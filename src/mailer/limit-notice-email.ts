import type { EmailContent } from './new-auction-email.js';

/**
 * Aviso de teto atingido (rate-limit, Fase 4). Enviado uma vez por janela quando os alertas do
 * usuário passam do limite — os excedentes são dropados até a janela virar.
 */
export function buildLimitNoticeEmail(cap: number, windowHours: number): EmailContent {
  return {
    subject: 'Limite de e-mails da Utiva atingido',
    text: [
      `Você chegou ao limite de ${cap} e-mails de alerta nas últimas ${windowHours} horas.`,
      'Os próximos alertas não serão enviados até a janela liberar.',
      '',
      'Se isso acontece sempre, deixe seus filtros mais específicos para receber menos avisos.',
    ].join('\n'),
  };
}
