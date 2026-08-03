create extension if not exists vector;

create type source_status as enum ('pending', 'processing', 'ready', 'error');
create type source_kind as enum ('pdf', 'docx', 'text', 'markdown', 'url');

create table notebooks (
	id uuid primary key default gen_random_uuid(),
	user_id uuid not null references auth.users(id) on delete cascade,
	title text not null,
	emoji text not null default '📓',
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

create index on notebooks (user_id, updated_at desc);

create table sources (
	id uuid primary key default gen_random_uuid(),
	notebook_id uuid not null references notebooks(id) on delete cascade,
	user_id uuid not null references auth.users(id) on delete cascade,
	title text not null,
	kind source_kind not null,
	storage_path text,
	source_url text,
	status source_status not null default 'pending',
	error_message text,

	-- der viewer highlightet ueber char-offsets, die nur zu genau diesem text passen
	extracted_text text,
	char_count int,

	-- ohne das bleiben quellen nach einem neustart fuer immer auf processing
	processing_started_at timestamptz,

	metadata jsonb not null default '{}',
	created_at timestamptz not null default now()
);

create index on sources (notebook_id, created_at);

create table chunks (
	id uuid primary key default gen_random_uuid(),
	source_id uuid not null references sources(id) on delete cascade,
	notebook_id uuid not null references notebooks(id) on delete cascade,
	idx int not null,
	content text not null,
	page int,
	char_start int not null,
	char_end int not null,

	-- quellen sind gemischt deutsch/englisch, also stemming pro chunk statt global
	lang regconfig not null default 'german',
	fts tsvector generated always as (to_tsvector(lang, content)) stored,

	-- hnsw kann max 2000 dims, gemini liefert per default 3072
	embedding vector(768)
);

create index on chunks using hnsw (embedding vector_cosine_ops);
create index on chunks using gin (fts);
create index on chunks (notebook_id);
create index on chunks (source_id, idx);

create table conversations (
	id uuid primary key default gen_random_uuid(),
	notebook_id uuid not null references notebooks(id) on delete cascade,
	user_id uuid not null references auth.users(id) on delete cascade,
	title text,
	created_at timestamptz not null default now()
);

create index on conversations (notebook_id, created_at desc);

create table messages (
	id uuid primary key default gen_random_uuid(),
	conversation_id uuid not null references conversations(id) on delete cascade,
	role text not null check (role in ('user', 'assistant')),
	content text not null,
	citations jsonb not null default '[]',
	created_at timestamptz not null default now()
);

create index on messages (conversation_id, created_at);

create table notes (
	id uuid primary key default gen_random_uuid(),
	notebook_id uuid not null references notebooks(id) on delete cascade,
	user_id uuid not null references auth.users(id) on delete cascade,
	title text,
	content text not null,
	origin text not null default 'manual' check (origin in ('manual', 'chat', 'studio')),
	created_at timestamptz not null default now()
);

create index on notes (notebook_id, created_at desc);

alter table notebooks enable row level security;
alter table sources enable row level security;
alter table chunks enable row level security;
alter table conversations enable row level security;
alter table messages enable row level security;
alter table notes enable row level security;

create policy "own notebooks" on notebooks
	for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "own sources" on sources
	for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "own notes" on notes
	for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "own conversations" on conversations
	for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "own chunks" on chunks
	for all using (
		exists (
			select 1 from notebooks n
			where n.id = chunks.notebook_id and n.user_id = auth.uid()
		)
	);

create policy "own messages" on messages
	for all using (
		exists (
			select 1 from conversations c
			where c.id = messages.conversation_id and c.user_id = auth.uid()
		)
	);

-- realtime verwirft events still, wenn die zeile per rls nicht lesbar ist
alter publication supabase_realtime add table sources;

insert into storage.buckets (id, name, public, file_size_limit)
values ('sources', 'sources', false, 26214400)
on conflict (id) do nothing;

-- pfad ist immer <user_id>/<source_id>, damit die policy ohne join auskommt
create policy "own files read" on storage.objects
	for select using (
		bucket_id = 'sources' and (storage.foldername(name))[1] = auth.uid()::text
	);

create policy "own files write" on storage.objects
	for insert with check (
		bucket_id = 'sources' and (storage.foldername(name))[1] = auth.uid()::text
	);

create policy "own files delete" on storage.objects
	for delete using (
		bucket_id = 'sources' and (storage.foldername(name))[1] = auth.uid()::text
	);
