/**
 * GET /api/public-config
 *
 * cypher-interface.html is a static file in /public — it never goes through
 * Next's bundler, so it has no way to read NEXT_PUBLIC_* env vars directly.
 * This hands it just enough to open its own Supabase client and subscribe to
 * cypher_live_state Realtime updates. Both values are the anon/publishable
 * key + project URL — designed to be public, same as anywhere else Supabase
 * is used client-side.
 */
import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || null,
    supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || null,
  });
}
