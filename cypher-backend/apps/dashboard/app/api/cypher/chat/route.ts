import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Simple keyword-based intent detector (mirrors config/routing.json)
function detectIntent(text: string): string {
  const t = text.toLowerCase();
  if (/server|deploy|vercel|github|ci|latency|uptime|orion/.test(t)) return 'infra';
  if (/money|invoice|revenue|mrr|stripe|xero|cashflow|sable/.test(t)) return 'finance';
  if (/health|sleep|steps|calendar|reminder|vesper/.test(t)) return 'personal';
  if (/ads|campaign|roas|facebook|morrigan/.test(t)) return 'ads';
  if (/research|news|market|summarize|theron/.test(t)) return 'research';
  return 'orchestrate';
}

const AGENT_MODELS: Record<string, { provider: string; model: string; id: string }> = {
  orchestrate: { provider: 'anthropic', model: 'claude-sonnet-4-20250514', id: 'cypher' },
  infra:       { provider: 'anthropic', model: 'claude-haiku-4-20250514',  id: 'orion' },
  finance:     { provider: 'anthropic', model: 'claude-sonnet-4-20250514', id: 'sable' },
  personal:    { provider: 'anthropic', model: 'claude-sonnet-4-20250514', id: 'vesper' },
  ads:         { provider: 'openai',    model: 'gpt-4o',                  id: 'morrigan' },
  research:    { provider: 'google',    model: 'gemini-2.5-pro',          id: 'theron' },
};

export async function POST(req: NextRequest) {
  const { text, session_id } = await req.json();
  if (!text) return NextResponse.json({ error: 'text required' }, { status: 400 });

  const intent = detectIntent(text);
  const agent = AGENT_MODELS[intent] || AGENT_MODELS.orchestrate;
  const sid = session_id || crypto.randomUUID();

  // Log user turn
  await supabase.from('agent_conversations').insert({
    session_id: sid, agent_id: agent.id, speaker: 'user',
    intent, text,
  });

  // Update live state → CYPHER dashboard subscribes via Supabase Realtime
  await supabase.from('cypher_live_state').update({
    agent_idx: ['orion','sable','vesper','morrigan','theron','cypher'].indexOf(agent.id),
    mode: 'thinking',
    speaker: agent.id.toUpperCase(),
    text: 'Working…',
    updated_at: new Date().toISOString(),
  }).eq('id', 1);

  // ── Call the LLM ────────────────────────────────────────────────
  // Replace these stubs with your actual SDK calls:
  //   Anthropic: import Anthropic from '@anthropic-ai/sdk'
  //   OpenAI:    import OpenAI from 'openai'
  //   Google:    import { GoogleGenerativeAI } from '@google/generative-ai'
  const reply = `[${agent.id.toUpperCase()}] Intent detected: ${intent}. LLM call stubbed — wire your SDK here.`;

  // Log agent reply
  await supabase.from('agent_conversations').insert({
    session_id: sid, agent_id: agent.id,
    speaker: agent.id, intent, text: reply,
  });

  // Queue to Obsidian
  const today = new Date().toISOString().slice(0, 10);
  await supabase.from('obsidian_log').insert({
    vault_path: `CYPHER/Daily/${today}.md`,
    content: `\n## ${new Date().toLocaleTimeString()} — ${agent.id.toUpperCase()}\n**You:** ${text}\n\n**${agent.id}:** ${reply}\n`,
    frontmatter: { agent: agent.id, intent, session: sid },
  });

  // Update live state → responding
  await supabase.from('cypher_live_state').update({
    mode: 'responding', text: reply,
    updated_at: new Date().toISOString(),
  }).eq('id', 1);

  return NextResponse.json({ reply, agent: agent.id, intent, session_id: sid });
}
