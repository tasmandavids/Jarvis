/**
 * GET /api/auth/xero/callback
 *
 * Xero redirects here after the user approves the consent screen. Exchanges
 * the code for tokens, resolves the connected organisation's tenant id, and
 * stores both in oauth_tokens. One-time step — after this, /api/sync/xero
 * refreshes tokens on its own.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { exchangeCodeForTokens, fetchTenantId, saveTokens } from '@/lib/xero';

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

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  const state = req.nextUrl.searchParams.get('state');
  const expectedState = req.cookies.get('xero_oauth_state')?.value;
  const error = req.nextUrl.searchParams.get('error');

  if (error) {
    return NextResponse.json({ error: `Xero denied consent: ${error}` }, { status: 400 });
  }
  if (!code) {
    return NextResponse.json({ error: 'missing code' }, { status: 400 });
  }
  if (!state || !expectedState || state !== expectedState) {
    return NextResponse.json({ error: 'state mismatch — restart at /api/auth/xero/start' }, { status: 400 });
  }

  const redirectUri = `${req.nextUrl.origin}/api/auth/xero/callback`;

  try {
    const tokens = await exchangeCodeForTokens(code, redirectUri);
    const tenantId = await fetchTenantId(tokens.access_token);
    await saveTokens(tokens, tenantId);

    const supabase = getSupabase();
    await supabase.from('connector_status').update({
      status: 'ok',
      last_synced: new Date().toISOString(),
      last_error: null,
    }).eq('id', 'xero');

    const res = NextResponse.redirect(new URL('/?xero=connected', req.nextUrl.origin));
    res.cookies.delete('xero_oauth_state');
    return res;
  } catch (err) {
    const message = (err as Error)?.message || 'unknown error';
    const supabase = getSupabase();
    await supabase.from('connector_status').update({ status: 'error', last_error: message }).eq('id', 'xero');
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
