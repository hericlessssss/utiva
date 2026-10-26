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
