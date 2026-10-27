import type PgBoss from 'pg-boss';
import { sendNewAuctionAlert, type MailerConfig } from '../mailer/mailer.js';
import type { AuctionListEntry } from '../scraper/list-parser.js';

export const NEW_AUCTION_QUEUE = 'new-auction-email';

/** Forma serializável do leilão no job (Date vira ISO string no JSON do pg-boss). */
export interface NewAuctionJob {
  auctionId: number;
  characterName: string;
  level: number;
  vocation: string;
  sex: string;
  world: string;
  endsAt: string;
  bid: { amount: number; kind: 'current' | 'minimum' };
}

export function toJob(entry: AuctionListEntry): NewAuctionJob {
  // Só os campos que o e-mail usa: outfit/itens de exibição (ADR 10) ficam de fora do job.
  const { auctionId, characterName, level, vocation, sex, world, bid } = entry;
  return { auctionId, characterName, level, vocation, sex, world, bid, endsAt: entry.endsAt.toISOString() };
}

export function fromJob(job: NewAuctionJob): AuctionListEntry {
  // O job não carrega outfit/itens de exibição (toJob não os serializa); reconstituímos vazios
  // só pra satisfazer o tipo do entry consumido pelo mailer.
  return { ...job, endsAt: new Date(job.endsAt), outfit: null, displayItems: [] };
}

/** Cria as filas usadas pela app (pg-boss v10 exige a fila existir antes de send/work). */
export async function ensureQueues(boss: PgBoss): Promise<void> {
  await boss.createQueue(NEW_AUCTION_QUEUE);
}

/** Enfileira o alerta de um char novo (§7-A), com retries e backoff em falha transitória. */
export async function enqueueNewAuction(boss: PgBoss, entry: AuctionListEntry): Promise<void> {
  await boss.send(NEW_AUCTION_QUEUE, toJob(entry), {
    retryLimit: 5,
    retryDelay: 60,
    retryBackoff: true,
  });
}

/**
 * Registra o worker que consome os jobs e envia o e-mail via mailer.
 * Assume batchSize=1 (default): cada batch traz 1 job, então um erro re-tenta só esse job.
 * Se um dia batchSize for aumentado, isolar cada job (try/catch por item) pra não re-enviar
 * os já entregues no mesmo batch.
 */
export async function registerNewAuctionWorker(boss: PgBoss, mailer: MailerConfig): Promise<void> {
  await boss.work<NewAuctionJob>(NEW_AUCTION_QUEUE, async (jobs) => {
    for (const job of jobs) {
      await sendNewAuctionAlert(mailer, fromJob(job.data));
    }
  });
}
