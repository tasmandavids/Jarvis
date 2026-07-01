/**
 * POST /api/cypher/chat
 *
 * Main CYPHER gateway: detects intent, routes to the right persona agent,
 * retrieves memory via Hermes, calls that agent's LLM, logs to Supabase,
 * and queues to Obsidian.
 *
 * Routing is config-driven: intent detection and agent selection come from
 * @jarvis/config (packages/config/data/routing.json), and each agent's
 * provider + model come from its JSON in packages/config/data/agents/.
 * There is no second hardcoded model map — this is the single brain.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { loadAgents, resolveIntent, resolveAgentForIntent } from '@jarvis/config';
import { routeChat, agentMaxTier, type Tier } from '@/lib/model-router';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Display order shared with the cockpit's agent rail (cypher-interface.html).
// hermes has no dedicated tile, so the cockpit folds it onto the orchestrator.
const AGENT_ORDER = ['orion', 'sable', 'vesper', 'morrigan', 'theron', 'cypher', 'hermes'];

// Short persona system prompts. The richer prompts/*.md files aren't bundled
// into the Next standalone server, so the agent identity lives here.
const PROMPTS: Record<string, string> = {
  cypher:   `You are Cypher, the CEO-level AI orchestrator for a personal intelligence system. Be calm, precise, decisive. Brief, route, and act.`,
  orion:    `You are Orion, the infrastructure and DevOps agent. Be brief and metric-first.`,
  sable:    `You are Sable, the finance agent. Focus on cashflow, revenue, and financial clarity.`,
  vesper:   `You are Vesper, the personal assistant agent. Handle health, calendar, and personal tasks.`,
  morrigan: `You are Morrigan, the ads and growth agent. Focus on ROAS, campaigns, and conversion.`,
  theron:   `You are Theron, the research agent. Synthesise news, markets, and competitive intel.`,
  hermes:   `You are Hermes, the memory and communications agent. Retrieve, synthesise, and send.`,
};

// Resolve provider + model + role for an agent from the config JSON.
function agentRuntime(agentId: string): { provider: string; model: string; role?: string } | null {
  const a = loadAgents().find((x) => x.id === agentId);
  return a ? { provider: a.provider, model: a.model, role: (a as Record<string, unknown>).role as string | undefined } : null;
}

// Run a Supabase write but never let a logging failure 500 the user's reply.
async function safeWrite(promise: PromiseLike<unknown>): Promise<void> {
  try {
    await promise;
  } catch (err) {
    console.error('[cypher] supabase write failed:', (err as Error)?.message);
  }
}

// ── Retrieve memory context from Hermes ─────────────────────────────────────
async function recallMemory(query: string, agentId: string): Promise<string | null> {
  try {
    const base = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3005';
    const res = await fetch(`${base}/api/hermes/recall`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, agent_id: agentId, top_k: 4 }),
    });
    if (!res.ok) return null;
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
    const base = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3005';
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

// ── Call LLM via the Tier 0→3 router ────────────────────────────────────────
async function callLLM(
  _provider: string,
  _model: string,
  agentId: string,
  systemPrompt: string,
  userText: string,
  memoryContext: string | null,
  maxTier: Tier = 3
): Promise<{ text: string; tier: Tier; provider: string; model: string }> {
  const system = memoryContext ? `${systemPrompt}\n\n${memoryContext}` : systemPrompt;
  return routeChat(system, userText, { maxTier });
}

// ── Route handler ────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  let text: string | undefined;
  let session_id: string | undefined;
  try {
    ({ text, session_id } = await req.json());
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  if (!text) return NextResponse.json({ error: 'text required' }, { status: 400 });

  // Config-driven routing: intent → agent → provider/model (single source).
  const intent = resolveIntent(text);
  let agentId = resolveAgentForIntent(intent);
  if (!PROMPTS[agentId]) agentId = 'cypher';
  const rt = agentRuntime(agentId) || { provider: 'anthropic', model: 'claude-sonnet-4-6', role: undefined };
  // Determine max tier from agent role (config json role field, or inferred from id)
  const roleKey = rt.role || agentId;
  const maxTier = agentMaxTier(roleKey);

  const sid = session_id || crypto.randomUUID();
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Pacific/Auckland' });
  const agentIdx = Math.max(0, AGENT_ORDER.indexOf(agentId));

  // Log user turn (non-blocking on failure)
  await safeWrite(
    supabase.from('agent_conversations').insert({
      session_id: sid, agent_id: agentId, speaker: 'user', intent, text,
    })
  );

  // Update live state → thinking
  await safeWrite(
    supabase.from('cypher_live_state').update({
      agent_idx: agentIdx,
      mode: 'thinking',
      speaker: agentId.toUpperCase(),
      text: 'Working…',
      updated_at: new Date().toISOString(),
    }).eq('id', 1)
  );

  // Retrieve memory context (Hermes recall)
  const memoryContext = await recallMemory(text, agentId);

  // Call the LLM via router — a complete cascade failure becomes a clean 502.
  let reply: string;
  let usedModel: string = rt.model;
  let usedProvider: string = rt.provider;
  try {
    const result = await callLLM(rt.provider, rt.model, agentId, PROMPTS[agentId], text, memoryContext, maxTier);
    reply = result.text || '(the model returned no text)';
    usedModel = result.model;
    usedProvider = result.provider;
  } catch (err) {
    const message = (err as Error)?.message || 'LLM call failed';
    console.error('[cypher] LLM error:', message);
    await safeWrite(
      supabase.from('cypher_live_state').update({
        mode: 'error', speaker: agentId.toUpperCase(),
        text: `LLM error: ${message}`, updated_at: new Date().toISOString(),
      }).eq('id', 1)
    );
    return NextResponse.json(
      { error: message, agent: agentId, intent, session_id: sid },
      { status: 502 }
    );
  }

  // Log agent reply
  await safeWrite(
    supabase.from('agent_conversations').insert({
      session_id: sid, agent_id: agentId, speaker: agentId, intent, text: reply,
    })
  );

  // Write memory via Hermes (non-blocking)
  rememberExchange(agentId, sid, text, reply, intent, today);

  // Update live state → responding
  await safeWrite(
    supabase.from('cypher_live_state').update({
      mode: 'responding', text: reply, updated_at: new Date().toISOString(),
    }).eq('id', 1)
  );

  return NextResponse.json({
    reply,
    agent: agentId,
    intent,
    model: usedModel,
    provider: usedProvider,
    session_id: sid,
    memory_injected: !!memoryContext,
  });
}
