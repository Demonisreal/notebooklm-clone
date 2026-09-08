# Hybrid search: why retrieval is one SQL function

> A self-hosted NotebookLM clone: upload sources, ask questions about them, and follow every
> statement in the answer back to the passage it came from. Next.js, NestJS, Supabase/pgvector.
> Live at [notebook.dmn-software.com](https://notebook.dmn-software.com), code at
> [github.com/Demonisreal/notebooklm-clone](https://github.com/Demonisreal/notebooklm-clone).
>
> The retrieval function discussed here is
> [`supabase/migrations/20260804090100_match_chunks.sql`](../supabase/migrations/20260804090100_match_chunks.sql),
> the regression test is
> [`apps/api/src/chat/match-chunks.spec.ts`](../apps/api/src/chat/match-chunks.spec.ts).

The chat in this project answers questions about documents the user uploaded, and every
statement in an answer has to link back to the exact passage it came from. That puts all the
weight on the retrieval step. If the wrong chunks go into the prompt, no amount of prompting
fixes the answer.

This is a write-up of how retrieval works and why it looks the way it does.

## Two kinds of question

_What does the contract say about liability?_ is a semantic question. Vector search handles it
well.

_What is in paragraph 15a?_ is not. The user is asking for a literal string. An embedding of
"paragraph 15a" sits close to every other paragraph reference in the document, so vector search
returns something plausible and wrong. Product names, error codes and version numbers behave the
same way.

Full text search is the mirror image. It is exact on the token and useless as soon as the user
paraphrases.

Both kinds of question arrive through the same input box, so the search runs both and merges the
two result lists.

## Merging on rank, not on score

Each search produces a score, but the two numbers have nothing to do with each other. A cosine
distance and a `ts_rank_cd` value are not on a common scale. To combine them I would have to pick
a weighting factor by hand, and that factor would be a guess that stops being right as soon as
the document set changes.

Reciprocal Rank Fusion sidesteps this. It throws the scores away and uses only the position of a
chunk in each list:

```
score = 1/(k + rank_vector) + 1/(k + rank_fulltext)
```

A chunk that ranks third in both lists beats a chunk that ranks first in one list and does not
appear in the other. That is the behaviour I want. Agreement between two independent methods is
a stronger signal than a top position in one of them.

The merge is a single SQL statement. There is no reranking model and no second network call. I
looked at a cross encoder reranker first and left it out, because it costs one model call per
query and I have no evaluation set to show that the extra call buys anything. Building that set
is the prerequisite, not the reranker.

## Full text: two languages, and OR instead of AND

Sources are mixed German and English, sometimes inside the same notebook. Two things follow from
that.

Stemming happens per chunk, not globally. The `chunks` table has a `lang` column and the search
vector is a generated column over it:

```sql
lang regconfig not null default 'german',
fts tsvector generated always as (to_tsvector(lang, content)) stored,
```

The question is the harder half, because I do not know what language it is in. So I build a
German and an English `tsquery` and take `greatest()` of the two ranks.

I also could not use `websearch_to_tsquery`. It joins terms with AND. A natural question — here
a German one, _Was ist die Kündigungsfrist und wann kam Zephyr-7?_ — would then require every
word to appear inside one chunk, which never happens. I build the query from the lexemes myself and join them
with OR instead. RRF absorbs the loss in precision: a chunk that only matches one common word
lands far down the keyword list and contributes almost nothing to the fused score.

## The bug that took the longest

Filtered vector search returned nothing at all.

The symptom was narrow. Search worked. The moment a user deselected sources in the sidebar, the
answer came back empty. No error, no warning, no results.

The cause is the order of operations. HNSW is an approximate index. It walks its graph, returns a
fixed number of candidates, and only then does Postgres apply the `where source_id = any(...)`
filter. If the selected source is small and the other sources fill the candidate set, every
candidate is filtered away and nothing survives.

The fix is one line:

```sql
set hnsw.iterative_scan = 'relaxed_order'
```

pgvector then keeps scanning until enough rows survive the filter.

Two details cost me extra time. The function is `stable`, so a `SET` statement inside the body is
not allowed and it has to be a function attribute instead. And the bug is invisible on small
data, because with twenty chunks the index returns everything anyway. The regression test
therefore inserts 120 filler chunks into one source and two into another, then searches with a
filter on the small source and asserts that both come back.

A related trap sits next to it: an empty array is not `NULL`. `'x' = any(array[]::uuid[])`
evaluates to `false`, so deselecting _every_ source would have returned nothing instead of
searching everything. The filter checks `cardinality(...) = 0` as well.

## What I would change

`lang` is decided once per source at ingestion time. A document that switches language halfway
through gets stemmed with the wrong configuration. Detection per chunk would fix that.

`k = 60` is the value from the original RRF paper. I never tuned it, because my test set is too
small for any result to mean anything. That is the same gap that keeps the reranker out — an
evaluation set of fixed questions with known correct passages would turn both of these from
opinion into measurement, and it is the next thing I would build.
