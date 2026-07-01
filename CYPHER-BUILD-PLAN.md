# CYPHER — Build Plan: The $100/month "Does Everything" Assistant

**Goal:** an always-on, real AI assistant that runs your life and two businesses (Olune + Nova), for a **hard ceiling of $100/month** to operate. Realistic target: **$25–75/month**.

**Companion doc:** `Futuristic AI Assistant Interface Design 2/CYPHER-Integration-Architecture.md` (the connector-by-connector engineering spec). This plan is the *cost-engineered, sequenced* version of that.

---

## 0. The core principle — never pay for a token you can get for free

CYPHER runs a **model router** that sends each task to the cheapest tier that can do it. This single decision is what keeps "everything" affordable.

| Tier | What runs it | Cost | Use for |
|---|---|---|---|
| **0 — Local** | Ollama on the Mac (Llama 3.3 70B / **Nous Hermes** Q4) | **$0**, private | Routine reasoning + sensitive tasks — *when the Mac is on* (~10–18 tok/s on 64GB+ Apple Silicon) |
| **1 — Free cloud** | Groq + Cerebras + Gemini Flash + OpenRouter free | **$0** | Always-on default when the Mac is asleep |
| **2 — Cheap paid** | Hermes 4 70B ($0.13/$0.40 per M), Groq paid ($0.05/M), Gemini paid | **cents** | Hard tasks past free rate limits |
| **3 — Premium** | Claude / GPT, **hard monthly cap** | budgeted spend | Genuinely hard orchestration / planning / code |

**Stack the free tiers.** Each provider has independent limits; routing across them multiplies free capacity:
- **Groq** — 30 RPM / 6K TPM / **14,400 req/day** (llama-3.1-8b-instant), no card. Prompt caching doesn't count against limits.
- **Gemini Flash** — **1,500 req/day**, 1M context, multimodal, no card.
- **Cerebras** — ~**1M tokens/day** on Llama 3.3 70B, up to 2,000 tok/s.
- **OpenRouter free models** — 20+ models, one key, for variety/fallback.

**On Hermes (you asked):** Nous Research **Hermes 4** open models are the cheap-brain sweet spot — 70B at $0.13/$0.40 per M tokens on OpenRouter, *or* self-host the weights for $0. NOTE: the `HERMES` in this repo is the **memory** service — a different thing. We use Hermes *models* as agent brains and keep the memory service as-is.

---

## 1. The free-tier stack (whole system on a ~$0 base)

| Layer | Tool | Free tier | Role |
|---|---|---|---|
| Always-on host | **Oracle Cloud Always Free** | 4 OCPU / 24GB ARM (trimming to 2/12 mid-2026 — still enough) | Gateway, n8n, Redis, workers — 24/7, no fee |
| Automation engine | **n8n self-hosted** | Free, 400+ integrations | Most connectors = n8n workflows (OAuth, webhooks, schedules) |
| System of record | **Supabase** (already have) | 500MB Postgres, 50K MAU | State, audit log, vectors |
| Cache / queue / pub-sub | **Upstash Redis** (or Redis on Oracle box) | 256MB, 500K cmds/mo | Live state, job queue, event bus |
| Voice in | **Whisper** (local) or Gemini multimodal | $0 | Speech-to-text |
| Voice out | **Piper** (local) | $0 | Text-to-speech |
| Record | **Obsidian** | Free | Decisions logged as Markdown |
| Infra/CI | GitHub + Vercel hobby | Free | ORION's data |

---

## 2. Realistic monthly budget

| Item | Est. /mo | Notes |
|---|---|---|
| Oracle always-on host | **$0** | Always-on for free |
| Databases (Supabase + Upstash) | **$0** | Free tiers, kept alive by the gateway |
| Free-tier inference (Groq/Gemini/Cerebras) | **$0** | Covers most of the day |
| Paid LLM fallback (Hermes 70B + premium, **hard-capped**) | **$20–40** | Router minimizes this; set a ceiling |
| Domain | **~$1.50** | $15/yr amortized |
| Voice (only if cloud quality wanted) | **$0–15** | Local Whisper/Piper = $0; Deepgram ~$4.30/1k min |
| WhatsApp Business API (optional) | **$0–20** | Conversation-priced; skip if iMessage/Slack enough |
| Push (APNs/FCM) | **$0** | Free with own certs |
| **Total** | **~$25–75** | Headroom under $100 |

