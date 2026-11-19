/**
 * Bhāva by bhāva, and the Sarvatobhadra cakra.
 *
 * The bhāva readings are not prose about the native: they are the facts a
 * reader weighs for each house (its lord's house and dignity, the grahas in it
 * and aspecting it, its sarvāṣṭakavarga) sorted by the classical rules into
 * what tradition reads as supporting the house's matters and what it reads as
 * asking for care. The words are the app's; the rules are documented in
 * docs/VEDIC_CONVENTIONS.md §14.
 */
import { norm360, type Degrees } from '@astro/engine';
import { GRAHAS, SIGN_LORDS, type Graha, type GrahaLongitudes } from './grahas.js';
import { ashtakavarga } from './ashtakavarga.js';
import { dignities, type Dignity } from './tables.js';

const sgn = (lon: Degrees): number => Math.floor(norm360(lon) / 30);

/** Bhāva kārakas (Parāśara), house 1 first. */
export const BHAVA_KARAKAS: readonly (readonly Graha[])[] = [
  ['sun'], ['jupiter'], ['mars'], ['moon', 'mercury'], ['jupiter'], ['mars', 'saturn'],
  ['venus'], ['saturn'], ['jupiter', 'sun'], ['sun', 'mercury', 'jupiter', 'saturn'], ['jupiter'], ['saturn'],
];

/** Houses counted from a graha's own that it aspects (Parāśara): all the 7th; Mars, Jupiter and Saturn their specials. */
export const GRAHA_DRISHTI: Readonly<Record<Graha, readonly number[]>> = {
  sun: [7], moon: [7], mercury: [7], venus: [7], rahu: [7], ketu: [7],
  mars: [4, 7, 8], jupiter: [5, 7, 9], saturn: [3, 7, 10],
};

/** Signs a graha aspects. */
export function aspectedSigns(g: GrahaLongitudes, b: Graha): number[] {
  const s = sgn(g.lon[b]);
  return GRAHA_DRISHTI[b].map((h) => (s + h - 1) % 12);
}

export const BENEFICS: readonly Graha[] = ['jupiter', 'venus', 'mercury', 'moon'];
export const MALEFICS: readonly Graha[] = ['sun', 'mars', 'saturn', 'rahu', 'ketu'];
const KENDRA = [1, 4, 7, 10];
const TRIKONA = [1, 5, 9];
const DUSTHANA = [6, 8, 12];
const UPACAYA = [3, 6, 10, 11];

export type BhavaFactor =
  | { readonly kind: 'lordKendra' | 'lordTrikona' | 'lordDignified' | 'lordDusthana' | 'lordDebilitated' | 'lordCombust' | 'jupiter' }
  | { readonly kind: 'benefic' | 'malefic' | 'maleficUpacaya'; readonly bodies: readonly Graha[] }
  | { readonly kind: 'savHigh' | 'savLow'; readonly n: number };

export interface BhavaFacts {
  readonly house: number;
  readonly sign: number;
  readonly lord: Graha;
  readonly lordHouse: number;
  readonly lordSign: number;
  readonly lordDignity: Dignity;
  readonly occupants: readonly Graha[];
  readonly aspectedBy: readonly Graha[];
  readonly sav: number;
  readonly support: readonly BhavaFactor[];
  readonly care: readonly BhavaFactor[];
}

/**
 * The twelve houses (whole-sign, from the lagna) with the facts a reader
 * weighs and the classical sorting of them:
 *
 * - supporting: lord in a kendra or trikoṇa, lord in own, mūlatrikoṇa or
 *   exaltation sign, natural benefics in the house, Jupiter's aspect, more
 *   than 28 sarvāṣṭakavarga bindus, malefics in an upacaya house;
 * - asking for care: lord in a dusthāna (6, 8, 12), lord debilitated or
 *   combust, natural malefics in a house that is not an upacaya, fewer than 28
 *   bindus.
 *
 * The 1st house is both kendra and trikoṇa; it counts once, as a kendra. A
 * house's lord in its own house is a kendra or trikoṇa only when that house is.
 */
