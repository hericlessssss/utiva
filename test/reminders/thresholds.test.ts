import { describe, expect, it } from 'vitest';
import { reminderSchedule } from '../../src/reminders/thresholds.js';

const end = new Date('2026-11-01T18:00:00Z');

describe('reminderSchedule', () => {
  it('agenda só os thresholds cujo disparo ainda está no futuro', () => {
    const now = new Date('2026-10-30T18:00:00Z'); // 2 dias antes do fim: 3d já passou

    expect(reminderSchedule(end, now).map((r) => r.label)).toEqual(['1d', '3h', '1h', '15m', '5m']);
  });

  it('calcula o horário de disparo como fim - threshold', () => {
    const now = new Date('2026-10-29T00:00:00Z');

    const oneDay = reminderSchedule(end, now).find((r) => r.label === '1d');
    expect(oneDay?.at.toISOString()).toBe('2026-10-31T18:00:00.000Z');
  });

  it('devolve vazio se o fim já passou', () => {
    expect(reminderSchedule(end, new Date('2026-11-02T00:00:00Z'))).toEqual([]);
  });
});
