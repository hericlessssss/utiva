import type { EmailContent } from './new-auction-email.js';

/**
 * E-mail de confirmação (double opt-in, Fase 4). O usuário só passa a receber alertas depois
 * de abrir o `link`. Texto direto: sem o clique, nada é enviado.
 */
export function buildVerificationEmail(link: string): EmailContent {
  return {
    subject: 'Confirme seu e-mail na Utiva',
    text: [
      'Confirme este e-mail para começar a receber os alertas de leilão da Utiva.',
      '',
      `Confirmar: ${link}`,
      '',
      'O link vale por 24 horas. Se não foi você que entrou na Utiva, ignore este e-mail.',
    ].join('\n'),
  };
}
