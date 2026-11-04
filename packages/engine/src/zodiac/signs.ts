/**
 * Zodiac signs and their groupings.
 *
 * Sign identity is derived arithmetically from longitude, never from a lookup
 * of pre-formatted strings, so it cannot drift out of step with the maths.
 */
import { splitSign, type Degrees } from '../math/angles.js';

export type SignName =
  | 'aries' | 'taurus' | 'gemini' | 'cancer' | 'leo' | 'virgo'
  | 'libra' | 'scorpio' | 'sagittarius' | 'capricorn' | 'aquarius' | 'pisces';

export type Element = 'fire' | 'earth' | 'air' | 'water';
export type Modality = 'cardinal' | 'fixed' | 'mutable';
export type Polarity = 'positive' | 'negative';

/** Signs in zodiacal order; index is the sign number, 0 = Aries. */
export const SIGNS: readonly SignName[] = [
  'aries', 'taurus', 'gemini', 'cancer', 'leo', 'virgo',
  'libra', 'scorpio', 'sagittarius', 'capricorn', 'aquarius', 'pisces',
];

const ELEMENT_CYCLE: readonly Element[] = ['fire', 'earth', 'air', 'water'];
const MODALITY_CYCLE: readonly Modality[] = ['cardinal', 'fixed', 'mutable'];

export interface SignPosition {
  readonly sign: SignName;
  /** 0-11, Aries = 0. */
  readonly signIndex: number;
  /** Degrees within the sign, [0, 30). */
  readonly degreesInSign: Degrees;
  readonly element: Element;
  readonly modality: Modality;
  readonly polarity: Polarity;
}

/** Element of a sign. The sequence fire-earth-air-water repeats every four signs. */
export function elementOf(signIndex: number): Element {
  return ELEMENT_CYCLE[((signIndex % 4) + 4) % 4]!;
}

/** Modality of a sign. The sequence cardinal-fixed-mutable repeats every three. */
export function modalityOf(signIndex: number): Modality {
  return MODALITY_CYCLE[((signIndex % 3) + 3) % 3]!;
}

/** Alternating polarity, starting positive at Aries. */
export function polarityOf(signIndex: number): Polarity {
  return ((signIndex % 2) + 2) % 2 === 0 ? 'positive' : 'negative';
}

/** Full sign placement for an ecliptic longitude. */
export function signPosition(longitude: Degrees): SignPosition {
  const { sign: signIndex, degreesInSign } = splitSign(longitude);
  return {
    sign: SIGNS[signIndex]!,
    signIndex,
    degreesInSign,
    element: elementOf(signIndex),
    modality: modalityOf(signIndex),
    polarity: polarityOf(signIndex),
  };
}
