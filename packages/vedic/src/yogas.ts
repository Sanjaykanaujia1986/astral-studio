/**
 * Yogas — each tested against the condition as the reference horoscope
 * software states it in its own text, so a listed yoga can be checked rather
 * than taken on trust. Every result carries the reason it holds or fails.
 *
 * Classical counting: the lunar and solar yogas (Sunaphā, Anaphā, Durudharā,
 * Veśi, Vāsi, Ubhayacarī) count the five tārāgrahas only — never Rāhu/Ketu,
 * and the Sun is excluded from the Moon's yogas. A result notes when a yoga
 * would hold only by counting the nodes, because some software does.
 */
import { norm360 } from '@astro/engine';
import { EXALTATION, OWN_SIGNS, SEVEN, SIGN_LORDS, type GrahaLongitudes, type Planet } from './grahas.js';

export interface YogaResult {
  readonly id: string;
  readonly name: string;
  readonly holds: boolean;
  /** Why, in terms of placements. */
  readonly reason: string;
  /** Present only when counting Rāhu/Ketu as planets would change the answer. */
  readonly holdsWithNodes?: boolean;
  readonly group: 'lunar' | 'solar' | 'mahapurusha' | 'other';
  /**
   * The reason as data, for interfaces that print it in another language:
   * `key` names the sentence; `n` holds numbers (or a list of house numbers),
   * `p` single graha ids and `g` lists of graha ids (empty means none).
   */
  readonly detail: YogaDetail;
}

export interface YogaDetail {
  readonly key: string;
  readonly n?: Readonly<Record<string, number | string>>;
  readonly p?: Readonly<Record<string, string>>;
  readonly g?: Readonly<Record<string, readonly string[]>>;
}

const NM: Readonly<Record<string, string>> = {
  sun: 'Sūrya', moon: 'Candra', mars: 'Maṅgala', mercury: 'Budha', jupiter: 'Guru', venus: 'Śukra', saturn: 'Śani', rahu: 'Rāhu', ketu: 'Ketu',
};
const nm = (b: string): string => NM[b] ?? b;

const ASPECTS: Partial<Record<Planet, readonly number[]>> = { mars: [4, 7, 8], jupiter: [5, 7, 9], saturn: [3, 7, 10] };

