import { PrismaClient } from '@prisma/client';

/** Instância única do Prisma Client usada pela aplicação. */
export const prisma = new PrismaClient();
