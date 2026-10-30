-- VotaVía — stored AI analysis per citizen report (additive).
--
-- The AI engine (Session 2) is advisory: it never changes case status, never
-- marks community verification, and never overwrites the reporter's text.
-- Reporting must keep working when no model key is configured; in that case the
-- engine stores a deterministic, clearly flagged fallback analysis.

create table if not exists public.case_analyses (
  case_id uuid primary key references public.cases(id) on delete cascade,
  issue_id uuid references public.issues(id) on delete set null,
  analysis_version text not null,
  model text not null,
  summary text not null,
  suggested_category case_category,
  severity text,
  confidence double precision,
  priority jsonb,
  duplicate_candidates jsonb not null default '[]'::jsonb,
  /** Which source the analyzer treated this report as (citizen_web, …). */
  report_source text,
  /** True when the deterministic fallback produced this result. */
  is_fallback boolean not null default false,
  /** Full engine payload (bounded); safe to keep server-side. */
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists case_analyses_issue_idx on public.case_analyses (issue_id);

do $$ begin
  alter table public.case_analyses
    add constraint case_analyses_severity_check
    check (severity is null or severity in ('low','medium','high','critical'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.case_analyses
    add constraint case_analyses_confidence_check
    check (confidence is null or (confidence >= 0 and confidence <= 1));
exception when duplicate_object then null; end $$;

drop trigger if exists case_analyses_touch on public.case_analyses;
create trigger case_analyses_touch
  before update on public.case_analyses
  for each row execute function public.touch_updated_at();

alter table public.case_analyses enable row level security;

-- Analysis of a published report is public copy; the full payload stays
-- server-side and is only reachable through the internal API.
drop policy if exists case_analyses_select_public on public.case_analyses;
create policy case_analyses_select_public on public.case_analyses
  for select using (
    exists (
      select 1 from public.cases c
      where c.id = case_analyses.case_id
        and (c.is_published or c.created_by_user_id = auth.uid())
    )
  );

-- No client writes: only the server (service role) persists analysis.

-- Reporter-initiated events (edit / withdraw) get their own audit vocabulary so
-- a citizen edit is never mislabeled as a government update.
alter type case_event_type add value if not exists 'report_updated';
alter type case_event_type add value if not exists 'report_withdrawn';
