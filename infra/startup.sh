#!/usr/bin/env bash
# Startup-script da VM GCP (Debian 12), rodado no 1º boot como root. Idempotente:
# instala Docker + compose plugin, cria swap, e prepara /opt/utiva pro deploy via CI.
# O deploy (GitHub Actions) escreve o .env, o docker-compose.prod.yml e o Caddyfile aqui.
set -euo pipefail

DEPLOY_USER=deploy
APP_DIR=/opt/utiva

# --- swap de 2GB (e2-small tem 2GB RAM; colchão p/ build/picos) ---
if [ ! -f /swapfile ]; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >>/etc/fstab
fi

# --- Docker Engine + plugin compose (repo oficial) ---
if ! command -v docker >/dev/null 2>&1; then
  export DEBIAN_FRONTEND=noninteractive
  apt-get update
  apt-get install -y ca-certificates curl
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
    >/etc/apt/sources.list.d/docker.list
  apt-get update
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  systemctl enable --now docker
fi

# --- usuário de deploy + diretório da app ---
if ! id -u "$DEPLOY_USER" >/dev/null 2>&1; then
  useradd -m -s /bin/bash "$DEPLOY_USER"
fi
usermod -aG docker "$DEPLOY_USER"
mkdir -p "$APP_DIR"
chown -R "$DEPLOY_USER":"$DEPLOY_USER" "$APP_DIR"
