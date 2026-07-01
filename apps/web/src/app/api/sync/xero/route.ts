/**
 * POST /api/sync/xero
 *
 * Pulls Profit & Loss (for burn) and Bank Summary (for cash) from Xero's
 * Accounting API and writes them into cypher_live_state.metrics.finance
 * (merged alongside whatever Stripe already put there) + connector_status('xero').
 *
 * Requires a completed one-time OAuth consent via /api/auth/xero/start first —
 * this route only refreshes/uses the token already stored in oauth_tokens.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getValidAccessToken, xeroGet, findReportRowValue } from '@/lib/xero';

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

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

export async function POST(req: NextRequest) {
  const { secret } = await req.json().catch(() => ({}));
  if (secret !== process.env.SYNC_SECRET) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const supabase = getSupabase();

  try {
    const { accessToken, tenantId } = await getValidAccessToken();

    const today = new Date();
    const threeMonthsAgo = new Date(today);
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

    const [pnl, bankSummary, org] = await Promise.all([
      xeroGet(`Reports/ProfitAndLoss?fromDate=${isoDate(threeMonthsAgo)}&toDate=${isoDate(today)}`, tenantId, accessToken),
      xeroGet(`Reports/BankSummary?fromDate=${isoDate(threeMonthsAgo)}&toDate=${isoDate(today)}`, tenantId, accessToken),
      xeroGet('Organisation', tenantId, accessToken),
    ]);
    const currency = (org?.Organisations?.[0]?.BaseCurrency || 'nzd').toLowerCase();

    const totalIncome = findReportRowValue(pnl, 'Total Income') || 0;
    const totalExpenses = findReportRowValue(pnl, 'Total Expenses') || 0;
    const months = (today.getTime() - threeMonthsAgo.getTime()) / (30 * 86400000);
    const burn = (totalExpenses - totalIncome) / Math.max(1, months);

    // BankSummary rows: one per bank account, last cell = closing balance.
    const bankRows = bankSummary?.Reports?.[0]?.Rows?.flatMap((s: any) => s.Rows || []) || [];
    const cash = bankRows.reduce((sum: number, row: any) => {
      const cells = row.Cells || [];
      const val = parseFloat(cells[cells.length - 1]?.Value);
      return sum + (Number.isFinite(val) ? val : 0);
    }, 0);

    const runway = burn > 0 ? cash / burn : null;

    const xeroFinance = { burn, cash, runway, currency, xeroSyncedAt: new Date().toISOString() };

    const { data: row } = await supabase.from('cypher_live_state').select('metrics').eq('id', 1).single();
    const metrics = { ...(row?.metrics || {}), finance: { ...(row?.metrics?.finance || {}), ...xeroFinance } };

    await supabase.from('cypher_live_state').update({ metrics }).eq('id', 1);
    await supabase.from('connector_status').update({
      status: 'ok',
      last_synced: new Date().toISOString(),
      last_error: null,
      metadata: { burn, cash, runway },
    }).eq('id', 'xero');

    return NextResponse.json({ ok: true, finance: xeroFinance });
  } catch (err) {
    const message = (err as Error)?.message || 'unknown error';
    await supabase.from('connector_status').update({ status: 'error', last_error: message }).eq('id', 'xero');
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
