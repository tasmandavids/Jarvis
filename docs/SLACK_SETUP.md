# Slack Setup

Jarvis uses Slack as the real-time operator channel — task intake via `@mentions` and slash commands, status alerts, and agent notifications.

## 1. Create a Slack app

1. Go to [api.slack.com/apps](https://api.slack.com/apps) → **Create New App** → From scratch
2. Name: `Jarvis` (or your preference)
3. Select your workspace

## 2. Bot token scopes

**OAuth & Permissions** → Bot Token Scopes:

| Scope | Purpose |
|-------|---------|
| `app_mentions:read` | Respond to @Jarvis mentions |
| `channels:history` | Read command centre channel |
| `channels:read` | Resolve channel names |
| `chat:write` | Post status updates |
| `commands` | Slash commands |
| `users:read` | Resolve user info |

Install to workspace → copy **Bot User OAuth Token** → `SLACK_BOT_TOKEN`

## 3. Signing secret

**Basic Information** → App Credentials → **Signing Secret** → `SLACK_SIGNING_SECRET`

## 4. Event subscriptions

**Event Subscriptions** → Enable → Request URL:

```
https://<your-vercel-domain>/api/slack/events
```

Subscribe to bot events:

- `app_mention`
- `message.channels` (limit to command centre channel in n8n filter)

## 5. Slash commands

Create in **Slash Commands**:

| Command | Request URL | Description |
|---------|-------------|-------------|
| `/jarvis` | `https://<domain>/api/slack/events` | Dispatch a task |
| `/jarvis-status` | `https://<domain>/api/slack/events` | Show status |

Config reference: `config/slack/events.json`

## 6. Channel IDs

Invite the bot to your channels, then copy channel IDs:

- Right-click channel → **View channel details** → copy ID at bottom
- Set `SLACK_COMMAND_CENTRE_CHANNEL_ID` (required)
- Optionally set `SLACK_ALERTS_CHANNEL_ID`, `SLACK_AGENT_RUNS_CHANNEL_ID`

Channel mapping: `config/slack/channels.json`

## 7. Environment variables

```bash
SLACK_BOT_TOKEN=xoxb-...
SLACK_SIGNING_SECRET=...
SLACK_COMMAND_CENTRE_CHANNEL_ID=C...
SLACK_ALERTS_CHANNEL_ID=C...        # optional
SLACK_AGENT_RUNS_CHANNEL_ID=C...    # optional
```

## 8. Verify

```bash
npm run dev
curl http://localhost:3005/api/slack/status
```

## n8n workflows

| Workflow | File | Role |
|----------|------|------|
| **slack-intake** | `n8n/workflows/slack-intake.json` | Persist Slack events → `tasks` + `comms_log` |
| **slack-notify** | `n8n/workflows/slack-notify.json` | Supabase changes → Slack posts |

## API routes

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/slack/status` | GET | `auth.test` + channel config status |
| `/api/slack/events` | POST | Slack Events API + slash commands |
