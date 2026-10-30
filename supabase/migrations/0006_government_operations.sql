-- VotaVía — Government operations (additive)
-- Run after 0001–0005.
--
-- Persists the five contracts the government console previously kept as local
-- fixtures: area/operator assignment, official dispute responses, outcome
-- publication, the activity feed, and specialist dispatch. All access goes
-- through the server-side service role; RLS is enabled with no policies so
-- anon/authenticated clients can never read these tables directly.

create table if not exists public.issue_assignments (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid not null references public.issues(id) on delete cascade,
  department_id text not null,
  operator_name text not null,
  operator_user_id uuid references auth.users(id) on delete set null,
  organization_id uuid references public.organizations(id) on delete set null,
  note text,
  assigned_by text,
  created_at timestamptz not null default now()
);

create index if not exists issue_assignments_issue_idx
  on public.issue_assignments (issue_id, created_at desc);

create table if not exists public.issue_dispute_responses (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid not null references public.issues(id) on delete cascade,
  body text not null,
  department_id text,
  author_name text not null,
  follow_up_evidence_ids text[] not null default '{}',
  organization_id uuid references public.organizations(id) on delete set null,
  responded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists issue_dispute_responses_issue_idx
  on public.issue_dispute_responses (issue_id, created_at desc);

create table if not exists public.issue_publications (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid not null references public.issues(id) on delete cascade,
  outcome text not null,
  summary text,
  organization_id uuid references public.organizations(id) on delete set null,
  published_by uuid references auth.users(id) on delete set null,
  published_at timestamptz not null default now()
);

create index if not exists issue_publications_issue_idx
  on public.issue_publications (issue_id, published_at desc);

create table if not exists public.issue_activity (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid not null references public.issues(id) on delete cascade,
  kind text not null,
  actor text,
  summary text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists issue_activity_issue_idx
  on public.issue_activity (issue_id, created_at desc);

create table if not exists public.specialists (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  skills text[] not null default '{}',
  coverage_colonias text[] not null default '{}',
  approved boolean not null default false,
  available boolean not null default true,
  organization_id uuid references public.organizations(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.dispatch_requests (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid not null references public.issues(id) on delete cascade,
  category text not null,
  colonia text,
  note text,
  requested_by uuid references auth.users(id) on delete set null,
  organization_id uuid references public.organizations(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists dispatch_requests_issue_idx
  on public.dispatch_requests (issue_id, created_at desc);

create table if not exists public.dispatch_assignments (
  id uuid primary key default gen_random_uuid(),
  dispatch_request_id uuid not null references public.dispatch_requests(id) on delete cascade,
  issue_id uuid not null references public.issues(id) on delete cascade,
  specialist_id uuid not null references public.specialists(id) on delete restrict,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined', 'in_progress', 'submitted_for_review', 'verified', 'returned', 'cancelled')),
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists dispatch_assignments_issue_idx
  on public.dispatch_assignments (issue_id, created_at desc);

alter table public.issue_assignments enable row level security;
alter table public.issue_dispute_responses enable row level security;
alter table public.issue_publications enable row level security;
alter table public.issue_activity enable row level security;
alter table public.specialists enable row level security;
alter table public.dispatch_requests enable row level security;
alter table public.dispatch_assignments enable row level security;

-- Intentionally no policies: the service role bypasses RLS for the console's
-- server routes. Government surfaces are never read directly by browsers.

drop trigger if exists dispatch_assignments_touch on public.dispatch_assignments;
create trigger dispatch_assignments_touch
  before update on public.dispatch_assignments
  for each row execute function public.touch_updated_at();

-- Seed the demo specialist bench once, so dispatch has real rows to match.
insert into public.specialists (name, skills, coverage_colonias, approved, available)
select * from (values
  ('Cuadrilla Vial Norte', array['baches','drenaje']::text[], array['Guerrero','Centro','Santa María la Ribera']::text[], true, true),
  ('Electro Servicio CDMX', array['alumbrado','otros']::text[], array['Centro','Doctores','Obrera']::text[], true, true),
  ('Verde Urbano', array['parques','residuos']::text[], array['Condesa','Roma Norte','Hipódromo']::text[], true, true),
  ('Señaliza MX', array['movilidad','seguridad']::text[], array['Centro','Tabacalera','Guerrero']::text[], true, true),
  ('Agua y Drenaje Sur', array['agua','drenaje']::text[], array['Portales','Narvarte','Del Valle']::text[], true, false)
) as seed(name, skills, coverage_colonias, approved, available)
where not exists (select 1 from public.specialists);
