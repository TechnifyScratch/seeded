alter table public.profiles add column first_name text not null default '', add column last_name text not null default '';
create table public.access_slots(slot integer primary key check(slot in (1,2)),profile_id uuid not null unique references public.profiles(id) on delete cascade);
alter table public.access_slots enable row level security;
revoke all on public.access_slots from public,anon,authenticated;
grant all on public.access_slots to service_role;
-- Only the server can claim a configured slot. Concurrent claims preserve the first identity.
create function public.claim_access_slot(p_slot integer,p_user uuid,p_email text,p_first text,p_last text) returns uuid language plpgsql security definer set search_path=public as $$
declare existing uuid;
begin
 if p_slot not in (1,2) or p_slot is null or length(trim(p_first)) not between 1 and 80 or length(trim(p_last)) not between 1 and 80 or p_first is null or p_last is null then raise exception 'Invalid registration'; end if;
 perform pg_advisory_xact_lock(782134,p_slot);
 select profile_id into existing from access_slots where slot=p_slot;
 if existing is not null then return existing; end if;
 insert into profiles(id,email,role,first_name,last_name) values(p_user,p_email,'admin',trim(p_first),trim(p_last));
 insert into access_slots(slot,profile_id) values(p_slot,p_user);
 return p_user;
end$$;
revoke all on function public.claim_access_slot(integer,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.claim_access_slot(integer,uuid,text,text,text) to service_role;
