# CYPHER — Integration Architecture

**Purpose:** turn the CYPHER interface (the cockpit) into a real, always-on system that runs your two businesses and supports your life. This document is the developer handoff: what to build behind the shell, service by service.

The HTML interface (`CYPHER Interface.dc.html`) is the **presentation layer only**. Everything below is the **engineering layer** it plugs into. None of it can live inside a single HTML file — it needs a backend, authenticated connections, and an agent runtime.

---

## 1. System overview

```
                         ┌─────────────────────────────┐
                         │   CYPHER INTERFACE (cockpit) │  ← the HTML shell you have
                         │   web · desktop · mobile     │
                         └───────────────┬─────────────┘
                                         │  WebSocket (live state) + REST (commands)
                         ┌───────────────▼─────────────┐
                         │        CYPHER GATEWAY        │  auth, routing, rate-limit, audit
                         └───────────────┬─────────────┘
                                         │
              ┌──────────────────────────┼──────────────────────────┐
              ▼                          ▼                          ▼
   ┌────────────────────┐   ┌────────────────────────┐   ┌────────────────────┐
   │   AGENT RUNTIME    │   │   CONNECTOR SERVICES   │   │   EVENT BUS + DB    │
   │  6 agents (LLM +   │◄─►│  Gmail, GitHub/Vercel, │◄─►│  Postgres + Redis   │
   │  tools + memory)   │   │  Stripe/Xero, Health,  │   │  pub/sub, job queue │
   │  CYPHER = orch.    │   │  Push, Markets, Olune, │   │  vector store       │
   └─────────┬──────────┘   │  Nova, Obsidian, MDM   │   └────────────────────┘
             │              └────────────────────────┘
             ▼
   ┌────────────────────┐
   │  OBSIDIAN VAULT     │  every conversation + decision written as Markdown
   └────────────────────┘
```

