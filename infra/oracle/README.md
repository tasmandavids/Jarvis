# CYPHER — Oracle Always Free box

24/7 spine: n8n + Redis + nginx, running free on Oracle Cloud ARM.

## Provision the box (one-time, ~10 min)

### 1. Create Oracle Cloud account

Go to https://signup.cloud.oracle.com — use a real card for identity verification (not charged).

Pick **Home Region** closest to you: `ap-sydney-1` (Sydney) is the best option for NZ.

> **Important:** Home Region cannot be changed. Sydney gives the lowest latency from NZ.

### 2. Create the VM

1. Oracle Console → **Compute → Instances → Create Instance**
2. **Name:** `cypher-spine`
3. **Image:** Ubuntu 22.04 (Minimal) — *change from Oracle Linux*
4. **Shape:** Click **Change Shape** → **Ampere** → `VM.Standard.A1.Flex`
   - OCPUs: **2** (leave headroom; Always Free pool is 4 OCPU total)
   - Memory: **12 GB**
   > Oracle is trimming Always Free to 2 OCPU / 12GB mid-2026 — stay within this to avoid charges.
5. **Networking:** Create a new VCN or use default. Keep defaults.
6. **SSH keys:** Upload your public key (`~/.ssh/id_ed25519.pub`) or generate one now.
7. Click **Create** — takes ~2 minutes to boot.

### 3. Open ports in Oracle's Security List

Oracle has its own firewall on top of the OS:

1. **Networking → Virtual Cloud Networks → your VCN → Security Lists → Default**
2. Add **Ingress Rules:**
   | Source CIDR | Protocol | Port | Description |
   |---|---|---|---|
   | 0.0.0.0/0 | TCP | 80 | HTTP (redirects to HTTPS) |
   | 0.0.0.0/0 | TCP | 443 | HTTPS (n8n) |
   
   (Port 22 / SSH is already open by default.)

### 4. SSH in and run setup

```bash
# Get the public IP from the Oracle console
ssh ubuntu@YOUR_PUBLIC_IP

# On the server:
curl -fsSL https://raw.githubusercontent.com/YOUR_REPO/main/infra/oracle/setup.sh | bash
# OR: copy setup.sh first and run it locally
```

### 5. Copy infra files to the server

From your Mac (Jarvis repo root):

```bash
SERVER=ubuntu@YOUR_PUBLIC_IP

# Create deploy dir
ssh $SERVER 'mkdir -p ~/cypher/ssl'

# Copy compose + nginx
scp infra/oracle/docker-compose.yml $SERVER:~/cypher/
scp infra/oracle/nginx.conf         $SERVER:~/cypher/

# Copy and fill in env
cp infra/oracle/.env.example infra/oracle/.env
# Edit .env — fill in N8N_PASSWORD, REDIS_PASSWORD, N8N_HOST, etc.
scp infra/oracle/.env $SERVER:~/cypher/
```

### 6. Start the stack

```bash
ssh ubuntu@YOUR_PUBLIC_IP

cd ~/cypher

# Pick up the docker group (or log out and back in)
newgrp docker

# Start everything
docker compose up -d

# Check status
docker compose ps
docker compose logs -f --tail=50
```

### 7. Verify

```bash
# Health check via nginx
curl -k https://localhost/healthz

# Redis ping
docker exec cypher-redis redis-cli -a YOUR_REDIS_PASSWORD ping
# → PONG
```

Open `https://YOUR_PUBLIC_IP` in the browser — accept the self-signed cert warning — you should see the n8n login page.

---

## DNS (optional but recommended)

Point a subdomain at the Oracle IP:
```
n8n.yourdomain.com  A  YOUR_ORACLE_PUBLIC_IP
```

Then replace the self-signed cert with a real Let's Encrypt cert:

```bash
# On the server
sudo apt-get install -y certbot
sudo certbot certonly --standalone -d n8n.yourdomain.com \
  --email your@email.com --agree-tos --non-interactive

# Copy certs into the ssl/ mount
sudo cp /etc/letsencrypt/live/n8n.yourdomain.com/fullchain.pem ~/cypher/ssl/cert.pem
sudo cp /etc/letsencrypt/live/n8n.yourdomain.com/privkey.pem   ~/cypher/ssl/key.pem

# Reload nginx
docker compose exec nginx nginx -s reload

# Auto-renew (add to crontab)
echo "0 3 * * * sudo certbot renew --quiet && sudo cp /etc/letsencrypt/live/n8n.yourdomain.com/fullchain.pem ~/cypher/ssl/cert.pem && sudo cp /etc/letsencrypt/live/n8n.yourdomain.com/privkey.pem ~/cypher/ssl/key.pem && docker compose -f ~/cypher/docker-compose.yml exec nginx nginx -s reload" | crontab -
```

---

## Import n8n workflows

Once n8n is running, import the CYPHER workflows:

1. n8n UI → **Workflows → Import from file**
2. Import each file from `n8n/workflows/`:
   - `slack-intake.json`
   - `slack-notify.json`
   - `task-intake.json`
   - `agent-dispatch.json`

Or use the n8n CLI:
```bash
docker exec -it cypher-n8n n8n import:workflow --separate --input=/home/node/workflows
```

---

## Useful commands

```bash
# View logs
docker compose -f ~/cypher/docker-compose.yml logs -f n8n
docker compose -f ~/cypher/docker-compose.yml logs -f redis

# Restart a service
docker compose -f ~/cypher/docker-compose.yml restart n8n

# Update n8n to latest
docker compose -f ~/cypher/docker-compose.yml pull n8n
docker compose -f ~/cypher/docker-compose.yml up -d n8n

# Redis CLI
docker exec -it cypher-redis redis-cli -a YOUR_REDIS_PASSWORD
```
