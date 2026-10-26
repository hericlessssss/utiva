# Utiva — Planejamento (Alerta de Char Bazaar do Tibia)

> Documento vivo de planejamento (SDD). Status: **beta/concepção**. Data: 2026-10-26.
> Nome do projeto: **Utiva** (definido — ver §12).

---

## 1. Problema e visão

Comprar personagens no **Char Bazaar oficial do Tibia** exige vigiar a lista de leilões manualmente: um char com as características que eu quero pode ser anunciado a qualquer momento e eu só descubro se abrir o site na hora. Além disso, é fácil perder o fim de um leilão que me interessa.

**Visão (v1):** uma aplicação pessoal que, via verificação periódica (cron), detecta quando um personagem que bate com os meus filtros é colocado em leilão e me **alerta por e-mail**, e que me manda **lembretes conforme o leilão se aproxima do fim**. Frontend próprio com resumo completo do char (estilo Exevo Pan) e toggle de acompanhamento por leilão.

**Não-objetivo (v1):** dar lances automáticos, operar a conta do jogo, ou ser uma plataforma pública multi-usuário. (Ver roadmap, §11.)

---

## 2. Escopo v1 (Definition of Done do MVP)

**Dentro:**
- Cron que consulta a lista de leilões atuais **já filtrada no servidor** pelos meus critérios.
- Detecção de leilão novo (diff por `auctionid`) → **e-mail de alerta**.
- Agendamento de **lembretes de fim** (3d / 1d / 3h / 1h / 15m / 5m antes do `auction_end`).
- Persistência dos leilões vistos + estado dos alertas.
- Frontend: lista + detalhe do char (atributos), toggle "acompanhar/parar de acompanhar".
- Rodando 100% local via Docker Compose, com testes.

**Fora (v1):** lances automáticos, histórico/estatísticas de mercado, multi-usuário/auth pública, canais além de e-mail, mobile push.

---

## 3. Decisões de arquitetura (ADR resumido)

| # | Decisão | Alternativa descartada | Porquê |
|---|---|---|---|
| 1 | **Scraping do tibia.com** como fonte | API oficial / TibiaData | Não existe API oficial do bazar; TibiaData v4 não tem rota de leilão (§4) |
| 2 | **TypeScript** | Python/tibiapy | Alinha ao workspace, aos blueprints e ao ecossistema JS; reuso direto de assets do Exevo |
| 3 | **Fastify** (API) | Nest/Express | Leve, performático, padrão dos blueprints |
| 4 | **Scraper híbrido**: undici+Cheerio, Playwright só p/ renovar cookie | Playwright sempre / ScraperAPI | Cloudflare é intermitente por reputação de IP; HTTP puro é barato, browser é fallback |
| 5 | **Postgres em Docker** + Prisma | Supabase / Turso/SQLite | Prod roda em Docker; não quero um projeto Supabase gerenciado só pra teste local. Mesmo Postgres (container) em dev/test/prod, Prisma dono do schema |
| 6 | **pg-boss** (fila/scheduler em Postgres) | BullMQ + Redis | MVP pessoal não precisa de Redis; menos peças no monólito |
| 7 | **Resend** (e-mail) | SES/SMTP | DX simples p/ beta |
| 8 | **Monólito** em Docker Compose (local) → **VM GCP (e2-small)** | Cloud Run | Cron always-on + browser ocasional caem mal em serverless |

---

## 4. Descobertas de pesquisa (fonte da verdade dos dados)

- **Não há API oficial da CipSoft** para o bazar. O "programa de fansite" dá status de *supported fansite* (TibiaData e Exevo têm), mas **não concede API** — todos fazem scraping.
- **TibiaData API v4**: cobre character/guild/house/highscores/news — **sem** rota de leilão. Útil só para dados de personagem fora do bazar.
- **tibiapy** (Python): tem `fetch_current_auctions` / `fetch_auction` / `fetch_auction_history`, mas é scraping e sofre rate-limit/403. Referência de cobertura de campos.
- **Cloudflare**: a página devolve *managed challenge* para HTTP cru (confirmado: `curl` → 403), mas **passa normalmente** no browser com cookies. O `bazaar-api-docker` scrapeia o bazar com **Axios+Cheerio puro** → o challenge é **intermitente (reputação de IP/sessão)**, não always-on.
- **Página é HTML renderizado no servidor** (PHP), **sem API JSON interna** → parsear HTML (Cheerio).
- **Mecânica do leilão**: duração 2–28 dias; 50 TC p/ listar + 12% de comissão; vencedor tem 7 dias p/ pagar; transferência no próximo *server save*. Observação empírica: os `Auction Start` tendem a se concentrar ~10:00 (CE(S)T), sugerindo que leilões criados entram "ao vivo" em janela diária — **validar** (pode permitir afinar a cadência do cron).