### Suggested stack
- **Gateway / API:** Node (Fastify) or Python (FastAPI). WebSocket for live push to the cockpit.
- **Agent runtime:** an orchestrator framework (e.g. LangGraph, the OpenAI/Anthropic Agents SDK, or a thin custom loop). One LLM "brain" per agent, each with its own scoped toolset + memory namespace. **CYPHER is the supervisor** that routes a request to the right agent and merges results.
- **Data:** Postgres (system of record), Redis (pub/sub + job queue + sync-status cache), a vector store (pgvector / Pinecone) for long-term memory and retrieval.
- **Hosting:** Vercel for the cockpit; a long-running host (Fly.io / Railway / a VPS) for the gateway + agents (serverless can't hold WebSockets or run schedulers).
- **Scheduler:** cron/worker for polling feeds, nightly digests, reminders.

---

## 2. The agent runtime

Each agent is an LLM loop with a **system prompt (its persona + remit)**, a **scoped set of tools**, and a **memory namespace**. They communicate through the event bus; CYPHER orchestrates.

| Agent | Colour | Remit | Tools it owns |
|---|---|---|---|
| **ORION** | teal | Infra · DevOps | GitHub, Vercel, uptime/log providers, alerting |
| **SABLE** | green | Business finance | Stripe, Xero, bank feed, Olune billing |
| **VESPER** | violet | Personal · health | Apple Health, Calendar, Reminders, push |
| **MORRIGAN** | magenta | Growth · ads | Meta/Google Ads, GA4, Olune + Nova funnels |
| **THERON** | gold | Research · intel | Web search/fetch, RSS, market data, summariser |
| **CYPHER** | blue | CEO · orchestrator | Delegates to all; owns priorities, briefings, approvals |

**Orchestration pattern:** a request (voice or text) → CYPHER classifies intent → routes to one or more agents → agents call their tools → CYPHER composes the answer → reply streams back to the cockpit and is logged to Obsidian.

**Guardrails:** every state-changing tool call (send email, move money, deploy, change a device setting) goes through an **approval policy** — auto-approve below a threshold, require your confirmation above it. All actions are written to an immutable audit log.

---

## 3. Connectors (per service)

Each connector is a small service exposing a normalised API to the agents and pushing live updates onto the event bus. Tokens live in a secrets manager (never in the client).

### Mail — Gmail / Outlook
- **Auth:** OAuth 2.0, scopes `gmail.readonly` + `gmail.send` (or `gmail.modify`).
- **Live:** Gmail push via Pub/Sub `watch` (or polling fallback). Feeds the **Inbox** panel + triggers SABLE/CYPHER on important senders.
- **Actions:** triage, draft replies (held for approval), label, archive.

### GitHub + Vercel — ORION (Olune repos)
- **GitHub:** GitHub App installed on your org → repo list, branch, last commit, CI status, PRs, deploy checks. Webhooks for push/PR/CI.
- **Vercel:** REST API + deploy webhooks → deployments, build status, **edge analytics** (requests, p95 latency), errors. Feeds the **Infra · Vercel** panel.
- **Actions (gated):** trigger redeploy, promote, rollback.
- **Your actual repos (connected):**
  - `tasmandavids/NZAD` — **the Olune codebase** (Next.js + Supabase, deployed on Vercel; contains `OLUNE_PROGRESS.md`, brand guide). This is what ORION watches for the Olune + Infra panels.
  - `tasmandavids/Jarvis` — **the agent backend scaffold** (n8n, Supabase, `prompts/`, `agents/`, `schemas/`). This is effectively the agent-runtime host described in §2 — build the gateway + 6 agents here.

### Business finance — SABLE
- **Stripe:** payouts, MRR, churn, invoices (webhooks for live events).
- **Xero (or QuickBooks):** OAuth → invoices, expenses, overdue, cashflow.
- **Bank feed:** via Akahu (NZ) or Plaid → balances, runway, burn.
- Feeds **Finance · Cashflow** + **Olune** revenue cells.

### Personal & health — VESPER
- **Apple Health:** no server API — a companion **iOS app** (HealthKit) reads steps, resting HR, sleep and posts to the gateway. Alternatively Oura/Whoop/Garmin cloud APIs.
- **Calendar/Reminders:** Google Calendar API or CalDAV (iCloud) → schedule + reminder creation.
- Feeds **Health · Life**; VESPER generates nudges (hydration, wind-down, recovery).

### Phone notifications — VESPER / CYPHER
- **Inbound mirror:** an iOS/Android companion app forwards notifications (with your consent) to the gateway → **Phone · Notifications** panel.
- **Outbound push:** APNs (iOS) + FCM (Android) so CYPHER can reach you on any device.

### Markets & news — THERON
- **Markets:** a quotes API (e.g. Twelve Data / Finnhub / Alpha Vantage) on a polling worker → NZX, FX, ASX, crypto.
- **News/intel:** RSS + web search/fetch → THERON summarises into briefs (and drops them in your inbox/Obsidian).

### Olune & Nova Dance — business plugins
- **Olune (Studio OS):** a thin plugin/webhook in Olune posting MRR, trials, live-site count, invoices, signups. Until the API exists, ORION reads it from the repo/DB + Vercel.
- **Nova Dance:** enrolments, today's classes, trials, term revenue, events — via the studio's booking/admin system (webhook or scheduled export).

### Growth & ads — MORRIGAN
- **Meta + Google Ads APIs** → spend, ROAS, campaign performance.
- **GA4 / Olune + Nova funnels** → conversion. MORRIGAN drafts variants + reallocates budget (gated).

### Unified messaging — bottom-right dock (CYPHER / VESPER)
One inbox across every channel; replies sent from the cockpit (gated).
- **WhatsApp:** WhatsApp Business Cloud API (Meta) — webhooks in, message API out. Personal WA has no official API; use WA Business.
- **Messenger + Instagram DMs:** Meta Graph API with the `messaging`/`instagram_manage_messages` permissions + Page/IG webhooks.
- **Slack:** Slack app (Events API + `chat.write`) across the Olune workspace channels.
- **Gmail chat / email threads:** Gmail API (reuses the Mail connector's OAuth).
- Each platform connector normalises to `{channel, from, text, time, threadId}` and pushes to the dock; outbound replies route back through the same connector. All logged to Obsidian like any other conversation.

---

## 4. Obsidian — the running record

**Goal:** every conversation with every agent, and every decision/action, is written to your Obsidian vault as Markdown, so you have a permanent, searchable record.

- **Mechanism:** the gateway writes `.md` files into your vault folder. Pick one transport:
  - **Local Obsidian + sync** — gateway writes to the vault directory on a machine that runs Obsidian (or to an iCloud/Dropbox-synced vault).
  - **Obsidian Local REST API** community plugin — gateway `POST`s notes over HTTP.
  - **Git-backed vault** — commit notes to a private repo the vault pulls.
- **Structure:**
  ```
  /CYPHER/
    Daily/2026-06-30.md              ← chronological log of the day
    Agents/Sable/2026-06-30.md       ← per-agent threads
    Decisions/2026-06-30-invoice-reminders.md
    Briefings/2026-06-30-morning.md
  ```
- **Note format:** frontmatter (`agent`, `time`, `intent`, `tools_used`, `approved_by`) + the transcript + any artifacts (links, figures, amounts). Backlinks tie decisions to the agent and the day.
- **In the cockpit:** the command bar shows a live `◆ OBSIDIAN · N LOGGED · <last>` indicator; each completed exchange increments it. (Already wired in the interface.)

---

## 5. Device control layer (phone · computer · desktop)

**Goal:** CYPHER can observe and command your devices. Be deliberate here — this is the highest-risk capability and needs the strongest guardrails.

- **Mac/PC desktop agent:** a small signed daemon (Swift/Tauri/Electron-less Rust) on each computer, connected to the gateway over an authenticated WebSocket. Capabilities, each behind a permission toggle:
  - launch/focus apps, run whitelisted scripts/shortcuts, system actions (sleep, volume, Do-Not-Disturb), file/window automation (AppleScript / Shortcuts / `osascript`, or Windows equivalents).
- **iPhone/iPad:** Apple deliberately sandboxes this. Realistic paths:
  - **Apple Shortcuts** invoked via push/automation (most actions: messages, home, focus, reminders).
  - **MDM enrolment** (e.g. via an MDM provider) for true management-grade control: install/restrict apps, settings, locate, lock/wipe.
  - HomeKit/Matter for lights/devices (the "dim the studio" action).
- **Transport & safety:**
  - mutual-TLS device identity; per-device capability scopes; **every command is signed, logged, and reversible where possible.**
  - destructive/system commands require step-up confirmation (Face ID / push approval).
  - a global **kill switch** that disconnects all device agents instantly.
- **In the cockpit:** surface devices as a panel (online/last-seen, current focus mode, battery) and let CYPHER issue commands that appear in the log.

---

## 6. Security & privacy (non-negotiable)

- Secrets in a managed vault (1Password/Doppler/AWS Secrets Manager); **never** in the client or repo.
- OAuth tokens encrypted at rest, refreshed server-side; least-privilege scopes per connector.
- Full audit log of every agent action; immutable, exportable.
- Approval policies for anything that spends money, sends a message, deploys, or controls a device.
- The cockpit only ever holds a short-lived session token and talks to the gateway — it never sees raw service credentials.

---

## 7. Build roadmap

1. **Gateway + WebSocket + auth** — cockpit connects, shows live mock state replaced by real pushes.
2. **ORION first** (GitHub + Vercel) — highest signal, lowest risk, read-only. Grounds the Infra + Olune panels.
3. **THERON** (markets + news) — read-only feeds.
4. **SABLE** (Stripe → Xero → bank) — read-only, then gated actions.
5. **Obsidian logging** — wire from day one so the record builds as you go.
6. **VESPER** (Calendar + Health companion app + push).
7. **MORRIGAN** (ads APIs).
8. **CYPHER orchestration + approvals** — tie the agents together.
9. **Device control** — desktop agent first (read-only telemetry → gated commands), then Shortcuts, then MDM. Last, because it's the riskiest.

---

*The interface is ready to receive all of the above — each panel and agent already maps to a connector named here. Connect GitHub and ORION's Olune data can be made real first.*
