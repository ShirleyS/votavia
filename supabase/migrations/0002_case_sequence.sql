-- VotaVía — collision-free human-readable case numbers.
-- Phase 1 used max(display_sequence)+1 from the application, which can race.
-- This sequence is allocated atomically by Postgres.

create sequence if not exists public.case_display_sequence_seq;

do $$
declare
  next_value integer;
begin
  select coalesce(max(display_sequence), 0) + 1 into next_value from public.cases;
  perform setval('public.case_display_sequence_seq', next_value, false);
end $$;

create or replace function public.next_case_sequence()
returns integer
language sql
security definer
set search_path = public
as $$
  select nextval('public.case_display_sequence_seq')::integer;
$$;

revoke all on function public.next_case_sequence() from public;
grant execute on function public.next_case_sequence() to service_role;
