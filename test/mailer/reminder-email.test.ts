import { describe, expect, it } from 'vitest';
import { buildReminderEmail } from '../../src/mailer/reminder-email.js';

const target = {
  auctionId: 2292063,
  charName: 'Kord Di',
  endAt: new Date('2026-11-01T18:00:00Z'),
};

describe('buildReminderEmail', () => {
  it('assunto indica o tempo restante e o char', () => {
    const { subject } = buildReminderEmail(target, '1h');

    expect(subject).toContain('1h');
    expect(subject).toContain('Kord Di');
  });

  it('corpo tem o link do leilão', () => {
    expect(buildReminderEmail(target, '5m').text).toContain('auctionid=2292063');
  });
});
