-- laedt pgvector in die session. vorher ist hnsw.iterative_scan nur ein platzhalter,
-- und den darf man ohne superuser-rechte nicht als funktionsattribut setzen
do $$ begin perform '[1]'::vector; end $$;

-- websearch_to_tsquery verknuepft alle begriffe mit AND. eine frage wie
-- "kuendigungsfrist und garantie" findet damit nichts, obwohl beide begriffe
-- einzeln vorkommen. fuer den volltext-zweig zaehlt recall, sortiert wird per rrf
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

-- hybride suche: vektor + volltext, zusammengefuehrt per reciprocal rank fusion.
-- reine vektorsuche findet eigennamen, paragraphen und zahlen schlecht.
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
-- ohne iterative scan liefert hnsw bei abgewaehlten quellen still zu wenige treffer:
-- der index holt ef_search kandidaten und der filter wirft sie danach alle weg.
-- als funktionsattribut, weil eine stable function kein SET im rumpf ausfuehren darf
set hnsw.iterative_scan = 'relaxed_order'
as $$
declare
	-- sprache der frage ist unbekannt, also gegen beide konfigurationen matchen
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
