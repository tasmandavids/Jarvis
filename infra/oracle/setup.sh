#!/usr/bin/env bash
# CYPHER — Oracle Always Free box bootstrap
# Run as ubuntu user (has sudo). Takes ~5 minutes.
# Usage: curl -fsSL https://raw.githubusercontent.com/.../setup.sh | bash
#   OR:  scp setup.sh ubuntu@YOUR_IP:~ && ssh ubuntu@YOUR_IP 'bash setup.sh'

set -euo pipefail
CYAN='\033[0;36m'; GREEN='\033[0;32m'; RED='\033[0;31m'; NC='\033[0m'

log()  { echo -e "${CYAN}[cypher]${NC} $*"; }
ok()   { echo -e "${GREEN}[ok]${NC} $*"; }
fail() { echo -e "${RED}[fail]${NC} $*" >&2; exit 1; }

[[ $(id -u) -eq 0 ]] && fail "Do not run as root. Run as ubuntu and use sudo."

# ── 1. System update ──────────────────────────────────────────────────────────
log "Updating system packages..."
sudo apt-get update -qq
sudo apt-get upgrade -y -qq
sudo apt-get install -y -qq \
  curl wget git unzip jq \
  ca-certificates gnupg lsb-release \
  ufw fail2ban

ok "System packages installed"

# ── 2. Docker ─────────────────────────────────────────────────────────────────
if ! command -v docker &>/dev/null; then
  log "Installing Docker..."
  sudo install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
    | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  sudo chmod a+r /etc/apt/keyrings/docker.gpg
  echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
    https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" \
    | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
  sudo apt-get update -qq
  sudo apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-compose-plugin
  sudo usermod -aG docker "$USER"
  ok "Docker installed"
else
  ok "Docker already installed ($(docker --version))"
fi

# ── 3. Firewall ───────────────────────────────────────────────────────────────
log "Configuring ufw firewall..."
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow ssh        # 22 — SSH
sudo ufw allow 80/tcp     # HTTP (redirect to HTTPS)
sudo ufw allow 443/tcp    # HTTPS (n8n via nginx)
# Redis is NOT exposed — only accessible within Docker network
sudo ufw --force enable
ok "Firewall configured (22, 80, 443 open; Redis internal only)"

# ── 4. Oracle iptables (OCI adds its own rules on top of ufw) ─────────────────
log "Opening OCI iptables rules..."
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
# Make persistent
sudo apt-get install -y -qq iptables-persistent
sudo netfilter-persistent save
ok "OCI iptables rules saved"

# ── 5. fail2ban ───────────────────────────────────────────────────────────────
log "Enabling fail2ban (SSH brute-force protection)..."
sudo systemctl enable fail2ban
sudo systemctl start fail2ban
ok "fail2ban running"

# ── 6. Clone / copy CYPHER infra files ───────────────────────────────────────
DEPLOY_DIR="$HOME/cypher"
mkdir -p "$DEPLOY_DIR/ssl"

log "Deploy directory: $DEPLOY_DIR"
log "Copy your infra files here:"
log "  scp infra/oracle/{docker-compose.yml,nginx.conf,.env} ubuntu@SERVER:~/cypher/"

# ── 7. Self-signed cert (for initial testing before pointing a real domain) ───
if [[ ! -f "$DEPLOY_DIR/ssl/cert.pem" ]]; then
  log "Generating self-signed TLS cert (replace with real cert later)..."
  openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout "$DEPLOY_DIR/ssl/key.pem" \
    -out    "$DEPLOY_DIR/ssl/cert.pem" \
    -subj "/CN=$(curl -s ifconfig.me)/O=CYPHER/C=NZ" 2>/dev/null
  ok "Self-signed cert generated at $DEPLOY_DIR/ssl/"
fi

# ── 8. Swap (Oracle ARM has no swap by default — n8n needs headroom) ─────────
if [[ ! -f /swapfile ]]; then
  log "Creating 2GB swapfile..."
  sudo fallocate -l 2G /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
  ok "2GB swap enabled"
else
  ok "Swap already exists"
fi

# ── Done ─────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  CYPHER box ready. Next steps:${NC}"
echo ""
echo -e "  1. Copy infra files to ~/cypher/"
echo -e "     ${CYAN}scp infra/oracle/{docker-compose.yml,nginx.conf} ubuntu@SERVER:~/cypher/${NC}"
echo -e "     ${CYAN}scp infra/oracle/.env ubuntu@SERVER:~/cypher/  # (after filling it in)${NC}"
echo ""
echo -e "  2. Start the stack:"
echo -e "     ${CYAN}newgrp docker  # pick up docker group without logging out${NC}"
echo -e "     ${CYAN}cd ~/cypher && docker compose up -d${NC}"
echo ""
echo -e "  3. Check it's running:"
echo -e "     ${CYAN}docker compose ps${NC}"
echo -e "     ${CYAN}curl -k https://localhost/healthz${NC}"
echo ""
echo -e "  4. Open n8n:"
echo -e "     ${CYAN}https://YOUR_PUBLIC_IP${NC}  (accept the self-signed cert warning)"
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
