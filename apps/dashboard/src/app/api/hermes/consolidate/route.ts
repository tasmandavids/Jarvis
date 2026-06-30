/**
 * POST /api/hermes/consolidate
 *
 * Nightly consolidation: reads today's agent_conversations, asks Claude to
 * distil them into a structured summary, writes to Obsidian, and extracts
 * persistent facts back into agent_memory.
 *
 * Trigger via n8n cron at 23:00 NZT, or call directly.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

export async function POST(req: NextRequest) {
  // Allow specifying a date; default to today NZT
  const { date, secret } = await req.json().catch(() => ({}));

  if (secret !== process.env.CONSOLIDATION_SECRET) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const targetDate = date || new Date().toLocaleDateString('en-CA', { timeZone: 'Pacific/Auckland' });
  const dayStart = new Date(`${targetDate}T00:00:00+12:00`).toISOString();
  const dayEnd   = new Date(`${targetDate}T23:59:59+12:00`).toISOString();

  // Fetch all conversations for the day
  const { data: convos } = await supabase
    .from('agent_conversations')
    .select('agent_id, speaker, intent, text, created_at')
    .gte('created_at', dayStart)
    .lte('created_at', dayEnd)
    .order('created_at');

  if (!convos?.length) {
    return NextResponse.json({ message: 'no conversations to consolidate', date: targetDate });
  }

  const transcript = convos
    .map((c) => `[${c.speaker.toUpperCase()}] ${c.text}`)
    .join('\n');

  // Ask Hermes/Claude to consolidate
  const consolidationPrompt = `You are Hermes, memory keeper for the CYPHER system.

Below is today's full conversation transcript (${targetDate}). Produce a structured consolidation with these sections:

## Summary
2-3 sentences covering what happened today overall.

## Decisions Made
Bullet list of any decisions, approvals, or commitments.

## Action Items
Bullet list of unresolved tasks or follow-ups, with responsible agent where known.

## Facts Learned
Bullet list of new persistent facts (about people, businesses, systems, or patterns) worth keeping long-term.

## Agent Activity
Brief note on which agents were active and what they handled.

---
TRANSCRIPT:
${transcript}`;

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2048,
    messages: [{ role: 'user', content: consolidationPrompt }],
  });

  const summary = response.content[0].type === 'text' ? response.content[0].text : '';

  // Write summary to Obsidian
  await supabase.from('obsidian_log').insert({
    vault_path: `CYPHER/Summaries/${targetDate}.md`,
    content: `# CYPHER Daily Summary — ${targetDate}\n\n${summary}`,
    frontmatter: { type: 'summary', date: targetDate, agent: 'hermes' },
  });

  // Extract facts section and store each as a persistent agent_memory
  const factsMatch = summary.match(/## Facts Learned\n([\s\S]*?)(?=\n##|$)/);
  if (factsMatch) {
    const facts = factsMatch[1]
      .split('\n')
      .map((l: string) => l.replace(/^[-*]\s*/, '').trim())
      .filter(Boolean);

    for (const fact of facts) {
      await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/hermes/remember`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent_id: 'hermes',
          memory_type: 'fact',
          content: fact,
          vault_path: `CYPHER/Knowledge/${targetDate}-facts.md`,
          metadata: { source: 'consolidation', date: targetDate },
        }),
      });
    }
  }

  // Update connector status for obsidian
  await supabase.from('connector_status').update({
    status: 'ok',
    last_synced: new Date().toISOString(),
  }).eq('id', 'obsidian');

  return NextResponse.json({
    date: targetDate,
    conversations_processed: convos.length,
    summary_written: `CYPHER/Summaries/${targetDate}.md`,
  });
}
