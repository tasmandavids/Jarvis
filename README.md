# Jarvis — AI Agent Command Centre

Config-driven orchestration hub connecting **Notion**, **Slack**, **n8n**, **Supabase**, **Vercel**, **GitHub**, and **Claude / ChatGPT / Gemini**.

## Quick start

```bash
cp .env.example apps/dashboard/.env.local   # first-time only
npm install
npm run vercel:link                         # link to Vercel project
npm run env:pull                            # or env:push to upload local secrets
npm run validate:config
npm run dev                                 # http://localhost:3005
```

Secrets workflow: [docs/SECRETS.md](docs/SECRETS.md)

## Repository layout

```
Jarvis/
├── config/           # Source of truth (JSON) — agents, routing, integrations, workflows
├── schemas/          # JSON Schema for validation
├── prompts/          # System prompts referenced by agent configs
├── data/
│   ├── examples/     # Sample payloads (committed)
│   └── local/        # Runtime cache (gitignored)
├── apps/dashboard/   # Next.js UI + API (deploy to Vercel)
├── packages/config/  # Shared config loader
├── supabase/         # Postgres migrations
├── n8n/workflows/    # Exported n8n workflow JSON
├── scripts/          # Config validation
└── docs/             # Architecture reference
```

## Stack roles

| Service   | Role |
|-----------|------|
| **GitHub** | Version control for JSON configs, prompts, workflows; CI; issue triggers |
| **Vercel** | Hosts dashboard + API routes (`/api/health`, `/api/supabase/status`) |
| **Supabase** | Clients, tasks, memory (vectors), agent runs, comms log |
| **n8n** | Workflow engine — webhooks, schedules, cross-service glue |
| **Notion** | Human-facing command centre — tasks, docs, status pages |
| **Slack** | Real-time operator channel — @mentions, slash commands, alerts |
| **Claude** | Primary orchestrator |
| **ChatGPT** | Fast executor / tool-use agent |
| **Gemini** | Research & long-context specialist |

## Data flow

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full diagram and integration patterns.

## Deploy

1. **Supabase** — project `hwyokoiqjynmcpuypwmf` is already provisioned; see `supabase/README.md`
2. **Vercel** — project `jarvis` on team `olune` → `npm run vercel:link` then `npm run env:push`
3. **n8n** — import workflows from `n8n/workflows/`, point webhooks at Vercel/n8n URLs
4. **Notion** — create command centre page + task database, set `NOTION_COMMAND_CENTRE_PAGE_ID`
5. **Slack** — create app, set env vars, point events to `/api/slack/events` — see [docs/SLACK_SETUP.md](docs/SLACK_SETUP.md)

## API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | System + agent/integration summary |
| `/api/health` | POST | Preview intent → agent routing (`text`, optional `intent`, `source_default`) |
| `/api/supabase/status` | GET | Supabase connectivity check |
| `/api/slack/status` | GET | Slack `auth.test` + channel config |
| `/api/slack/events` | POST | Slack Events API + slash commands |

## Next steps

- [ ] Connect Supabase project and run migrations
- [ ] Deploy dashboard to Vercel
- [ ] Build n8n task-intake workflow
- [ ] Wire Notion database sync
- [ ] Create Slack app and connect channels
- [ ] Add auth to dashboard (Supabase Auth)