Biggest lever = Tier-3 premium usage. Hard cap it + route to free tiers → likely **$30–50/mo**.

---

## 3. "Everything" decomposed (7 capability domains)

Each is built the same way: **connector → normalize → panel + agent tool**.
1. **Comms** — mail, iMessage, WhatsApp, Slack, IG/Messenger (read + reply, gated)
2. **Money** — Stripe, Xero, bank feed (read, then gated payments)
3. **Infra/work** — GitHub, Vercel, Olune + Nova
4. **Life/health** — Calendar, reminders, Apple Health (companion app), nudges
5. **Intel** — markets, news, web research, briefings
6. **Growth** — ads platforms, analytics
7. **Device control** — Mac daemon → Shortcuts → MDM (riskiest, built last)

---

## 4. Build roadmap

### Day 1 (tomorrow) — the foundation
- [ ] **Kill the bouncing-icon bug** — launch from terminal (`/Applications/CYPHER.app/Contents/MacOS/CYPHER`) + Console.app to classify: relaunch-loop vs blocked main thread vs hidden window. Fix, rebuild, clean launch.
- [ ] **Stand up the Oracle Always Free box** — the 24/7 spine.
- [ ] **Install n8n + Redis** on it (Docker Compose / n8n self-hosted AI starter kit).
- [ ] **Deploy the gateway skeleton** — auth token, one REST route, one WebSocket channel; point the cockpit at it instead of localhost.
- [ ] **Build the model router** — Tier 0→3 cascade (start with Groq + Gemini).
- [ ] **First end-to-end agent loop** — CYPHER takes a command → routes to a free model → replies into the cockpit → logs to Obsidian.

### Week 1
- [ ] ORION (Vercel + GitHub, read-only) → **first live panel** (Infra).
- [ ] Wire one dashboard panel from demo `state` → live gateway fetch (proves demo→real).
- [ ] THERON (markets + news, free APIs e.g. Finnhub).

### Week 2
- [ ] SABLE (Stripe → Xero, read-only).
- [ ] Obsidian logging hardened (counter ticks in cockpit).
- [ ] **Approval / guardrail layer** — built BEFORE any write action.

### Week 3
- [ ] Comms via n8n — iMessage + Slack + Gmail into the Messages dock.
- [ ] VESPER — Calendar + reminders.

### Week 4+
- [ ] Apple Health companion app (HealthKit → gateway).
- [ ] MORRIGAN (ads APIs).
- [ ] **Device control** — Mac daemon (telemetry → gated commands) → Shortcuts → MDM. Last, because it's the riskiest.

---

## 5. The one rule we never skip

Reading data = low-risk, comes first. **Any write action — send email, move money, deploy, command a device — ships only behind the approval policy + immutable audit log.** That layer is built before the first write capability, not after. A global kill switch disconnects all device agents instantly.

---

## 6. Honest caveats

- **Mac-off problem:** Tier-0 local inference vanishes when the Mac sleeps → router auto-falls-back to free cloud tiers. Gateway stays alive 24/7 regardless.
- **Local 70B needs a 64GB+ Mac.** Smaller Mac → lean on free cloud inference.
- **Free tiers have ToS + reliability limits.** Fine for personal use; don't resell; keep the Oracle box busy so it isn't reclaimed.
- **WhatsApp + ads APIs** are the only real-money / real-friction connectors (business verification). Everything else is free or cents.
- **"Everything" is months of capability-by-capability work** — but running cost stays in budget the whole way thanks to the routing architecture.

---

## Sources (verified June 2026)
- Free LLM APIs: https://openrouter.ai/blog/tutorials/free-llm-apis-compared/ · https://awesomeagents.ai/tools/free-ai-inference-providers-2026/
- Hermes 4: https://openrouter.ai/nousresearch/hermes-4-70b · https://openrouter.ai/nousresearch/hermes-4-405b
- DB free tiers: https://agentdeals.dev/database-free-tier-comparison-2026 · https://www.koyeb.com/blog/top-postgresql-database-free-tiers-in-2026
- Local LLM on Mac / n8n: https://newtechreview.com.br/en/how-to-run-llama-70b-locally-2026-en/ · https://github.com/n8n-io/self-hosted-ai-starter-kit
- STT benchmarks: https://northflank.com/blog/best-open-source-speech-to-text-stt-model-in-2026-benchmarks
