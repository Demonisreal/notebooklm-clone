-- loads pgvector, otherwise hnsw.iterative_scan below is only a placeholder
do $$ begin perform '[1]'::vector; end $$;

-- websearch_to_tsquery joins terms with AND, so "notice period and warranty" finds nothing
create or replace function to_or_tsquery(p_config regconfig, p_text text)
returns tsquery
language sql
immutable
as $$
	select coalesce(
		(
			select string_agg(quote_literal(t.lexeme), ' | ')
			from unnest(to_tsvector(p_config, p_text)) t
		),
		''
	)::tsquery;
$$;

-- vector plus full text via rrf, because vectors are weak on section numbers and figures
create or replace function match_chunks(
	p_notebook_id uuid,
	p_source_ids uuid[],
	p_query_embedding vector(768),
	p_query_text text,
	p_limit int default 10
)
returns table (
	id uuid,
	source_id uuid,
	content text,
	page int,
	char_start int,
	char_end int,
	score float
)
language plpgsql
stable
-- without this, deselected sources return nothing: the index pulls
-- ef_search candidates and the filter drops them. attribute, because stable forbids SET
set hnsw.iterative_scan = 'relaxed_order'
as $$
declare
	-- language of the question is unknown, so match against both configurations
	q_de tsquery := to_or_tsquery('german', p_query_text);
	q_en tsquery := to_or_tsquery('english', p_query_text);
	k constant int := 60;
begin
	return query
	with vec as (
		select c.id, row_number() over (order by c.embedding <=> p_query_embedding) as rank
		from chunks c
		where c.notebook_id = p_notebook_id
			and (
				p_source_ids is null
				or cardinality(p_source_ids) = 0
				or c.source_id = any(p_source_ids)
			)
			and c.embedding is not null
		order by c.embedding <=> p_query_embedding
		limit 40
	),
	kw as (
		select t.id, row_number() over (order by t.rnk desc) as rank
		from (
			select c.id, greatest(ts_rank_cd(c.fts, q_de), ts_rank_cd(c.fts, q_en)) as rnk
			from chunks c
			where c.notebook_id = p_notebook_id
				and (
					p_source_ids is null
					or cardinality(p_source_ids) = 0
					or c.source_id = any(p_source_ids)
				)
				and (c.fts @@ q_de or c.fts @@ q_en)
			order by rnk desc
			limit 40
		) t
	),
	candidates as (
		select vec.id from vec
		union
		select kw.id from kw
	)
	select
		c.id,
		c.source_id,
		c.content,
		c.page,
		c.char_start,
		c.char_end,
		(coalesce(1.0 / (k + v.rank), 0) + coalesce(1.0 / (k + w.rank), 0))::float as score
	from candidates
	join chunks c on c.id = candidates.id
	left join vec v on v.id = candidates.id
	left join kw w on w.id = candidates.id
	order by score desc
	limit p_limit;
end;
$$;