---

## 5. Contrato do scraper (confirmado inspecionando o site)

**Lista de leilões atuais:**
`GET https://www.tibia.com/charactertrade/?subtopic=currentcharactertrades`

**Parâmetros de filtro (GET) — mapeiam 1:1 os filtros do site:**

| Param | Significado |
|---|---|
| `filter_world` | mundo (ex.: Antica, Secura…) |
| `filter_worldpvptype` | tipo de PvP |
| `filter_worldbattleyestate` | estado BattlEye |
| `filter_profession` | vocação |
| `filter_levelrangefrom` / `filter_levelrangeto` | faixa de level |
| `filter_skillid` | skill (magic, shielding, distance, axe, club, sword, fist, fishing) |
| `filter_skillrangefrom` / `filter_skillrangeto` | faixa da skill |
| `searchstring` + `searchtype` | busca por item (default/wildcard) ou nome do char |
| `order_column` + `order_direction` | ordenação |
| `currentpage` | paginação (~24 itens/página) |

**Detalhe do leilão:**
`GET /charactertrade/?subtopic=auctiondetails&auctionid=<id>` — traz o breakdown completo (skills, itens, imbuements, charms, outfits, mounts, store items).

**Estratégia de detecção (2 fases, barata):**
1. Para cada **preset de filtro** do usuário, pedir a lista ordenada por **Start Date desc**, ler só a **página 1** → coletar `auctionid`s.
2. Diff contra os IDs já vistos → para cada **ID novo**, buscar a página de detalhe e persistir. Disparar e-mail de alerta.
3. Atualizar bids/remover finalizados nos já acompanhados.

**Cadência alvo:** 1–5 min por preset (1 request/ciclo/preset). Respeitar rate-limit: delays entre requests, concorrência baixa, backoff no 403, reuso de `cf_clearance`.

---

## 6. Modelo de dados (rascunho)

- **`watch_filter`** — preset de busca do usuário: world, pvp, battleye, vocação, level_from/to, skill_id, skill_from/to, search, ativo(bool).
- **`auction`** — snapshot do leilão: `auction_id` (PK), char_name, world, vocation, sex, level, start_at, end_at, min_bid, current_bid, battleye, pvp_type, flags(jsonb), attributes(jsonb raw), first_seen_at, last_seen_at, status(active/finished/cancelled).
- **`auction_match`** — liga `auction` ↔ `watch_filter` que o capturou (p/ saber por que alertou).
- **`watched_auction`** — leilões que eu marquei p/ acompanhar (toggle): auction_id, enabled(bool).
- **`notification`** — auction_id, tipo(new|ending), threshold(ex.: '3h'), scheduled_at, sent_at, channel(email).

Fila/agendamento via **pg-boss** (tabelas próprias no mesmo Postgres).

---

## 7. Fluxos principais

**A. Detecção de char novo**
cron (node-cron) → p/ cada `watch_filter` ativo → scraper fase 1+2 → IDs novos → upsert `auction` + `auction_match` → enfileirar e-mail "char novo" (pg-boss) → worker envia via Resend.

**B. Lembretes de fim**
Ao marcar `watched_auction`, calcular os thresholds a partir de `end_at` e agendar jobs pg-boss (3d/1d/3h/1h/15m/5m) via `startAfter`, com `singletonKey` por (leilão, threshold) pra não duplicar. Cada job, ao disparar, checa se o leilão ainda está **acompanhado (`enabled`) e ativo** e só então envia — se o toggle foi desligado, o job pula. Isso substitui "cancelar os jobs pendentes" (mesmo efeito, sem rastrear/cancelar jobs no pg-boss).

---

## 8. Reuso (com licenças)