export function yogas(g: GrahaLongitudes): YogaResult[] {
  const sg = (b: Planet | 'rahu' | 'ketu'): number => Math.floor(norm360(g.lon[b]) / 30);
  const asc = g.lagna === undefined ? undefined : Math.floor(norm360(g.lagna) / 30);
  const houseFrom = (b: Planet, from: number): number => ((sg(b) - from + 12) % 12) + 1;
  const m = sg('moon'); const s = sg('sun');
  const inSign = (x: number, exclude: readonly string[], withNodes = false): string[] =>
    [...SEVEN, ...(withNodes ? ['rahu', 'ketu'] as const : [])]
      .filter((b) => !exclude.includes(b) && sg(b) === ((x % 12) + 12) % 12);
  const elong = norm360(g.lon.moon - g.lon.sun);
  const moonWeak = elong < 72 || elong > 288;
  const benefic = (b: Planet): boolean => b === 'jupiter' || b === 'venus'
    || (b === 'mercury' && !inSign(sg('mercury'), ['mercury']).some((x) => ['sun', 'mars', 'saturn'].includes(x)))
    || (b === 'moon' && !moonWeak);
  const malefic = (b: string): boolean => ['sun', 'mars', 'saturn', 'rahu', 'ketu'].includes(b) || (b === 'moon' && moonWeak);
  const list = (xs: string[]) => (xs.length ? xs.map(nm).join(', ') : 'empty');
  const out: YogaResult[] = [];
  const add = (id: string, name: string, group: YogaResult['group'], holds: boolean, reason: string, detail: YogaDetail, withNodes?: boolean) => {
    out.push({ id, name, group, holds, reason, detail, ...(withNodes !== undefined && withNodes !== holds ? { holdsWithNodes: withNodes } : {}) });
  };

  // ------------------------------------------------------------ lunar
  const gk = houseFrom('jupiter', m);
  add('gajakesari', 'Gajakesarī', 'lunar', [1, 4, 7, 10].includes(gk), `Jupiter is ${gk} from the Moon (needs a kendra: 1, 4, 7, 10)`, { key: 'gk', n: { n: gk } });
  const second = inSign(m + 1, ['sun', 'moon']); const twelfth = inSign(m - 1, ['sun', 'moon']);
  const secondN = inSign(m + 1, ['sun', 'moon'], true); const twelfthN = inSign(m - 1, ['sun', 'moon'], true);
  add('sunapha', 'Sunaphā', 'lunar', second.length > 0, `2nd from the Moon: ${list(second)}`, { key: 'second', g: { list: second } }, secondN.length > 0);
  add('anapha', 'Anaphā', 'lunar', twelfth.length > 0, `12th from the Moon: ${list(twelfth)}`, { key: 'twelfth', g: { list: twelfth } }, twelfthN.length > 0);
  add('durudhura', 'Durudharā', 'lunar', second.length > 0 && twelfth.length > 0, `2nd from the Moon: ${list(second)}; 12th: ${list(twelfth)}`, { key: 'both', g: { second, twelfth } }, secondN.length > 0 && twelfthN.length > 0);
  const kendraFromMoon = SEVEN.filter((b) => b !== 'moon' && b !== 'sun' && [1, 4, 7, 10].includes(houseFrom(b, m)));
  add('kemadruma', 'Kemadruma', 'lunar', second.length === 0 && twelfth.length === 0 && kendraFromMoon.length === 0,
    `2nd and 12th from the Moon: ${list([...second, ...twelfth])}; kendras from the Moon: ${list(kendraFromMoon)}`,
    { key: 'kema', g: { sides: [...second, ...twelfth], kendras: kendraFromMoon } });
  add('chandra-mangala', 'Candra-Maṅgala', 'lunar', sg('mars') === m, `Mars and the Moon ${sg('mars') === m ? 'share a sign' : 'are in different signs'}`, { key: sg('mars') === m ? 'cmShare' : 'cmApart' });
  const vasu = (['jupiter', 'venus', 'mercury', 'moon'] as const).filter(benefic)
    .filter((b) => (asc !== undefined && [3, 6, 10, 11].includes(houseFrom(b, asc))) || (b !== 'moon' && [3, 6, 10, 11].includes(houseFrom(b, m))));
  add('vasumati', 'Vasumatī', 'lunar', vasu.length > 0, `benefics in upacaya (3, 6, 10, 11) from the lagna or Moon: ${list(vasu)}`, { key: 'vasu', g: { list: vasu } });
  const tenthL = asc === undefined ? [] : SEVEN.filter((b) => houseFrom(b, asc) === 10);
  const tenthM = SEVEN.filter((b) => houseFrom(b, m) === 10);
  add('amala', 'Amala', 'lunar', [...tenthL, ...tenthM].some((b) => benefic(b)), `10th from the lagna: ${list(tenthL)}; from the Moon: ${list(tenthM)}`, { key: 'amala', g: { lagna: tenthL, moon: tenthM } });

  // ------------------------------------------------------------ solar
  const s2 = inSign(s + 1, ['sun', 'moon']); const s12 = inSign(s - 1, ['sun', 'moon']);
  const s2N = inSign(s + 1, ['sun', 'moon'], true); const s12N = inSign(s - 1, ['sun', 'moon'], true);
  add('vesi', 'Veśi', 'solar', s2.length > 0, `2nd from the Sun: ${list(s2)}`, { key: 'sun2', g: { list: s2 } }, s2N.length > 0);
  add('vasi', 'Vāsi', 'solar', s12.length > 0, `12th from the Sun: ${list(s12)}`, { key: 'sun12', g: { list: s12 } }, s12N.length > 0);
  add('ubhayachari', 'Ubhayacarī', 'solar', s2.length > 0 && s12.length > 0, 'planets on both sides of the Sun', { key: 'ubhaya' }, s2N.length > 0 && s12N.length > 0);
  add('budha-aditya', 'Budha-Āditya', 'solar', sg('mercury') === s, `Mercury and the Sun ${sg('mercury') === s ? 'share a sign' : 'are in different signs'}`, { key: sg('mercury') === s ? 'baShare' : 'baApart' });

  // ------------------------------------------------------------ pañca-mahāpuruṣa
  if (asc !== undefined) {
    for (const [b, id, name] of [['mars', 'ruchaka', 'Rucaka'], ['mercury', 'bhadra', 'Bhadra'], ['jupiter', 'hamsa', 'Haṁsa'], ['venus', 'malavya', 'Mālavya'], ['saturn', 'sasa', 'Śaśa']] as const) {
      const h = houseFrom(b, asc); const dignified = OWN_SIGNS[b].includes(sg(b)) || EXALTATION[b] === sg(b);
      add(id, name, 'mahapurusha', [1, 4, 7, 10].includes(h) && dignified, `${nm(b)} in house ${h}, ${dignified ? 'own or exaltation sign' : 'not in own or exaltation sign'}`,
        { key: dignified ? 'mpYes' : 'mpNo', n: { house: h }, p: { planet: b } });
    }

    // ---------------------------------------------------------- other
    const lordOf = (h: number): Planet => SIGN_LORDS[(asc + h - 1) % 12]!;
    const houses = SEVEN.map((b) => houseFrom(b, asc));
    const occ = (k: number) => houses.includes(k);
    const run = (start: number): boolean => houses.every((h) => ((h - start + 12) % 12) < 7)
      && [0, 1, 2, 3, 4, 5, 6].every((k) => occ(((start - 1 + k) % 12) + 1));
    add('chapa', 'Cāpa', 'other', run(10) || run(4), `houses of the seven planets: ${houses.join(', ')} (needs seven consecutive houses from the 10th or the 4th, each occupied)`,
      { key: 'chapa', n: { houses: houses.join(', ') } });
    const l10 = lordOf(10);
    add('duryoga', 'Duryoga', 'other', [6, 8, 12].includes(houseFrom(l10, asc)), `10th lord ${nm(l10)} in house ${houseFrom(l10, asc)}`,
      { key: 'duryoga', n: { house: houseFrom(l10, asc) }, p: { planet: l10 } });
    const l1 = lordOf(1);
    const withL1 = [...SEVEN, 'rahu', 'ketu'].filter((b) => b !== l1 && sg(b as Planet) === sg(l1));
    add('dehakashta', 'Dehakaṣṭa', 'other', houseFrom(l1, asc) === 8 || withL1.some(malefic),
      `lagna lord ${nm(l1)} in house ${houseFrom(l1, asc)} with ${list(withL1)}`,
      { key: 'deha', n: { house: houseFrom(l1, asc) }, p: { planet: l1 }, g: { list: withL1 } });
    const l2 = lordOf(2); const l4 = lordOf(4);
    const asp = (a: Planet, b: Planet) => (ASPECTS[a] ?? [7]).includes(houseFrom(b, sg(a)));
    add('matrumooladhana', 'Mātṛmūladhana', 'other', l2 === l4 || sg(l2) === sg(l4) || asp(l4, l2), `2nd lord ${nm(l2)}, 4th lord ${nm(l4)}`, { key: 'matru', p: { l2, l4 } });
    // Kāla-sarpa: every planet on one side of the Rāhu–Ketu axis.
    const side = SEVEN.map((b) => norm360(g.lon[b] - g.lon.rahu) < 180);
    const all = side.every(Boolean) || side.every((x) => !x);
    const outside = side.filter((x) => x !== side[0]).length;
    add('kalasarpa', 'Kāla-sarpa', 'other', all, all ? 'all seven planets lie between Rāhu and Ketu' : `${Math.min(outside, 7 - outside)} planet(s) outside the Rāhu–Ketu axis`,
      all ? { key: 'ksAll' } : { key: 'ksOut', n: { n: Math.min(outside, 7 - outside) } });
  }
  return out;
}
