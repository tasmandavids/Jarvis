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
  id uuid primary key,
  created_at timestamptz not null default now(),
  note text,
  vector vector,
  constraint memory_id_fkey foreign key (id) references public.clients (id)
);

-- ─── Agent runs ──────────────────────────────────────────────────────────────
create table public.agent_runs (
  id uuid not null,
  created_at timestamptz not null default now(),
  agent_id uuid not null,
  task_id uuid not null,
  status text,
  details text,
  constraint agent_runs_pkey primary key (id, agent_id, task_id),
  constraint agent_runs_agent_id_key unique (agent_id),
  constraint agent_runs_task_id_key unique (task_id),
  constraint agent_runs_id_fkey foreign key (id) references public.clients (id),
  constraint agent_runs_id_fkey1 foreign key (id) references public.memory (id),
  constraint agent_runs_id_fkey2 foreign key (id) references public.tasks (id)
);

-- ─── Communications log ──────────────────────────────────────────────────────
create table public.comms_log (
  id uuid not null,
  created_at timestamptz not null default now(),
  agent_id uuid not null,
  task_id uuid not null,
  client uuid,
  message text,
  status text,
  constraint comms_log_pkey primary key (id, agent_id, task_id),
  constraint comms_log_agent_id_key unique (agent_id),
  constraint comms_log_task_id_key unique (task_id),
  constraint comms_log_id_fkey foreign key (id) references public.clients (id),
  constraint comms_log_id_fkey1 foreign key (id) references public.memory (id),
  constraint comms_log_id_fkey2 foreign key (id) references public.tasks (id),
  constraint comms_log_id_agent_id_task_id_fkey
    foreign key (id, agent_id, task_id)
    references public.agent_runs (id, agent_id, task_id),
  constraint comms_log_id_agent_id_task_id_fkey1
    foreign key (id, agent_id, task_id)
    references public.comms_log (id, agent_id, task_id)
);

comment on table public.comms_log is 'communications';

-- ─── Row Level Security (enabled, policies added when auth is wired) ─────────
alter table public.clients enable row level security;
alter table public.memory enable row level security;
alter table public.tasks enable row level security;
alter table public.agent_runs enable row level security;
alter table public.comms_log enable row level security;
