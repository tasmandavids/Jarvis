/**
 * POST /api/sync/vercel
 *
 * Pulls recent deployment state from the Vercel REST API and writes it into
 * cypher_live_state.metrics.infra + connector_status('vercel'), the same
 * tables the dashboard's /api/cypher/status route already reads.
 *
 * Trigger via n8n cron (same pattern as hermes/consolidate), or call directly.
 * Requires VERCEL_TOKEN. VERCEL_PROJECT_ID / VERCEL_TEAM_ID are optional
 * scoping filters — omit to read across everything the token can see.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

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

type VercelDeployment = {
  uid: string;
  name: string;
  state: 'READY' | 'ERROR' | 'BUILDING' | 'QUEUED' | 'CANCELED' | string;
  created: number;
  meta?: { githubCommitRef?: string; githubCommitSha?: string };
};

async function fetchDeployments(): Promise<VercelDeployment[]> {
  const params = new URLSearchParams({ limit: '20' });
  if (process.env.VERCEL_PROJECT_ID) params.set('projectId', process.env.VERCEL_PROJECT_ID);
  if (process.env.VERCEL_TEAM_ID) params.set('teamId', process.env.VERCEL_TEAM_ID);

  const res = await fetch(`https://api.vercel.com/v6/deployments?${params}`, {
    headers: { Authorization: `Bearer ${process.env.VERCEL_TOKEN}` },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Vercel API ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.deployments || [];
}

export async function POST(req: NextRequest) {
  const { secret } = await req.json().catch(() => ({}));
  if (secret !== process.env.SYNC_SECRET) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!process.env.VERCEL_TOKEN) {
    return NextResponse.json({ error: 'VERCEL_TOKEN not set' }, { status: 400 });
  }

  const supabase = getSupabase();

  try {
    const deployments = await fetchDeployments();
    const latest = deployments[0];
    const dayAgo = Date.now() - 86400000;
    const deploysToday = deployments.filter((d) => d.created >= dayAgo).length;
    const errorCount = deployments.filter((d) => d.state === 'ERROR').length;

    const infra = {
      status: latest?.state || 'unknown',
      project: latest?.name || null,
      branch: latest?.meta?.githubCommitRef || null,
      commit: latest?.meta?.githubCommitSha?.slice(0, 7) || null,
      deployedAgoMs: latest ? Date.now() - latest.created : null,
      deploysToday,
      errorsLast20: errorCount,
      syncedAt: new Date().toISOString(),
    };

    const { data: row } = await supabase.from('cypher_live_state').select('metrics').eq('id', 1).single();
    const metrics = { ...(row?.metrics || {}), infra };

    await supabase.from('cypher_live_state').update({ metrics }).eq('id', 1);
    await supabase.from('connector_status').update({
      status: 'ok',
      last_synced: new Date().toISOString(),
      last_error: null,
      metadata: { deploysToday, errorsLast20: errorCount },
    }).eq('id', 'vercel');

    return NextResponse.json({ ok: true, infra });
  } catch (err) {
    const message = (err as Error)?.message || 'unknown error';
    await supabase.from('connector_status').update({
      status: 'error',
      last_error: message,
    }).eq('id', 'vercel');
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
