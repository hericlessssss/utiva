import type { EmailContent } from './new-auction-email.js';

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

/**
 * Envia um conteúdo já montado. `to` opcional sobrepõe o destinatário global (cfg.to):
 * multiusuário envia pro e-mail do dono; o cfg.to fica como fallback (dev/single-user).
 */
export async function sendEmail(cfg: MailerConfig, content: EmailContent, to?: string): Promise<void> {
  await cfg.transport({ from: cfg.from, to: to ?? cfg.to, subject: content.subject, text: content.text });
}
