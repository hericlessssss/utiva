import { describe, expect, it } from 'vitest';
import { formatRemaining, isUrgent, remainingMs } from './time';

const H = 3_600_000;
const D = 24 * H;

describe('remainingMs', () => {
  it('é a diferença entre endAt e agora', () => {
    const now = Date.parse('2026-10-26T12:00:00Z');
    expect(remainingMs('2026-10-26T13:30:00Z', now)).toBe(1.5 * H);
  });

  it('fica negativo depois do fim', () => {
    const now = Date.parse('2026-10-26T12:00:00Z');
    expect(remainingMs('2026-10-26T11:00:00Z', now)).toBe(-H);
  });
});

describe('formatRemaining', () => {
  it('dias e horas acima de 1 dia', () => {
    expect(formatRemaining(2 * D + 3 * H + 5 * 60_000)).toBe('2d 03h');
  });

  it('horas e minutos acima de 1 hora', () => {
    expect(formatRemaining(3 * H + 7 * 60_000 + 59_000)).toBe('3h 07m');
  });

  it('minutos e segundos abaixo de 1 hora', () => {
    expect(formatRemaining(12 * 60_000 + 5_000)).toBe('12m 05s');
  });

  it('data inválida vira traço, nunca NaN', () => {
    expect(formatRemaining(Number.NaN)).toBe('—');
    expect(remainingMs('não é data', 0)).toBeNaN();
  });

  it('zero ou negativo vira encerrado', () => {
    expect(formatRemaining(0)).toBe('encerrado');
    expect(formatRemaining(-5)).toBe('encerrado');
  });
});

describe('isUrgent', () => {
  it('só quando falta menos de 1 hora e ainda não acabou', () => {
    expect(isUrgent(H - 1)).toBe(true);
    expect(isUrgent(H)).toBe(false);
    expect(isUrgent(0)).toBe(false);
  });
});
