/**
 * Vargas — divisional charts.
 *
 * **Each varga has its own mapping rule.** The tempting uniform formula
 * `floor(longitude / (30/n)) mod 12` is correct for navāṁśa and wrong for most
 * of the others; applying it everywhere produces plausible-looking charts that
 * are simply not the varga they claim to be, and nothing on screen would say
 * so. So every rule below is written out separately and tested separately.
 *
 * Conventions and the list of what is deliberately absent:
 * docs/VEDIC_CONVENTIONS.md §5.
 */
import { norm360, SIGNS, type Degrees, type SignName } from '@astro/engine';
import { absolutePada } from './nakshatra.js';

export const VARGAS = ['D1', 'D2', 'D3', 'D9', 'D10', 'D12'] as const;
export type Varga = (typeof VARGAS)[number];

export interface VargaDefinition {
  readonly id: Varga;
  /** Sanskrit name. */
  readonly name: string;
  /** Parts each sign is divided into. */
  readonly divisions: number;
  /** What the chart is traditionally read for — not an interpretation, a label. */
  readonly significationKey: string;
}

export const VARGA_DEFINITIONS: Readonly<Record<Varga, VargaDefinition>> = {
  D1: { id: 'D1', name: 'Rāśi', divisions: 1, significationKey: 'varga.sig.D1' },
  D2: { id: 'D2', name: 'Horā', divisions: 2, significationKey: 'varga.sig.D2' },
  D3: { id: 'D3', name: 'Drekkāṇa', divisions: 3, significationKey: 'varga.sig.D3' },
  D9: { id: 'D9', name: 'Navāṁśa', divisions: 9, significationKey: 'varga.sig.D9' },
  D10: { id: 'D10', name: 'Daśāṁśa', divisions: 10, significationKey: 'varga.sig.D10' },
  D12: { id: 'D12', name: 'Dvādaśāṁśa', divisions: 12, significationKey: 'varga.sig.D12' },
};

/** Sign index 0-11 of a sidereal longitude. */
function signIndex(longitude: Degrees): number {
  return Math.min(11, Math.floor(norm360(longitude) / 30));
}

/** Which part of its own sign a longitude falls in, 0-based. */
function divisionIndex(longitude: Degrees, divisions: number): number {
  const within = norm360(longitude) % 30;
  return Math.min(divisions - 1, Math.floor((within * divisions) / 30));
}

/** True for Aries, Gemini, Leo… — the odd-numbered signs counting from 1. */
function isOddSign(index: number): boolean {
  return index % 2 === 0;
}

/**
 * The varga sign for a sidereal longitude.
 *
 * Returns a sign index 0-11; `vargaSign` wraps it as a name.
 */
export function vargaSignIndex(siderealLongitude: Degrees, varga: Varga): number {
  const longitude = norm360(siderealLongitude);
  const sign = signIndex(longitude);

  switch (varga) {
    case 'D1':
      return sign;

    case 'D2': {
      /*
       * Horā. Parāśarī: only Leo (Sun's horā) and Cancer (Moon's) ever occur.
       * Odd sign — first half Leo, second half Cancer; even sign — reversed.
       * A naive "divide by 15 and count on" would hand back twelve different
       * signs, none of them a horā.
       */
      const firstHalf = divisionIndex(longitude, 2) === 0;
      const LEO = 4;
      const CANCER = 3;
      return isOddSign(sign) === firstHalf ? LEO : CANCER;
    }

    case 'D3': {
      // Drekkāṇa: same sign, then 5th from it, then 9th from it.
      const third = divisionIndex(longitude, 3);
      return (sign + third * 4) % 12;
    }

    case 'D9':
      /*
       * Navāṁśa. The 108 navāṁśas and the 108 pādas are the same division of
       * the zodiac, so this reuses `absolutePada` rather than deriving the
       * same quantity a second way. Counting continuously from Aries is
       * equivalent to the classical rule — movable signs start from
       * themselves, fixed from the 9th, dual from the 5th — and the tests
       * assert that equivalence rather than assuming it.
       */
      return absolutePada(longitude) % 12;

    case 'D10': {
      // Daśāṁśa: odd signs count from the sign; even signs from the 9th.
      const part = divisionIndex(longitude, 10);
      const start = isOddSign(sign) ? sign : (sign + 8) % 12;
      return (start + part) % 12;
    }

    case 'D12': {
      // Dvādaśāṁśa: always counted from the sign itself.
      const part = divisionIndex(longitude, 12);
      return (sign + part) % 12;
    }
  }
}

export function vargaSign(siderealLongitude: Degrees, varga: Varga): SignName {
  return SIGNS[vargaSignIndex(siderealLongitude, varga)]!;
}

export interface VargaPlacement {
  readonly body: string;
  readonly sign: SignName;
  readonly signIndex: number;
  /** House counted from the varga lagna, 1-12, whole-sign. */
  readonly house: number;
}

export interface VargaChart {
  readonly varga: Varga;
  readonly definition: VargaDefinition;
  readonly lagnaSign: SignName;
  readonly lagnaSignIndex: number;
  readonly placements: readonly VargaPlacement[];
}

/**
 * Build a varga chart.
 *
 * Houses are whole-sign from the varga's own lagna — the lagna is divided into
 * the varga too, not carried over from the rāśi chart. Carrying it over is a
 * common bug and makes every house placement in every divisional wrong.
 */
export function buildVargaChart(
  varga: Varga,
  lagnaLongitude: Degrees,
  bodies: readonly { readonly body: string; readonly longitude: Degrees }[],
): VargaChart {
  const lagnaSignIndex = vargaSignIndex(lagnaLongitude, varga);

  return {
    varga,
    definition: VARGA_DEFINITIONS[varga],
    lagnaSign: SIGNS[lagnaSignIndex]!,
    lagnaSignIndex,
    placements: bodies.map(({ body, longitude }) => {
      const index = vargaSignIndex(longitude, varga);
      return {
        body,
        sign: SIGNS[index]!,
        signIndex: index,
        house: ((index - lagnaSignIndex + 12) % 12) + 1,
      };
    }),
  };
}
