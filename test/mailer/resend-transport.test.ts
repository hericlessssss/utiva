import { describe, expect, it } from 'vitest';
import { createResendTransport, type ResendLike } from '../../src/mailer/resend-transport.js';

function fakeClient(result: { error: { message: string } | null }, calls: unknown[] = []): ResendLike {
  return {
    emails: {
      send: (args) => {
        calls.push(args);
        return Promise.resolve(result);
      },
    },
  };
}

describe('createResendTransport', () => {
  it('encaminha a mensagem para client.emails.send', async () => {
    const calls: unknown[] = [];

    await createResendTransport(fakeClient({ error: null }, calls))({
      from: 'a@x',
      to: 'b@y',
      subject: 'S',
      text: 'T',
    });

    expect(calls[0]).toEqual({ from: 'a@x', to: 'b@y', subject: 'S', text: 'T' });
  });

  it('lança quando o Resend devolve erro (não engole a falha)', async () => {
    const transport = createResendTransport(fakeClient({ error: { message: 'invalid api key' } }));

    await expect(
      transport({ from: 'a@x', to: 'b@y', subject: 'S', text: 'T' }),
    ).rejects.toThrow(/invalid api key/);
  });
});
