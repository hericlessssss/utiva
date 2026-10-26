import { describe, expect, it } from 'vitest';
import { resolvePort } from '../src/env.js';

describe('resolvePort', () => {
  it('usa o fallback quando não está definido', () => {
    expect(resolvePort(undefined)).toBe(3000);
  });

  it('usa o fallback quando está vazio ou só espaços', () => {
    expect(resolvePort('')).toBe(3000);
    expect(resolvePort('   ')).toBe(3000);
  });

  it('parseia uma porta válida', () => {
    expect(resolvePort('8080')).toBe(8080);
  });

  it('lança para valor não-numérico (falha rápido, não bind aleatório)', () => {
    expect(() => resolvePort('abc')).toThrow();
  });

  it('lança para porta fora da faixa ou não-inteira', () => {
    expect(() => resolvePort('0')).toThrow();
    expect(() => resolvePort('-5')).toThrow();
    expect(() => resolvePort('80.5')).toThrow();
    expect(() => resolvePort('70000')).toThrow();
  });
});
