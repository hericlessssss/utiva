/**
 * Resolve a porta HTTP a partir de uma variável de ambiente.
 * Vazio/ausente cai no fallback; valor inválido lança (falha rápido em vez de
 * deixar o Fastify bindar numa porta aleatória do SO).
 */
export function resolvePort(value: string | undefined, fallback = 3000): number {
  const raw = value?.trim();
  if (!raw) return fallback;

  const port = Number(raw);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`PORT inválido: "${value}" (esperado inteiro entre 1 e 65535)`);
  }

  return port;
}
