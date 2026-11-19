/**
 * Phala: the facts a reading of each graha is composed from.
 *
 * Nothing here is prose. For each graha it gives the house it stands in and
 * that house's class, the houses it rules, its dignity, combustion and
 * retrogression, its natural and functional nature, and for the nodes the
 * dispositor they act for. The app turns these into readings with the
 * classical associations, in its own words (docs/VEDIC_CONVENTIONS.md §15).
 */
import { norm360 } from '@astro/engine';
import { GRAHAS, SIGN_LORDS, type Graha, type GrahaLongitudes } from './grahas.js';
import { dignities, type Dignity } from './tables.js';
import { BENEFICS, functionalNature, type FunctionalNature } from './bhava.js';

const sgn = (lon: number): number => Math.floor(norm360(lon) / 30);

/** Kendra 1, 4, 7, 10; trikoṇa 5, 9; upacaya 3, 6, 11; dusthāna 8, 12; dhana 2. */
export type HouseClass = 'kendra' | 'trikona' | 'upacaya' | 'dusthana' | 'dhana';
export const HOUSE_CLASSES: readonly HouseClass[] = ['kendra', 'trikona', 'upacaya', 'dusthana', 'dhana'];

/** The class tradition reads a house by. The 1st counts as a kendra, the 10th as a kendra, the 6th as an upacaya. */
export function houseClass(house: number): HouseClass {
  if ([1, 4, 7, 10].includes(house)) return 'kendra';
  if (house === 5 || house === 9) return 'trikona';
  if ([3, 6, 11].includes(house)) return 'upacaya';
  if (house === 8 || house === 12) return 'dusthana';
  return 'dhana';
}

export type Element = 'fire' | 'earth' | 'air' | 'water';
export type Modality = 'movable' | 'fixed' | 'dual';
/** Meṣa fire, Vṛṣabha earth, Mithuna air, Karka water, and round again. */
export const signElement = (sign: number): Element => (['fire', 'earth', 'air', 'water'] as const)[((sign % 12) + 12) % 4]!;
/** Cara (movable), sthira (fixed), dvisvabhāva (dual), from Meṣa. */
export const signModality = (sign: number): Modality => (['movable', 'fixed', 'dual'] as const)[((sign % 12) + 12) % 3]!;

export interface GrahaPhala {
  readonly body: Graha;
  readonly house: number;
  readonly sign: number;
  readonly cls: HouseClass;
  /** Houses (from the lagna) whose sign it rules; empty for the nodes. */
  readonly owns: readonly number[];
  readonly dignity: Dignity['status'];
  readonly combust: boolean;
  readonly retrograde: boolean;
  readonly natural: 'benefic' | 'malefic';
  readonly functional: FunctionalNature;
  /** For Rāhu and Ketu: the lord of the sign they occupy, and its house. */
  readonly dispositor?: { readonly body: Graha; readonly house: number };
}

/** The reading facts of the nine grahas, from the natal lagna (whole-sign houses). */
export function grahaPhala(g: GrahaLongitudes): GrahaPhala[] {
  if (g.lagna === undefined) return [];
  const asc = sgn(g.lagna);
  const houseOf = (s: number): number => ((s - asc + 12) % 12) + 1;
  const dig = new Map(dignities(g).map((d) => [d.body, d]));
  const fn = functionalNature(asc, g);
  return GRAHAS.map((b) => {
    const sign = sgn(g.lon[b]); const house = houseOf(sign); const d = dig.get(b)!;
    const node = b === 'rahu' || b === 'ketu';
    const owns = node ? [] : SIGN_LORDS.flatMap((l, s) => (l === b ? [houseOf(s)] : [])).sort((x, y) => x - y);
    const disp = SIGN_LORDS[sign]!;
    return {
      body: b, house, sign, cls: houseClass(house), owns,
      dignity: d.status, combust: d.combust, retrograde: !node && g.retrograde[b],
      natural: BENEFICS.includes(b) ? 'benefic' as const : 'malefic' as const,
      functional: fn[b],
      ...(node ? { dispositor: { body: disp, house: houseOf(sgn(g.lon[disp])) } } : {}),
    };
  });
}

/**
 * How tradition reads an antardaśā lord's place counted from the mahādaśā
 * lord: in a kendra or trikoṇa from it, a supportive pairing; in the 6th,
 * 8th or 12th from it, one that asks for care; elsewhere, mixed.
 */
export function dashaPairing(g: GrahaLongitudes, md: Graha, ad: Graha): { readonly from: number; readonly kind: 'good' | 'hard' | 'mixed' } {
  const from = ((sgn(g.lon[ad]) - sgn(g.lon[md]) + 12) % 12) + 1;
  const kind = [6, 8, 12].includes(from) ? 'hard' : [1, 4, 5, 7, 9, 10].includes(from) ? 'good' : 'mixed';
  return { from, kind };
}
