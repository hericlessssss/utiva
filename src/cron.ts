import cron from 'node-cron';

export interface CronHandle {
  stop: () => void;
}

/** Agendador injetável (default = node-cron); facilita testar sem timers reais. */
export type Scheduler = (expression: string, task: () => void) => CronHandle;

const nodeCronScheduler: Scheduler = (expression, task) => {
  const scheduled = cron.schedule(expression, task);
  return { stop: () => scheduled.stop() };
};

/**
 * Agenda a task do scraper na expressão cron dada e devolve um handle pra parar (shutdown).
 * Um tick que falha é logado e engolido (não derruba o agendador); se o tick anterior
 * ainda roda, o próximo é pulado (baixa concorrência, §5).
 */
export function startScraperCron(
  expression: string,
  task: () => Promise<void>,
  schedule: Scheduler = nodeCronScheduler,
): CronHandle {
  let running = false;

  return schedule(expression, () => {
    if (running) {
      console.warn('[cron] tick anterior ainda rodando — pulando este (baixa concorrência, §5)');
      return;
    }
    running = true;
    void task()
      .catch((err: unknown) => {
        console.error('[cron] tick do scraper falhou:', err);
      })
      .finally(() => {
        running = false;
      });
  });
}
