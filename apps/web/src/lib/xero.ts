/**
 * Xero OAuth2 helper — token storage/refresh + a thin Accounting API client.
 *
 * Flow: /api/auth/xero/start -> Xero consent -> /api/auth/xero/callback
 * stores { access_token, refresh_token, tenant_id } in oauth_tokens (id='xero').
 * /api/sync/xero calls xeroFetch(), which refreshes the access token first if
 * it's expired — Xero access tokens last 30 minutes, refresh tokens rotate on
 * every use and must be re-persisted each time.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const XERO_TOKEN_URL = 'https://identity.xero.com/connect/token';
const XERO_API_BASE = 'https://api.xero.com/api.xro/2.0';
const XERO_CONNECTIONS_URL = 'https://api.xero.com/connections';

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

type TokenRow = {
  access_token: string | null;
  refresh_token: string | null;
  expires_at: string | null;
  tenant_id: string | null;
};

function basicAuthHeader() {
  return 'Basic ' + Buffer.from(`${process.env.XERO_CLIENT_ID}:${process.env.XERO_CLIENT_SECRET}`).toString('base64');
}

export async function exchangeCodeForTokens(code: string, redirectUri: string) {
  const res = await fetch(XERO_TOKEN_URL, {
    method: 'POST',
    headers: { Authorization: basicAuthHeader(), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri }),
  });
  if (!res.ok) throw new Error(`Xero token exchange ${res.status}: ${await res.text()}`);
  return res.json() as Promise<{ access_token: string; refresh_token: string; expires_in: number }>;
}

async function refreshTokens(refreshToken: string) {
  const res = await fetch(XERO_TOKEN_URL, {
    method: 'POST',
    headers: { Authorization: basicAuthHeader(), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }),
  });
  if (!res.ok) throw new Error(`Xero token refresh ${res.status}: ${await res.text()}`);
  return res.json() as Promise<{ access_token: string; refresh_token: string; expires_in: number }>;
}

export async function fetchTenantId(accessToken: string): Promise<string> {
  const res = await fetch(XERO_CONNECTIONS_URL, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error(`Xero connections ${res.status}: ${await res.text()}`);
  const conns = await res.json();
  if (!conns?.[0]?.tenantId) throw new Error('No Xero organisation connected to this app');
  return conns[0].tenantId;
}

export async function saveTokens(tokens: { access_token: string; refresh_token: string; expires_in: number }, tenantId: string) {
  const supabase = getSupabase();
  await supabase.from('oauth_tokens').upsert({
    id: 'xero',
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
    tenant_id: tenantId,
    updated_at: new Date().toISOString(),
  });
}

/** Returns a valid access token + tenant id, refreshing first if needed. */
export async function getValidAccessToken(): Promise<{ accessToken: string; tenantId: string }> {
  const supabase = getSupabase();
  const { data: row } = await supabase.from('oauth_tokens').select('*').eq('id', 'xero').single<TokenRow>();
  if (!row?.refresh_token || !row.tenant_id) {
    throw new Error('Xero not connected — visit /api/auth/xero/start to authorize');
  }

  const expiresAt = row.expires_at ? new Date(row.expires_at).getTime() : 0;
  if (row.access_token && expiresAt - Date.now() > 60_000) {
    return { accessToken: row.access_token, tenantId: row.tenant_id };
  }

  const refreshed = await refreshTokens(row.refresh_token);
  await saveTokens(refreshed, row.tenant_id);
  return { accessToken: refreshed.access_token, tenantId: row.tenant_id };
}

export async function xeroGet(path: string, tenantId: string, accessToken: string) {
  const res = await fetch(`${XERO_API_BASE}/${path}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Xero-tenant-id': tenantId,
      Accept: 'application/json',
    },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Xero API ${path} ${res.status}: ${await res.text()}`);
  return res.json();
}

// Xero's Reports API returns a spreadsheet-like Rows/Cells matrix. This walks
// it looking for a summary row by title (e.g. "Total Income") and reads the
// last non-empty cell as the value for the most recent period.
export function findReportRowValue(report: any, rowTitle: string): number | null {
  const rows = report?.Reports?.[0]?.Rows || [];
  for (const section of rows) {
    for (const row of section.Rows || []) {
      const label = row.Cells?.[0]?.Value;
      if (label === rowTitle) {
        const cells = row.Cells || [];
        const last = cells[cells.length - 1]?.Value;
        const num = parseFloat(last);
        return Number.isFinite(num) ? num : null;
      }
    }
  }
  return null;
}
