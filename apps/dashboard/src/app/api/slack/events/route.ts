import {
  detectIntentFromText,
  loadSlackEvents,
  resolveIntent,
  resolveRouteForIntent,
} from "@jarvis/config";
import { NextResponse } from "next/server";
import { verifySlackSignature } from "@/lib/slack";

type SlackEnvelope = {
  type?: string;
  challenge?: string;
  event?: {
    type?: string;
    text?: string;
    user?: string;
    channel?: string;
    ts?: string;
    bot_id?: string;
    subtype?: string;
  };
  command?: string;
  text?: string;
  user_id?: string;
  channel_id?: string;
  response_url?: string;
};

function parseTaskFromText(
  text: string,
  options?: { explicitIntent?: string; sourceDefault?: string },
) {
  const cleaned = text.replace(/<@[A-Z0-9]+>/g, "").trim();
  const intent = resolveIntent(cleaned, {
    explicit: options?.explicitIntent,
    sourceDefault: options?.sourceDefault,
  });
  const route = resolveRouteForIntent(intent);

  return {
    headline: cleaned || "Slack task",
    description: `Created from Slack: ${cleaned}`,
    status: ["queued"],
    responsible: route.responsible,
    intent,
    agent_id: route.agent_id,
    fallback_agent_id: route.fallback_agent_id,
    intent_source:
      options?.explicitIntent != null
        ? "explicit"
        : detectIntentFromText(cleaned)
          ? "keyword"
          : options?.sourceDefault
            ? "source_default"
            : "global_default",
    source: "slack" as const,
  };
}

export async function POST(request: Request) {
  const signingSecret = process.env.SLACK_SIGNING_SECRET;
  const rawBody = await request.text();

  if (signingSecret) {
    const signature = request.headers.get("x-slack-signature") ?? "";
    const timestamp = request.headers.get("x-slack-request-timestamp") ?? "";

    if (!verifySlackSignature(signingSecret, signature, timestamp, rawBody)) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
  }

  const contentType = request.headers.get("content-type") ?? "";
  let payload: SlackEnvelope;

  if (contentType.includes("application/x-www-form-urlencoded")) {
    const params = new URLSearchParams(rawBody);
    payload = {
      type: "slash_command",
      command: params.get("command") ?? undefined,
      text: params.get("text") ?? undefined,
      user_id: params.get("user_id") ?? undefined,
      channel_id: params.get("channel_id") ?? undefined,
      response_url: params.get("response_url") ?? undefined,
    };
  } else {
    payload = JSON.parse(rawBody) as SlackEnvelope;
  }

  if (payload.type === "url_verification" && payload.challenge) {
    return NextResponse.json({ challenge: payload.challenge });
  }

  const slackEvents = loadSlackEvents();

  if (payload.type === "slash_command" && payload.command) {
    const cmd = slackEvents.slash_commands.find((c) => c.command === payload.command);
    const sourceDefault = cmd?.default_intent ?? "orchestrate";
    const task = parseTaskFromText(payload.text ?? "", { sourceDefault });

    if (payload.command === "/jarvis-status") {
      return NextResponse.json({
        response_type: "ephemeral",
        text: "Jarvis status: Supabase connected. Task queue wiring via n8n pending.",
      });
    }

    return NextResponse.json({
      response_type: "ephemeral",
      text: `Task queued: *${task.headline}* → agent \`${task.agent_id}\` (intent: ${task.intent})`,
      task_preview: task,
    });
  }

  const event = payload.event;
  if (event?.type === "app_mention" && event.text) {
    const sub = slackEvents.subscriptions.find((s) => s.type === "app_mention");
    const sourceDefault = sub?.default_intent ?? "orchestrate";
    const task = parseTaskFromText(event.text, { sourceDefault });

    return NextResponse.json({
      ok: true,
      action: "create_task",
      task_preview: task,
      slack: {
        channel: event.channel,
        event_ts: event.ts,
        user: event.user,
      },
      message: "Acknowledged — wire n8n slack-intake to persist to Supabase",
    });
  }

  if (
    event?.type === "message" &&
    !event.bot_id &&
    !event.subtype &&
    event.text
  ) {
    const sub = slackEvents.subscriptions.find((s) => s.type === "message");
    const sourceDefault = sub?.default_intent ?? "orchestrate";
    const task = parseTaskFromText(event.text, { sourceDefault });

    return NextResponse.json({
      ok: true,
      action: "create_task",
      task_preview: task,
      message: "Message received — wire n8n to persist",
    });
  }

  return NextResponse.json({ ok: true, ignored: true });
}
