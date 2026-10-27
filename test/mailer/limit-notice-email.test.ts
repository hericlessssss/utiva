import { describe, expect, it } from 'vitest';
import { buildLimitNoticeEmail } from '../../src/mailer/limit-notice-email.js';

describe('buildLimitNoticeEmail', () => {
  it('assunto fala em limite e o corpo traz o teto e a janela', () => {
    const { subject, text } = buildLimitNoticeEmail(50, 24);

    expect(subject.toLowerCase()).toContain('limite');
    expect(text).toContain('50');
    expect(text).toContain('24');
  });
});
