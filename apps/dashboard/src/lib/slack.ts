import { createHmac, timingSafeEqual } from "node:crypto";

const SLACK_API = "https://slack.com/api";

export function verifySlackSignature(
  signingSecret: string,
  signature: string,
  timestamp: string,
  body: string,
): boolean {
  const fiveMinutes = 60 * 5;
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > fiveMinutes) {
    return false;
  }

  const base = `v0:${timestamp}:${body}`;
  const digest = `v0=${createHmac("sha256", signingSecret).update(base).digest("hex")}`;

  try {
    return timingSafeEqual(Buffer.from(digest), Buffer.from(signature));
  } catch {
    return false;
  }
}

export async function slackAuthTest(token: string) {
  const res = await fetch(`${SLACK_API}/auth.test`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
  });
  return res.json() as Promise<{
    ok: boolean;
    url?: string;
    team?: string;
    user?: string;
    team_id?: string;
    user_id?: string;
    error?: string;
  }>;
}

export async function slackPostMessage(
  token: string,
  channel: string,
  text: string,
  threadTs?: string,
) {
  const body = new URLSearchParams({ channel, text });
  if (threadTs) body.set("thread_ts", threadTs);

  const res = await fetch(`${SLACK_API}/chat.postMessage`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  return res.json() as Promise<{
    ok: boolean;
    ts?: string;
    channel?: string;
    error?: string;
  }>;
}
