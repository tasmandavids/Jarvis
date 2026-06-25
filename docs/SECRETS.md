# Secrets & environment variables

**Never commit real secrets.** This repo only tracks `.env.example` (placeholders).

## Local development

Secrets live in `apps/dashboard/.env.local` (gitignored).

```bash
# After Vercel is linked — pull latest from Vercel (recommended)
npm run env:pull

# Or copy the template manually
cp .env.example apps/dashboard/.env.local
```

## Vercel (source of truth for deployed env)

1. Link once: `npm run vercel:link`
2. Push local `.env.local` → Vercel: `npm run env:push`
3. Pull Vercel → local: `npm run env:pull`

Sensitive keys (`SUPABASE_SERVICE_ROLE_KEY`, `SLACK_BOT_TOKEN`, `SLACK_SIGNING_SECRET`, AI keys) are stored as **encrypted** Vercel env vars.

## Rules

| Do | Don't |
|----|-------|
| Use `vercel env pull` for local dev | Commit `.env.local` |
| Use `NEXT_PUBLIC_*` only for browser-safe values | Put service keys in `NEXT_PUBLIC_*` |
| Rotate keys if pasted in chat/issues | Share tokens in GitHub issues or PRs |

## Required for production

| Variable | Sensitive |
|----------|-----------|
| `NEXT_PUBLIC_SUPABASE_URL` | No |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | No |
| `SUPABASE_SERVICE_ROLE_KEY` | **Yes** |
| `SLACK_BOT_TOKEN` | **Yes** |
| `SLACK_SIGNING_SECRET` | **Yes** |
| `SLACK_COMMAND_CENTRE_CHANNEL_ID` | No |
| `GITHUB_REPO` | No |

See `.env.example` for the full list.
