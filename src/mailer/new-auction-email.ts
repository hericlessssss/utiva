import type { AuctionListEntry } from '../scraper/list-parser.js';
import { AUCTION_DETAIL_URL } from '../scraper/url.js';

export interface EmailContent {
  subject: string;
  text: string;
}

/** Monta o e-mail de alerta "char novo" a partir do resumo da lista (§7-A). */
export function buildNewAuctionEmail(entry: AuctionListEntry): EmailContent {
  const lance = `${entry.bid.amount} TC (${entry.bid.kind === 'current' ? 'lance atual' : 'lance mínimo'})`;

  return {
    subject: `Novo char no bazar: ${entry.characterName} — lvl ${entry.level} ${entry.vocation} (${entry.world})`,
    text: [
      `${entry.characterName} — level ${entry.level} ${entry.vocation} (${entry.sex}), mundo ${entry.world}.`,
      `Lance: ${lance}.`,
      `Fim: ${entry.endsAt.toISOString()}.`,
      `Leilão: ${AUCTION_DETAIL_URL}${entry.auctionId}`,
    ].join('\n'),
  };
}
