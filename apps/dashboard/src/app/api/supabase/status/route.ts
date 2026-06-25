import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const TABLES = [
  "clients",
  "tasks",
  "memory",
  "agent_runs",
  "comms_log",
] as const;

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    return NextResponse.json({
      connected: false,
      reason: "Supabase env vars not configured",
    });
  }

  const supabase = createClient(url, key);
  const counts: Record<string, number | null> = {};
  let hasError = false;
  let errorMessage: string | undefined;

  for (const table of TABLES) {
    const { count, error } = await supabase
      .from(table)
      .select("*", { count: "exact", head: true });

    if (error) {
      hasError = true;
      errorMessage = error.message;
      counts[table] = null;
    } else {
      counts[table] = count ?? 0;
    }
  }

  if (hasError) {
    return NextResponse.json({
      connected: false,
      reason: errorMessage,
      counts,
    });
  }

  return NextResponse.json({
    connected: true,
    project_url: url,
    counts,
  });
}
