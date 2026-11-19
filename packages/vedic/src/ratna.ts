/**
 * Ratna: the gemstones tradition assigns the nine grahas, and which of them a
 * chart's own logic would point to or away from.
 *
 * The correspondences (stone, metal, finger, weekday) are the common printed
 * ones. The suggestions are not a table lookup but follow from the chart:
 *
 * - a stone strengthens its graha, so tradition suggests only the stones of
 *   grahas that are good for the lagna: the lagna lord, the 5th lord and the
 *   9th lord (Laghu Pārāśarī, §14);
 * - it advises against the stones of functional malefics (lords of the 3rd,
 *   6th, 8th or 11th that rule no trikoṇa), and of nodes whose dispositor is one;
 * - two stones "contradict" when their grahas are natural enemies in either
 *   direction (Parāśara's naisargika table); Rāhu and Ketu, the eclipsers,
 *   are counted enemies of the Sun and the Moon.
 *
 * Weights in ratti differ from book to book and rest on no rule; none are given.
 * See docs/VEDIC_CONVENTIONS.md §16.
 */
import { GRAHAS, NATURAL_RELATION, SIGN_LORDS, type Graha, type GrahaLongitudes, type Planet } from './grahas.js';
import { functionalNature } from './bhava.js';
import { VIMSHOTTARI_LORDS } from './nakshatra.js';
import { norm360 } from '@astro/engine';

export type Stone = 'ruby' | 'pearl' | 'coral' | 'emerald' | 'yellowSapphire' | 'diamond' | 'blueSapphire' | 'hessonite' | 'catsEye';
export type Metal = 'gold' | 'silver' | 'goldCopper' | 'silverPlatinum' | 'panchadhatu' | 'ashtadhatu';
export type Finger = 'ring' | 'little' | 'index' | 'middle';

export const RATNA: Readonly<Record<Graha, { readonly stone: Stone; readonly metal: Metal; readonly finger: Finger }>> = {
  sun: { stone: 'ruby', metal: 'gold', finger: 'ring' },
  moon: { stone: 'pearl', metal: 'silver', finger: 'little' },
  mars: { stone: 'coral', metal: 'goldCopper', finger: 'ring' },
  mercury: { stone: 'emerald', metal: 'gold', finger: 'little' },
  jupiter: { stone: 'yellowSapphire', metal: 'gold', finger: 'index' },
  venus: { stone: 'diamond', metal: 'silverPlatinum', finger: 'little' },
  saturn: { stone: 'blueSapphire', metal: 'panchadhatu', finger: 'middle' },
  rahu: { stone: 'hessonite', metal: 'ashtadhatu', finger: 'middle' },
  ketu: { stone: 'catsEye', metal: 'silver', finger: 'ring' },
};

/** The three nakṣatras (0-based) a graha rules in the Viṁśottarī order, the traditional days to wear its stone. */
export function ratnaNakshatras(b: Graha): number[] {
  return Array.from({ length: 27 }, (_, i) => i).filter((i) => VIMSHOTTARI_LORDS[i % 9] === b);
}

const NODE = (b: Graha): b is 'rahu' | 'ketu' => b === 'rahu' || b === 'ketu';
const E = -1;

/** Whether two grahas' stones are traditionally kept apart. */
export function stonesContradict(a: Graha, b: Graha): boolean {
  if (a === b) return false;
  if (NODE(a) || NODE(b)) {
    const other = NODE(a) ? b : a;
    return other === 'sun' || other === 'moon';
  }
  return NATURAL_RELATION[a as Planet][b as Planet] === E || NATURAL_RELATION[b as Planet][a as Planet] === E;
}

export type RatnaReason = 'lagnaLord' | 'fifthLord' | 'ninthLord';

export interface RatnaAdvice {
  readonly body: Graha;
  /** Why tradition would point to this stone for the chart; empty if it would not. */
  readonly reasons: readonly RatnaReason[];
  /** A functional malefic for the lagna: tradition advises against strengthening it. */
  readonly avoid: boolean;
  readonly contradicts: readonly Graha[];
}

export function ratnaAdvice(g: GrahaLongitudes): RatnaAdvice[] {
  if (g.lagna === undefined) return [];
  const asc = Math.floor(norm360(g.lagna) / 30);
  const fn = functionalNature(asc, g);
  const lordOf = (h: number): Graha => SIGN_LORDS[(asc + h - 1) % 12]!;
  return GRAHAS.map((b) => {
    const reasons: RatnaReason[] = [];
    if (lordOf(1) === b) reasons.push('lagnaLord');
    if (lordOf(5) === b) reasons.push('fifthLord');
    if (lordOf(9) === b) reasons.push('ninthLord');
    return {
      body: b, reasons, avoid: reasons.length === 0 && fn[b] === 'malefic',
      contradicts: GRAHAS.filter((o) => stonesContradict(b, o)),
    };
  });
}
