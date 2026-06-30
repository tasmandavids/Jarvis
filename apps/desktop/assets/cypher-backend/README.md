# CYPHER Backend — Drop-in Package for tasmandavids/Jarvis

Copy all files in this package into the Jarvis repo, preserving directory structure. Everything is additive — no existing files are overwritten.

## What's here

| Path | Purpose |
|------|---------|
| `config/agents/cypher.json` … `theron.json` | 6 named CYPHER agent configs matching Jarvis schema |
| `prompts/cypher.md` … `theron.md` | System prompts for each agent |
| `config/routing.json` | Replace existing — adds CYPHER intent routes |
| `config/system.json` | Replace existing — renames to CYPHER, adds new features |
| `config/integrations/` | 9 new connector configs (Gmail, Stripe, Xero, WhatsApp, Instagram, Messenger, Markets, Apple Health, Obsidian) |
| `supabase/migrations/20260630000001_cypher_agents.sql` | New tables: agent_conversations, obsidian_log, cypher_live_state, device_commands, connector_status |
| `apps/dashboard/app/api/cypher/chat/route.ts` | Gateway endpoint: detects intent, routes to agent, logs to Supabase + Obsidian |
| `apps/dashboard/app/api/cypher/status/route.ts` | Status endpoint: live state + connector health + agent activity |
| `services/obsidian.ts` | Obsidian vault writer — drains the obsidian_log queue |
| `n8n/workflows/cypher-morning-brief.json` | Import into n8n — triggers daily brief at 7am NZT |

## Step-by-step setup

```bash
# 1. Copy files into Jarvis repo
cp -r cypher-backend/* ../Jarvis/

# 2. Run Supabase migration
cd Jarvis && npx supabase db push

# 3. Add new env vars (add to Vercel + .env.local)
GMAIL_OAUTH_TOKEN=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
XERO_ACCESS_TOKEN=
WHATSAPP_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
META_ACCESS_TOKEN=
META_WEBHOOK_SECRET=
MARKETS_API_KEY=          # twelvedata.com — free tier ok
HEALTH_SYNC_SECRET=       # random secret for iOS companion push
OBSIDIAN_API_KEY=         # from Obsidian Local REST API plugin
OBSIDIAN_BASE_URL=http://127.0.0.1:27123

# 4. Deploy to Vercel
npm run vercel:link && npm run env:push && vercel --prod

# 5. Import n8n workflow
# Open n8n → Workflows → Import → select n8n/workflows/cypher-morning-brief.json
# Set VERCEL_URL and SLACK_BRIEF_CHANNEL env vars in n8n

# 6. Install Obsidian plugin
# Obsidian → Settings → Community Plugins → search "Local REST API" → install + enable
# Copy the API key into OBSIDIAN_API_KEY

# 7. Wire the LLM SDK calls in apps/dashboard/app/api/cypher/chat/route.ts
# The stub comment shows exactly where. Use existing Jarvis SDK setup from apps/dashboard.
```

## Connecting the CYPHER dashboard

The interface subscribes to live state via Supabase Realtime. In `CYPHER Interface.dc.html`, add:

```js
import { createClient } from '@supabase/supabase-js'
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
sb.channel('live').on('postgres_changes',
  { event: 'UPDATE', schema: 'public', table: 'cypher_live_state' },
  (payload) => updateDashboard(payload.new)
).subscribe()
```

## Build order (recommended)

1. ✅ Run migration, deploy, confirm `/api/cypher/status` returns 200
2. ✅ Wire Stripe read-only → confirm Sable responds to "cashflow"
3. ✅ Wire GitHub + Vercel → Orion responds to "infrastructure"  
4. ✅ Connect Obsidian — confirm notes appear after a chat exchange
5. ✅ Import n8n morning brief workflow
6. Add Gmail, Health, Ads connectors one by one
7. Wire Meta (WhatsApp/Instagram/Messenger) — requires Meta app approval first
