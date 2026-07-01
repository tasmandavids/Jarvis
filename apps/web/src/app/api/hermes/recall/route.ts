/**
 * POST /api/hermes/recall
 *
 * Retrieves the top-k most relevant memories for a given query.
 * Called by the chat gateway before each LLM call to inject context.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

// Lazy singletons — module-scope construction runs during Next's build-time
// page-data collection, which has no env vars set.
let _supabase: SupabaseClient | null = null;
function getSupabase(): SupabaseClient {
  if (!_supabase) {
    _supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
  }
  return _supabase;
}

let _openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
  return _openai;
}

async function embed(text: string): Promise<number[]> {
  const res = await getOpenAI().embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
  });
  return res.data[0].embedding;
}

export async function POST(req: NextRequest) {
  const supabase = getSupabase();
  const { query, agent_id, top_k = 5, threshold = 0.75 } = await req.json();

  if (!query) {
    return NextResponse.json({ error: 'query required' }, { status: 400 });
  }

  const embedding = await embed(query);

  // pgvector cosine similarity search — filter by agent if provided
  const { data: memories, error } = await supabase.rpc('match_agent_memory', {
    query_embedding: embedding,
    match_threshold: threshold,
    match_count: top_k,
    filter_agent_id: agent_id || null,
  });

  if (error) {
    console.error('recall rpc failed:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Format as injectable context block
  const context = memories?.length
    ? [
        '[MEMORY context]',
        ...(memories as Array<{ content: string; created_at: string; agent_id: string; similarity: number }>).map(
          (m) =>
            `- ${new Date(m.created_at).toLocaleDateString('en-NZ')} [${m.agent_id}]: ${m.content}`
        ),
        '[END MEMORY]',
      ].join('\n')
    : null;

  return NextResponse.json({ memories, context, count: memories?.length ?? 0 });
}
