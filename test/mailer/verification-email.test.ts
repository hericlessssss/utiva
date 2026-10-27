import { describe, expect, it } from 'vitest';
import { buildVerificationEmail } from '../../src/mailer/verification-email.js';

describe('buildVerificationEmail', () => {
  it('assunto fala em confirmar e o corpo traz o link', () => {
    const { subject, text } = buildVerificationEmail('http://localhost:3000/auth/verify-email?token=abc');

    expect(subject.toLowerCase()).toContain('confirme');
    expect(text).toContain('http://localhost:3000/auth/verify-email?token=abc');
    expect(text).toContain('24 horas');
  });
});
