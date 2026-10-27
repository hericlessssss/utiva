import type { PrismaClient } from '@prisma/client';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance } from 'fastify';
import { resolve } from 'node:path';
import type PgBoss from 'pg-boss';
import { auctionRoutes } from './routes/auctions.js';
import { filterRoutes } from './routes/filters.js';
import { healthRoutes } from './routes/health.js';
import { spriteRoutes } from './routes/sprites.js';
import { watchRoutes } from './routes/watch.js';
import type { SpriteStore } from './sprites/sprite-store.js';

export interface AppDeps {
  prisma?: PrismaClient;
  boss?: PgBoss;
  /** Pasta do build do frontend. Quando presente, a API serve o painel na mesma origem (ADR 9). */
  webDist?: string;
  /** Proxy com cache dos sprites do bazar (ADR 10). Ausente = rota de sprites não registrada. */
  spriteStore?: SpriteStore;
}

export function buildApp(deps: AppDeps = {}): FastifyInstance {
  // removeAdditional:false → props desconhecidas no body viram 400 (pega typos do cliente)
  // em vez de serem silenciosamente removidas (default do Fastify).
  const app = Fastify({ logger: true, ajv: { customOptions: { removeAdditional: false } } });

  app.register(healthRoutes);
  if (deps.prisma) {
    app.register(filterRoutes, { prisma: deps.prisma });
    app.register(auctionRoutes, { prisma: deps.prisma });
  }
  if (deps.prisma && deps.boss) {
    app.register(watchRoutes, { prisma: deps.prisma, boss: deps.boss });
  }
  if (deps.spriteStore) {
    app.register(spriteRoutes, { store: deps.spriteStore });
  }
  if (deps.webDist) {
    // @fastify/static exige root absoluto; WEB_DIST costuma vir relativo ao cwd (web/dist).
    app.register(fastifyStatic, { root: resolve(deps.webDist) });
    // SPA: rota desconhecida que o browser pede como página cai no index.html
    // (react-router resolve do lado do cliente). O resto segue 404 JSON do Fastify.
    app.setNotFoundHandler((req, reply) => {
      const wantsHtml = req.method === 'GET' && (req.headers.accept ?? '').includes('text/html');
      if (wantsHtml) return reply.sendFile('index.html');
      return reply.code(404).send({ error: 'rota não encontrada' });
    });
  }

  return app;
}
