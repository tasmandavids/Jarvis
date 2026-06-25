import { NextResponse } from "next/server";
import {
  buildAgentRunDetails,
  detectIntentFromText,
  loadAgents,
  loadIntegrations,
  loadSystemConfig,
  resolveIntent,
  resolveRouteForIntent,
} from "@jarvis/config";

export async function GET() {
  return NextResponse.json({
    status: "ok",
    system: loadSystemConfig(),
    agents: loadAgents().map((a) => ({
      id: a.id,
      supabase_id: a.supabase_id,
      name: a.name,
      status: a.status,
      prompt_version: a.prompt_version,
    })),
    integrations: loadIntegrations().map((i) => ({
      id: i.id,
      name: i.name,
      status: i.status,
    })),
  });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const text = typeof body.text === "string" ? body.text : "";
  const explicitIntent = typeof body.intent === "string" ? body.intent : undefined;
  const sourceDefault =
    typeof body.source_default === "string" ? body.source_default : undefined;

  const intent = resolveIntent(text, { explicit: explicitIntent, sourceDefault });
  const route = resolveRouteForIntent(intent);
  const keywordMatch = text ? detectIntentFromText(text) : null;

  return NextResponse.json({
    intent,
    intent_source: explicitIntent
      ? "explicit"
      : keywordMatch
        ? "keyword"
        : sourceDefault
          ? "source_default"
          : "global_default",
    keyword_match: keywordMatch,
    agent_id: route.agent_id,
    fallback_agent_id: route.fallback_agent_id,
    responsible: route.responsible,
    agent_run_details_preview: JSON.parse(
      buildAgentRunDetails(route.agent_id, intent, { attempt: 1 }),
    ),
    message: "Task routing preview — wire to n8n webhook for full dispatch",
  });
}
