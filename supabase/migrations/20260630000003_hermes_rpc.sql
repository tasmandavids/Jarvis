-- Hermes memory retrieval RPC
-- Used by /api/hermes/recall for pgvector cosine similarity search

create or replace function match_agent_memory(
  query_embedding vector(1536),
  match_threshold  float,
  match_count      int,
  filter_agent_id  text default null
)
returns table (
  id          uuid,
  agent_id    text,
  memory_type text,
  content     text,
  vault_path  text,
  metadata    jsonb,
  created_at  timestamptz,
  similarity  float
)
language sql stable
as $$
  select
    am.id,
    am.agent_id,
    am.memory_type,
    am.content,
    am.vault_path,
    am.metadata,
    am.created_at,
    1 - (am.embedding <=> query_embedding) as similarity
  from agent_memory am
  where
    1 - (am.embedding <=> query_embedding) > match_threshold
    and (filter_agent_id is null or am.agent_id = filter_agent_id)
  order by am.embedding <=> query_embedding
  limit match_count;
$$;
