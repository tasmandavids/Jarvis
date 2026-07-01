/**
 * POST /api/hermes/remember
 *
 * Real-time write: embeds content, stores in agent_memory, and queues to Obsidian.
 * Called by the chat gateway after every agent exchange.
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
  const {
    agent_id,
    session_id,
    memory_type = 'conversation',
    content,
    vault_path,
    metadata = {},
  } = await req.json();

  if (!agent_id || !content) {
    return NextResponse.json({ error: 'agent_id and content required' }, { status: 400 });
  }

  // 1. Embed the content
  const embedding = await embed(content);

  // 2. Store in agent_memory with vector
  const { data: memory, error } = await supabase
    .from('agent_memory')
    .insert({ agent_id, session_id, memory_type, content, embedding, vault_path, metadata })
    .select('id')
    .single();

  if (error) {
    console.error('agent_memory insert failed:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // 3. Queue to Obsidian if vault_path provided
  if (vault_path) {
    await supabase.from('obsidian_log').insert({
      vault_path,
      content,
      frontmatter: { agent: agent_id, session: session_id, memory_id: memory.id, ...metadata },
    });
  }

  return NextResponse.json({ memory_id: memory.id, embedded: true, queued_obsidian: !!vault_path });
}
