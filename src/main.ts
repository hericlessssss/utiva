import { PrismaClient } from '@prisma/client';
import PgBoss from 'pg-boss';
import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { startScraperCron } from './cron.js';
import { enqueueNewForActiveFilters } from './flow.js';
import { resendTransport } from './mailer/resend-transport.js';
import { ensureQueues, registerNewAuctionWorker } from './queue/new-auction-queue.js';

/**
 * Entrypoint do monólito (§3 ADR 8): sobe API (Fastify) + fila/worker (pg-boss) +
 * cron (node-cron) no mesmo processo. O cron roda os watch_filters ativos e enfileira
 * os alertas; o worker envia os e-mails via Resend.
 */
async function main(): Promise<void> {
  const cfg = loadConfig(process.env);
  const app = buildApp();
  const prisma = new PrismaClient();
  const boss = new PgBoss(cfg.databaseUrl);

  await boss.start();
  await ensureQueues(boss);
  await registerNewAuctionWorker(boss, {
    transport: resendTransport(cfg.resend.apiKey),
    from: cfg.resend.from,
    to: cfg.resend.to,
  });

  startScraperCron(cfg.scrapeCron, async () => {
    const enqueued = await enqueueNewForActiveFilters(prisma, boss, { cfClearance: cfg.cfClearance });
    if (enqueued > 0) app.log.info(`enfileirados ${enqueued} alerta(s) de char novo`);
  });

  await app.listen({ port: cfg.port, host: cfg.host });
  app.log.info(`utiva no ar em :${cfg.port} — scraper cron "${cfg.scrapeCron}"`);

  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    app.log.info(`${signal} recebido — encerrando...`);
    await app.close();
    await boss.stop();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err: unknown) => {
  console.error('Falha ao subir a aplicação:', err);
  process.exit(1);
});
