const SECOND = 1_000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function remainingMs(endAt: string, now: number): number {
  return Date.parse(endAt) - now;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** "2d 03h" · "3h 07m" · "12m 05s" · "encerrado". */
export function formatRemaining(ms: number): string {
  if (Number.isNaN(ms)) return '—';
  if (ms <= 0) return 'encerrado';
  if (ms >= DAY) {
    const days = Math.floor(ms / DAY);
    return `${days}d ${pad(Math.floor((ms % DAY) / HOUR))}h`;
  }
  if (ms >= HOUR) {
    const hours = Math.floor(ms / HOUR);
    return `${hours}h ${pad(Math.floor((ms % HOUR) / MINUTE))}m`;
  }
  const minutes = Math.floor(ms / MINUTE);
  return `${minutes}m ${pad(Math.floor((ms % MINUTE) / SECOND))}s`;
}

/** Falta menos de 1h e ainda não acabou. */
export function isUrgent(ms: number): boolean {
  return ms > 0 && ms < HOUR;
}
