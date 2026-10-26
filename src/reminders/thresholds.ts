const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** Antecedências dos lembretes de fim de leilão (§7-B). */
export const REMINDER_THRESHOLDS: { label: string; ms: number }[] = [
  { label: '3d', ms: 3 * DAY },
  { label: '1d', ms: 1 * DAY },
  { label: '3h', ms: 3 * HOUR },
  { label: '1h', ms: 1 * HOUR },
  { label: '15m', ms: 15 * MIN },
  { label: '5m', ms: 5 * MIN },
];

export interface ScheduledReminder {
  label: string;
  at: Date;
}

/**
 * Dado o fim do leilão, devolve os lembretes cujo horário de disparo (fim - antecedência)
 * ainda está no futuro em relação a `now`.
 */
export function reminderSchedule(endAt: Date, now: Date = new Date()): ScheduledReminder[] {
  return REMINDER_THRESHOLDS.map((t) => ({ label: t.label, at: new Date(endAt.getTime() - t.ms) })).filter(
    (r) => r.at.getTime() > now.getTime(),
  );
}
