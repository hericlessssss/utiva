import { AUCTION_DETAIL_URL } from '../scraper/url.js';
import type { EmailContent } from './new-auction-email.js';

/** Dados mínimos do leilão para o e-mail de lembrete. */
export interface ReminderTarget {
  auctionId: number;
  charName: string;
  endAt: Date;
}

/** Monta o e-mail de lembrete de fim de leilão (§7-B). `label` é a antecedência (ex.: '1h'). */
export function buildReminderEmail(target: ReminderTarget, label: string): EmailContent {
  return {
    subject: `Leilão acabando em ${label}: ${target.charName}`,
    text: [
      `O leilão de ${target.charName} termina em ~${label} (${target.endAt.toISOString()}).`,
      `Leilão: ${AUCTION_DETAIL_URL}${target.auctionId}`,
    ].join('\n'),
  };
}
