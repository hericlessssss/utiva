import type PgBoss from 'pg-boss';
import { buildNewAuctionEmail } from '../mailer/new-auction-email.js';
import { deliverToUser, type DeliverDeps } from '../mailer/user-mailer.js';
import type { AuctionListEntry } from '../scraper/list-parser.js';

export const NEW_AUCTION_QUEUE = 'new-auction-email';

/** Destinatário do alerta: dono do filtro que capturou o leilão. O e-mail é resolvido do
 * banco no envio (pega mudança de e-mail), então aqui basta o id do dono. */
export interface AlertRecipient {
  userId: string;
}

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
  /** Dono do filtro (pra quem vai o e-mail), resolvido no enqueue. */
  userId: string;
}

export function toJob(entry: AuctionListEntry, recipient: AlertRecipient): NewAuctionJob {
  // Só os campos que o e-mail usa: outfit/itens de exibição (ADR 10) ficam de fora do job.
  const { auctionId, characterName, level, vocation, sex, world, bid } = entry;
  return {
    auctionId,
    characterName,
    level,
    vocation,
    sex,
    world,
    bid,
    endsAt: entry.endsAt.toISOString(),
    userId: recipient.userId,
  };
}

export function fromJob(job: NewAuctionJob): AuctionListEntry {
  // O job não carrega outfit/itens de exibição (toJob não os serializa); reconstituímos vazios
  // só pra satisfazer o tipo do entry consumido pelo mailer. userId não faz parte do entry.
  const { auctionId, characterName, level, vocation, sex, world, bid } = job;
  return {
    auctionId,
    characterName,
    level,
    vocation,
    sex,
    world,
    bid,
    endsAt: new Date(job.endsAt),
    outfit: null,
    displayItems: [],
  };
}

/** Cria as filas usadas pela app (pg-boss v10 exige a fila existir antes de send/work). */
export async function ensureQueues(boss: PgBoss): Promise<void> {
  await boss.createQueue(NEW_AUCTION_QUEUE);
}

/** Enfileira o alerta de um char novo (§7-A), com retries e backoff em falha transitória. */
export async function enqueueNewAuction(
  boss: PgBoss,
  entry: AuctionListEntry,
  recipient: AlertRecipient,
): Promise<void> {
  await boss.send(NEW_AUCTION_QUEUE, toJob(entry, recipient), {
    retryLimit: 5,
    retryDelay: 60,
    retryBackoff: true,
  });
}

/**
 * Registra o worker que consome os jobs e entrega o e-mail via `deliverToUser` (gate de
 * opt-in + rate-limit, Fase 4). Assume batchSize=1 (default): cada batch traz 1 job, então
 * um erro re-tenta só esse job. Se um dia batchSize for aumentado, isolar cada job (try/catch
 * por item) pra não re-enviar os já entregues no mesmo batch.
 */
export async function registerNewAuctionWorker(boss: PgBoss, deps: DeliverDeps): Promise<void> {
  await boss.work<NewAuctionJob>(NEW_AUCTION_QUEUE, async (jobs) => {
    for (const job of jobs) {
      const result = await deliverToUser(deps, job.data.userId, buildNewAuctionEmail(fromJob(job.data)));
      if (result === 'rate-limited') {
        console.warn(`[alert] usuário ${job.data.userId} no teto de e-mails — alerta dropado`);
      }
    }
  });
}
