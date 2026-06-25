# Supabase

**Project:** Jarvis (`hwyokoiqjynmcpuypwmf`, ap-southeast-1)  
**URL:** `https://hwyokoiqjynmcpuypwmf.supabase.co`

## Tables

| Table | Purpose |
|-------|---------|
| `clients` | End clients (email, name, country) |
| `tasks` | Work items (`headline`, `status[]`, `responsible` agent UUID) |
| `memory` | Client-linked notes + `vector` embeddings |
| `agent_runs` | Per-task agent execution records |
| `comms_log` | Outbound/inbound communications audit trail |

Agent definitions live in `config/agents/*.json` (not a DB table). Each agent has a stable `supabase_id` UUID used as `agent_id` / `responsible` in Postgres.

## Migrations

The baseline migration `20250625000000_initial_schema.sql` documents the **already-provisioned** remote schema. Do not run `supabase db push` against the hosted project unless you intend to reconcile drift.

For new changes, add incremental migrations via:

```bash
supabase migration new <description>
```
