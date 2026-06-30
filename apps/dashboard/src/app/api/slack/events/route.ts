import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifySlackSignature } from "../../../../lib/slack";
import { resolveIntent, resolveRouteForIntent } from "@jarvis/config";

// Force Node.js runtime for crypto/fs usage in @jarvis/config
export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const bodyText = await req.text();
    const headers = req.headers;
    
    const signature = headers.get("x-slack-signature");
    const timestamp = headers.get("x-slack-request-timestamp");
    const secret = process.env.SLACK_SIGNING_SECRET;

    // Optional verification (disabled locally if secret is missing)
    if (secret && signature && timestamp) {
      if (!verifySlackSignature(secret, signature, timestamp, bodyText)) {
        return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
      }
    }

    const body = JSON.parse(bodyText);

    // Handle URL verification challenge during Slack App setup
    if (body.type === "url_verification") {
      return NextResponse.json({ challenge: body.challenge });
    }

    // Process actual Slack events
    if (body.type === "event_callback" && body.event) {
      const event = body.event;
      
      // We only care about mentions and direct messages
      if (event.type === "app_mention" || event.type === "message") {
        // Ignore bot messages to prevent infinite loops
        if (event.bot_id) {
          return NextResponse.json({ status: "ok" });
        }

        const rawText = event.text || "";
        // Strip out the bot mention e.g., <@U123456>
        const text = rawText.replace(/<@[A-Z0-9]+>/g, "").trim();

        if (!text) {
          return NextResponse.json({ status: "ok" });
        }

        // 1. Resolve Intent and Agent
        const intent = resolveIntent(text);
        const route = resolveRouteForIntent(intent);

        // 2. Initialize Supabase Admin Client
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

        if (!supabaseUrl || !supabaseKey) {
          console.error("Missing Supabase credentials in .env.local");
          return NextResponse.json({ error: "Configuration error" }, { status: 500 });
        }

        const supabase = createClient(supabaseUrl, supabaseKey);

        // 3. Insert into Tasks table
        const { error } = await supabase.from("tasks").insert({
          headline: text.substring(0, 100),
          description: `Source: Slack (${event.channel})\n\n${text}`,
          responsible: route.responsible, // Agent UUID
          status: ["pending"]
        });

        if (error) {
          console.error("Error inserting task:", error);
          return NextResponse.json({ error: error.message }, { status: 500 });
        }
      }
    }

    // Return 200 OK fast so Slack doesn't retry
    return NextResponse.json({ status: "ok" });
  } catch (error: any) {
    console.error("Slack event error:", error);
    return NextResponse.json({ status: "error", error: error.message }, { status: 500 });
  }
}

