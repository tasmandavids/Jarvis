/**
 * POST /api/sync/stripe
 *
 * Pulls balance + recent transaction activity from the Stripe REST API and
 * writes it into cypher_live_state.metrics.finance + connector_status('stripe'),
 * same pattern as /api/sync/vercel.
 *
 * Trigger via n8n cron, or call directly. Requires STRIPE_SECRET_KEY.
 *
 * Deliberately does NOT report "burn" or "runway" — those need real expense
 * data (Xero), which isn't wired yet. Reporting a fabricated number under a
 * "LIVE" badge would be worse than just leaving those fields on demo data.
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

async function stripeGet(path: string) {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    headers: { Authorization: `Basic ${Buffer.from(`${process.env.STRIPE_SECRET_KEY}:`).toString('base64')}` },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Stripe API ${res.status}: ${await res.text()}`);
  return res.json();
}

type Balance = { available: { amount: number; currency: string }[] };
type Txn = { amount: number; net: number; created: number; currency: string };
type Payout = { amount: number; currency: string; arrival_date: number; status: string };

export async function POST(req: NextRequest) {
  const { secret } = await req.json().catch(() => ({}));
  if (secret !== process.env.SYNC_SECRET) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ error: 'STRIPE_SECRET_KEY not set' }, { status: 400 });
  }

  const supabase = getSupabase();

  try {
    const thirtyDaysAgo = Math.floor((Date.now() - 30 * 86400000) / 1000);

    const [balance, txns, payouts] = await Promise.all([
      stripeGet('balance') as Promise<Balance>,
      stripeGet(`balance_transactions?limit=100&created[gte]=${thirtyDaysAgo}`) as Promise<{ data: Txn[] }>,
      stripeGet('payouts?limit=1') as Promise<{ data: Payout[] }>,
    ]);

    const primaryCurrency = balance.available[0]?.currency || 'usd';
    const balanceTotal = balance.available
      .filter((b) => b.currency === primaryCurrency)
      .reduce((sum, b) => sum + b.amount, 0) / 100;

    const netLast30d = (txns.data || []).reduce((sum, t) => sum + t.net, 0) / 100;
    const chargeCount30d = (txns.data || []).filter((t) => t.net > 0).length;

    // Bucket the 30-day window into 12 points for a spark line (oldest -> newest).
    const bucketCount = 12;
    const bucketSpanSec = (30 * 86400) / bucketCount;
    const spark = new Array(bucketCount).fill(0);
    for (const t of txns.data || []) {
      const elapsed = t.created - thirtyDaysAgo;
      const idx = Math.min(bucketCount - 1, Math.max(0, Math.floor(elapsed / bucketSpanSec)));
      spark[idx] += t.net / 100;
    }

    const lastPayout = payouts.data?.[0]
      ? { amount: payouts.data[0].amount / 100, currency: payouts.data[0].currency, arrivalDate: payouts.data[0].arrival_date * 1000, status: payouts.data[0].status }
      : null;

    const finance = {
      balance: balanceTotal,
      currency: primaryCurrency,
      netLast30d,
      chargeCount30d,
      spark,
      lastPayout,
      syncedAt: new Date().toISOString(),
    };

    const { data: row } = await supabase.from('cypher_live_state').select('metrics').eq('id', 1).single();
    const metrics = { ...(row?.metrics || {}), finance };

    await supabase.from('cypher_live_state').update({ metrics }).eq('id', 1);
    await supabase.from('connector_status').update({
      status: 'ok',
      last_synced: new Date().toISOString(),
      last_error: null,
      metadata: { balance: balanceTotal, netLast30d },
    }).eq('id', 'stripe');

    return NextResponse.json({ ok: true, finance });
  } catch (err) {
    const message = (err as Error)?.message || 'unknown error';
    await supabase.from('connector_status').update({
      status: 'error',
      last_error: message,
    }).eq('id', 'stripe');
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
