create table auth_login_attempts (
	user_id uuid primary key references auth.users(id) on delete cascade,
	failures int not null default 0,
	last_failure_at timestamptz not null default now(),
	locked_until timestamptz
);

alter table auth_login_attempts enable row level security;

create policy "auth admin only" on auth_login_attempts
	for all to supabase_auth_admin using (true) with check (true);

revoke all on auth_login_attempts from anon, authenticated, public;
grant select, insert, update, delete on auth_login_attempts to supabase_auth_admin;
grant select, update, delete on auth_login_attempts to service_role;

create or replace function hook_password_verification_attempt(event jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
	uid uuid := (event->>'user_id')::uuid;
	attempt public.auth_login_attempts;
begin
	if exists (select 1 from auth.users where id = uid and raw_app_meta_data->>'demo' = 'true') then
		return jsonb_build_object('decision', 'continue');
	end if;

	perform pg_advisory_xact_lock(hashtextextended(uid::text, 0));

	select * into attempt from public.auth_login_attempts where user_id = uid;

	if attempt.locked_until > now() then
		return jsonb_build_object('decision', 'reject', 'message', 'Invalid login credentials');
	end if;

	if (event->>'valid')::boolean then
		delete from public.auth_login_attempts where user_id = uid;
		return jsonb_build_object('decision', 'continue');
	end if;

	insert into public.auth_login_attempts as a (user_id, failures)
	values (uid, 1)
	on conflict (user_id) do update set
		failures = case when a.last_failure_at < now() - interval '1 day' then 1 else a.failures + 1 end,
		last_failure_at = now()
	returning * into attempt;

	if attempt.failures >= 5 then
		update public.auth_login_attempts
		set locked_until = now() + interval '15 minutes'
		where user_id = uid;
	end if;

	return jsonb_build_object('decision', 'continue');
end;
$$;

grant execute on function hook_password_verification_attempt to supabase_auth_admin;
revoke execute on function hook_password_verification_attempt from anon, authenticated, public;
