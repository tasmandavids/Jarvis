/**
 * CYPHER Model Router — Tier 0 → 3 cascade
 *
 * Sends each request to the cheapest tier that can handle it,
 * falling back automatically on rate-limits (429) or errors.
 *
 * Tier 0  Local      Ollama (Llama 3.3 70B) — $0, private, only when Mac is on
 * Tier 1  Free cloud Groq + Cerebras + Gemini Flash + OpenRouter free models — $0
 * Tier 2  Cheap paid Hermes 4 70B on OpenRouter ($0.13/$0.40 /M) — cents
 * Tier 3  Premium    Claude / GPT-4o — hard-capped, last resort
 *
 * All OpenAI-compatible APIs (Groq, Cerebras, OpenRouter, Ollama) share one
 * OpenAI SDK instance per base URL — no extra dependencies required.
 */

import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';

// ── Types ─────────────────────────────────────────────────────────────────────

export type Tier = 0 | 1 | 2 | 3;

export interface RouterResult {
  text: string;
  tier: Tier;
  provider: string;
  model: string;
}

interface ModelEntry {
  tier: Tier;
  provider: string;
  model: string;
  /** For OpenAI-compat providers (Groq, Cerebras, OpenRouter, Ollama) */
  baseURL?: string;
  /** Resolved API key — entry skipped if falsy */
  apiKey?: string;
}

// ── Model table ───────────────────────────────────────────────────────────────
// Entries are tried in order within each tier; tiers are tried lowest→highest.
// Add / reorder models here — no other file needs changing.

function buildTable(): ModelEntry[] {
  const e = process.env;
  return [
    // ── Tier 0 — Local (Ollama) ──────────────────────────────────────────────
    // Only tried if OLLAMA_BASE_URL is set (e.g. http://localhost:11434/v1).
    // No API key needed; the presence of the env var is the gate.
    {
      tier: 0,
      provider: 'ollama',
      model: e.OLLAMA_MODEL || 'llama3.3:70b',
      baseURL: e.OLLAMA_BASE_URL,
      apiKey: e.OLLAMA_BASE_URL ? 'ollama' : undefined, // dummy key — Ollama ignores it
    },

    // ── Tier 1 — Free cloud ──────────────────────────────────────────────────
    // Cerebras: gpt-oss-120b @ ~3000 tok/s (Llama models removed June 2025)
    {
      tier: 1,
      provider: 'cerebras',
      model: 'gpt-oss-120b',
      baseURL: 'https://api.cerebras.ai/v1',
      apiKey: e.CEREBRAS_API_KEY,
    },
    // Groq: fast, 14 400 req/day on 8B, smaller limits on 70B
    {
      tier: 1,
      provider: 'groq',
      model: 'llama-3.3-70b-versatile',
      baseURL: 'https://api.groq.com/openai/v1',
      apiKey: e.GROQ_API_KEY,
    },
    {
      tier: 1,
      provider: 'groq',
      model: 'llama-3.1-8b-instant',   // fallback within Groq when 70B is rate-limited
      baseURL: 'https://api.groq.com/openai/v1',
      apiKey: e.GROQ_API_KEY,
    },
    // Gemini Flash: 1 500 req/day, 1M context, multimodal
    {
      tier: 1,
      provider: 'google',
      model: 'gemini-2.0-flash',
      apiKey: e.GOOGLE_API_KEY,
    },
    // OpenRouter free models (20+ models, one key)
    {
      tier: 1,
      provider: 'openrouter',
      model: 'meta-llama/llama-3.3-70b-instruct:free',
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey: e.OPENROUTER_API_KEY,
    },
    {
      tier: 1,
      provider: 'openrouter',
      model: 'mistralai/mistral-7b-instruct:free',
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey: e.OPENROUTER_API_KEY,
    },

    // ── Tier 2 — Cheap paid ──────────────────────────────────────────────────
    // Hermes 4 70B: $0.13 in / $0.40 out per M — the sweet-spot brain
    {
      tier: 2,
      provider: 'openrouter',
      model: 'nousresearch/hermes-4-70b',
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey: e.OPENROUTER_API_KEY,
    },
    // Hermes 4 405B for hard tasks
    {
      tier: 2,
      provider: 'openrouter',
      model: 'nousresearch/hermes-4-405b',
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey: e.OPENROUTER_API_KEY,
    },
    // Groq paid (very cheap, very fast)
    {
      tier: 2,
      provider: 'groq',
      model: 'llama-3.3-70b-versatile',
      baseURL: 'https://api.groq.com/openai/v1',
      apiKey: e.GROQ_API_KEY,
    },

    // ── Tier 3 — Premium (hard-capped, last resort) ──────────────────────────
    {
      tier: 3,
      provider: 'anthropic',
      model: e.ANTHROPIC_DEFAULT_MODEL || 'claude-haiku-4-5-20251001', // default to Haiku — cheapest Claude
      apiKey: e.ANTHROPIC_API_KEY,
    },
    {
      tier: 3,
      provider: 'anthropic',
      model: 'claude-sonnet-4-6',
      apiKey: e.ANTHROPIC_API_KEY,
    },
    {
      tier: 3,
      provider: 'openai',
      model: 'gpt-4o-mini',
      apiKey: e.OPENAI_API_KEY,
    },
  ];
}

