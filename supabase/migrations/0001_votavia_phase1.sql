-- VotaVía — Phase 1 schema (citizen experience + ownership)
-- Run with: supabase db push   (or paste into the SQL editor)

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------- enums
do $$ begin
  create type case_category as enum (
    'road_damage','street_lighting','traffic_signals','sidewalk_accessibility',
    'trees_vegetation','waste_sanitation','parks_public_spaces','other'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type case_status as enum (
    'reported','under_review','assigned','in_progress','pending_verification','resolved','closed'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type assignment_status as enum (
    'pending','accepted','declined','in_progress','submitted_for_review','verified','returned','cancelled'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type user_role as enum ('citizen','government','specialist','admin');
exception when duplicate_object then null; end $$;

do $$ begin
  create type case_event_type as enum (
    'reported','under_review','assigned','in_progress','pending_verification','resolved','closed',
    'community_support','observation','government_update','evidence_added','dispatch_update'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type observation_kind as enum (
    'comment','still_happening','safety_concern','accessibility_concern'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type actor_type as enum ('citizen','community','government','specialist','system');
exception when duplicate_object then null; end $$;

-- ------------------------------------------------------------- profiles
create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role user_role not null default 'citizen',
  display_name text,
  created_at timestamptz not null default now()
);

create or replace function public.current_role()
returns user_role
language sql stable security definer set search_path = public
as $$
  select coalesce((select role from public.profiles where user_id = auth.uid()), 'citizen'::user_role);
$$;

-- Auto-create a citizen profile for every new verified user.
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (user_id, role) values (new.id, 'citizen')
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Nobody can promote themselves: role changes are blocked for non-admins.
create or replace function public.prevent_role_escalation()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.role <> old.role and public.current_role() not in ('admin','government') then
    raise exception 'No autorizado para cambiar roles';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_role_guard on public.profiles;
create trigger profiles_role_guard
  before update on public.profiles
  for each row execute function public.prevent_role_escalation();

-- ---------------------------------------------------------------- cases
create table if not exists public.cases (
  id uuid primary key default gen_random_uuid(),
  display_sequence integer not null unique,
  display_id text not null unique,
  category case_category not null,
  status case_status not null default 'reported',
  title text not null check (char_length(title) between 4 and 140),
  description text not null check (char_length(description) between 10 and 2000),
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  colonia text not null,
  address_hint text,
  has_safety_concern boolean not null default false,
  has_accessibility_concern boolean not null default false,
  support_count integer not null default 0,
  created_by_user_id uuid references auth.users(id) on delete set null,
  reporter_email text,
  is_demo boolean not null default false,
  is_published boolean not null default true,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists cases_created_at_idx on public.cases (created_at desc);
create index if not exists cases_category_idx on public.cases (category);
create index if not exists cases_status_idx on public.cases (status);
create index if not exists cases_colonia_idx on public.cases (colonia);
create index if not exists cases_owner_idx on public.cases (created_by_user_id);
create index if not exists cases_geo_idx on public.cases (latitude, longitude);

create table if not exists public.case_photos (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  url text not null,
  kind text not null default 'report' check (kind in ('report','before','after')),
  caption text,
  created_at timestamptz not null default now()
);
create index if not exists case_photos_case_idx on public.case_photos (case_id);

create table if not exists public.case_supports (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  participant_key text not null,
  user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (case_id, participant_key)
);
create index if not exists case_supports_case_idx on public.case_supports (case_id);

create table if not exists public.case_observations (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  kind observation_kind not null default 'comment',
  body text not null check (char_length(body) between 3 and 800),
  author_type actor_type not null default 'community',
  author_label text not null default 'Vecina o vecino de la colonia',
  participant_key text not null,
  user_id uuid references auth.users(id) on delete set null,
  is_published boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists case_observations_case_idx on public.case_observations (case_id, created_at desc);

create table if not exists public.case_events (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  type case_event_type not null,
  actor_type actor_type not null default 'system',
  title text not null,
  description text,
  is_public boolean not null default true,
  metadata jsonb,
  created_at timestamptz not null default now()
);
create index if not exists case_events_case_idx on public.case_events (case_id, created_at);

create table if not exists public.case_claims (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  email text not null,
  token_hash text not null unique,
  expires_at timestamptz not null,
  claimed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists case_claims_email_idx on public.case_claims (lower(email));
create index if not exists case_claims_case_idx on public.case_claims (case_id);

-- Keep support_count in sync so lists and stats stay cheap.
create or replace function public.sync_support_count()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.cases set support_count = support_count + 1 where id = new.case_id;
    return new;
  elsif tg_op = 'DELETE' then
    update public.cases set support_count = greatest(support_count - 1, 0) where id = old.case_id;
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists case_supports_count on public.case_supports;
create trigger case_supports_count
  after insert or delete on public.case_supports
  for each row execute function public.sync_support_count();

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists cases_touch on public.cases;
create trigger cases_touch
  before update on public.cases
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------- RLS
alter table public.profiles enable row level security;
alter table public.cases enable row level security;
alter table public.case_photos enable row level security;
alter table public.case_supports enable row level security;
alter table public.case_observations enable row level security;
alter table public.case_events enable row level security;
alter table public.case_claims enable row level security;

-- profiles: a resident reads and edits only their own row.
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select using (auth.uid() = user_id or public.current_role() in ('admin','government'));

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- cases: published reports are public; owners see their own unpublished rows.
drop policy if exists cases_select_public on public.cases;
create policy cases_select_public on public.cases
  for select using (is_published or created_by_user_id = auth.uid() or public.current_role() in ('admin','government','specialist'));

-- Writes go through the server API (service role) so guests can report safely.
drop policy if exists cases_update_owner on public.cases;
create policy cases_update_owner on public.cases
  for update using (created_by_user_id = auth.uid())
  with check (created_by_user_id = auth.uid());

drop policy if exists photos_select_public on public.case_photos;
create policy photos_select_public on public.case_photos
  for select using (
    exists (select 1 from public.cases c where c.id = case_photos.case_id and (c.is_published or c.created_by_user_id = auth.uid()))
  );

drop policy if exists observations_select_public on public.case_observations;
create policy observations_select_public on public.case_observations
  for select using (
    is_published and exists (select 1 from public.cases c where c.id = case_observations.case_id and c.is_published)
  );

drop policy if exists events_select_public on public.case_events;
create policy events_select_public on public.case_events
  for select using (
    is_public and exists (select 1 from public.cases c where c.id = case_events.case_id and c.is_published)
  );

-- Supports and claims stay server-only: no anon/auth policy at all.

-- ------------------------------------------------------------- storage
insert into storage.buckets (id, name, public)
values ('case-photos', 'case-photos', true)
on conflict (id) do nothing;

drop policy if exists case_photos_read on storage.objects;
create policy case_photos_read on storage.objects
  for select using (bucket_id = 'case-photos');

-- ------------------------------------------------------------ RPC helpers
create or replace function public.cases_nearby(
  lat double precision,
  lng double precision,
  radius_meters double precision default 400
)
returns table (
  id uuid, display_id text, title text, category case_category, status case_status,
  support_count integer, distance_meters double precision
)
language sql stable
as $$
  select c.id, c.display_id, c.title, c.category, c.status, c.support_count,
         (6371000 * 2 * asin(sqrt(
            power(sin(radians(c.latitude - lat) / 2), 2) +
            cos(radians(lat)) * cos(radians(c.latitude)) *
            power(sin(radians(c.longitude - lng) / 2), 2)
         ))) as distance_meters
  from public.cases c
  where c.is_published
    and (6371000 * 2 * asin(sqrt(
            power(sin(radians(c.latitude - lat) / 2), 2) +
            cos(radians(lat)) * cos(radians(c.latitude)) *
            power(sin(radians(c.longitude - lng) / 2), 2)
         ))) <= radius_meters
  order by distance_meters asc
  limit 50;
$$;
