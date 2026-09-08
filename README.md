# NotebookLM clone

Upload sources, chat with them, and trace every statement in an answer back to the passage it came from.

![Workspace with sources, chat and a highlighted citation](docs/screenshot.jpg)

---

## Try it live

**→ [notebook.dmn-software.com](https://notebook.dmn-software.com)**

|              |                       |
| ------------ | --------------------- |
| **Email**    | `demo@notebook.local` |
| **Password** | `demo-citations-2026` |

The account comes with a prepared notebook and two fully processed sources, so there is something to look at before uploading anything.

It is read-only: chat, citations and studio work, but uploading, renaming and deleting are rejected by the API. That way the example notebook is still intact for the next visitor. To put your own sources in, create an account in the same interface.

### The core idea in two minutes

1. **Sign in** and open the **"Example notebook"**.
2. Ask in the chat: _"How long is the warranty, and what applies to existing customers?"_
3. The answer **streams in** and carries small blue numbers — those are the citations.
4. **Click a number.** The source opens on the right, jumps to the passage and highlights it. The page it sits on is shown above.
5. Optional: in the studio on the right, **"Generate conversation"** turns the sources into an audio summary spoken by two voices. That takes a minute or two.

Also worth a look: **deselect** a source on the left and ask the same question again — only the rest is searched. And in your own account, upload a **scanned PDF**: it is detected and rejected with a comprehensible message instead of ending up as an empty source.

---

## What is in it

- **Sources**: PDF, DOCX, TXT, Markdown, web addresses and pasted text
- **Processing with visible status** — runs in the background, the status travels to the frontend over Supabase Realtime without polling
- **Chat with citations**, streamed, strictly from the selected sources
- **Clickable citations** that jump into the source and highlight the passage
- **Source selection** by checkbox — only what is ticked gets searched
- **Hybrid search** combining vector and full text search, merged with Reciprocal Rank Fusion
- **Notes**, written by hand or taken over from a chat answer
- **Studio**: briefing, frequently asked questions, study guide, mind map, and an **audio summary** as a conversation between two voices

## What is deliberately not in it

- **Collaboration and sharing** — needs a permission model beyond ownership and would have crowded out the core
- **YouTube transcripts** — the available libraries break with every change to the platform, too fragile to run in production
- **Multi-tenancy** — a notebook belongs to exactly one account; anything beyond that needs a permission model of its own

---

## Architecture

```
Browser
  │
  ├── Next.js ──────────────── Supabase Auth      (sign-in, JWT)
  │      │                     Supabase Storage   (direct upload via signed URL)
  │      └─ fetch + Bearer JWT
  │            ▼
  │      Nest.js API
  │            ├── SourcesModule   extraction, chunking, embedding
  │            ├── ChatModule      retrieval, prompt, SSE stream
  │            ├── StudioModule    briefing, FAQ, mind map, audio
  │            └── SupabaseModule  client with user token, RLS applies
  │            │
  │            ├─────────► Gemini (text, embeddings, speech)
  │            └─────────► Postgres + pgvector
```

Next.js handles rendering and the session. All domain logic sits in Nest — the frontend never talks to the database directly. Files go straight into storage through a signed URL; the API is never a file proxy, otherwise memory and timeouts run out on large PDFs.

**Stack:** Next.js 16 (App Router), NestJS 11, Supabase (Postgres 17, pgvector 0.8, Auth, Storage, Realtime), Gemini 3.5 Flash, `gemini-embedding-2`, Tailwind 4.

---

## Decisions

### 1. Hybrid search instead of vector search alone

Vector search is poor at proper nouns, section numbers and figures. Someone asking for "Section 15a" or a product name is served far more reliably by full text search. Both rankings are merged with Reciprocal Rank Fusion.

Three details I measured against the running database, because they fail **silently** otherwise:

**`hnsw.iterative_scan` is off by default.** The index fetches `ef_search` candidates and the `WHERE` filter throws them away afterwards. With a notebook of 305 chunks and one selected source holding 5 of them, **nothing** comes back. With `relaxed_order` the same query returns exactly the 5 expected hits — that is what makes source selection dependable in the first place.

**An empty array is not `NULL`.** `'x' = any(array[]::uuid[])` evaluates to `false`. If the frontend sends an empty array when every source is deselected, the search finds nothing. The condition therefore also checks `cardinality(...) = 0`.

**`websearch_to_tsquery` joins terms with AND.** "What is the notice period and how long does the warranty run?" becomes `'notice' & 'period' & 'warranti'` and matches zero rows, even though the terms occur individually — hybrid search would quietly have been pure vector search. The lexemes are now joined with OR, ranked through `ts_rank_cd` and then fused with RRF.

The retrieval function in full — rank fusion, bilingual stemming, the HNSW filter bug and what is still missing — is written up in [`docs/hybrid-search.md`](docs/hybrid-search.md).

### 2. 768 dimensions, with normalisation of my own

pgvector's HNSW indexes work up to 2000 dimensions, the embedding models return 3072 by default. So 768 via `outputDimensionality`.

There is a rule going around that below 3072 dimensions you have to normalise yourself. Measured against the API instead of believed:

| Model                  | 768 dimensions   | 3072 dimensions |
| ---------------------- | ---------------- | --------------- |
| `gemini-embedding-001` | length **0.589** | length 1.0      |
| `gemini-embedding-2`   | length 1.0       | length 1.0      |

The rule holds for the older model, not for the one in use. The code normalises anyway: on an already normalised vector that is a division by 1 and costs nothing, but a later model change would otherwise skew cosine similarity without a sound.

### 3. Row Level Security with the user token instead of the service role

Nest builds a Supabase client per request using the user's JWT. That way the database checks access rights, not the controller — a mistake in controller logic does not immediately leak data. The service role key is used exclusively in processing, where no user context exists any more.

Verified: a second user gets a 404 when accessing someone else's notebook, and calling the search function directly on foreign notebook IDs returns an empty set.

### 4. The citation viewer shows the extracted text, not the original PDF

What gets indexed is the extracted text, and `char_start`/`char_end` point exactly into it. In a rendered PDF those offsets no longer match the text layer; you would have to find the passage again by text search, which regularly fails on line breaks, hyphenation and ligatures. The text viewer also works the same way for every source type — a PDF viewer would need a second one for DOCX, web and pasted text.

So I show exactly what was searched. The original sits next to it as a download.

### 5. Audio summary in two steps

First the language model writes a conversation between two people from the sources, then a second model speaks that script with two voices. Both through the same provider, no additional service enters the picture.

Speech synthesis returns raw PCM without a container, which no browser can do anything with — a 44 byte WAV header in front solves it without pulling in a library. And two minutes of conversation take around a minute and a half to generate, so it runs in the background with its status in the database instead of holding the request open.

### 6. Processing in-process instead of a queue

With a single API container, asynchronous processing inside the process with status tracking in the database is enough. A real queue (BullMQ with Redis) would be the clean solution, but costs half a day.

The known drawback: if the process restarts mid-processing, the source would be stuck on `processing`. Against that, processing writes a timestamp, and on startup entries that are too old are set to `error` and can be triggered again. **From the second API container onwards I would switch to BullMQ**, because then several processes could grab the same source.

---

## Running locally

Requirements: Node ≥ 22, pnpm, Docker.

```bash
pnpm install
pnpm db:start                 # Supabase in Docker, applies the migrations

cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
# fill in the keys from the output of "supabase status"

pnpm dev                      # API on :3001, web on :3000

# optional: demo account with a populated notebook, password is yours to pick
DEMO_PASSWORD=secret pnpm seed:demo
```

**Without an API key** everything runs on `LLM_PROVIDER=fake`: the fake provider derives reproducible, normalised vectors from a hash of the text. The same text always yields the same vector, but similar text yields _no_ similar one — search is not semantic that way, yet the whole chain from chunking through retrieval to the citation jump is developable and testable. That is also how the project started, before I had a key.

**With real models**: create a key at [aistudio.google.com](https://aistudio.google.com) (free), put it in `apps/api/.env`, set `LLM_PROVIDER=gemini` — and then run `pnpm reembed`. That step is not optional: vectors from a different model live in a different space, otherwise the system keeps searching the old one while the answers already sound real.

## Tests

```bash
pnpm test     # 55 tests, 61 with Supabase running
```

No coverage theatre, but tests where logic can be **silently** wrong:

| File                       | Checks                                                                                                                                                                                                 |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `chunker.spec.ts`          | The invariant `extracted_text.slice(charStart, charEnd) === content` — including overlong paragraphs and text without spaces. If it breaks, every citation points off target without anything crashing |
| `citations.spec.ts`        | Invented citation numbers are removed, grouped ones like `[1, 2]` are split, the rest renumbered without gaps                                                                                          |
| `match-chunks.spec.ts`     | Search against the real database, including the case that would come back empty without `iterative_scan`                                                                                               |
| `pdf.spec.ts`              | Page mapping across page boundaries; scans without a text layer are detected                                                                                                                           |
| `ingestion.spec.ts`        | Uploaded text files against pasted text — two paths, the same kind of source                                                                                                                           |
| `html.spec.ts`             | Navigation and footer are dropped instead of landing in every chunk                                                                                                                                    |
| `wav.spec.ts`              | The WAV header carries the right sample rate, otherwise the audio plays too fast                                                                                                                       |
| `fake.provider.spec.ts`    | Embeddings are reproducible and normalised                                                                                                                                                             |
| `demo-write.guard.spec.ts` | The public demo account is refused on write routes and let through everywhere else, and the guard stays inert when no demo account is configured                                                       |

`match-chunks.spec.ts` skips itself when no Supabase is configured.

## Deployment

Runs on a server of its own: Supabase self-hosted, frontend and API as separate containers, Caddy in front with automatic Let's Encrypt certificates. Instructions in [`deploy/README.md`](deploy/README.md).

Two things that only surfaced in operation and are visible in the code:

The API container **cannot reach its own public address** — behind the reverse proxy, the path out and back in fails. The Supabase address is therefore split in two: internal over the Docker network for server-to-server, public for signed links that get opened in a browser.

The **token issuer differs by deployment mode**: self-hosted GoTrue writes the bare host into `iss`, the local CLI appends `/auth/v1`. The check is configurable rather than hard-wired.

## Next

- **Reranking** the hits with a cross encoder — RRF orders well, a reranker orders better
- **An evaluation set** for retrieval quality: fixed questions with expected passages, so that changes to chunking or search can be measured instead of guessed at
- **BullMQ** for processing, as soon as more than one API container runs
- **Finer citation spans**: right now the whole chunk is highlighted. Determining the supporting sentence inside the chunk would make the highlight considerably more precise

## License

MIT — see [LICENSE](LICENSE).
