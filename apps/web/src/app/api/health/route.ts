import { NextResponse } from "next/server";
import { loadSystemConfig, resolveIntent, resolveRouteForIntent } from "@jarvis/config";

export async function GET() {
  try {
    const config = loadSystemConfig();
    return NextResponse.json({
      status: "ok",
      system: config.name,
      version: config.version,
      default_agent: config.default_agent_id,
    });
  } catch (error: any) {
    return NextResponse.json({ status: "error", error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { text, intent, source_default } = body;

    if (!text && !intent) {
      return NextResponse.json(
        { error: "Missing required fields: 'text' or 'intent' must be provided." },
        { status: 400 }
      );
    }

    const resolvedIntent = resolveIntent(text || "", {
      explicit: intent,
      sourceDefault: source_default,
    });
    const route = resolveRouteForIntent(resolvedIntent);

    return NextResponse.json({
      status: "ok",
      input: { text, intent, source_default },
      resolution: route,
    });
  } catch (error: any) {
    return NextResponse.json({ status: "error", error: error.message }, { status: 500 });
  }
}
