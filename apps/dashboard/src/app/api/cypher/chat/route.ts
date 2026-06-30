/**
 * POST /api/cypher/chat
 *
 * Main CYPHER gateway: detects intent, retrieves memory via Hermes,
 * calls the appropriate agent LLM, logs to Supabase, and queues to Obsidian.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
const openai    = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
const google    = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);

// ── Intent detection (mirrors config/routing.json) ──────────────────────────
function detectIntent(text: string): string {
  const t = text.toLowerCase();
  if (/server|deploy|vercel|github|ci|latency|uptime|orion/.test(t))           return 'infra';
  if (/money|invoice|revenue|mrr|stripe|xero|cashflow|sable/.test(t))          return 'finance';
  if (/health|sleep|steps|calendar|reminder|vesper/.test(t))                   return 'personal';
  if (/ads|campaign|roas|facebook|morrigan/.test(t))                           return 'ads';
  if (/research|news|market|summarize|theron/.test(t))                         return 'research';
  if (/remember|recall|memory|obsidian|wrote|said|yesterday|hermes/.test(t))   return 'memory';
  if (/email|message|whatsapp|slack|send|reply|comms|hermes/.test(t))          return 'comms';
  return 'orchestrate';
}

const AGENT_MODELS: Record<string, { provider: string; model: string; id: string }> = {
  orchestrate: { provider: 'anthropic', model: 'claude-sonnet-4-20250514', id: 'cypher'   },
  infra:       { provider: 'anthropic', model: 'claude-haiku-4-20250514',  id: 'orion'    },
  finance:     { provider: 'anthropic', model: 'claude-sonnet-4-20250514', id: 'sable'    },
  personal:    { provider: 'anthropic', model: 'claude-sonnet-4-20250514', id: 'vesper'   },
  ads:         { provider: 'openai',    model: 'gpt-4o',                   id: 'morrigan' },
  research:    { provider: 'google',    model: 'gemini-2.5-pro',           id: 'theron'   },
  memory:      { provider: 'anthropic', model: 'claude-sonnet-4-20250514', id: 'hermes'   },
  comms:       { provider: 'anthropic', model: 'claude-sonnet-4-20250514', id: 'hermes'   },
};

// ── Load agent system prompt ─────────────────────────────────────────────────
const PROMPTS: Record<string, string> = {
  cypher:   `You are Cypher, the CEO-level AI orchestrator for a personal intelligence system.`,
  orion:    `You are Orion, the infrastructure and DevOps agent. Be brief and metric-first.`,
  sable:    `You are Sable, the finance agent. Focus on cashflow, revenue, and financial clarity.`,
  vesper:   `You are Vesper, the personal assistant agent. Handle health, calendar, and personal tasks.`,
  morrigan: `You are Morrigan, the ads and growth agent. Focus on ROAS, campaigns, and conversion.`,
  theron:   `You are Theron, the research agent. Synthesise news, markets, and competitive intel.`,
  hermes:   `You are Hermes, the memory and communications agent. Retrieve, synthesise, and send.`,
};

// ── Retrieve memory context from Hermes ─────────────────────────────────────
async function recallMemory(query: string, agentId: string): Promise<string | null> {
  try {
    const base = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const res = await fetch(`${base}/api/hermes/recall`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, agent_id: agentId, top_k: 4 }),
    });
    const data = await res.json();
    return data.context || null;
  } catch {
    return null;
  }
}

// ── Write memory via Hermes ──────────────────────────────────────────────────
async function rememberExchange(
  agentId: string,
  sessionId: string,
  userText: string,
  agentReply: string,
  intent: string,
  date: string
) {
  try {
    const base = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const content = `User asked [${intent}]: ${userText}\n${agentId.toUpperCase()} replied: ${agentReply}`;
    await fetch(`${base}/api/hermes/remember`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agent_id: agentId,
        session_id: sessionId,
        memory_type: 'conversation',
        content,
        vault_path: `CYPHER/Daily/${date}.md`,
        metadata: { intent },
      }),
    });
  } catch {
    // non-fatal — don't block the response
  }
}

// ── Call the correct LLM ─────────────────────────────────────────────────────
async function callLLM(
  provider: string,
  model: string,
  agentId: string,
  systemPrompt: string,
  userText: string,
  memoryContext: string | null
): Promise<string> {
  const system = memoryContext
    ? `${systemPrompt}\n\n${memoryContext}`
    : systemPrompt;

  if (provider === 'anthropic') {
    const msg = await anthropic.messages.create({
      model,
      max_tokens: 1024,
      system,
      messages: [{ role: 'user', content: userText }],
    });
    return msg.content[0].type === 'text' ? msg.content[0].text : '';
  }

  if (provider === 'openai') {
    const msg = await openai.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: system },
        { role: 'user',   content: userText },
      ],
    });
    return msg.choices[0].message.content || '';
  }

  if (provider === 'google') {
    const genModel = google.getGenerativeModel({ model });
    const chat = genModel.startChat({ history: [] });
    const result = await chat.sendMessage(`${system}\n\n${userText}`);
    return result.response.text();
  }

  return `[${agentId.toUpperCase()}] Unknown provider: ${provider}`;
}

// ── Route handler ────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const { text, session_id } = await req.json();
  if (!text) return NextResponse.json({ error: 'text required' }, { status: 400 });

  const intent = detectIntent(text);
  const agent  = AGENT_MODELS[intent] || AGENT_MODELS.orchestrate;
  const sid    = session_id || crypto.randomUUID();
  const today  = new Date().toLocaleDateString('en-CA', { timeZone: 'Pacific/Auckland' });

  // Log user turn
  await supabase.from('agent_conversations').insert({
    session_id: sid, agent_id: agent.id, speaker: 'user', intent, text,
  });

  // Update live state → thinking
  await supabase.from('cypher_live_state').update({
    agent_idx: ['orion','sable','vesper','morrigan','theron','cypher','hermes'].indexOf(agent.id),
    mode: 'thinking',
    speaker: agent.id.toUpperCase(),
    text: 'Working…',
    updated_at: new Date().toISOString(),
  }).eq('id', 1);

  // Retrieve memory context (Hermes recall)
  const memoryContext = await recallMemory(text, agent.id);

  // Call LLM
  const systemPrompt = PROMPTS[agent.id] || PROMPTS.cypher;
  const reply = await callLLM(agent.provider, agent.model, agent.id, systemPrompt, text, memoryContext);

  // Log agent reply
  await supabase.from('agent_conversations').insert({
    session_id: sid, agent_id: agent.id, speaker: agent.id, intent, text: reply,
  });

  // Write memory via Hermes (non-blocking)
  rememberExchange(agent.id, sid, text, reply, intent, today);

  // Update live state → responding
  await supabase.from('cypher_live_state').update({
    mode: 'responding',
    text: reply,
    updated_at: new Date().toISOString(),
  }).eq('id', 1);

  return NextResponse.json({
    reply,
    agent: agent.id,
    intent,
    session_id: sid,
    memory_injected: !!memoryContext,
  });
}
