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
| 9 | **Frontend em `web/`: Vite + React + TS, CSS puro com tokens, `react-router`**; projeto pnpm próprio, fora do workspace/Dockerfile | Next/Remix, lib de UI, Tailwind | Painel pessoal, 3 telas, sem SSR nem auth; visual artesanal (pixel/medieval) não combina com kit de componentes. Em dev o Vite faz proxy de `/api` → API. Em prod a própria API serve o `web/dist` na mesma origem (`@fastify/static` + fallback SPA pro `index.html` em GET que aceita html; `WEB_DIST` no env, stage `web` no Dockerfile) — sem CORS, uma porta só. Por isso as rotas do painel são em pt-BR (`/`, `/leiloes/:id`, `/filtros`): não colidem com as da API (`/auctions`, `/filters`) |
| 10 | **Sprites (outfits/mounts/itens): capturar a URL do próprio tibia.com e servir por um proxy com cache no nosso backend** | Biblioteca de sprites (npm-tibia-assets), gerador de outfit, pré-download em massa | O tibia.com já hospeda os GIFs **animados**, com as addons certas, indexados por id, em `static.tibia.com/images/charactertrade/{outfits,mounts,objects}/{id}.gif` — e essas URLs já vêm no HTML do detalhe que raspamos. Gerar sprite nós mesmos seria overengineering. Hotlink direto do browser dá **403** (bloqueio de hotlink/Cloudflare; o browser em outra origem não manda o `cf_clearance` do tibia). Logo um **proxy** `GET /sprites/:cat/:file` busca via as creds da sessão `cf` (`tibiaImageFetcher`) e cacheia em disco (imutável por id; só cacheia resposta que é mesmo imagem — o challenge do Cloudflare vem como HTML com 200; single-flight + escrita atômica). A **Lista** (fase 1) já traz o outfit do char (`AuctionOutfitImage`) e os itens de exibição do card (`AuctionItemsViewBox`), persistidos em `auction.outfit`/`display_items`; o **Detalhe** (fase 2) traz itens/mounts/outfits completos. Skills viram **barra CSS** (já temos `level`+`percent`, zero asset). Fora do v1: ícones de imbuement/charm (são linhas de texto na página, exigiriam dicionário nome→id — YAGNI) |

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
`GET /charactertrade/?subtopic=currentcharactertrades&page=details&source=overview&auctionid=<id>` — traz o breakdown (skills, itens, imbuements, charms, outfits, mounts, store items). **Atenção:** `subtopic=auctiondetails` **não** existe (só reexibe a lista); a URL correta usa `page=details` (confirmado nos links da própria lista). A página **trunca** listas longas, marcando o corte com `(N more entries)` / mostrando só parte do `Results: N` — capturamos o que é exibido.

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
- **Design (definido, implementado em `web/src/styles.css`):** Silkscreen no wordmark e rótulos de seção, VT323 nos números e timers, Inter no corpo. Tokens: `--bg #0f0d0a`, `--surface #17130d`, `--surface-2 #211a11`, `--ink #e7dcc4`, `--muted #9a8f78`, `--gold #e0b64a` (acento), `--blood #a81717` (urgência: timer com menos de 1h vira bloco sangue), `--line #3a3024` (hairline). Cantos retos, sem sombra/gradiente, marcador de 8px em dourado nas linhas acompanhadas, switch pixelado. Só tema escuro; funciona em 360px.
- **Códigos dos filtros** (lidos do formulário do tibia.com em out/2026, em `web/src/lib/options.ts`): vocação `1` None · `2` Druid · `3` Knight · `4` Paladin · `5` Sorcerer · `6` Monk; skill `1` Magic · `6` Shielding · `7` Distance · `8` Sword · `9` Club · `10` Axe · `11` Fist · `13` Fishing; PvP `0`–`4` (Open, Optional, Hardcore, Retro Open, Retro Hardcore); BattlEye `1` initially protected · `2` protected · `3` not protected. O backend repassa como vem.

---

## 13. Riscos e perguntas em aberto

- **Fragilidade de parser** (CipSoft muda HTML) → mitigado por contract tests e fixtures.
- **Cloudflare aperta** → fallback FlareSolverr/ScraperAPI já previsto.
- **Resolvido (renovação de cf_clearance):** `src/scraper/cf-clearance.ts` — `createCfSession` reusa o cookie e, no `CloudflareBlockedError` (403/challenge persistente), renova via **Playwright** (`playwrightRenewer`: abre o Chromium, deixa o challenge setar o `cf_clearance`, devolve cookie + UA) e re-tenta uma vez; single-flight; persiste em arquivo (`CF_CLEARANCE_FILE`, default `.cf-clearance.json`). O UA do browser (`HeadlessChrome/…`) acompanha o cookie nos requests HTTP seguintes (o cf_clearance é amarrado ao UA). `main` injeta `session.fetchPage` no scraper. **Cautela:** o cookie só é setado quando o site realmente desafia; sem challenge (hoje o HTTP puro passa) o renovador não tem o que resolver — é fallback, não caminho normal. Se o headless começar a ser barrado, `headless:false` ou um UA custom são os próximos passos.
- **Resolvido (smoke ao vivo):** usar **`order_direction=0`** — é o que traz os chars mais novos na página 1 (dir=1 deixava-os de fora, quebrando a detecção). HTTP puro passou o Cloudflare sem `cf_clearance`.
- **Resolvido (fase 2):** detalhe parseado por id estável de seção (`div.CharacterDetailsBlock#General|ItemSummary|Imbuements|Charms|Mounts|Outfits`), não por texto de cabeçalho; persistido em `auction.attributes` (jsonb) por um backfill que detalha quem tem `attributes` nulo (cap por ciclo, para no `CloudflareBlockedError`). Escopo v1: general (stats), skills, items, imbuements, charms, mounts, outfits. **Fora do escopo v1 (YAGNI):** store items, familiars, blessings, bestiary/bosstiary, achievements, titles, quest lines, gems, proficiencies.
- **Limitação conhecida (detalhe):** a página trunca listas longas (`(N more entries)`), então `items`/`imbuements`/etc. podem vir parciais — aceitável p/ v1 (snapshot do que o site exibe sem login).
- **Validar:** janela diária de `Auction Start`; expiração real do `cf_clearance`; limites de rate aceitáveis.
- **Resolvido (varredura de fim):** `finishEndedAuctions` (em `src/db/auction-repo.ts`) marca `finished` todo leilão `active` cujo `end_at` já passou; o cron a roda a cada ciclo, antes do backfill (sem rede, só DB). Como só raspamos a página 1 da lista, "sumiu da lista" não é observável (leilões vivos saem da página 1 só por serem empurrados pelos mais novos); o `end_at` vencido é o sinal confiável — o mesmo que já protege os lembretes. **`cancelled` fica fora do escopo v1** (exigiria raspar a página de detalhe/histórico para ler o banner de cancelamento).
- **Hardening adiado (YAGNI p/ v1 local/single-user):** lote nas escritas do tick (hoje ~2 queries/leilão, irrelevante no Postgres local); `min_bid`/`current_bid` são `int4` (estouraria acima de ~2,1 bi TC — valor irreal hoje) → migrar p/ `bigint` se necessário.
- **Decidir depois:** domínio + handle GitHub; identidade visual; **se um char que casa N presets deve gerar N e-mails** (hoje sim — novidade é por-filtro, cada preset alerta e registra seu `auction_match`) **ou 1 e-mail** (dedup do alerta mantendo os matches). Em v1 (poucos presets, pouca sobreposição) o atual é aceitável.
