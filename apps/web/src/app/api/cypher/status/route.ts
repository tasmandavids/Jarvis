import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET() {
  const [{ data: live }, { data: connectors }, { data: recentLogs }] = await Promise.all([
    supabase.from('cypher_live_state').select('*').single(),
    supabase.from('connector_status').select('id,status,last_synced'),
    supabase.from('agent_conversations').select('agent_id,created_at')
      .gte('created_at', new Date(Date.now() - 86400000).toISOString())
      .order('created_at', { ascending: false }).limit(50),
  ]);

  const agentCounts = (recentLogs || []).reduce((acc: Record<string, number>, row: { agent_id: string }) => {
    acc[row.agent_id] = (acc[row.agent_id] || 0) + 1;
    return acc;
  }, {});

  return NextResponse.json({ live, connectors, agent_activity_24h: agentCounts });
}
