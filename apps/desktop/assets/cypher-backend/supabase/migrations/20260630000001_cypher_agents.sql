-- CYPHER agent system tables
-- Run: supabase db push  (project hwyokoiqjynmcpuypwmf)

-- ── Agent conversations (full transcript log) ─────────────────────
create table if not exists public.agent_conversations (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null,
  agent_id    text not null,                    -- 'cypher'|'orion'|'sable'|'vesper'|'morrigan'|'theron'
  speaker     text not null,                    -- 'user'|agent name
  intent      text,                             -- detected intent
  text        text not null,
  tools_used  jsonb default '[]',
  approved    boolean,
  created_at  timestamptz default now()
);

create index on public.agent_conversations (session_id);
create index on public.agent_conversations (agent_id);
create index on public.agent_conversations (created_at desc);

alter table public.agent_conversations enable row level security;
create policy "service role only" on public.agent_conversations
  using (auth.role() = 'service_role');

-- ── Obsidian log queue ────────────────────────────────────────────
create table if not exists public.obsidian_log (
  id          uuid primary key default gen_random_uuid(),
  vault_path  text not null,                    -- e.g. CYPHER/Daily/2026-06-30.md
  content     text not null,
  frontmatter jsonb default '{}',
  status      text default 'queued'             -- queued|synced|failed
    check (status in ('queued','synced','failed')),
  attempts    int default 0,
  synced_at   timestamptz,
  created_at  timestamptz default now()
);

create index on public.obsidian_log (status) where status = 'queued';

-- ── Live dashboard state (Supabase Realtime) ─────────────────────
create table if not exists public.cypher_live_state (
  id          int primary key default 1          -- single-row table
    check (id = 1),
  agent_idx   int default 5,                     -- active agent index (0-5)
  mode        text default 'idle',               -- idle|listening|thinking|responding|error
  metrics     jsonb default '{}',                -- latest panel data snapshot
  speaker     text default 'CYPHER',
  text        text default 'Standing by.',
  updated_at  timestamptz default now()
);

insert into public.cypher_live_state (id) values (1)
  on conflict (id) do nothing;

alter table public.cypher_live_state enable row level security;
create policy "anon read" on public.cypher_live_state for select using (true);
create policy "service write" on public.cypher_live_state
  for update using (auth.role() = 'service_role');

-- Enable realtime for live state
alter publication supabase_realtime add table public.cypher_live_state;

-- ── Device commands ───────────────────────────────────────────────
create table if not exists public.device_commands (
  id          uuid primary key default gen_random_uuid(),
  device_id   text not null,
  command     text not null,
  payload     jsonb default '{}',
  status      text default 'pending'
    check (status in ('pending','approved','executing','done','rejected','failed')),
  approved_by text,
  approved_at timestamptz,
  executed_at timestamptz,
  result      jsonb,
  created_at  timestamptz default now()
);

create index on public.device_commands (device_id, status);

alter table public.device_commands enable row level security;
create policy "service role only" on public.device_commands
  using (auth.role() = 'service_role');

-- ── Connector status ──────────────────────────────────────────────
create table if not exists public.connector_status (
  id            text primary key,                -- connector id e.g. 'gmail'
  status        text default 'unknown'
    check (status in ('ok','degraded','error','unconfigured','unknown')),
  last_synced   timestamptz,
  last_error    text,
  metadata      jsonb default '{}'
);

insert into public.connector_status (id, status) values
  ('gmail','unconfigured'),('stripe','unconfigured'),('xero','unconfigured'),
  ('whatsapp','unconfigured'),('instagram','unconfigured'),('messenger','unconfigured'),
  ('markets','unconfigured'),('apple-health','unconfigured'),('obsidian','unconfigured'),
  ('github','unconfigured'),('vercel','unconfigured'),('slack','unconfigured')
on conflict (id) do nothing;
