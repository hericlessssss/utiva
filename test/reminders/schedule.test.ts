import type PgBoss from 'pg-boss';
import { describe, expect, it } from 'vitest';
import { REMINDER_QUEUE, type ReminderJob, scheduleReminders } from '../../src/queue/reminder-queue.js';

interface SentCall {
  queue: string;
  data: ReminderJob;
  opts: { startAfter?: Date; singletonKey?: string };
}

function fakeBoss() {
  const calls: SentCall[] = [];
  const boss = {
    send: (queue: string, data: ReminderJob, opts: SentCall['opts']) => {
      calls.push({ queue, data, opts });
      return Promise.resolve('job-id');
    },
  } as unknown as PgBoss;
  return { boss, calls };
}

describe('scheduleReminders', () => {
  it('agenda um job por threshold futuro, com startAfter e singletonKey', async () => {
    const { boss, calls } = fakeBoss();
    const end = new Date('2026-11-01T18:00:00Z');
    const now = new Date('2026-10-30T18:00:00Z'); // 2 dias antes → 5 thresholds (3d já passou)

    const n = await scheduleReminders(boss, 'user-1', 2292063, end, now);

    expect(n).toBe(5);
    expect(calls).toHaveLength(5);
    expect(calls[0]!.queue).toBe(REMINDER_QUEUE);
    expect(calls[0]!.data).toMatchObject({ userId: 'user-1', auctionId: 2292063 });
    expect(calls[0]!.opts.startAfter).toBeInstanceOf(Date);
    expect(calls[0]!.opts.singletonKey).toContain('2292063');
    expect(calls[0]!.opts.singletonKey).toContain('user-1');
  });

  it('não agenda nada se o leilão já acabou', async () => {
    const { boss, calls } = fakeBoss();

    const n = await scheduleReminders(
      boss,
      'user-1',
      1,
      new Date('2026-11-01T18:00:00Z'),
      new Date('2026-11-02T00:00:00Z'),
    );

    expect(n).toBe(0);
    expect(calls).toHaveLength(0);
  });
});
