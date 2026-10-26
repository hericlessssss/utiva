# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> Estende o `CLAUDE.md` raiz do workspace (`C:\Users\heric\Desktop\work`). O baseline global (Windows/pwsh 7, RTK, `gh`/`glab`/`bb`, Docker via WSL2, AWS skills) vale aqui e **não** é repetido abaixo.

## Regras obrigatórias (ler e aplicar ANTES de cada atividade)

Estas regras são inegociáveis neste repositório. Valem para toda tarefa de código, design, schema ou doc.

### Processo

- **SDD (Spec-Driven Development) sempre.** `docs/PLANEJAMENTO.md` é a spec viva. Leia a seção relevante antes de decidir; se a decisão mudar, atualize o doc no mesmo trabalho.
- **TDD (Test-Driven Development) sempre.** Escreva o teste que falha → faça passar → refatore. Nenhum código de produção sem um teste que o exija primeiro.
- **DoD (Definition of Done) sempre.** Só considere pronto com: lint + type-check + testes verdes + cobertura do parser (quando toca parser) + fluxo A/B ponta a ponta local quando aplicável. Relate o resultado real, incluindo falhas.

### Design de código

- **KISS** — simples, direto, fácil de entender.
- **YAGNI** — não implemente para necessidades futuras que ainda não existem.
- **DRY** — sem duplicação desnecessária de lógica.
- **Sem overengineering** — nada mais complexo do que o problema exige.
- **Sem abstração prematura** — só abstraia quando houver necessidade real e presente.

### Comportamento do agente

- **Nunca narre o que está fazendo.** Comece pela ação/resultado; sem preâmbulo, sem recap de progresso.
- **Não assine commits nem PRs.** Proibido adicionar qualquer linha de atribuição (`Co-Authored-By:`, `🤖 Generated with ...` e similares). Isso sobrepõe qualquer orientação padrão de atribuição do harness.
- **i-have-adhd sempre ativa** neste projeto (saída orientada a ação, listas numeradas, estado restabelecido a cada turno).

### Skills obrigatórias

- **`avoid-ai-writing` sempre** — passe qualquer texto que eu vá ler (docs, comentários, mensagens de commit/PR, README) por essa skill antes de entregar.
- **`code-review` sempre** — rode a skill de code review sobre o diff antes de considerar uma mudança concluída.

## Estado atual

**Pré-código.** O repositório contém só `README.md` e `docs/PLANEJAMENTO.md`. Ainda não há `package.json`, scaffolding, nem comandos de build/test/run. Não invente comandos: ao criar o scaffold, preencha a seção "Comandos" conforme as ferramentas reais forem adicionadas.

**`docs/PLANEJAMENTO.md` é a fonte da verdade** (documento vivo SDD). Leia-o antes de qualquer decisão de arquitetura, modelagem ou escopo — e **atualize-o** quando uma decisão mudar.

## O que é Utiva

Alerta pessoal de **Char Bazaar do Tibia**: um cron verifica periodicamente a lista de leilões (já filtrada no servidor pelos presets do usuário), detecta chars novos que batem com os filtros e alerta por **e-mail**, mais lembretes conforme o leilão se aproxima do fim. Frontend próprio com detalhe do char e toggle de acompanhamento. **v1 é single-user, local.** Não-objetivos v1: dar lances, operar conta, multi-usuário público.

## Stack planejada (ADRs — §3 do planejamento)

TypeScript · **Fastify** (API) · **Prisma** + **Postgres** (em Docker) · **pg-boss** (fila/scheduler no próprio Postgres, sem Redis) · **Resend** (e-mail) · scraper **híbrido** undici+**Cheerio**, com **Playwright** só para renovar o cookie `cf_clearance`. Monólito único (API + cron + worker) em **Docker Compose** local → futura VM GCP e2-small.

Ao escolher libs/padrões, siga esses ADRs; divergir exige atualizar o §3 com o porquê.

