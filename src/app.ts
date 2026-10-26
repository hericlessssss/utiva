import type { PrismaClient } from '@prisma/client';
import Fastify, { type FastifyInstance } from 'fastify';
import { filterRoutes } from './routes/filters.js';
import { healthRoutes } from './routes/health.js';

export interface AppDeps {
  prisma?: PrismaClient;
}

export function buildApp(deps: AppDeps = {}): FastifyInstance {
  // removeAdditional:false → props desconhecidas no body viram 400 (pega typos do cliente)
  // em vez de serem silenciosamente removidas (default do Fastify).
  const app = Fastify({ logger: true, ajv: { customOptions: { removeAdditional: false } } });

  app.register(healthRoutes);
  if (deps.prisma) {
    app.register(filterRoutes, { prisma: deps.prisma });
  }

  return app;
}
