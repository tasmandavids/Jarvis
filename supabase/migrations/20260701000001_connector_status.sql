-- Connector status table for Hermes / consolidator / dashboard sync tracking
-- Matches usage in apps/web/src/app/api/hermes/consolidate/route.ts

create table if not exists public.connector_status (
  id            text primary key,                  -- connector id e.g. 'gmail'
  status        text default 'unknown'
    check (status in ('ok','degraded','error','unconfigured','unknown')),
  last_synced   timestamptz,
  last_error    text,
  metadata      jsonb default '{}'
);

create index if not exists connector_status_status_idx
  on public.connector_status (status);

alter table public.connector_status enable row level security;
create policy "service role only" on public.connector_status
  using (auth.role() = 'service_role');
