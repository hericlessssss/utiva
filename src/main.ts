import { PrismaClient } from '@prisma/client';
import PgBoss from 'pg-boss';
import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { startScraperCron } from './cron.js';
import { enqueueNewForActiveFilters } from './flow.js';
import { resendTransport } from './mailer/resend-transport.js';
import { finishEndedAuctions } from './db/auction-repo.js';
import { createCfSession, createFileCredsStore, playwrightRenewer } from './scraper/cf-clearance.js';
import { runDetailBackfill } from './scraper/tick.js';
import { tibiaImageFetcher } from './sprites/image-fetcher.js';
import { createSpriteStore } from './sprites/sprite-store.js';
import { buildListUrl } from './scraper/url.js';
import { ensureQueues, registerNewAuctionWorker } from './queue/new-auction-queue.js';
import { ensureReminderQueue, registerReminderWorker } from './queue/reminder-queue.js';

/**
 * Entrypoint do monólito (§3 ADR 8): sobe API (Fastify) + fila/worker (pg-boss) +
 * cron (node-cron) no mesmo processo. O cron roda os watch_filters ativos e enfileira
 * os alertas; o worker envia os e-mails via Resend.
 */
async function main(): Promise<void> {
  const cfg = loadConfig(process.env);
  const prisma = new PrismaClient();
  const boss = new PgBoss(cfg.databaseUrl);

  const mailer = {
    transport: resendTransport(cfg.resend.apiKey),
    from: cfg.resend.from,
    to: cfg.resend.to,
  };

  await boss.start();
  await ensureQueues(boss);
  await ensureReminderQueue(boss);
  await registerNewAuctionWorker(boss, mailer);
  await registerReminderWorker(boss, { prisma, mailer });

  // Sessão do cf_clearance: reusa o cookie (env ou arquivo) e, no bloqueio persistente do
  // Cloudflare, renova via Playwright e persiste o cookie novo (§3/§5). O `session.fetchPage`
  // é injetado no scraper; o `session.creds` alimenta o proxy de sprites (ADR 10).
  const credsStore = createFileCredsStore(cfg.cfClearanceFile);
  const stored = credsStore.load();
  // cf_clearance é amarrado ao UA que o obteve: nunca parear o cookie do env com o UA do
  // arquivo. Prefere o par coeso (cookie+UA) de uma renovação anterior; senão, o cookie do
  // env sozinho (sem UA → o fetchPage usa o DEFAULT_UA).
  const initial = stored.cfClearance ? stored : { cfClearance: cfg.cfClearance };
  const session = createCfSession({
    renewer: playwrightRenewer({ url: buildListUrl() }),
    initial,
    onRenew: (creds) => {
      credsStore.save(creds);
      app.log.info('cf_clearance renovado via Playwright');
    },
  });

  // Proxy com cache dos sprites do bazar (ADR 10): baixa do static.tibia.com com as creds da
  // sessão cf (hotlink direto do browser dá 403) e cacheia em disco.
  const spriteStore = createSpriteStore({
    dir: cfg.spriteCacheDir,
    fetchImage: tibiaImageFetcher(session.creds),
  });

  const app = buildApp({ prisma, boss, webDist: cfg.webDist, spriteStore, auth: cfg.auth });

  const cronHandle = startScraperCron(cfg.scrapeCron, async () => {
    const enqueued = await enqueueNewForActiveFilters(prisma, boss, {}, session.fetchPage);
    if (enqueued > 0) app.log.info(`enfileirados ${enqueued} alerta(s) de char novo`);

    // Varredura de fim (§13): marca `finished` quem já venceu (`end_at` no passado). Sem rede,
    // só DB. (O backfill já ignora leilão vencido por conta própria; a varredura é o registro
    // persistente do término, não uma otimização dele.)
    const finished = await finishEndedAuctions(prisma);
    if (finished > 0) app.log.info(`marcados ${finished} leilão(ões) como finished`);

    // Fase 2: enriquece com o detalhe (skills/itens/imbuements/…) os leilões sem attributes.
    const detailed = await runDetailBackfill(prisma, {}, 10, 1500, undefined, session.fetchPage);
    if (detailed > 0) app.log.info(`detalhados ${detailed} leilão(ões)`);
  });

  await app.listen({ port: cfg.port, host: cfg.host });
  app.log.info(`utiva no ar em :${cfg.port} — scraper cron "${cfg.scrapeCron}"`);

  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    app.log.info(`${signal} recebido — encerrando...`);
    cronHandle.stop(); // para de agendar novos ticks antes de drenar
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
