# Egress residencial do scraper (proxy + túnel SSH)

O Cloudflare da Tibia bloqueia o **IP de datacenter** da VPS com "Attention Required!". A saída
é fazer o scraper sair por um **IP residencial** — o do PC do dono. O browser continua na VPS;
ele só **tunela** por um proxy que roda no PC.

```
VPS (Playwright, SCRAPE_PROXY)  --túnel reverso SSH-->  PC: home-proxy.mjs  -->  internet residencial  -->  Tibia/Cloudflare
```

⚠️ **A raspagem só funciona enquanto o PC estiver ligado** com o proxy + túnel de pé. PC desligou
= o fetch falha e é logado; volta sozinho quando religar.

## Setup (uma vez)

### 1. VPS: permitir o bind do túnel no endereço do docker0
Em `/etc/ssh/sshd_config`, garanta:
```
GatewayPorts clientspecified
```
Depois: `systemctl reload ssh` (ou `sshd`). Isso deixa o `ssh -R` bindar em `172.17.0.1` (a
gateway do docker0, alcançável de dentro do container do app — e **não** exposta à internet).

### 2. PC: rodar o proxy (deixe a janela aberta)
```
node tools/home-proxy.mjs
```
Escuta em `127.0.0.1:8899`, encaminha só `*.tibia.com` (não é proxy aberto).

### 3. PC: abrir o túnel reverso (outra janela, PowerShell — reconecta sozinho)
```powershell
while ($true) {
  ssh -N -o ServerAliveInterval=30 -o ExitOnForwardFailure=yes `
      -R 172.17.0.1:8899:127.0.0.1:8899 root@2.24.100.80
  Start-Sleep -Seconds 5
}
```
Isso expõe o proxy na VPS em `172.17.0.1:8899`, que é o que o `SCRAPE_PROXY` aponta por padrão
(ver `docker-compose.prod.yml`). Para rodar sem janela aberta, crie uma Tarefa Agendada no logon.

### 4. VPS: sem mudança extra
O `SCRAPE_PROXY` já tem default `http://172.17.0.1:8899` no compose. Após este deploy, o scraper
usa o túnel automaticamente. Para desligar o proxy (egress direto), setar `SCRAPE_PROXY=` vazio.

## Checar
- Proxy vivo: a janela do passo 2 loga `CONNECT www.tibia.com:443` a cada ciclo.
- VPS: `docker compose -f docker-compose.prod.yml logs app | grep -iE 'enfileir|challenge'` —
  `enfileirados N` = funcionando; `challenge não limpou` = ainda bloqueado (PC/túnel fora do ar?).

## Se o container não alcançar `172.17.0.1`
Fallback: no `app` do compose adicione `extra_hosts: ["host.docker.internal:host-gateway"]`,
use `SCRAPE_PROXY=http://host.docker.internal:8899` e binde o túnel em `0.0.0.0` (`-R 0.0.0.0:8899:...`,
com `GatewayPorts yes`). O allowlist `*.tibia.com` do proxy limita o risco do bind público.
