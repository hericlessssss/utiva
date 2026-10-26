import { Resend } from 'resend';
import type { EmailMessage, EmailTransport } from './mailer.js';

/** Subconjunto do cliente Resend que usamos — facilita injetar um fake nos testes. */
export interface ResendLike {
  emails: {
    send(args: {
      from: string;
      to: string;
      subject: string;
      text: string;
    }): Promise<{ error: { message: string } | null }>;
  };
}

/**
 * Adaptador EmailTransport sobre um cliente Resend. O Resend NÃO lança em erro de API
 * (chave inválida, domínio não verificado, rate limit): devolve `{ error }`. Convertemos
 * isso em exceção pra o job falhar e ser re-tentado, em vez de dropar o alerta em silêncio.
 */
export function createResendTransport(client: ResendLike): EmailTransport {
  return async (msg: EmailMessage) => {
    const { error } = await client.emails.send({
      from: msg.from,
      to: msg.to,
      subject: msg.subject,
      text: msg.text,
    });
    if (error) throw new Error(`Resend falhou ao enviar: ${error.message}`);
  };
}

/** Transport de produção a partir da API key do Resend. */
export function resendTransport(apiKey: string): EmailTransport {
  return createResendTransport(new Resend(apiKey) as unknown as ResendLike);
}
