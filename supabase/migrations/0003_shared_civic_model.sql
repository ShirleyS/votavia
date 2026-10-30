-- VotaVía — shared civic data model (additive, Phase 1/2 architecture update)
-- Run after 0001 and 0002.
--
-- Nothing here removes or renames existing columns, enums or tables.
-- `public.cases` remains the citizen report table; `report_id` in the shared
-- contract is the existing `cases.id`.

-- ---------------------------------------------------------------- enums
do $$ begin
  create type issue_operational_status as enum (
    'new','triaged','assigned','in_progress','completed','cancelled'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type community_verification_status as enum (
    'unreviewed','confirmed','disputed','verified_resolved'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type issue_origin as enum ('citizen','official','mixed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type organization_kind as enum ('alcaldia','municipality','agency','civic');
exception when duplicate_object then null; end $$;

do $$ begin
  create type organization_role as enum ('responder','supervisor','admin');
exception when duplicate_object then null; end $$;

do $$ begin
  create type evidence_kind as enum (
    'citizen_followup','government_intervention','resolution_proof','official_record'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type verification_verdict as enum ('confirmed','disputed','verified_resolved');
exception when duplicate_object then null; end $$;

-- Append-only audit vocabulary. Adding enum values is backwards compatible.
alter type case_event_type add value if not exists 'community_verification';
alter type case_event_type add value if not exists 'official_record_linked';
alter type case_event_type add value if not exists 'support_removed';
alter type case_event_type add value if not exists 'evidence_uploaded';

-- ---------------------------------------------------------- organizations
create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  kind organization_kind not null default 'alcaldia',
  /** jurisdictions this organization may operate in (empty = all it is scoped to) */
  areas text[] not null default '{}',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Membership is explicit. A government email domain alone grants nothing.
create table if not exists public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role organization_role not null default 'responder',
  /** optional finer scope: colonias or responsibility codes */
  scope text[] not null default '{}',
  verified_at timestamptz,
  verified_by uuid references auth.users(id) on delete set null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

create index if not exists organization_members_user_idx
  on public.organization_members (user_id) where revoked_at is null;

-- --------------------------------------------------------------- issues
-- A shared issue groups one or more citizen reports and may link to many
-- official government records. Reports are never deleted when grouped.
create table if not exists public.issues (
  id uuid primary key default gen_random_uuid(),
  display_sequence integer not null unique,
  display_id text not null unique,
  title text not null,
  description text,
  category case_category not null,
  origin issue_origin not null default 'citizen',
  -- A. VotaVía operational workflow
  operational_status issue_operational_status not null default 'new',
  -- B. Raw status from an external government system (null until known)
  external_status text,
  -- C. Independent community verification
  community_verification_status community_verification_status not null default 'unreviewed',
  latitude double precision,
  longitude double precision,
  colonia text,
  organization_id uuid references public.organizations(id) on delete set null,
  created_by_user_id uuid references auth.users(id) on delete set null,
  is_public boolean not null default true,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists issues_created_at_idx on public.issues (created_at desc);
create index if not exists issues_operational_idx on public.issues (operational_status);
create index if not exists issues_verification_idx on public.issues (community_verification_status);
create index if not exists issues_organization_idx on public.issues (organization_id);

-- ------------------------------------------------------- report linkage
alter table public.cases
  add column if not exists issue_id uuid references public.issues(id) on delete set null;
alter table public.cases
  add column if not exists submission_channel text not null default 'web';
alter table public.cases
  add column if not exists submission_metadata jsonb;

create index if not exists cases_issue_idx on public.cases (issue_id);

-- Every existing report gets its own issue so support and verification have a
-- stable shared identity from day one.
create sequence if not exists public.issue_display_sequence_seq;

do $$
declare
  next_value integer;
begin
  select coalesce(max(display_sequence), 0) + 1 into next_value from public.issues;
  perform setval('public.issue_display_sequence_seq', next_value, false);
end $$;

create or replace function public.next_issue_sequence()
returns integer
language sql security definer set search_path = public
as $$ select nextval('public.issue_display_sequence_seq')::integer; $$;

revoke all on function public.next_issue_sequence() from public;
grant execute on function public.next_issue_sequence() to service_role;

do $$
declare
  r record;
  seq integer;
  new_issue_id uuid;
begin
  for r in select * from public.cases where issue_id is null order by created_at loop
    seq := nextval('public.issue_display_sequence_seq');
    insert into public.issues (
      id, display_sequence, display_id, title, description, category, origin,
      operational_status, latitude, longitude, colonia, created_by_user_id,
      is_public, resolved_at, created_at, updated_at
    ) values (
      gen_random_uuid(), seq, 'ISS-' || lpad(seq::text, 4, '0'),
      r.title, r.description, r.category, 'citizen',
      case r.status
        when 'reported' then 'new'::issue_operational_status
        when 'under_review' then 'triaged'::issue_operational_status
        when 'assigned' then 'assigned'::issue_operational_status
        when 'in_progress' then 'in_progress'::issue_operational_status
        when 'pending_verification' then 'completed'::issue_operational_status
        when 'resolved' then 'completed'::issue_operational_status
        else 'new'::issue_operational_status
      end,
      r.latitude, r.longitude, r.colonia, r.created_by_user_id,
      r.is_published, r.resolved_at, r.created_at, r.updated_at
    ) returning id into new_issue_id;

    update public.cases set issue_id = new_issue_id where id = r.id;
  end loop;
end $$;

-- ------------------------------------------------------- official records
-- Imported source data. Never citizen submissions.
--
-- Ingestion contract (owned by Session 6 / Ismael):
--   * natural key = (source_system, source_record_id)
--   * imports are idempotent: re-running a sync updates instead of duplicating
--   * the collector never writes here directly; it calls upsert_official_record()
--   * status changes are appended to official_record_status_history
do $$ begin
  create type redistribution_eligibility as enum ('allowed', 'restricted', 'unknown');
exception when duplicate_object then null; end $$;

create table if not exists public.official_records (
  id uuid primary key default gen_random_uuid(),
  source_system text not null,
  /**
   * Stable identifier inside the source system. Canonical idempotency key.
   * When the source has no id, the collector passes its dedupe_key here.
   */
  source_record_id text not null,
  /** Collector-side dedupe key (0311:id|natural|content:...). */
  dedupe_key text,
  /** Government dataset identity, e.g. '0311'. */
  source_dataset text,
  /** Human-facing folio. May be null or repeated; never the primary key. */
  external_folio text,
  source_url text,
  original_category text,
  original_status text,
  /** Collector mapping of the raw status; advisory only. */
  status_normalized text,
  title text,
  description text,
  reported_at timestamptz,
  /** Coordinates are optional: many source rows have no usable geometry. */
  latitude double precision,
  longitude double precision,
  colonia text,
  alcaldia text,
  address_hint text,
  responsible_agency text,
  source_closed_at timestamptz,
  collector_schema_version text,
  extraction_method text,
  data_quality_flags text[] not null default '{}',
  raw_payload jsonb,
  /** attribution and licensing for the source dataset */
  provenance jsonb not null default '{}'::jsonb,
  license text,
  license_url text,
  attribution text,
  /** How the license was confirmed: ckan_metadata | dataset_page | unverified. */
  license_verified_from text,
  redistribution redistribution_eligibility not null default 'unknown',
  redistribution_note text,
  /** hash of the normalized record, used to skip no-op updates */
  content_hash text,
  sync_run_id text,
  source_created_at timestamptz,
  source_updated_at timestamptz,
  source_fetched_at timestamptz,
  first_seen_at timestamptz not null default now(),
  last_synced_at timestamptz not null default now(),
  /** false when the record disappeared upstream or was explicitly retired */
  is_active boolean not null default true,
  upstream_removed_at timestamptz,
  imported_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_system, source_record_id)
);

create index if not exists official_records_source_idx
  on public.official_records (source_system, source_record_id);
create index if not exists official_records_folio_idx
  on public.official_records (source_system, external_folio);
create index if not exists official_records_geo_idx
  on public.official_records (latitude, longitude)
  where latitude is not null and longitude is not null;
create index if not exists official_records_sync_idx
  on public.official_records (last_synced_at desc);
create index if not exists official_records_alcaldia_idx
  on public.official_records (alcaldia, source_system);

-- Append-only history of the *source* status. The raw text always wins; the
-- normalized mapping is advisory and may be null.
create table if not exists public.official_record_status_history (
  id uuid primary key default gen_random_uuid(),
  official_record_id uuid not null references public.official_records(id) on delete cascade,
  status_text text not null,
  status_normalized text,
  changed_at timestamptz,
  observed_at timestamptz not null default now(),
  source_updated_at timestamptz,
  sync_run_id text,
  is_current boolean not null default false,
  raw_payload jsonb,
  created_at timestamptz not null default now()
);

create index if not exists official_status_history_record_idx
  on public.official_record_status_history (official_record_id, observed_at desc);

-- Exactly one current status row per record.
create unique index if not exists official_status_history_one_current
  on public.official_record_status_history (official_record_id)
  where is_current;

-- -------------------------------------------------- ingestion entry point
-- Idempotent upsert used by the Session 6 collector. Accepts one normalized
-- record per call; reports whether the row was created or updated.
create or replace function public.upsert_official_record(payload jsonb)
returns table (official_record_id uuid, created boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source_system text := nullif(payload->>'source_system', '');
  v_source_record_id text := nullif(payload->>'source_record_id', '');
  v_status text := nullif(payload->>'original_status', '');
  v_record_id uuid;
  v_existing_status text;
  v_is_new boolean := false;
  v_observed timestamptz := coalesce((payload->>'observed_at')::timestamptz, now());
begin
  if v_source_system is null or v_source_record_id is null then
    raise exception 'source_system y source_record_id son obligatorios';
  end if;

  select id, original_status into v_record_id, v_existing_status
  from public.official_records
  where source_system = v_source_system and source_record_id = v_source_record_id
  for update;

  if v_record_id is null then
    v_is_new := true;
    insert into public.official_records (
      source_system, source_record_id, dedupe_key, source_dataset,
      external_folio, source_url,
      original_category, original_status, status_normalized,
      title, description, reported_at, source_closed_at,
      latitude, longitude, colonia, alcaldia, address_hint,
      responsible_agency, collector_schema_version, extraction_method,
      data_quality_flags, raw_payload,
      provenance, license, license_url, attribution, license_verified_from,
      redistribution, redistribution_note, content_hash, sync_run_id,
      source_created_at, source_updated_at, source_fetched_at,
      first_seen_at, last_synced_at, is_active, imported_at, updated_at
    ) values (
      v_source_system,
      v_source_record_id,
      payload->>'dedupe_key',
      payload->>'source_dataset',
      payload->>'external_folio',
      payload->>'source_url',
      payload->>'original_category',
      v_status,
      payload->>'status_normalized',
      payload->>'title',
      payload->>'description',
      (payload->>'reported_at')::timestamptz,
      (payload->>'source_closed_at')::timestamptz,
      (payload->>'latitude')::double precision,
      (payload->>'longitude')::double precision,
      payload->>'colonia',
      payload->>'alcaldia',
      payload->>'address_hint',
      payload->>'responsible_agency',
      payload->>'collector_schema_version',
      payload->>'extraction_method',
      coalesce(
        (select array_agg(value) from jsonb_array_elements_text(payload->'data_quality_flags')),
        '{}'::text[]
      ),
      payload->'raw_payload',
      coalesce(payload->'provenance', '{}'::jsonb),
      payload->>'license',
      payload->>'license_url',
      payload->>'attribution',
      payload->>'license_verified_from',
      coalesce(
        (payload->>'redistribution')::redistribution_eligibility,
        'unknown'::redistribution_eligibility
      ),
      payload->>'redistribution_note',
      payload->>'content_hash',
      payload->>'sync_run_id',
      (payload->>'source_created_at')::timestamptz,
      (payload->>'source_updated_at')::timestamptz,
      coalesce((payload->>'source_fetched_at')::timestamptz, now()),
      coalesce((payload->>'first_seen_at')::timestamptz, now()),
      now(),
      coalesce((payload->>'is_active')::boolean, true),
      now(),
      now()
    )
    returning id into v_record_id;
  else
    update public.official_records set
      dedupe_key = coalesce(payload->>'dedupe_key', dedupe_key),
      source_dataset = coalesce(payload->>'source_dataset', source_dataset),
      external_folio = coalesce(payload->>'external_folio', external_folio),
      source_url = coalesce(payload->>'source_url', source_url),
      original_category = coalesce(payload->>'original_category', original_category),
      original_status = coalesce(v_status, original_status),
      title = coalesce(payload->>'title', title),
      description = coalesce(payload->>'description', description),
      reported_at = coalesce((payload->>'reported_at')::timestamptz, reported_at),
      latitude = coalesce((payload->>'latitude')::double precision, latitude),
      longitude = coalesce((payload->>'longitude')::double precision, longitude),
      colonia = coalesce(payload->>'colonia', colonia),
      alcaldia = coalesce(payload->>'alcaldia', alcaldia),
      address_hint = coalesce(payload->>'address_hint', address_hint),
      responsible_agency = coalesce(payload->>'responsible_agency', responsible_agency),
      source_closed_at = coalesce((payload->>'source_closed_at')::timestamptz, source_closed_at),
      collector_schema_version = coalesce(payload->>'collector_schema_version', collector_schema_version),
      extraction_method = coalesce(payload->>'extraction_method', extraction_method),
      data_quality_flags = case
        when payload->'data_quality_flags' is not null then coalesce(
          (select array_agg(value) from jsonb_array_elements_text(payload->'data_quality_flags')),
          '{}'::text[]
        )
        else data_quality_flags
      end,
      status_normalized = coalesce(payload->>'status_normalized', status_normalized),
      raw_payload = coalesce(payload->'raw_payload', raw_payload),
      provenance = coalesce(payload->'provenance', provenance),
      license = coalesce(payload->>'license', license),
      license_url = coalesce(payload->>'license_url', license_url),
      attribution = coalesce(payload->>'attribution', attribution),
      license_verified_from = coalesce(payload->>'license_verified_from', license_verified_from),
      redistribution = coalesce(
        (payload->>'redistribution')::redistribution_eligibility,
        redistribution
      ),
      redistribution_note = coalesce(payload->>'redistribution_note', redistribution_note),
      content_hash = coalesce(payload->>'content_hash', content_hash),
      sync_run_id = coalesce(payload->>'sync_run_id', sync_run_id),
      source_updated_at = coalesce((payload->>'source_updated_at')::timestamptz, source_updated_at),
      source_fetched_at = coalesce((payload->>'source_fetched_at')::timestamptz, now()),
      last_synced_at = now(),
      is_active = coalesce((payload->>'is_active')::boolean, is_active),
      upstream_removed_at = case
        when coalesce((payload->>'is_active')::boolean, true) = false
          then coalesce(upstream_removed_at, now())
        else null
      end,
      updated_at = now()
    where id = v_record_id;
  end if;

  -- Append a history row only when the status actually changed.
  if v_is_new or v_status is distinct from v_existing_status then
    update public.official_record_status_history
      set is_current = false
      where official_record_id = v_record_id and is_current;

    insert into public.official_record_status_history (
      official_record_id, status_text, status_normalized, changed_at,
      observed_at, source_updated_at, sync_run_id, is_current, raw_payload
    ) values (
      v_record_id,
      coalesce(v_status, 'desconocido'),
      payload->>'status_normalized',
      coalesce((payload->>'source_updated_at')::timestamptz, (payload->>'reported_at')::timestamptz),
      v_observed,
      (payload->>'source_updated_at')::timestamptz,
      payload->>'sync_run_id',
      true,
      payload->'raw_payload'
    );
  end if;

  return query select v_record_id, v_is_new;
end $$;

revoke all on function public.upsert_official_record(jsonb) from public;
grant execute on function public.upsert_official_record(jsonb) to service_role;

-- Marks records not seen in a completed sync run as inactive. Called once per
-- successful full sync so partial runs never retire data.
create or replace function public.retire_missing_official_records(
  p_source_system text,
  p_sync_run_id text
)
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  affected integer;
begin
  update public.official_records
    set is_active = false,
        upstream_removed_at = now(),
        updated_at = now()
  where source_system = p_source_system
    and is_active
    and (sync_run_id is distinct from p_sync_run_id);
  get diagnostics affected = row_count;
  return affected;
end $$;

revoke all on function public.retire_missing_official_records(text, text) from public;
grant execute on function public.retire_missing_official_records(text, text) to service_role;

-- Public projection for Session 4. Excludes raw payloads and anything that may
-- not be redistributed.
create or replace view public.official_records_public
with (security_invoker = true)
as
select
  id as official_record_id,
  source_system,
  source_record_id,
  external_folio,
  source_url,
  original_category,
  original_status,
  title,
  description,
  reported_at,
  source_closed_at,
  latitude,
  longitude,
  colonia,
  alcaldia,
  address_hint,
  responsible_agency,
  license,
  license_url,
  attribution,
  license_verified_from,
  first_seen_at,
  last_synced_at,
  source_updated_at
from public.official_records
where is_active
  and redistribution = 'allowed';

grant select on public.official_records_public to anon, authenticated;

-- An issue may link to many official records and vice versa.
create table if not exists public.issue_official_records (
  issue_id uuid not null references public.issues(id) on delete cascade,
  official_record_id uuid not null references public.official_records(id) on delete cascade,
  linked_at timestamptz not null default now(),
  linked_by_user_id uuid references auth.users(id) on delete set null,
  primary key (issue_id, official_record_id)
);

create index if not exists issue_official_records_record_idx
  on public.issue_official_records (official_record_id);

-- --------------------------------------------------------------- evidence
create table if not exists public.evidence (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid references public.issues(id) on delete cascade,
  case_id uuid references public.cases(id) on delete cascade,
  kind evidence_kind not null,
  url text not null,
  caption text,
  uploaded_by_user_id uuid references auth.users(id) on delete set null,
  uploader_role actor_type not null default 'citizen',
  organization_id uuid references public.organizations(id) on delete set null,
  is_public boolean not null default true,
  created_at timestamptz not null default now(),
  constraint evidence_has_parent check (issue_id is not null or case_id is not null)
);

create index if not exists evidence_issue_idx on public.evidence (issue_id, created_at);
create index if not exists evidence_case_idx on public.evidence (case_id, created_at);

-- --------------------------------------------------------- issue supports
-- One *active* support per authenticated user per issue, enforced by index.
create table if not exists public.issue_supports (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid not null references public.issues(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  participant_key text not null,
  created_at timestamptz not null default now(),
  removed_at timestamptz
);

create unique index if not exists issue_supports_one_active_user
  on public.issue_supports (issue_id, user_id)
  where removed_at is null and user_id is not null;

create unique index if not exists issue_supports_one_active_participant
  on public.issue_supports (issue_id, participant_key)
  where removed_at is null and user_id is null;

create index if not exists issue_supports_issue_idx on public.issue_supports (issue_id);

-- -------------------------------------------------- community verification
create table if not exists public.community_verifications (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid not null references public.issues(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  verdict verification_verdict not null,
  note text,
  created_at timestamptz not null default now(),
  superseded_at timestamptz
);

create unique index if not exists community_verifications_one_active
  on public.community_verifications (issue_id, user_id)
  where superseded_at is null;

create index if not exists community_verifications_issue_idx
  on public.community_verifications (issue_id);

-- ------------------------------------------------- audit / event history
alter table public.case_events
  add column if not exists issue_id uuid references public.issues(id) on delete cascade;

-- Issue-level events (support, verification, evidence) have no single report.
alter table public.case_events alter column case_id drop not null;

do $$ begin
  alter table public.case_events
    add constraint case_events_has_parent check (case_id is not null or issue_id is not null);
exception when duplicate_object then null; end $$;
alter table public.case_events
  add column if not exists actor_user_id uuid references auth.users(id) on delete set null;
alter table public.case_events
  add column if not exists organization_id uuid references public.organizations(id) on delete set null;
alter table public.case_events
  add column if not exists visibility text not null default 'public';

create index if not exists case_events_issue_idx on public.case_events (issue_id, created_at);

-- ------------------------------------------------------ org access rules
-- Membership + revocation + active organization, never the email domain.
create or replace function public.is_org_member(org uuid, min_role organization_role default 'responder')
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members m
    join public.organizations o on o.id = m.organization_id
    where m.organization_id = org
      and m.user_id = auth.uid()
      and m.revoked_at is null
      and m.verified_at is not null
      and o.is_active
      and (
        min_role = 'responder'
        or (min_role = 'supervisor' and m.role in ('supervisor','admin'))
        or (min_role = 'admin' and m.role = 'admin')
      )
  );
$$;

create or replace function public.current_organization_ids()
returns uuid[]
language sql stable security definer set search_path = public
as $$
  select coalesce(array_agg(m.organization_id), '{}'::uuid[])
  from public.organization_members m
  join public.organizations o on o.id = m.organization_id
  where m.user_id = auth.uid()
    and m.revoked_at is null
    and m.verified_at is not null
    and o.is_active;
$$;

-- ------------------------------------------------------------------- RLS
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.issues enable row level security;
alter table public.official_records enable row level security;
alter table public.issue_official_records enable row level security;
alter table public.evidence enable row level security;
alter table public.issue_supports enable row level security;
alter table public.community_verifications enable row level security;

drop policy if exists organizations_select_public on public.organizations;
create policy organizations_select_public on public.organizations
  for select using (is_active or public.is_org_member(id));

drop policy if exists organizations_admin_write on public.organizations;
create policy organizations_admin_write on public.organizations
  for all using (public.is_org_member(id, 'admin'))
  with check (public.is_org_member(id, 'admin'));

-- Members may see their own membership; supervisors see the roster.
drop policy if exists organization_members_select on public.organization_members;
create policy organization_members_select on public.organization_members
  for select using (
    user_id = auth.uid() or public.is_org_member(organization_id, 'supervisor')
  );

drop policy if exists organization_members_admin_write on public.organization_members;
create policy organization_members_admin_write on public.organization_members
  for all using (public.is_org_member(organization_id, 'admin'))
  with check (public.is_org_member(organization_id, 'admin'));

-- Issues: public rows are readable; non-public rows only for their creator or
-- a member of the responsible organization.
drop policy if exists issues_select on public.issues;
create policy issues_select on public.issues
  for select using (
    is_public
    or created_by_user_id = auth.uid()
    or (organization_id is not null and public.is_org_member(organization_id))
    or public.current_role() in ('admin','government')
  );

-- Official records: only redistributable, active rows are readable by clients.
-- The service role (used by the collector and internal UI) bypasses RLS.
drop policy if exists official_records_select on public.official_records;
create policy official_records_select on public.official_records
  for select using (is_active and redistribution = 'allowed');

alter table public.official_record_status_history enable row level security;

drop policy if exists official_status_history_select on public.official_record_status_history;
create policy official_status_history_select on public.official_record_status_history
  for select using (
    exists (
      select 1 from public.official_records r
      where r.id = official_record_status_history.official_record_id
        and r.is_active
        and r.redistribution = 'allowed'
    )
  );

drop policy if exists issue_official_records_select on public.issue_official_records;
create policy issue_official_records_select on public.issue_official_records
  for select using (
    exists (select 1 from public.issues i where i.id = issue_id and i.is_public)
  );

drop policy if exists evidence_select on public.evidence;
create policy evidence_select on public.evidence
  for select using (
    is_public
    and (
      (issue_id is not null and exists (
        select 1 from public.issues i where i.id = evidence.issue_id and i.is_public
      ))
      or (case_id is not null and exists (
        select 1 from public.cases c where c.id = evidence.case_id and c.is_published
      ))
    )
  );

-- Issue-level audit rows must be readable when their issue is public.
drop policy if exists events_select_public on public.case_events;
create policy events_select_public on public.case_events
  for select using (
    is_public
    and (
      (case_id is not null and exists (
        select 1 from public.cases c where c.id = case_events.case_id and c.is_published
      ))
      or (issue_id is not null and exists (
        select 1 from public.issues i where i.id = case_events.issue_id and i.is_public
      ))
    )
  );

-- Supports and verifications are server-mediated: counts are exposed through
-- the API, never as raw rows. No select policy means no direct client reads.

-- -------------------------------------------------------------- triggers
drop trigger if exists issues_touch on public.issues;
create trigger issues_touch
  before update on public.issues
  for each row execute function public.touch_updated_at();

drop trigger if exists organizations_touch on public.organizations;
create trigger organizations_touch
  before update on public.organizations
  for each row execute function public.touch_updated_at();

drop trigger if exists official_records_touch on public.official_records;
create trigger official_records_touch
  before update on public.official_records
  for each row execute function public.touch_updated_at();

-- Append-only audit: events may be inserted and read, never updated/deleted.
create or replace function public.reject_event_mutation()
returns trigger language plpgsql as $$
begin
  raise exception 'case_events es un registro de auditoría de solo agregado';
end $$;

drop trigger if exists case_events_append_only on public.case_events;
create trigger case_events_append_only
  before update or delete on public.case_events
  for each row execute function public.reject_event_mutation();

