import type { AuctionListEntry } from '../scraper/list-parser.js';
import { buildNewAuctionEmail } from './new-auction-email.js';

export interface EmailMessage {
  from: string;
  to: string;
  subject: string;
  text: string;
}

/** Transporte de e-mail injetável — produção usa Resend; testes usam um fake. */
export type EmailTransport = (msg: EmailMessage) => Promise<void>;

export interface MailerConfig {
  transport: EmailTransport;
  from: string;
  to: string;
}

/** Envia o alerta de "char novo" para o destinatário configurado. */
export async function sendNewAuctionAlert(
  cfg: MailerConfig,
  entry: AuctionListEntry,
): Promise<void> {
  const { subject, text } = buildNewAuctionEmail(entry);
  await cfg.transport({ from: cfg.from, to: cfg.to, subject, text });
}
