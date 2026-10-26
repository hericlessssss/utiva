import { describe, expect, it, vi } from 'vitest';
import { startScraperCron, type Scheduler } from '../src/cron.js';

const noopHandle = { stop: () => {} };

describe('startScraperCron', () => {
  it('agenda a task na expressão dada e a executa quando o schedule dispara', async () => {
    let registered: (() => void) | undefined;
    let expr = '';
    const schedule: Scheduler = (e, task) => {
      expr = e;
      registered = task;
      return noopHandle;
    };
    const run = vi.fn(() => Promise.resolve());

    startScraperCron('*/5 * * * *', run, schedule);
    expect(expr).toBe('*/5 * * * *');

    registered!();
    await new Promise((r) => setTimeout(r, 0));

    expect(run).toHaveBeenCalledTimes(1);
  });

  it('não propaga erro da task (um tick que falha não derruba o cron)', async () => {
    let registered: (() => void) | undefined;
    const schedule: Scheduler = (_e, task) => {
      registered = task;
      return noopHandle;
    };

    startScraperCron('* * * * *', () => Promise.reject(new Error('boom')), schedule);

    expect(() => registered!()).not.toThrow();
    await new Promise((r) => setTimeout(r, 0));
  });

  it('pula o tick se o anterior ainda está rodando (sem concorrência)', async () => {
    let registered: (() => void) | undefined;
    const schedule: Scheduler = (_e, task) => {
      registered = task;
      return noopHandle;
    };
    let resolveFirst!: () => void;
    const first = new Promise<void>((r) => {
      resolveFirst = r;
    });
    let runs = 0;
    const task = vi.fn(() => {
      runs += 1;
      return runs === 1 ? first : Promise.resolve();
    });

    startScraperCron('* * * * *', task, schedule);
    registered!();
    registered!();
    expect(task).toHaveBeenCalledTimes(1);

    resolveFirst();
    await new Promise((r) => setTimeout(r, 0));

    registered!();
    expect(task).toHaveBeenCalledTimes(2);
  });

  it('devolve um handle que repassa o stop para o schedule', () => {
    const stop = vi.fn();
    const schedule: Scheduler = () => ({ stop });

    startScraperCron('* * * * *', () => Promise.resolve(), schedule).stop();

    expect(stop).toHaveBeenCalledTimes(1);
  });
});
