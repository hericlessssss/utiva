import { load } from 'cheerio';

export type BidKind = 'current' | 'minimum';

export interface AuctionBid {
  amount: number;
  kind: BidKind;
}

export interface AuctionListEntry {
  auctionId: number;
  characterName: string;
  level: number;
  vocation: string;
  sex: string;
  world: string;
  endsAt: Date;
  bid: AuctionBid;
}

/**
 * Sinaliza que um card `.Auction` existe mas não casa com o layout esperado.
 * A fragilidade do parser é por design (CipSoft muda o HTML): preferimos falhar
 * alto para os contract tests pegarem a quebra cedo (§9 do planejamento), em vez
 * de descartar o card em silêncio.
 */
export class AuctionListParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuctionListParseError';
  }
}

const META_RE = /Level:\s*(\d+)\s*\|\s*Vocation:\s*(.+?)\s*\|\s*(Male|Female)\s*\|\s*World:/;

/**
 * Parseia a página 1 da lista de leilões atuais (fase 1 do scraper, §5 do planejamento).
 * Recebe o HTML cru e devolve o resumo presente em cada card `.Auction` — sem tocar na rede.
 *
 * Zero cards devolve `[]` (lista vazia é legítima). Distinguir uma página de challenge
 * Cloudflare / 403 de uma lista vazia é responsabilidade da camada de fetch (status HTTP +
 * marcadores), não deste parser puro.
 */
export function parseAuctionList(html: string): AuctionListEntry[] {
  const $ = load(html);
  const cards = $('.Auction').toArray();
  const entries: AuctionListEntry[] = [];

  for (let i = 0; i < cards.length; i++) {
    const auction = $(cards[i]!);

    const header = auction.find('.AuctionHeader');
    const nameLink = header.find('.AuctionCharacterName a');
    const id = /auctionid=(\d+)/.exec(nameLink.attr('href') ?? '');
    const meta = META_RE.exec(header.text());
    // World sai do próprio link (não de regex gulosa no texto concatenado do header).
    const world = header.find('a[href*="subtopic=worlds"]').text().trim();
    const timestamp = auction.find('.AuctionTimer').attr('data-timestamp');

    if (!id) throw new AuctionListParseError(`card #${i}: auctionid ausente no link`);
    if (!meta) throw new AuctionListParseError(`card #${i}: linha de atributos fora do formato`);
    if (!world) throw new AuctionListParseError(`card #${i}: world ausente`);
    if (!timestamp) throw new AuctionListParseError(`card #${i}: data-timestamp ausente`);

    const bidRow = auction.find('.ShortAuctionDataBidRow');
    const bidLabel = bidRow.find('.ShortAuctionDataLabel').text();
    const bidDigits = bidRow.find('.ShortAuctionDataValue').text().replace(/\D/g, '');
    const isCurrent = /current/i.test(bidLabel);
    const isMinimum = /minimum/i.test(bidLabel);

    if (!bidDigits) throw new AuctionListParseError(`card #${i}: valor de lance ausente`);
    if (!isCurrent && !isMinimum) {
      throw new AuctionListParseError(`card #${i}: label de lance desconhecido "${bidLabel.trim()}"`);
    }

    entries.push({
      auctionId: Number(id[1]),
      characterName: nameLink.text().trim(),
      level: Number(meta[1]),
      vocation: meta[2]!.trim(),
      sex: meta[3]!,
      world,
      endsAt: new Date(Number(timestamp) * 1000),
      bid: { amount: Number(bidDigits), kind: isCurrent ? 'current' : 'minimum' },
    });
  }

  return entries;
}
