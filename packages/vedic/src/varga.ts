/**
 * Vargas — divisional charts.
 *
 * **Each varga has its own mapping rule.** The tempting uniform formula
 * `floor(longitude / (30/n)) mod 12` is correct for navāṁśa and wrong for most
 * of the others; applying it everywhere produces plausible-looking charts that
 * are simply not the varga they claim to be, and nothing on screen would say
 * so. So every rule below is written out separately and tested separately.
 *
 * All sixteen of Parāśara's ṣoḍaśavarga are here (0.49). The same rules drive
 * the booklet and ṣaḍbala through `vargaOf`; a test sweeps the zodiac and
 * asserts the two agree, so the picker and the booklet cannot drift apart.
 * Conventions: docs/VEDIC_CONVENTIONS.md §5.
 */
import { norm360, SIGNS, type Degrees, type SignName } from '@astro/engine';
import { absolutePada } from './nakshatra.js';

export const VARGAS = [
  'D1', 'D2', 'D3', 'D4', 'D7', 'D9', 'D10', 'D12',
  'D16', 'D20', 'D24', 'D27', 'D30', 'D40', 'D45', 'D60',
] as const;
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
  D4: { id: 'D4', name: 'Caturthāṁśa', divisions: 4, significationKey: 'varga.sig.D4' },
  D7: { id: 'D7', name: 'Saptāṁśa', divisions: 7, significationKey: 'varga.sig.D7' },
  D9: { id: 'D9', name: 'Navāṁśa', divisions: 9, significationKey: 'varga.sig.D9' },
  D10: { id: 'D10', name: 'Daśāṁśa', divisions: 10, significationKey: 'varga.sig.D10' },
  D12: { id: 'D12', name: 'Dvādaśāṁśa', divisions: 12, significationKey: 'varga.sig.D12' },
  D16: { id: 'D16', name: 'Ṣoḍaśāṁśa', divisions: 16, significationKey: 'varga.sig.D16' },
  D20: { id: 'D20', name: 'Viṁśāṁśa', divisions: 20, significationKey: 'varga.sig.D20' },
  D24: { id: 'D24', name: 'Caturviṁśāṁśa', divisions: 24, significationKey: 'varga.sig.D24' },
  D27: { id: 'D27', name: 'Saptaviṁśāṁśa', divisions: 27, significationKey: 'varga.sig.D27' },
  D30: { id: 'D30', name: 'Triṁśāṁśa', divisions: 30, significationKey: 'varga.sig.D30' },
  D40: { id: 'D40', name: 'Khavedāṁśa', divisions: 40, significationKey: 'varga.sig.D40' },
  D45: { id: 'D45', name: 'Akṣavedāṁśa', divisions: 45, significationKey: 'varga.sig.D45' },
  D60: { id: 'D60', name: 'Ṣaṣṭyāṁśa', divisions: 60, significationKey: 'varga.sig.D60' },
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

/** Movable (cara) 0, fixed (sthira) 1, dual (dvisvabhāva) 2. */
function modality(index: number): 0 | 1 | 2 {
  return (index % 3) as 0 | 1 | 2;
}

const ARIES = 0;
const CANCER_I = 3;
const LEO_I = 4;
const LIBRA = 6;
const SAGITTARIUS = 8;

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

    case 'D4': {
      // Caturthāṁśa: the sign itself, then the 4th, 7th and 10th from it.
      return (sign + divisionIndex(longitude, 4) * 3) % 12;
    }

    case 'D7': {
      // Saptāṁśa: odd signs count from the sign; even signs from the 7th from it.
      const start = isOddSign(sign) ? sign : (sign + 6) % 12;
      return (start + divisionIndex(longitude, 7)) % 12;
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

    case 'D16': {
      // Ṣoḍaśāṁśa: movable signs count from Aries, fixed from Leo, dual from Sagittarius.
      const start = [ARIES, LEO_I, SAGITTARIUS][modality(sign)]!;
      return (start + divisionIndex(longitude, 16)) % 12;
    }

    case 'D20': {
      // Viṁśāṁśa: movable from Aries, fixed from Sagittarius, dual from Leo.
      const start = [ARIES, SAGITTARIUS, LEO_I][modality(sign)]!;
      return (start + divisionIndex(longitude, 20)) % 12;
    }

    case 'D24': {
      // Caturviṁśāṁśa: odd signs count from Leo, even signs from Cancer.
      const start = isOddSign(sign) ? LEO_I : CANCER_I;
      return (start + divisionIndex(longitude, 24)) % 12;
    }

    case 'D27':
      /*
       * Saptaviṁśāṁśa (bhāṁśa): fire signs from Aries, earth from Cancer, air
       * from Libra, water from Capricorn. Those starts are exactly where the
       * previous sign's 27 parts end, so it is a continuous count from Aries,
       * as the navāṁśa is.
       */
      return Math.floor((longitude * 27) / 30) % 12;

    case 'D30': {
      /*
       * Triṁśāṁśa: not equal parts. Odd signs — Mars 5°, Saturn 5°, Jupiter 8°,
       * Mercury 7°, Venus 5°, giving Aries, Aquarius, Sagittarius, Gemini,
       * Libra. Even signs reverse the order of the lords — Venus 5°, Mercury 7°,
       * Jupiter 8°, Saturn 5°, Mars 5° — giving Taurus, Virgo, Pisces,
       * Capricorn, Scorpio.
       */
      const d = longitude - sign * 30;
      if (isOddSign(sign)) return d < 5 ? 0 : d < 10 ? 10 : d < 18 ? 8 : d < 25 ? 2 : 6;
      return d < 5 ? 1 : d < 12 ? 5 : d < 20 ? 11 : d < 25 ? 9 : 7;
    }

    case 'D40': {
      // Khavedāṁśa: odd signs count from Aries, even signs from Libra.
      const start = isOddSign(sign) ? ARIES : LIBRA;
      return (start + divisionIndex(longitude, 40)) % 12;
    }

    case 'D45': {
      // Akṣavedāṁśa: movable from Aries, fixed from Leo, dual from Sagittarius.
      const start = [ARIES, LEO_I, SAGITTARIUS][modality(sign)]!;
      return (start + divisionIndex(longitude, 45)) % 12;
    }

    case 'D60': {
      // Ṣaṣṭyāṁśa: count from the sign itself.
      return (sign + divisionIndex(longitude, 60)) % 12;
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
