-- VotaVía — WhatsApp citizen intake state (additive)
-- Run after 0001–0004.
--
-- These tables hold private channel state, never public report data. The raw
-- WhatsApp phone number is used only to correlate one conversation; it is not
-- copied into `cases` or exposed by the public API. All access goes through the
-- server-side service role.

create table if not exists public.whatsapp_threads (
  wa_id text primary key,
  state text not null default 'awaiting_report'
    check (state in (
      'awaiting_report',
      'awaiting_location',
      'awaiting_category',
      'awaiting_confirmation',
      'completed'
    )),
  draft jsonb,
  last_case_id uuid references public.cases(id) on delete set null,
  last_display_id text,
  last_inbound_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.whatsapp_threads is
  'Private WhatsApp conversation state. Contains citizen-provided text; retain only while the conversation is active.';

create table if not exists public.whatsapp_messages (
  provider_message_id text primary key,
  wa_id text not null,
  direction text not null check (direction in ('inbound', 'outbound')),
  message_type text not null,
  created_at timestamptz not null default now()
);

comment on table public.whatsapp_messages is
  'Idempotency ledger for WhatsApp provider message ids. Stores no message body.';

create index if not exists whatsapp_messages_wa_created_idx
  on public.whatsapp_messages (wa_id, created_at desc);

create index if not exists whatsapp_threads_last_inbound_idx
  on public.whatsapp_threads (last_inbound_at desc);

alter table public.whatsapp_threads enable row level security;
alter table public.whatsapp_messages enable row level security;

-- Intentionally no policies: anon/authenticated cannot read or write channel
-- state. The service role bypasses RLS for the webhook handler.

drop trigger if exists whatsapp_threads_touch on public.whatsapp_threads;
create trigger whatsapp_threads_touch
  before update on public.whatsapp_threads
  for each row execute function public.touch_updated_at();
