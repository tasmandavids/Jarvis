-- Jarvis schema upgrade: pgvector dimensions, clients for globe, tasks source tracking

-- ─── Clients: add lat/lng for globe + product column ─────────────────────────
alter table public.clients add column if not exists latitude double precision;
alter table public.clients add column if not exists longitude double precision;
alter table public.clients add column if not exists product text; -- 'Nova' or 'Olune'
alter table public.clients add column if not exists status text default 'active';

-- ─── Tasks: add source tracking ──────────────────────────────────────────────
alter table public.tasks add column if not exists source text; -- 'slack', 'notion', 'webhook', 'dashboard'

-- ─── Memory: set vector dimension to 1536 (OpenAI ada-002 compatible) ────────
-- Note: the initial migration used `vector` without dimensions.
-- We alter to a fixed dimension for proper indexing.
alter table public.memory alter column vector type vector(1536);

-- ─── Index for similarity search on memory ───────────────────────────────────
create index if not exists memory_vector_idx on public.memory
  using ivfflat (vector vector_cosine_ops) with (lists = 10);

-- ─── Index for task lookups by status ────────────────────────────────────────
create index if not exists tasks_status_idx on public.tasks using gin (status);
