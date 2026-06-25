import { NextResponse } from "next/server";
import {
  loadAgents,
  loadIntegrations,
  loadSystemConfig,
  resolveAgentForIntent,
  resolveAgentSupabaseId,
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
  const intent = typeof body.intent === "string" ? body.intent : "orchestrate";
  const agentSlug = resolveAgentForIntent(intent);
  const supabaseId = resolveAgentSupabaseId(agentSlug);

  return NextResponse.json({
    intent,
    agent_id: agentSlug,
    responsible: supabaseId,
    message: "Task routing preview — wire to n8n webhook for full dispatch",
  });
}
