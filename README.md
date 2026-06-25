# Jarvis — AI Agent Command Centre

Config-driven orchestration hub connecting **Notion**, **n8n**, **Supabase**, **Vercel**, **GitHub**, and **Claude / ChatGPT / Gemini**.

## Quick start

```bash
cp .env.example apps/dashboard/.env.local   # fill in keys
npm install
npm run validate:config
npm run dev                                 # http://localhost:3000
```

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
| **Claude** | Primary orchestrator |
| **ChatGPT** | Fast executor / tool-use agent |
| **Gemini** | Research & long-context specialist |

## Data flow

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full diagram and integration patterns.

## Deploy

1. **Supabase** — project `hwyokoiqjynmcpuypwmf` is already provisioned; see `supabase/README.md`
2. **Vercel** — import repo, set root to `apps/dashboard`, add env vars from `.env.example`
3. **n8n** — import workflows from `n8n/workflows/`, point webhooks at Vercel/n8n URLs
4. **Notion** — create command centre page + task database, set `NOTION_COMMAND_CENTRE_PAGE_ID`

## API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | System + agent/integration summary |
| `/api/health` | POST | Preview intent → agent routing |
| `/api/supabase/status` | GET | Supabase connectivity check |

## Next steps

- [ ] Connect Supabase project and run migrations
- [ ] Deploy dashboard to Vercel
- [ ] Build n8n task-intake workflow
- [ ] Wire Notion database sync
- [ ] Add auth to dashboard (Supabase Auth)
