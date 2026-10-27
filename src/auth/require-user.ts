import type { PrismaClient, User } from '@prisma/client';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { findUserBySession } from '../db/user-repo.js';
import { SESSION_COOKIE } from '../routes/auth.js';

declare module 'fastify' {
  interface FastifyRequest {
    /** Usuário da sessão, injetado por `requireUser`/`optionalUser`. */
    user?: User | null;
  }
}

type PreHandler = (req: FastifyRequest, reply: FastifyReply) => Promise<void>;

function resolveUser(prisma: PrismaClient, req: FastifyRequest): Promise<User | null> {
  const token = req.cookies?.[SESSION_COOKIE];
  return token ? findUserBySession(prisma, token) : Promise.resolve(null);
}

/** preHandler das rotas que exigem login: injeta `req.user` ou responde 401. */
export function requireUser(prisma: PrismaClient): PreHandler {
  return async (req, reply) => {
    const user = await resolveUser(prisma, req);
    if (!user) {
      await reply.code(401).send({ error: 'não autenticado' });
      return;
    }
    req.user = user;
  };
}

/** preHandler das rotas públicas: injeta `req.user` quando há sessão, senão `null`. Nunca nega. */
export function optionalUser(prisma: PrismaClient): PreHandler {
  return async (req) => {
    req.user = await resolveUser(prisma, req);
  };
}
