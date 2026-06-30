import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET() {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    // Prefer service role key for backend routes, fallback to anon key for simple ping
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json(
        { status: "error", error: "Missing Supabase credentials in environment" },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Simple ping query
    const { error } = await supabase.from("tasks").select("id").limit(1);

    if (error) {
      throw error;
    }

    return NextResponse.json({
      status: "ok",
      connected: true,
    });
  } catch (error: any) {
    return NextResponse.json({ status: "error", error: error.message, connected: false }, { status: 500 });
  }
}