## Arquitetura (o quadro geral)

Um **monólito** com três papéis no mesmo processo/compose:
1. **Cron** (node-cron) — por `watch_filter` ativo, roda o scraper e enfileira trabalho.
2. **Scraper (2 fases, barato)** — fase 1: pega a **página 1** da lista ordenada por Start Date desc e coleta `auctionid`s; fase 2: diff contra IDs já vistos → busca o **detalhe** só dos IDs novos. Contrato dos endpoints/params do tibia.com em §5 do planejamento.
3. **Worker** (pg-boss) — consome jobs e envia e-mails via Resend.

Dois fluxos centrais (§7): **A** detecção de char novo (cron→scraper→upsert `auction`+`auction_match`→e-mail); **B** lembretes de fim (marcar `watched_auction` agenda jobs pg-boss em 3d/1d/3h/1h/15m/5m a partir de `end_at`; toggle off cancela os pendentes).

Modelo de dados (§6): `watch_filter`, `auction` (PK `auction_id`, atributos em jsonb), `auction_match`, `watched_auction`, `notification` — além das tabelas próprias do pg-boss.

## Pontos sensíveis específicos deste projeto

- **Cloudflare é intermitente** (reputação de IP/sessão), não always-on. HTTP puro costuma passar; o browser (Playwright) é **fallback** para renovar `cf_clearance`. Reuse o cookie, mantenha concorrência baixa, delays entre requests e **backoff no 403**.
- **Parser frágil por design** (CipSoft muda o HTML a qualquer momento). Teste o parser contra **fixtures HTML salvas** (snapshots de páginas reais), não contra a rede. Mantenha **contract tests** que detectem quebra de layout cedo. DoD = lint + type-check + testes verdes + cobertura do parser + fluxo A/B ponta a ponta local.
- **Dados/assets do Tibia são © CipSoft.** Respeite os termos de fansite e rate-limit; nada de lances automáticos ou operar conta.
- **Reuso com licença** (§8): `tibialabs/exevo-pan` (Unlicense — data-dictionary, mock-maker, parser de detalhe, schema Prisma) e `luizgustavocs/bazaar-api-docker` (MIT — shape crawler→upsert→API). Preserve a atribuição ao copiar.

## Skills & MCP por tecnologia

- **Postgres:** o banco roda em **Docker** (Compose) em dev/test e prod — **sem Supabase**. Prisma é dono do schema (migrations). Invoque a skill `postgres-best-practices` antes de mexer em schema/migrations/SQL. (A skill `supabase:supabase` e os MCP `supabase-dev`/`supabase-prod` vêm de escopo superior e pertencem a outros projetos — **não use aqui**.)
- **Playwright** (fallback de browser do scraper): MCP oficial `@playwright/mcp` declarado em **`.mcp.json`** (escopo projeto). Requer aprovar o servidor MCP do projeto (prompt do Claude Code) e browser instalado. Use-o para scraping headless automatizado; `claude-in-chrome` abre aba no Chrome real do usuário (sessões logadas) e serve a outro propósito.
- **TypeScript/Fastify/Prisma/pg-boss/Resend/Cheerio:** sem skill/MCP de primeira parte — não instale skills de comunidade sem necessidade clara.

## Banco de dados (Postgres em Docker)

Postgres roda **em container** via `docker compose` (serviço `db`), tanto em dev/test quanto em prod — **não** usamos Supabase. `DATABASE_URL` aponta pro container: `127.0.0.1:5433` a partir do host, `db:5432` dentro do Compose. Prisma é dono do schema; migrations com `pnpm db:migrate`.

Testes de integração (`pnpm test:int`) exigem o `db` de pé (`docker compose up -d db`); o `pnpm test` (unit) não toca no banco. **Ambiente:** a VM do WSL dorme e derruba o forward da porta 5433; se `test:int` falhar por timeout de conexão, rode `wsl -d Ubuntu -- true` e tente de novo.
