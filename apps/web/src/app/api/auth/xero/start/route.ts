/**
 * GET /api/auth/xero/start
 *
 * Kicks off the one-time Xero OAuth2 consent. Visit this URL in a browser
 * (not via fetch) — it redirects to Xero's login/consent screen, which
 * redirects back to /api/auth/xero/callback.
 */
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';

export async function GET(req: NextRequest) {
  if (!process.env.XERO_CLIENT_ID) {
    return NextResponse.json({ error: 'XERO_CLIENT_ID not set' }, { status: 400 });
  }

  const redirectUri = `${req.nextUrl.origin}/api/auth/xero/callback`;
  const state = crypto.randomBytes(16).toString('hex');

  const authorizeUrl = new URL('https://login.xero.com/identity/connect/authorize');
  authorizeUrl.searchParams.set('response_type', 'code');
  authorizeUrl.searchParams.set('client_id', process.env.XERO_CLIENT_ID);
  authorizeUrl.searchParams.set('redirect_uri', redirectUri);
  authorizeUrl.searchParams.set('scope', 'offline_access accounting.reports.read accounting.transactions.read');
  authorizeUrl.searchParams.set('state', state);

  const res = NextResponse.redirect(authorizeUrl.toString());
  res.cookies.set('xero_oauth_state', state, { httpOnly: true, maxAge: 600, sameSite: 'lax', path: '/' });
  return res;
}