export function bhavaFacts(g: GrahaLongitudes): BhavaFacts[] {
  if (g.lagna === undefined) return [];
  const asc = sgn(g.lagna);
  const av = ashtakavarga(g);
  const dig = new Map(dignities(g).map((d) => [d.body, d]));
  const houseOf = (s: number): number => ((s - asc + 12) % 12) + 1;
  return Array.from({ length: 12 }, (_, k) => {
    const house = k + 1; const sign = (asc + k) % 12; const lord = SIGN_LORDS[sign]!;
    const lordSign = sgn(g.lon[lord]); const lordHouse = houseOf(lordSign); const d = dig.get(lord)!;
    const occupants = GRAHAS.filter((b) => sgn(g.lon[b]) === sign);
    const aspectedBy = GRAHAS.filter((b) => aspectedSigns(g, b).includes(sign));
    const sav = av.sarva[sign]!;
    const support: BhavaFactor[] = []; const care: BhavaFactor[] = [];
    if (KENDRA.includes(lordHouse)) support.push({ kind: 'lordKendra' });
    else if (TRIKONA.includes(lordHouse)) support.push({ kind: 'lordTrikona' });
    if (d.status === 'own' || d.status === 'moolatrikona' || d.status === 'exalted') support.push({ kind: 'lordDignified' });
    if (DUSTHANA.includes(lordHouse)) care.push({ kind: 'lordDusthana' });
    if (d.status === 'debilitated') care.push({ kind: 'lordDebilitated' });
    if (d.combust) care.push({ kind: 'lordCombust' });
    const ben = occupants.filter((b) => BENEFICS.includes(b));
    const mal = occupants.filter((b) => MALEFICS.includes(b));
    if (ben.length) support.push({ kind: 'benefic', bodies: ben });
    if (mal.length) (UPACAYA.includes(house) ? support : care).push({ kind: UPACAYA.includes(house) ? 'maleficUpacaya' : 'malefic', bodies: mal });
    if (aspectedBy.includes('jupiter')) support.push({ kind: 'jupiter' });
    if (sav > 28) support.push({ kind: 'savHigh', n: sav });
    else if (sav < 28) care.push({ kind: 'savLow', n: sav });
    return { house, sign, lord, lordHouse, lordSign, lordDignity: d, occupants, aspectedBy, sav, support, care };
  });
}

// ------------------------------------------------------------------ Sarvatobhadra

/** The 28 nakṣatras with Abhijit, which sits between Uttarāṣāḍhā (index 20) and Śravaṇa. */
export const ABHIJIT_INDEX = 21;
const ABHIJIT_START = 276 + 40 / 60;
const ABHIJIT_END = 280 + 53 / 60 + 20 / 3600;

/** Index among the 28 nakṣatras: 0-20 Aśvinī-Uttarāṣāḍhā, 21 Abhijit, 22-27 Śravaṇa-Revatī. */
export function nakshatra28(lon: Degrees): number {
  const l = norm360(lon);
  if (l >= ABHIJIT_START && l < ABHIJIT_END) return ABHIJIT_INDEX;
  const n = Math.floor(l / (40 / 3));
  return n <= 20 ? n : n + 1;
}

export type SbcCell =
  | { readonly kind: 'nakshatra'; readonly index: number }
  | { readonly kind: 'letter'; readonly text: string }
  | { readonly kind: 'sign'; readonly index: number }
  | { readonly kind: 'tithi'; readonly group: string; readonly days: readonly number[]; readonly tithis: string };

/**
 * The 9×9 Sarvatobhadra cakra, row by row from the top (east). Nakṣatras run
 * clockwise round the edge from Kṛttikā; the vowels sit at the corners of each
 * ring, the consonants along the second ring, the signs along the third, and
 * the five tithi groups (with the weekdays that rule them) at the centre.
 */
