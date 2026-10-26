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

async function send(cfg: MailerConfig, content: EmailContent): Promise<void> {
  await cfg.transport({ from: cfg.from, to: cfg.to, subject: content.subject, text: content.text });
}

/** Envia o alerta de "char novo" para o destinatário configurado (§7-A). */
export async function sendNewAuctionAlert(
  cfg: MailerConfig,
  entry: AuctionListEntry,
): Promise<void> {
  await send(cfg, buildNewAuctionEmail(entry));
}

/** Envia o lembrete de fim de leilão (§7-B). */
export async function sendReminderAlert(
  cfg: MailerConfig,
  target: ReminderTarget,
  label: string,
): Promise<void> {
  await send(cfg, buildReminderEmail(target, label));
}
