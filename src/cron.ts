import cron from 'node-cron';

/** Agendador injetável (default = node-cron); facilita testar sem timers reais. */
export type Scheduler = (expression: string, task: () => void) => void;

const nodeCronScheduler: Scheduler = (expression, task) => {
  cron.schedule(expression, task);
};

/**
 * Agenda a task do scraper na expressão cron dada. Erros de um tick são logados e
 * engolidos — um ciclo que falha não pode derrubar o agendador.
 */
export function startScraperCron(
  expression: string,
  task: () => Promise<void>,
  schedule: Scheduler = nodeCronScheduler,
): void {
  let running = false;

  schedule(expression, () => {
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