| Fonte | Aproveitar | Licença |
|---|---|---|
| **Exevo Pan** (`tibialabs/exevo-pan`) | `data-dictionary` (IDs↔nomes), `mock-maker` (fixtures p/ TDD), parser detalhe 2 fases, lista de itens raros, `auction-queries`, schema Prisma | Unlicense (domínio público) |
| **bazaar-api-docker** (`luizgustavocs`) | shape crawler→upsert→API, batch 25/página, upsert por ID, health-check, parsing Cheerio | MIT |
| **tibiapy** | referência de cobertura de campos do parser | — |

> ⚠️ Mesmo com Unlicense/MIT, os **assets e dados do Tibia são © CipSoft**. Respeitar os termos de fansite; se publicar, candidatar-se a *supported fansite* e manter rate-limit respeitoso.

---

## 9. Qualidade (TDD / SDD / DoD)

- **TDD:** parser testado contra **fixtures HTML salvas** (snapshots de páginas reais) — isola a fragilidade do scraping. `mock-maker` do Exevo ajuda.
- **SDD:** este doc + specs por feature antes de codar. Contrato do scraper (§5) é o primeiro spec.
- **DoD:** lint + type-check + testes verdes + cobertura do parser + rodar o fluxo A/B localmente ponta a ponta.
- Contract tests para detectar quebra de layout do tibia.com cedo.

---

## 10. Deploy

- **Beta (agora):** Docker Compose local = app (Fastify+cron+worker) + Postgres (container). Playwright no container p/ renovar cookie.
- **Produção (pós-beta):** 1 VM GCP **e2-small** com o mesmo Compose (incl. o Postgres em container); secrets no **GCP Secret Manager**; backup do Postgres. Alt serverless: Cloud Run **Jobs** + Cloud Scheduler.

---

## 11. Roadmap de features

1. **v1 (core):** alerta de char novo por filtro (e-mail) · lembretes de fim · toggle de watch · detalhe do char.
2. **Perto:** alerta por item/mount/outfit raro · múltiplos presets · canais Discord/Telegram/PWA push · favoritos.
3. **Depois:** "preço justo" (stats de histórico / `tibia-evaluator`) · dashboards de mercado (Recharts) · scoring de charm/imbuement/bestiary · multi-usuário SaaS (auth Supabase).

---

## 12. Nome e design

- **Nome: `Utiva`** (definido). Cunhado a partir das sílabas mágicas do Tibia: **`ut`** (over time / contínuo) + **`iva`** (locate — a sílaba da única magia de *encontrar alguém*, o **Find Person** = `exiva <nome>`). Significa, sem forçar, **"localização contínua de personagem"** — o produto numa palavra. Segue a mesma lógica do "Exevo Pan" (a magia *Conjure Food*, `exevo`+`pan`).
- **Pendente:** registrar domínio (`.com`/`.gg`) e handle no GitHub; confirmar disponibilidade antes do deploy público.
- **Design:** fonte pixel nos títulos (Press Start 2P / Silkscreen / VT323) + corpo legível (Inter); paleta medieval (dourado, vermelho-sangue, pergaminho) em fundo escuro; minimalismo.

---

## 13. Riscos e perguntas em aberto

- **Fragilidade de parser** (CipSoft muda HTML) → mitigado por contract tests e fixtures.
- **Cloudflare aperta** → fallback FlareSolverr/ScraperAPI já previsto.
- **Resolvido (smoke ao vivo):** usar **`order_direction=0`** — é o que traz os chars mais novos na página 1 (dir=1 deixava-os de fora, quebrando a detecção). HTTP puro passou o Cloudflare sem `cf_clearance`.
- **Validar:** janela diária de `Auction Start`; expiração real do `cf_clearance`; cobertura de todos os campos do detalhe; limites de rate aceitáveis.
- **Hardening adiado (YAGNI p/ v1 local/single-user):** lote nas escritas do tick (hoje ~2 queries/leilão, irrelevante no Postgres local); `min_bid`/`current_bid` são `int4` (estouraria acima de ~2,1 bi TC — valor irreal hoje) → migrar p/ `bigint` se necessário; **`auction.status` nunca transiciona** (fica sempre `active`) — falta uma varredura que marque `finished`/`cancelled` quando o leilão some da lista. Os lembretes já se protegem por `end_at` (não dependem de `status`).
- **Decidir depois:** domínio + handle GitHub; identidade visual.
