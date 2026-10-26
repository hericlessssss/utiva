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

FROM base AS runtime
ENV NODE_ENV=production
# node_modules do stage deps já traz o Prisma Client gerado (postinstall). Mantemos
# o node_modules completo no runtime por simplicidade (prisma generate exige o CLI, que
# é devDependency); dá pra enxugar depois quando valer a pena.
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
COPY prisma ./prisma
USER node
EXPOSE 3000
CMD ["node", "dist/server.js"]
