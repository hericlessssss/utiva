# Deploy (Fase 6) — VPS Hostinger (Kamal) + CI/CD

Produção: **1 VPS Hostinger (Ubuntu)** que já roda **Kamal** — o container compartilhado **`kamal-proxy`** ocupa 80/443 e faz o TLS (Let's Encrypt) de várias apps. O Utiva **não sobe proxy próprio**: entra como mais uma rota no `kamal-proxy`. Deploy por **GitHub Actions** (build no runner → GHCR → SSH no VPS). Secrets no **GitHub Secrets**.

```
push main → Actions: build → ghcr.io/hericlessssss/utiva:<sha> → SSH no VPS
VPS: kamal-proxy (:80/:443, compartilhado) --(rede kamal)--> utiva-app-1:3000
     + utiva-db-1 (postgres, só na rede interna)
     app no boot: prisma migrate deploy && node dist/main.js
     deploy registra a rota:  kamal-proxy deploy utiva --host <SITE_ADDRESS> --target utiva-app-1:3000 --tls
```

## Pré-requisitos (você faz)

1. **VPS Hostinger com Docker + Kamal** (já existe). O `kamal-proxy` já cuida de 80/443 e TLS — não precisa abrir/gerenciar portas pro Utiva.
2. **Chave SSH** — a pública de deploy já está na VPS (user `root`); a privada está no GitHub Secret `VM_SSH_KEY`.
3. **Resend precisa de domínio** — pra `MAIL_FROM` enviar a terceiros, o Resend exige um **domínio verificado (SPF/DKIM)**. Com sslip.io o e-mail só chega no seu próprio endereço de teste. (Futuro: domínio na Hostinger resolve site + e-mail.)
4. **Google Console** — `https://<SITE_ADDRESS>/auth/callback` nos Authorized redirect URIs do OAuth Client (`<SITE_ADDRESS>` = `<IP>.sslip.io` ou domínio).

## Provisionamento (uma vez, já feito)

`infra/provision.sh` roda como root na VPS (Docker+compose se faltar, swap 2GB, `/opt/utiva`). Idempotente.

## GitHub Secrets (Settings → Secrets and variables → Actions)

| Secret | Valor |
|---|---|
| `VM_HOST` | IP público da VPS |
| `VM_USER` | `root` |
| `VM_SSH_KEY` | chave **privada** de deploy |
| `SITE_ADDRESS` | `<IP>.sslip.io` (hífens no IP, ex.: `2-24-100-80.sslip.io`) **ou** domínio — vira o `--host` do kamal-proxy |
| `POSTGRES_PASSWORD` | senha do Postgres |
| `RESEND_API_KEY` / `MAIL_FROM` / `MAIL_TO` | Resend |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | OAuth Client |
| `OAUTH_REDIRECT_URI` | `https://<SITE_ADDRESS>/auth/callback` |
| `COOKIE_SECRET` | `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |

GHCR usa o `GITHUB_TOKEN` do próprio workflow.

## Deploy

- **Automático:** push na `main` → `deploy.yml` builda, publica no GHCR, sobe o compose na VPS e **registra a rota no kamal-proxy**.
- **Manual:** aba Actions → `deploy` → *Run workflow*.
- **Rollback:** na VPS, `cd /opt/utiva && IMAGE_TAG=<sha-anterior> docker compose -f docker-compose.prod.yml up -d` + re-registrar (`docker exec kamal-proxy kamal-proxy deploy utiva --host <SITE_ADDRESS> --target utiva-app-1:3000 --health-check-path /health --tls`).

## Verificação pós-deploy

```bash
curl -I https://<SITE_ADDRESS>/health            # 200, TLS válido
docker exec kamal-proxy kamal-proxy list         # a rota `utiva` deve aparecer running/tls yes
ssh root@<IP> 'cd /opt/utiva && docker compose -f docker-compose.prod.yml logs --tail=50 app'
```

## Operação

- **Logs:** `docker compose -f docker-compose.prod.yml logs -f app`.
- **Backup do Postgres (cron na VPS):**
  ```bash
  docker compose -f docker-compose.prod.yml exec -T db pg_dump -U utiva utiva | gzip > ~/utiva-$(date +%F).sql.gz
  ```
- **Remover a rota (se precisar tirar do ar):** `docker exec kamal-proxy kamal-proxy remove utiva` (não afeta as outras apps).
- **Nunca** bindar 80/443 no compose do Utiva — são do `kamal-proxy` compartilhado.

## Notas

- **TLS/cert** são gerenciados pelo `kamal-proxy` (não temos volume de certs próprio).
- **Rede `kamal`**: o `utiva-app` precisa estar nela pro proxy alcançá-lo (`networks: [default, kamal]` no compose; `kamal` é `external`).
- **Health check** do kamal-proxy aponta pra `/health` (o default dele é `/up`).
- **Playwright/Chromium** não está na imagem (fallback de `cf_clearance`); hoje o HTTP puro passa.
- **sslip.io → domínio depois:** mudar `SITE_ADDRESS` + `OAUTH_REDIRECT_URI` (e o redirect no Console); o deploy re-registra a rota com o novo host.
