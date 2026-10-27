# Deploy (Fase 6) — VM GCP + HTTPS + CI/CD

Produção: **1 VM GCP e2-small (São Paulo)**, HTTPS via **Caddy + Let's Encrypt** sobre **sslip.io**, deploy por **GitHub Actions** (build no runner → GHCR → SSH no VM). Secrets no **GitHub Secrets**.

```
push main → Actions: build → ghcr.io/hericlessssss/utiva:<sha> → SSH no VM
VM: caddy (:80/:443) → app (:3000 interno) → db (postgres)
    app no boot: prisma migrate deploy && node dist/main.js
```

## Pré-requisitos (só você faz)

1. **Billing** vinculado ao projeto `utiva-512902` — sem isso não cria VM. Console → Billing.
2. **Resend**: verificar um **domínio** (SPF/DKIM) pra `MAIL_FROM` enviar a qualquer destinatário. sslip.io **não** resolve isso; sem domínio só manda pro seu próprio e-mail de teste.
3. **Google Console** (após reservar o IP): adicionar `https://<IP>.sslip.io/auth/callback` em Authorized redirect URIs do OAuth Client.

## Provisionamento (uma vez)

```bash
# 1. Habilitar Compute Engine
gcloud services enable compute.googleapis.com

# 2. IP estático (anote o endereço → vira <IP>.sslip.io)
gcloud compute addresses create utiva-ip --region southamerica-east1
gcloud compute addresses describe utiva-ip --region southamerica-east1 --format='value(address)'

# 3. Firewall: HTTP/HTTPS pra internet (SSH já vem no default-allow-ssh)
gcloud compute firewall-rules create utiva-web \
  --allow tcp:80,tcp:443 --target-tags utiva --direction INGRESS

# 4. Chave SSH dedicada pro CI (a privada vai pro GitHub Secret VM_SSH_KEY)
ssh-keygen -t ed25519 -f ./utiva_deploy -C deploy -N ''

# 5. Criar a VM (startup-script instala Docker + swap + /opt/utiva; usuário deploy)
gcloud compute instances create utiva \
  --zone southamerica-east1-a --machine-type e2-small \
  --image-family debian-12 --image-project debian-cloud \
  --address utiva-ip --tags utiva \
  --metadata-from-file startup-script=infra/startup.sh \
  --metadata ssh-keys="deploy:$(cat ./utiva_deploy.pub)"
```

## GitHub Secrets (Settings → Secrets and variables → Actions)

| Secret | Valor |
|---|---|
| `VM_HOST` | IP estático da VM |
| `VM_USER` | `deploy` |
| `VM_SSH_KEY` | conteúdo de `utiva_deploy` (chave privada) |
| `SITE_ADDRESS` | `<IP>.sslip.io` (hífens no IP, ex.: `34-8-130-1.sslip.io`) |
| `POSTGRES_PASSWORD` | senha forte do Postgres |
| `RESEND_API_KEY` / `MAIL_FROM` / `MAIL_TO` | credenciais do Resend |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | OAuth Client |
| `OAUTH_REDIRECT_URI` | `https://<IP>.sslip.io/auth/callback` |
| `COOKIE_SECRET` | `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |

GHCR usa o `GITHUB_TOKEN` do próprio workflow — sem secret extra.

## Deploy

- **Automático:** push na `main` → o workflow `deploy.yml` builda, publica no GHCR e sobe no VM.
- **Manual:** aba Actions → `deploy` → *Run workflow*.
- **Rollback:** no VM, `cd /opt/utiva && IMAGE_TAG=<sha-anterior> docker compose -f docker-compose.prod.yml up -d` (imagens antigas ficam no GHCR por tag de SHA).

## Verificação pós-deploy

```bash
curl -I https://<IP>.sslip.io/health      # 200, TLS válido
# browser: home carrega, cadeado ok, login Google → e-mail de confirmação chega
ssh deploy@<IP> 'cd /opt/utiva && docker compose -f docker-compose.prod.yml logs --tail=50 app'
```

## Operação

- **Logs:** `docker compose -f docker-compose.prod.yml logs -f app`.
- **Backup do Postgres (recomendado via cron no VM):**
  ```bash
  docker compose -f docker-compose.prod.yml exec -T db pg_dump -U utiva utiva | gzip > ~/utiva-$(date +%F).sql.gz
  ```
  (Mandar pra GCS é follow-up.)
- **Reset do cert (raro):** não apague o volume `caddy_data` à toa — o Let's Encrypt tem rate limit.

## Notas

- **RAM:** e2-small = 2GB + 2GB swap (startup-script). Se apertar, `gcloud compute instances set-machine-type utiva --machine-type e2-medium` (com a VM parada).
- **Playwright/Chromium** não está na imagem (fallback de `cf_clearance`); hoje o HTTP puro passa. Tratar se o Cloudflare desafiar em prod.
- **Trocar sslip.io por domínio:** mudar `SITE_ADDRESS` + `OAUTH_REDIRECT_URI` (e o redirect no Console) e apontar o A record pro IP. Sem mudança de código.
