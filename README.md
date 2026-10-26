# Utiva

Alerta pessoal de Char Bazaar do Tibia. Spec viva em [`docs/PLANEJAMENTO.md`](docs/PLANEJAMENTO.md).

## Requisitos

- Node >= 22 (dev em v24)
- pnpm
- Docker + Docker Compose (stack local)

## Comandos

| Comando | Faz |
|---|---|
| `pnpm install` | instala dependências |
| `pnpm dev` | sobe a API em watch (tsx) |
| `pnpm test` | roda os testes (vitest) |
| `pnpm test:watch` | testes em watch |
| `pnpm typecheck` | checagem de tipos (tsc) |
| `pnpm lint` | ESLint |
| `pnpm format` | Prettier --write |
| `pnpm build` | compila para `dist/` |
| `docker compose up --build` | sobe app + Postgres |

A API expõe `GET /health` → `{ "status": "ok" }`.

## Frontend (`web/`)

Projeto Vite + React separado, com o próprio `pnpm install`. Rode de dentro de `web/`:

| Comando | Faz |
|---|---|
| `pnpm dev` | sobe o painel em `http://localhost:5173` (proxy de `/api` para a API em `:3000`) |
| `pnpm test` | testes (vitest + Testing Library) |
| `pnpm typecheck` · `pnpm lint` · `pnpm build` | checagens e build em `web/dist/` |

Com a API desligada, `VITE_MOCK_AUCTIONS=true pnpm dev` mostra a tela de leilões com dados fictícios.

Em produção a API serve o build: `docker compose up --build` sobe API + painel em `http://127.0.0.1:3000`. Fora do Docker, aponte `WEB_DIST=web/dist` no `.env` depois de `pnpm --dir web build`.
