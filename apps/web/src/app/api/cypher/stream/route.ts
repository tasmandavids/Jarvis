/**
 * POST /api/cypher/stream
 *
 * Streaming voice endpoint — sentence-level SSE.
 * Designed for the voice agent: emits each complete sentence as it arrives
 * from the LLM so TTS can start playing before the full response is done.
 *
 * Event types:
 *   { type: 'agent',    agent: string }                — which agent is handling this
 *   { type: 'sentence', text: string, agent: string }  — a complete sentence to speak
 *   { type: 'done',     agent: string }                — stream complete
 *   { type: 'error',    message: string }              — something went wrong
 *
 * Provider priority for voice (latency-first):
 *   1. Cerebras  — 2000+ tok/s, lowest latency
 *   2. OpenRouter free — Llama 3.3 70B
 *   3. Anthropic — fallback (streaming supported)
 */
import { NextRequest } from 'next/server';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';

// System prompts — same as chat route but optimised for spoken output:
// shorter sentences, no markdown, no bullet points.
const VOICE_PROMPTS: Record<string, string> = {
  cypher:
    'You are Cypher, an AI orchestrator. Respond as if speaking aloud — concise, no markdown, short sentences. Be decisive and calm like Jarvis from Iron Man.',
  orion:
    'You are Orion, infrastructure agent. Respond concisely, no markdown. Metrics and status in plain speech.',
  sable:
    'You are Sable, finance agent. Respond concisely, no markdown. Plain spoken numbers and recommendations.',
  vesper:
    'You are Vesper, personal assistant. Warm, concise, no markdown. Spoken sentences only.',
  morrigan:
    'You are Morrigan, growth and ads agent. Energetic, concise, no markdown. Spoken only.',
  theron:
    'You are Theron, research agent. Measured, concise, no markdown. Summarise in spoken sentences.',
  hermes:
    'You are Hermes, memory and comms agent. Quick, crisp, no markdown. Spoken sentences only.',
};

const encoder = new TextEncoder();

function sse(obj: Record<string, unknown>): Uint8Array {
  return encoder.encode(`data: ${JSON.stringify(obj)}\n\n`);
}

/** Split buffered text on sentence boundaries, return [sentences[], remainder] */
function extractSentences(buf: string): [string[], string] {
  const sentences: string[] = [];
  // Match sentence endings: period/exclamation/question followed by space or end of string
  const re = /[^.!?]*[.!?]+(?:\s+|$)/g;
  let match: RegExpExecArray | null;
  let lastIdx = 0;

  while ((match = re.exec(buf)) !== null) {
    const s = match[0].trim();
    if (s) sentences.push(s);
    lastIdx = re.lastIndex;
  }

  return [sentences, buf.slice(lastIdx)];
}

// ── Provider clients ──────────────────────────────────────────────────────────

function getCerebrasClient(): OpenAI | null {
  return process.env.CEREBRAS_API_KEY
    ? new OpenAI({ apiKey: process.env.CEREBRAS_API_KEY, baseURL: 'https://api.cerebras.ai/v1' })
    : null;
}

function getOpenRouterClient(): OpenAI | null {
  return process.env.OPENROUTER_API_KEY
    ? new OpenAI({ apiKey: process.env.OPENROUTER_API_KEY, baseURL: 'https://openrouter.ai/api/v1' })
    : null;
}

function getAnthropicClient(): Anthropic | null {
  return process.env.ANTHROPIC_API_KEY
    ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    : null;
}

// ── Streaming helpers ─────────────────────────────────────────────────────────

async function* streamOpenAICompat(
  client: OpenAI,
  model: string,
  system: string,
  user: string,
): AsyncGenerator<string> {
  const stream = await client.chat.completions.create({
    model,
    max_tokens: 512, // voice responses should be concise
    stream: true,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  });
  for await (const chunk of stream) {
    yield chunk.choices[0]?.delta?.content || '';
  }
}

async function* streamAnthropic(
  client: Anthropic,
  model: string,
  system: string,
  user: string,
): AsyncGenerator<string> {
  const stream = await client.messages.create({
    model,
    max_tokens: 512,
    stream: true,
    system,
    messages: [{ role: 'user', content: user }],
  });
  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
      yield event.delta.text;
    }
  }
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const { text } = await req.json().catch(() => ({}));
  if (!text?.trim()) {
    return new Response(JSON.stringify({ error: 'text required' }), { status: 400 });
  }

  // Default to cypher for voice — intent routing via chat route
  const agentId = 'cypher';
  const system = VOICE_PROMPTS[agentId];
  console.log('[stream] received:', text.slice(0, 80));

  const stream = new ReadableStream({
    async start(controller) {
      // Announce which agent is responding
      controller.enqueue(sse({ type: 'agent', agent: agentId }));

      // Build provider cascade — first available wins, 429s fall through to next
      type ProviderAttempt = { label: string; gen: () => AsyncGenerator<string> };
      const providers: ProviderAttempt[] = [];

      const cerebras = getCerebrasClient();
      if (cerebras) providers.push({
        label: 'cerebras',
        gen: () => streamOpenAICompat(cerebras, 'gpt-oss-120b', system, text),
      });

      const openrouter = getOpenRouterClient();
      if (openrouter) providers.push({
        label: 'openrouter',
        gen: () => streamOpenAICompat(openrouter, 'meta-llama/llama-3.3-70b-instruct:free', system, text),
      });

      const anthropic = getAnthropicClient();
      if (anthropic) providers.push({
        label: 'anthropic-haiku',
        gen: () => streamAnthropic(anthropic, 'claude-haiku-4-5-20251001', system, text),
      });

      if (providers.length === 0) {
        controller.enqueue(sse({ type: 'error', message: 'No LLM provider configured' }));
        controller.close();
        return;
      }

      let succeeded = false;
      for (const { label, gen } of providers) {
        try {
          console.log('[stream] trying provider:', label);
          let buffer = '';
          for await (const token of gen()) {
            buffer += token;
            const [sentences, remainder] = extractSentences(buffer);
            buffer = remainder;
            for (const sentence of sentences) {
              controller.enqueue(sse({ type: 'sentence', text: sentence, agent: agentId }));
            }
          }
          if (buffer.trim()) {
            controller.enqueue(sse({ type: 'sentence', text: buffer.trim(), agent: agentId }));
          }
          controller.enqueue(sse({ type: 'done', agent: agentId }));
          succeeded = true;
          break; // done — don't try next provider
        } catch (err) {
          const msg = (err as Error)?.message || '';
          console.warn(`[stream] ${label} failed:`, msg);
          // Always try next provider — only hard-fail on auth errors
          if (msg.includes('401') || msg.toLowerCase().includes('unauthorized') || msg.toLowerCase().includes('invalid api key')) {
            controller.enqueue(sse({ type: 'error', message: `Auth error on ${label}: ${msg}` }));
            break;
          }
          // 429, 404, 5xx → fall through to next provider
        }
      }

      if (!succeeded) {
        controller.enqueue(sse({ type: 'error', message: 'All providers rate-limited. Try again in a moment.' }));
      }

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
