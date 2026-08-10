create type audio_status as enum ('pending', 'processing', 'ready', 'error');

create table audio_overviews (
	id uuid primary key default gen_random_uuid(),
	notebook_id uuid not null references notebooks(id) on delete cascade,
	user_id uuid not null references auth.users(id) on delete cascade,
	status audio_status not null default 'pending',
	script text,
	storage_path text,
	duration_seconds int,
	error_message text,
	created_at timestamptz not null default now()
);

-- pro notizbuch reicht eine zusammenfassung, ein neuer lauf ersetzt sie
create unique index on audio_overviews (notebook_id);

alter table audio_overviews enable row level security;

create policy "own audio" on audio_overviews
	for all using (user_id = auth.uid()) with check (user_id = auth.uid());

alter publication supabase_realtime add table audio_overviews;

insert into storage.buckets (id, name, public, file_size_limit)
values ('audio', 'audio', false, 52428800)
on conflict (id) do nothing;

create policy "own audio read" on storage.objects
	for select using (
		bucket_id = 'audio' and (storage.foldername(name))[1] = auth.uid()::text
	);

create policy "own audio delete" on storage.objects
	for delete using (
		bucket_id = 'audio' and (storage.foldername(name))[1] = auth.uid()::text
	);