// ── Client cache — one client per unique baseURL/key combo ───────────────────

const _openaiClients = new Map<string, OpenAI>();
const _anthropicClient = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;
const _googleClient = process.env.GOOGLE_API_KEY
  ? new GoogleGenerativeAI(process.env.GOOGLE_API_KEY)
  : null;

function getOpenAIClient(baseURL: string, apiKey: string): OpenAI {
  const key = `${baseURL}::${apiKey}`;
  if (!_openaiClients.has(key)) {
    _openaiClients.set(key, new OpenAI({ apiKey, baseURL }));
  }
  return _openaiClients.get(key)!;
}

// ── Single model call ─────────────────────────────────────────────────────────

async function callModel(
  entry: ModelEntry,
  system: string,
  user: string,
  maxTokens = 1024,
): Promise<string> {
  const { provider, model, baseURL, apiKey } = entry;

  // OpenAI-compatible (Groq, Cerebras, OpenRouter, Ollama)
  if (provider !== 'anthropic' && provider !== 'google') {
    const client = getOpenAIClient(baseURL!, apiKey!);
    const res = await client.chat.completions.create({
      model,
      max_tokens: maxTokens,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    });
    return res.choices[0]?.message?.content || '';
  }

  if (provider === 'anthropic') {
    if (!_anthropicClient) throw new Error('ANTHROPIC_API_KEY not set');
    const msg = await _anthropicClient.messages.create({
      model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: user }],
    });
    const block = msg.content.find((b) => b.type === 'text');
    return block && block.type === 'text' ? block.text : '';
  }

  if (provider === 'google') {
    if (!_googleClient) throw new Error('GOOGLE_API_KEY not set');
    const genModel = _googleClient.getGenerativeModel({ model });
    const result = await genModel.generateContent(`${system}\n\n${user}`);
    return result.response.text();
  }

  throw new Error(`Unknown provider: ${provider}`);
}

// ── Is this a rate-limit or capacity error? ───────────────────────────────────

function isRateLimit(err: unknown): boolean {
  const msg = String((err as Error)?.message || '').toLowerCase();
  const status = (err as { status?: number })?.status;
  return status === 429 || msg.includes('rate limit') || msg.includes('quota') || msg.includes('capacity');
}

// ── Public router ─────────────────────────────────────────────────────────────

export interface RouterOptions {
  /** Don't use tiers above this. Default: 3 (try everything) */
  maxTier?: Tier;
  /** Don't use tiers below this. Default: 0 */
  minTier?: Tier;
  maxTokens?: number;
}

/**
 * Route a chat request through the tier cascade.
 * Tries models in tier order; falls back on rate-limit or error.
 * Throws only if every model in every allowed tier fails.
 */
export async function routeChat(
  system: string,
  user: string,
  opts: RouterOptions = {},
): Promise<RouterResult> {
  const { maxTier = 3, minTier = 0, maxTokens = 1024 } = opts;
  const table = buildTable().filter(
    (e) => e.tier >= minTier && e.tier <= maxTier && !!e.apiKey,
  );

  const errors: string[] = [];

  for (const entry of table) {
    try {
      const text = await callModel(entry, system, user, maxTokens);
      if (text) {
        console.log(`[router] ✓ tier${entry.tier} ${entry.provider}/${entry.model}`);
        return { text, tier: entry.tier, provider: entry.provider, model: entry.model };
      }
    } catch (err) {
      const msg = `${entry.provider}/${entry.model}: ${(err as Error)?.message}`;
      errors.push(msg);
      if (isRateLimit(err)) {
        console.warn(`[router] rate-limited on ${entry.provider}/${entry.model} — trying next`);
      } else {
        console.error(`[router] error on ${entry.provider}/${entry.model}:`, (err as Error)?.message);
      }
    }
  }

  throw new Error(`All models failed (maxTier=${maxTier}):\n${errors.join('\n')}`);
}

/**
 * Map an agent role to its max allowed tier.
 * Prevents expensive models being used for simple tasks.
 */
export function agentMaxTier(role: string): Tier {
  switch (role) {
    case 'memory':       return 1; // lightweight memory ops — free tier is fine
    case 'memory-comms': return 1; // Hermes — recall/store, free tier is fine
    case 'specialist':   return 2; // Theron/Orion/Sable/Morrigan/Vesper — Hermes 70B ok
    case 'orchestrator': return 3; // Cypher CEO — full power when needed
    default:             return 2;
  }
}
