# Deploy (Fase 6) — VPS Hostinger + HTTPS + CI/CD

Produção: **1 VPS Hostinger (Ubuntu)**, HTTPS via **Caddy + Let's Encrypt** sobre **sslip.io** (ou um domínio), deploy por **GitHub Actions** (build no runner → GHCR → SSH no VPS). Secrets no **GitHub Secrets**.

```
push main → Actions: build → ghcr.io/hericlessssss/utiva:<sha> → SSH no VPS
VPS: caddy (:80/:443) → app (:3000 interno) → db (postgres)
     app no boot: prisma migrate deploy && node dist/main.js
```

## Pré-requisitos (você faz)

1. **VPS na Hostinger** — qualquer plano KVM serve (o de entrada já basta; Postgres+Node+Caddy cabem em 2–4GB). SO: **Ubuntu 24.04** (ou o template **"Ubuntu 24.04 com Docker"**, que pula a instalação do Docker). Anote o **IP público** (é fixo/dedicado).
2. **Chave SSH** — adicione a chave pública de deploy (gerada no repo, veja abaixo) à VPS: no painel Hostinger → VPS → *SSH Keys* (ou escolha-a na criação). A privada vai pro GitHub Secret `VM_SSH_KEY`.
3. **Resend precisa de domínio** — pra `MAIL_FROM` enviar a terceiros, o Resend exige um **domínio verificado (SPF/DKIM)**. sslip.io não resolve isso. **Como você já está na Hostinger, pegar um domínio barato lá resolve tudo de uma vez**: aponta o A record pro IP da VPS (vira o site, no lugar do sslip.io) e verifica no Resend via o DNS da Hostinger. Sem domínio, o e-mail só chega no seu próprio endereço de teste.
4. **Google Console** — adicionar `https://<SITE_ADDRESS>/auth/callback` nos Authorized redirect URIs do OAuth Client (`<SITE_ADDRESS>` = `<IP>.sslip.io` ou seu domínio).

## Provisionamento (uma vez, na VPS)

Com a VPS no ar, rode **como root** (via SSH ou o terminal do navegador da Hostinger):

```bash
# pega o provision.sh do repo e executa (instala Docker+compose se faltar, swap 2GB, /opt/utiva)
curl -fsSL https://raw.githubusercontent.com/hericlessssss/utiva/main/infra/provision.sh | bash
```

> O `provision.sh` está no repo em `infra/provision.sh`. Se preferir, copie e cole o conteúdo. É idempotente — pode rodar de novo sem quebrar.

## GitHub Secrets (Settings → Secrets and variables → Actions)

| Secret | Valor |
|---|---|
| `VM_HOST` | IP público da VPS |
| `VM_USER` | `root` |
| `VM_SSH_KEY` | conteúdo da **chave privada** de deploy |
| `SITE_ADDRESS` | `<IP>.sslip.io` (hífens no IP, ex.: `203-0-113-5.sslip.io`) **ou** seu domínio |
| `POSTGRES_PASSWORD` | senha forte do Postgres |
| `RESEND_API_KEY` / `MAIL_FROM` / `MAIL_TO` | credenciais do Resend |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | OAuth Client |
| `OAUTH_REDIRECT_URI` | `https://<SITE_ADDRESS>/auth/callback` |
| `COOKIE_SECRET` | `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |

GHCR usa o `GITHUB_TOKEN` do próprio workflow — sem secret extra. (A imagem `ghcr.io/hericlessssss/utiva` precisa ser acessível; o deploy faz `docker login ghcr.io` com o token efêmero do Actions.)

## Deploy

- **Automático:** push na `main` → o workflow `deploy.yml` builda, publica no GHCR e sobe na VPS.
- **Manual:** aba Actions → `deploy` → *Run workflow*.
- **Rollback:** na VPS, `cd /opt/utiva && IMAGE_TAG=<sha-anterior> docker compose -f docker-compose.prod.yml up -d` (tags por SHA ficam no GHCR).

## Verificação pós-deploy

```bash
curl -I https://<SITE_ADDRESS>/health      # 200, TLS válido (Let's Encrypt)
# browser: home carrega, cadeado ok, login Google → e-mail de confirmação chega
ssh root@<IP> 'cd /opt/utiva && docker compose -f docker-compose.prod.yml logs --tail=50 app'
```

## Operação

- **Logs:** `docker compose -f docker-compose.prod.yml logs -f app`.
- **Backup do Postgres (recomendado via cron na VPS):**
  ```bash
  docker compose -f docker-compose.prod.yml exec -T db pg_dump -U utiva utiva | gzip > ~/utiva-$(date +%F).sql.gz
  ```
- **Firewall:** garanta no painel da Hostinger (e/ou `ufw`) que **22, 80 e 443** estão abertas. O padrão da Hostinger já deixa abertas.
- **Cert:** não apague o volume `caddy_data` à toa — o Let's Encrypt tem rate limit.

## Notas

- **RAM:** swap de 2GB é criado pelo `provision.sh` como colchão.
- **Playwright/Chromium** não está na imagem (fallback de `cf_clearance`); hoje o HTTP puro passa. Tratar se o Cloudflare desafiar em prod.
- **sslip.io → domínio depois:** mudar `SITE_ADDRESS` + `OAUTH_REDIRECT_URI` (e o redirect no Console) e apontar o A record pro IP. Sem mudança de código.
