import { loadSlackChannels } from "@jarvis/config";
import { NextResponse } from "next/server";
import { slackAuthTest } from "@/lib/slack";

export async function GET() {
  const token = process.env.SLACK_BOT_TOKEN;

  if (!token) {
    return NextResponse.json({
      connected: false,
      reason: "SLACK_BOT_TOKEN not configured",
    });
  }

  const auth = await slackAuthTest(token);
  const channels = loadSlackChannels().channels.map((c) => ({
    id: c.id,
    name: c.name,
    configured: Boolean(process.env[c.env_key]),
  }));

  if (!auth.ok) {
    return NextResponse.json({
      connected: false,
      reason: auth.error ?? "auth.test failed",
      channels,
    });
  }

  return NextResponse.json({
    connected: true,
    team: auth.team,
    team_id: auth.team_id,
    bot_user: auth.user,
    bot_user_id: auth.user_id,
    channels,
  });
}