export const SARVATOBHADRA: readonly (readonly SbcCell[])[] = (() => {
  const grid: SbcCell[][] = Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => ({ kind: 'letter', text: '' }) as SbcCell));
  const L = (text: string): SbcCell => ({ kind: 'letter', text });
  // Edge: Kṛttikā (2) … Āśleṣā (8) along the top, Maghā (9) … Viśākhā (15) down the right,
  // Anurādhā (16) … Śravaṇa (22, after Abhijit) right to left along the bottom, Dhaniṣṭhā (23) … Bharaṇī (1) up the left.
  const n28 = (n27: number): number => (n27 <= 20 ? n27 : n27 + 1);
  for (let i = 0; i < 7; i += 1) grid[0]![1 + i] = { kind: 'nakshatra', index: n28(2 + i) };
  for (let i = 0; i < 7; i += 1) grid[1 + i]![8] = { kind: 'nakshatra', index: n28(9 + i) };
  const bottom = [16, 17, 18, 19, 20, -1, 21]; // -1 = Abhijit; 21 (27-index) = Śravaṇa
  for (let i = 0; i < 7; i += 1) grid[8]![7 - i] = { kind: 'nakshatra', index: bottom[i] === -1 ? ABHIJIT_INDEX : n28(bottom[i]!) };
  const left = [22, 23, 24, 25, 26, 0, 1]; // Dhaniṣṭhā … Revatī, Aśvinī, Bharaṇī, bottom to top
  for (let i = 0; i < 7; i += 1) grid[7 - i]![0] = { kind: 'nakshatra', index: n28(left[i]!) };
  // Vowels at the ring corners.
  grid[0]![0] = L('A'); grid[0]![8] = L('Ā'); grid[8]![8] = L('I'); grid[8]![0] = L('Ī');
  grid[1]![1] = L('U'); grid[1]![7] = L('Ū'); grid[7]![7] = L('Ṛ'); grid[7]![1] = L('Ṝ');
  grid[2]![2] = L('Ḷ'); grid[2]![6] = L('Ḹ'); grid[6]![6] = L('E'); grid[6]![2] = L('Ai');
  grid[3]![3] = L('O'); grid[3]![5] = L('Au'); grid[5]![5] = L('Aṁ'); grid[5]![3] = L('Aḥ');
  // Consonants along the second ring.
  ['A', 'Va', 'Ka', 'Ha', 'Ḍa'].forEach((x, i) => { grid[1]![2 + i] = L(x); });
  ['Ma', 'Ṭa', 'Pa', 'Ra', 'Ta'].forEach((x, i) => { grid[2 + i]![7] = L(x); });
  ['Na', 'Ya', 'Bha', 'Ja', 'Kha'].forEach((x, i) => { grid[7]![6 - i] = L(x); });
  ['Ga', 'Sa', 'Da', 'Ca', 'La'].forEach((x, i) => { grid[6 - i]![1] = L(x); });
  // Signs along the third ring: Vṛṣabha-Karka top, Siṁha-Tulā right, Vṛścika-Makara bottom (right to left), Kumbha-Meṣa left (upwards).
  [1, 2, 3].forEach((s, i) => { grid[2]![3 + i] = { kind: 'sign', index: s }; });
  [4, 5, 6].forEach((s, i) => { grid[3 + i]![6] = { kind: 'sign', index: s }; });
  [7, 8, 9].forEach((s, i) => { grid[6]![5 - i] = { kind: 'sign', index: s }; });
  [10, 11, 0].forEach((s, i) => { grid[5 - i]![2] = { kind: 'sign', index: s }; });
  // The tithi groups at the centre.
  grid[3]![4] = { kind: 'tithi', group: 'Nandā', days: [0, 2], tithis: '1 · 6 · 11' };
  grid[4]![5] = { kind: 'tithi', group: 'Bhadrā', days: [1, 3], tithis: '2 · 7 · 12' };
  grid[5]![4] = { kind: 'tithi', group: 'Jayā', days: [4], tithis: '3 · 8 · 13' };
  grid[4]![3] = { kind: 'tithi', group: 'Riktā', days: [5], tithis: '4 · 9 · 14' };
  grid[4]![4] = { kind: 'tithi', group: 'Pūrṇā', days: [6], tithis: '5 · 10 · 15' };
  return grid;
})();

/** Row and column of a nakṣatra (28-index) on the cakra's edge. */
export function sbcCellOf(index28: number): readonly [number, number] {
  for (let r = 0; r < 9; r += 1) {
    for (let c = 0; c < 9; c += 1) {
      const x = SARVATOBHADRA[r]![c]!;
      if (x.kind === 'nakshatra' && x.index === index28) return [r, c];
    }
  }
  throw new Error(`no cell for nakṣatra ${index28}`);
}
