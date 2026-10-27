FROM node:24-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /app

FROM base AS deps
# prisma/ precisa estar presente no install: o postinstall roda `prisma generate`.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY prisma ./prisma
RUN pnpm install --frozen-lockfile

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build

# Frontend (web/): projeto pnpm próprio, com lockfile separado (ADR 9).
FROM base AS web
WORKDIR /app/web
COPY web/package.json web/pnpm-lock.yaml web/pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY web ./
RUN pnpm build

FROM base AS runtime
ENV NODE_ENV=production
# node_modules do stage deps já traz o Prisma Client gerado (postinstall). Mantemos
# o node_modules completo no runtime por simplicidade (prisma generate exige o CLI, que
# é devDependency); dá pra enxugar depois quando valer a pena.
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=web /app/web/dist ./web/dist
COPY package.json ./
COPY prisma ./prisma
# Playwright grava os browsers neste caminho (em vez de ~/.cache), pra o processo `node` achá-los
# no runtime — o install roda como root e o cache fica legível pra todos.
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
# openssl: o Prisma precisa dele em runtime (sem, loga warning e pode errar o query engine).
# chromium: o renovador do cf_clearance (Playwright) só roda com o browser instalado; sem ele,
# todo tick morre com CfRenewalError e o bazar nunca popula. `--with-deps` traz as libs do SO.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && node_modules/.bin/playwright install --with-deps chromium \
  && chmod -R a+rx /ms-playwright \
  && rm -rf /var/lib/apt/lists/*
# Regera o Prisma Client AQUI, com o openssl 3.x ja instalado, pro query engine bater com o
# target do SO (debian-openssl-3.0.x). Gerado no stage `deps` (node:slim, sem openssl) saía só
# o engine 1.1.x; com openssl 3.x no runtime o client nao achava o engine e o app crashava.
RUN node_modules/.bin/prisma generate
# O prisma CLI roda no boot (`migrate deploy` no compose) e precisa escrever no dir de engines;
# como o app roda como `node` e o node_modules foi copiado como root, cai em "Can't write to
# @prisma/engines" e o container entra em crash loop. Damos a posse das pastas do Prisma ao node.
RUN chown -R node:node \
    node_modules/.pnpm/@prisma+* \
    node_modules/.pnpm/prisma@* \
    node_modules/@prisma \
    node_modules/.prisma \
  2>/dev/null || true
# /data guarda o estado de runtime (cookie cf_clearance + cache de sprites) num volume.
# Criado com dono `node` pra o volume nomeado herdar a permissão (o processo roda como node).
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 3000
CMD ["node", "dist/main.js"]
