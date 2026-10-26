import type { PrismaClient } from '@prisma/client';
import Fastify, { type FastifyInstance } from 'fastify';
import type PgBoss from 'pg-boss';
import { auctionRoutes } from './routes/auctions.js';
import { filterRoutes } from './routes/filters.js';
import { healthRoutes } from './routes/health.js';
import { watchRoutes } from './routes/watch.js';

export interface AppDeps {
  prisma?: PrismaClient;
  boss?: PgBoss;
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

  return app;
}
