# CYPHER — Fly.io spine

Stack: n8n + Redis, running on Fly.io.

## Prereqs

1. Install the Fly CLI: `brew install flyctl`
2. Sign up / log in: `fly auth login`

## 1. Create Redis first (internal only)

```bash
cd infra/fly
fly launch --no-deploy --name cypher-redis --org personal --region iad
# When prompted, choose Redis image: `redis:7-alpine`
```

Then:
```bash
fly secrets set --app cypher-redis REDIS_PASSWORD=<your_password>
fly volumes create redis_data --app cypher-redis --size 1 --region iad
fly deploy --app cypher-redis
```

## 2. Create n8n

```bash
cd infra/fly
fly launch --no-deploy --name cypher-n8n --org personal --region iad
# Choose any Dockerfile; we overwrite fly.toml next
```

Set env vars:
```bash
fly secrets set --app cypher-n8n \
  N8N_HOST=<your-domain> \
  N8N_USER=admin \
  N8N_PASSWORD=<strong_password> \
  WEBHOOK_URL=https://<your-domain> \
  GENERIC_TIMEZONE=Pacific/Auckland \
  N8N_LOG_LEVEL=info \
  N8N_LOG_OUTPUT=console
```

Then:
```bash
fly volumes create n8n_data --app cypher-n8n --size 1 --region iad
fly deploy --app cypher-n8n
```

## 3. Point your domain

Get the Fly IP:
```bash
fly ips list --app cypher-n8n
```

Create an A record at your DNS provider pointing `<your-domain>` to that IP.
Fly cert automatically provisions HTTPS once DNS resolves.
