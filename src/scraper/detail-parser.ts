import { load, type CheerioAPI } from 'cheerio';

/** Uma seleção cheerio (`$(...)`) — derivada sem importar o domhandler. */
type Selection = ReturnType<CheerioAPI>;

export interface SkillEntry {
  name: string;
  level: number;
  percent: number;
}

export interface ItemEntry {
  name: string;
  count: number;
  /**
   * Stem do GIF em `static.tibia.com/images/charactertrade/{cat}/{sprite}.gif` (ex.: `768`,
   * `136_0` p/ outfit com addons); `null` quando o ícone não tem `<img>`. O front monta a URL
   * do proxy a partir disso (ADR 10). `count` é 1 p/ mounts/outfits (só itens empilham).
   */
  sprite: string | null;
}

export interface CharmEntry {
  name: string;
  type: string;
  grade: string;
}

/** Breakdown do detalhe de um leilão (fase 2, §5). Seções ausentes vêm vazias. */
export interface AuctionDetail {
  /** Stats gerais (Hit Points, Mana, Experience…), chave sem o dois-pontos. */
  general: Record<string, string>;
  skills: SkillEntry[];
  items: ItemEntry[];
  imbuements: string[];
  charms: CharmEntry[];
  mounts: ItemEntry[];
  outfits: ItemEntry[];
}

/**
 * A página não parece um detalhe de leilão (bloco `#General` ausente, ou presente mas
 * sem nenhuma skill). Mesma filosofia do list-parser (§9): falhar alto para os contract
 * tests pegarem a quebra de layout — ou uma página de challenge/lista — cedo, em vez de
 * persistir um detalhe vazio em silêncio. Seções opcionais ausentes NÃO são erro.
 */
export class AuctionDetailParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuctionDetailParseError';
  }
}

const COUNT_RE = /^(\d+)x\s+(.*)$/;
// Stem do sprite na URL do tibia.com: .../charactertrade/<cat>/<stem>.gif (charactertrade é gif-only).
const SPRITE_RE = /\/charactertrade\/\w+\/([\w-]+)\.gif/;

/**
 * Ícones de uma seção (itens/mounts/outfits): nome no `title` (com prefixo opcional "Nx") e o
 * stem do sprite extraído do `<img src>` interno (ADR 10). Sem `<img>` reconhecível → `sprite`
 * nulo (o front cai no texto).
 */
function parseIcons($: CheerioAPI, block: Selection): ItemEntry[] {
  return block
    .find('.CVIcon[title]')
    .toArray()
    .map((el) => {
      const title = ($(el).attr('title') ?? '').trim();
      const sprite = SPRITE_RE.exec($(el).find('img').attr('src') ?? '')?.[1] ?? null;
      const m = COUNT_RE.exec(title);
      return m
        ? { name: m[2]!.trim(), count: Number(m[1]), sprite }
        : { name: title, count: 1, sprite };
    });
}

/**
 * Linhas de dados de uma `table.TableContent`: pula o cabeçalho `.LabelH` e o marcador
 * `.IndicateMoreEntries` ("(N more entries)") — a página de detalhe trunca listas longas
 * (mesmo motivo de os ícones de item mostrarem só parte do "Results: N"). O truncamento é
 * do próprio site; capturamos o que é exibido (§13).
 */
function contentRows(block: Selection): Selection {
  return block.find('table.TableContent tr').not('.LabelH').not('.IndicateMoreEntries');
}

function parseGeneral($: CheerioAPI, block: Selection): Record<string, string> {
  const general: Record<string, string> = {};
  block.find('span.LabelV').each((_, el) => {
    const key = $(el).text().replace(/:\s*$/, '').trim();
    if (key) general[key] = $(el).next('div').text().trim();
  });
  return general;
}

function parseSkills($: CheerioAPI, block: Selection): SkillEntry[] {
  return block
    .find('td.LabelColumn')
    .toArray()
    .map((el) => {
      const row = $(el).closest('tr');
      const percent = row.find('.PercentageString').text().replace('%', '').trim();
      // `|| 0`: um LevelColumn/PercentageString vazio (layout quebrado) vira 0, não NaN
      // (que apareceria como "NaN%" na tela).
      return {
        name: $(el).text().trim(),
        level: Number(row.find('td.LevelColumn').text().trim()) || 0,
        percent: Number(percent) || 0,
      };
    });
}

function parseCharms($: CheerioAPI, block: Selection): CharmEntry[] {
  return contentRows(block)
    .map((_, el) => {
      const td = $(el).find('td');
      return { name: td.eq(2).text().trim(), type: td.eq(1).text().trim(), grade: td.eq(3).text().trim() };
    })
    .get()
    .filter((c) => c.name);
}

/** Uma coluna por linha (ex.: Imbuements): o texto da primeira célula. */
function parseNameRows($: CheerioAPI, block: Selection): string[] {
  return contentRows(block)
    .map((_, el) => $(el).find('td').first().text().trim())
    .get()
    .filter(Boolean);
}

/**
 * Parseia a página de detalhe de um leilão (fase 2 do scraper, §5). Recebe o HTML cru e
 * devolve o breakdown — sem tocar na rede. Cada seção é ancorada pelo id estável do seu
 * `div.CharacterDetailsBlock` (#General, #ItemSummary, #Imbuements, #Charms, #Mounts,
 * #Outfits), não por texto de cabeçalho.
 */
export function parseAuctionDetail(html: string): AuctionDetail {
  const $ = load(html);
  const general = $('#General');
  if (general.length === 0) {
    throw new AuctionDetailParseError('bloco #General ausente — não parece página de detalhe');
  }

  const skills = parseSkills($, general);
  if (skills.length === 0) {
    throw new AuctionDetailParseError('#General sem nenhuma skill — layout quebrou');
  }

  return {
    general: parseGeneral($, general),
    skills,
    items: parseIcons($, $('#ItemSummary')),
    imbuements: parseNameRows($, $('#Imbuements')),
    charms: parseCharms($, $('#Charms')),
    mounts: parseIcons($, $('#Mounts')),
    outfits: parseIcons($, $('#Outfits')),
  };
}
