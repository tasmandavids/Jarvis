-- Agent memory: pgvector store for Hermes retrieval + Obsidian sync tracking

create table if not exists public.agent_memory (
  id           uuid primary key default gen_random_uuid(),
  agent_id     text not null,                         -- which agent wrote this
  session_id   uuid,                                  -- conversation it came from
  memory_type  text not null default 'conversation'   -- conversation|fact|summary|comms
    check (memory_type in ('conversation','fact','summary','comms')),
  content      text not null,                         -- raw text stored
  embedding    vector(1536),                          -- OpenAI text-embedding-3-small
  vault_path   text,                                  -- Obsidian path this was written to
  metadata     jsonb default '{}',                    -- intent, tags, source, etc.
  created_at   timestamptz default now()
);

create index if not exists agent_memory_embedding_idx on public.agent_memory
  using ivfflat (embedding vector_cosine_ops) with (lists = 10);

create index if not exists agent_memory_agent_idx on public.agent_memory (agent_id);
create index if not exists agent_memory_type_idx  on public.agent_memory (memory_type);
create index if not exists agent_memory_time_idx  on public.agent_memory (created_at desc);

alter table public.agent_memory enable row level security;
create policy "service role only" on public.agent_memory
  using (auth.role() = 'service_role');
