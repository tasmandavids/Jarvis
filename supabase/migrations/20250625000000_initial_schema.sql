-- Jarvis baseline schema (matches remote project: hwyokoiqjynmcpuypwmf)
-- Already applied on the hosted Supabase project — do NOT re-run against that project.
-- Use for local `supabase start` or documentation only.

create extension if not exists "pgcrypto";
create extension if not exists "vector";

-- ─── Clients ─────────────────────────────────────────────────────────────────
create table public.clients (
  id uuid primary key default gen_random_uuid(),
  name text,
  email text not null,
  created_at timestamptz not null default now(),
  country text,
  constraint clients_email_key unique (email)
);

comment on table public.clients is 'actual clients';

-- ─── Tasks ───────────────────────────────────────────────────────────────────
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  headline text,
  description text,
  responsible uuid default gen_random_uuid(),
  status text[] not null,
  created_at timestamptz not null default now()
);

-- ─── Memory (vector store, keyed to client) ──────────────────────────────────
create table public.memory (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null,
  created_at timestamptz not null default now(),
  note text,
  vector vector,
  constraint memory_client_id_fkey foreign key (client_id) references public.clients (id)
);

-- ─── Agent runs ──────────────────────────────────────────────────────────────
create table public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  agent_id text not null,
  task_id uuid not null,
  status text,
  details text,
  constraint agent_runs_task_id_fkey foreign key (task_id) references public.tasks (id)
);

-- ─── Communications log ──────────────────────────────────────────────────────
create table public.comms_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  agent_run_id uuid,
  task_id uuid not null,
  client_id uuid,
  message text,
  status text,
  constraint comms_log_task_id_fkey foreign key (task_id) references public.tasks (id),
  constraint comms_log_agent_run_id_fkey foreign key (agent_run_id) references public.agent_runs (id),
  constraint comms_log_client_id_fkey foreign key (client_id) references public.clients (id)
);

comment on table public.comms_log is 'communications';

-- ─── Row Level Security (enabled, policies added when auth is wired) ─────────
alter table public.clients enable row level security;
alter table public.memory enable row level security;
alter table public.tasks enable row level security;
alter table public.agent_runs enable row level security;
alter table public.comms_log enable row level security;
