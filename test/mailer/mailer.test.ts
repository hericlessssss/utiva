import { describe, expect, it, vi } from 'vitest';
import { sendNewAuctionAlert, type EmailMessage } from '../../src/mailer/mailer.js';
import { buildNewAuctionEmail } from '../../src/mailer/new-auction-email.js';
import type { AuctionListEntry } from '../../src/scraper/list-parser.js';

const entry: AuctionListEntry = {
  auctionId: 2292063,
  characterName: 'Kord Di',
  level: 562,
  vocation: 'Elite Knight',
  sex: 'Female',
  world: 'Secura',
  endsAt: new Date('2026-10-26T18:00:00Z'),
  bid: { amount: 3000, kind: 'current' },
  outfit: null,
  displayItems: [],
};

describe('buildNewAuctionEmail', () => {
  it('assunto tem nome, level e mundo', () => {
    const { subject } = buildNewAuctionEmail(entry);

    expect(subject).toContain('Kord Di');
    expect(subject).toContain('562');
    expect(subject).toContain('Secura');
  });

  it('corpo tem o link do leilão e o lance', () => {
    const { text } = buildNewAuctionEmail(entry);

    expect(text).toContain('auctionid=2292063');
    expect(text).toContain('3000');
  });
});

describe('sendNewAuctionAlert', () => {
  it('envia pelo transport com from/to configurados', async () => {
    const sent: EmailMessage[] = [];
    const transport = vi.fn((msg: EmailMessage) => {
      sent.push(msg);
      return Promise.resolve();
    });

    await sendNewAuctionAlert({ transport, from: 'a@x', to: 'b@y' }, entry);

    expect(sent).toHaveLength(1);
    expect(sent[0]!.from).toBe('a@x');
    expect(sent[0]!.to).toBe('b@y');
    expect(sent[0]!.subject).toContain('Kord Di');
  });
});
