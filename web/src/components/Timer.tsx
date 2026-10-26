import { formatRemaining, isUrgent, remainingMs } from '../lib/time';

interface Props {
  endAt: string;
  now: number;
  size?: 'row' | 'big';
}

export function Timer({ endAt, now, size = 'row' }: Props) {
  const ms = remainingMs(endAt, now);
  const cls = ['timer', `timer-${size}`, isUrgent(ms) ? 'timer-urgent' : '', ms <= 0 ? 'timer-over' : '']
    .filter(Boolean)
    .join(' ');
  return (
    <time className={cls} dateTime={endAt}>
      {formatRemaining(ms)}
    </time>
  );
}
