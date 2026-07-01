-- OAuth token storage for connectors using OAuth2 (Xero, eventually Gmail).
-- Separate from connector_status because these are secrets, not status metadata.

create table if not exists public.oauth_tokens (
  id            text primary key,          -- connector id e.g. 'xero'
  access_token  text,
  refresh_token text,
  expires_at    timestamptz,
  tenant_id     text,                      -- Xero organisation id / equivalent for other providers
  metadata      jsonb default '{}',
  updated_at    timestamptz default now()
);

alter table public.oauth_tokens enable row level security;
create policy "service role only" on public.oauth_tokens
  using (auth.role() = 'service_role');
