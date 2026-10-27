import type { AuctionListEntry } from '../scraper/list-parser.js';
import { buildNewAuctionEmail, type EmailContent } from './new-auction-email.js';
import { buildReminderEmail, type ReminderTarget } from './reminder-email.js';

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

// `to` opcional sobrepõe o destinatário global (cfg.to): multiusuário envia pro e-mail do dono;
// o cfg.to fica como fallback (dev/single-user).
async function send(cfg: MailerConfig, content: EmailContent, to?: string): Promise<void> {
  await cfg.transport({ from: cfg.from, to: to ?? cfg.to, subject: content.subject, text: content.text });
}

/** Envia o alerta de "char novo" (§7-A); `to` = e-mail do dono do filtro. */
export async function sendNewAuctionAlert(
  cfg: MailerConfig,
  entry: AuctionListEntry,
  to?: string,
): Promise<void> {
  await send(cfg, buildNewAuctionEmail(entry), to);
}

/** Envia o lembrete de fim de leilão (§7-B); `to` = e-mail de quem acompanha. */
export async function sendReminderAlert(
  cfg: MailerConfig,
  target: ReminderTarget,
  label: string,
  to?: string,
): Promise<void> {
  await send(cfg, buildReminderEmail(target, label), to);
}
