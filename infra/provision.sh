#!/usr/bin/env bash
# Provisiona uma VPS Ubuntu/Debian (ex.: Hostinger) p/ rodar o Utiva. Rodar UMA vez como root.
# Idempotente: instala Docker + plugin compose (se faltarem), cria swap de 2GB e o /opt/utiva.
# Se a VPS já veio com template "Ubuntu + Docker", o passo de instalação é pulado.
set -euo pipefail

APP_DIR=/opt/utiva

# --- swap de 2GB (colchão de RAM; pula se já houver swap no /swapfile) ---
if ! swapon --show 2>/dev/null | grep -q '/swapfile'; then
  fallocate -l 2G /swapfile 2>/dev/null || dd if=/dev/zero of=/swapfile bs=1M count=2048
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >>/etc/fstab
fi

# --- Docker Engine + plugin compose (repo oficial, detecta ubuntu/debian) ---
if ! command -v docker >/dev/null 2>&1; then
  export DEBIAN_FRONTEND=noninteractive
  . /etc/os-release
  apt-get update
  apt-get install -y ca-certificates curl
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL "https://download.docker.com/linux/${ID}/gpg" -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/${ID} ${VERSION_CODENAME} stable" \
    >/etc/apt/sources.list.d/docker.list
  apt-get update
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  systemctl enable --now docker
fi

mkdir -p "$APP_DIR"
echo "OK: $(docker --version) | compose $(docker compose version --short) | $APP_DIR pronto."
