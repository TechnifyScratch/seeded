-- Access codes map to provisioned Supabase identities; there is no public registration.
create table public.access_codes(id uuid primary key default gen_random_uuid(),profile_id uuid not null references public.profiles(id) on delete cascade,code_hash text not null unique check(code_hash ~ '^[a-f0-9]{64}$'),label text not null default 'Access code',enabled boolean not null default true,expires_at timestamptz,created_at timestamptz not null default now());
create table public.login_rate_limits(bucket text primary key,window_started_at timestamptz not null default now(),attempts int not null default 1);
alter table public.access_codes enable row level security;
alter table public.login_rate_limits enable row level security;
revoke all on public.access_codes,public.login_rate_limits from anon,authenticated;
create function public.consume_login_attempt(p_bucket text,p_limit int) returns boolean language plpgsql security definer set search_path=public as $$declare count_now int;begin
 insert into login_rate_limits(bucket) values(p_bucket)
 on conflict(bucket) do update set attempts=case when login_rate_limits.window_started_at<now()-interval '1 minute' then 1 else login_rate_limits.attempts+1 end,window_started_at=case when login_rate_limits.window_started_at<now()-interval '1 minute' then now() else login_rate_limits.window_started_at end returning attempts into count_now;
 -- Keep bounded retention without logging raw codes or IP addresses.
 delete from login_rate_limits where window_started_at<now()-interval '1 day';
 return count_now<=p_limit;
end$$;
revoke all on function public.consume_login_attempt(text,int) from public,anon,authenticated;
grant execute on function public.consume_login_attempt(text,int) to service_role;
