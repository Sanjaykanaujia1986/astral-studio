/**
 * Hand-drawn zodiac and planet glyphs, as stroke paths on a 24 × 24 grid.
 *
 * The Unicode symbols they replace look different on every platform: Windows
 * draws some as colour emoji, Android swaps faces mid-ring, and a PDF made on
 * a machine without a symbol font prints empty boxes. These paths are one
 * drawing everywhere — the same weight, the same optical size, the same
 * baseline — and they inherit colour, so the element tints and the dark theme
 * apply to them like text.
 *
 * Drawing rules, so additions match: stroke only (no fills, except the Sun's
 * centre), round caps and joins, nothing closer than 2 units to the edge, and
 * the visual mass centred on (12, 12). Rendered at stroke-width 1.6 by default.
 */
import type { AspectName, Body, SignName } from '@astro/engine';

export interface GlyphPath {
  /** Stroked path data. */
  readonly d: string;
  /** Filled path data (dots), drawn in the same colour. */
  readonly fill?: string;
}

/** A full circle as two arcs. Rounded, so floating-point noise never reaches the markup. */
const r2 = (n: number): number => Math.round(n * 100) / 100;
const circle = (cx: number, cy: number, r: number): string =>
  `M${r2(cx - r)} ${cy}a${r} ${r} 0 1 0 ${r2(2 * r)} 0a${r} ${r} 0 1 0 ${r2(-2 * r)} 0`;

export const SIGN_PATHS: Readonly<Record<SignName, GlyphPath>> = {
  // Ram's horns rising from one stem.
  aries: {
    d: 'M12 21V9.5C12 5.4 9.8 3.2 7.1 3.2 4.8 3.2 3.2 4.9 3.2 7.1c0 2 1.4 3.6 3.3 3.6'
      + 'M12 9.5c0-4.1 2.2-6.3 4.9-6.3 2.3 0 3.9 1.7 3.9 3.9 0 2-1.4 3.6-3.3 3.6',
  },
  // Bull's head: a full circle under a wide crescent.
  taurus: {
    d: `${circle(12, 15.2, 5.6)}M3.2 3.4c1.2 4 4.4 6.2 8.8 6.2s7.6-2.2 8.8-6.2`,
  },
  // The twins: two pillars joined top and bottom by bowed lintels.
  gemini: {
    d: 'M4 3.6c5.3 2.1 10.7 2.1 16 0M4 20.4c5.3-2.1 10.7-2.1 16 0M8.6 5.1v13.8M15.4 5.1v13.8',
  },
  // Two claws turning about each other.
  cancer: {
    d: `${circle(7, 9, 2.6)}M7 6.4c3.6-2.6 9.4-2.6 13.4 1.2`
      + `${circle(17, 15, 2.6)}M17 17.6c-3.6 2.6-9.4 2.6-13.4-1.2`,
  },
  // The lion's mane: a small circle, a looping arch and a flicked tail.
  leo: {
    d: `${circle(6.8, 16.2, 2.9)}M9.7 16.2c0-3.4-2.5-5.6-2.5-8.6 0-2.7 2-4.5 4.6-4.5s4.6 1.8 4.6 4.5`
      + 'c0 3.6-3 5.6-3 9.1 0 2.4 1.5 4 3.6 4 1.9 0 3.2-1.4 3.2-3.2',
  },
  // Three strokes and a closed loop crossing the last.
  virgo: {
    d: 'M3.4 5.6c1.3-.6 2.2.2 2.2 1.8V19.6M5.6 8c0-1.8 1.2-3 2.6-3s2.6 1.2 2.6 3v11.6'
      + 'M10.8 8c0-1.8 1.2-3 2.6-3s2.6 1.2 2.6 3v6.6c0 3.4 1.6 5.6 4.2 5.6'
      + 'M16 13.2c1.6-2.1 4.6-1.9 4.6.9 0 2.9-2.8 5.6-7 6.8',
  },
  // The scales: a beam over the sun setting on the horizon.
  libra: {
    d: 'M3 20h18M3 16.2h5.1C6.7 15 5.9 13.5 5.9 11.8c0-3.4 2.7-6 6.1-6s6.1 2.6 6.1 6'
      + 'c0 1.7-.8 3.2-2.2 4.4H21',
  },
  // Virgo's three strokes, the last ending in the sting.
  scorpio: {
    d: 'M3.4 5.6c1.3-.6 2.2.2 2.2 1.8V19.6M5.6 8c0-1.8 1.2-3 2.6-3s2.6 1.2 2.6 3v11.6'
      + 'M10.8 8c0-1.8 1.2-3 2.6-3s2.6 1.2 2.6 3v9.2c0 1.8 1 2.8 2.6 2.8h2.2'
      + 'M18.8 17.9l2.3 2.1-2.3 2.1',
  },
  // The archer's arrow.
  sagittarius: {
    d: 'M3.8 20.2 20.2 3.8M12.4 3.8h7.8v7.8M6.6 11.4l6 6',
  },
  // The sea-goat: horned V with a fish-tail loop.
  capricorn: {
    d: 'M2.8 5.2c1.4-.4 2.4.4 3 2L9 17.4l3.6-11c.4-1.2 1.6-1.4 1.6 0v8.4'
      + 'c0 3.3 1.8 5.4 4.1 5.4 2 0 3.3-1.5 3.3-3.3 0-1.9-1.4-3.3-3.2-3.3-2.1 0-3.4 1.8-4.2 4'
      + '-.8 2.2-2 3.3-3.8 3.3',
  },
  // Water bearer's waves.
  aquarius: {
    d: 'M2.8 9.6 6 6.4l3 3.2 3-3.2 3 3.2 3-3.2 3.2 3.2M2.8 17.4 6 14.2l3 3.2 3-3.2 3 3.2 3-3.2 3.2 3.2',
  },
  // Two fish bound back to back.
  pisces: {
    d: 'M5.2 3.2c3.9 3.4 3.9 14.2 0 17.6M18.8 3.2c-3.9 3.4-3.9 14.2 0 17.6M6.9 12h10.2',
  },
};

export const BODY_PATHS: Readonly<Record<Body, GlyphPath>> = {
  sun: { d: circle(12, 12, 8.4), fill: circle(12, 12, 1.7) },
  moon: { d: 'M15.2 3.3a9 9 0 1 0 0 17.4 10.6 10.6 0 0 1 0-17.4z' },
  mercury: {
    d: `${circle(12, 11.2, 4.1)}M12 15.3v6.2M9 18.4h6M7.9 2.8c.6 2.6 2 4.3 4.1 4.3s3.5-1.7 4.1-4.3`,
  },
  venus: { d: `${circle(12, 8.6, 5.3)}M12 13.9v7.6M8.4 18h7.2` },
  mars: { d: `${circle(9.6, 14.4, 5.6)}M13.6 10.4 20.6 3.4M14.6 3.4h6v6` },
  jupiter: { d: 'M5 5.6c1.2-2 4.6-2.4 5.7.1 1.3 3-1.6 6.8-6.1 10.2h15.2M16 3v18.4' },
  saturn: {
    d: 'M7.4 2.8v12M4.4 6h6M7.4 14.6c0-3 2-5.2 4.8-5.2 2.6 0 4.3 1.9 4.3 4.4 0 3.4-3.4 4.5-3.4 6.8'
      + ' 0 1.1.8 1.7 2.1 1.6',
  },
  uranus: { d: `M6 3.4v11.4M18 3.4v11.4M6 9.1h12M12 3.4v12.2${circle(12, 18.4, 2.6)}` },
  neptune: {
    d: 'M4.4 4.6c0 6.4 3.2 9.8 7.6 9.8s7.6-3.4 7.6-9.8M12 3v18.4M8.6 18h6.8'
      + 'M2.9 6.2 4.4 4.4 5.9 6.2M10.5 4.7 12 3l1.5 1.7M18.1 6.2l1.5-1.8 1.5 1.8',
  },
  pluto: {
    d: `${circle(12, 7.6, 3)}M5.6 5.2c0 4.6 2.8 8.2 6.4 8.2s6.4-3.6 6.4-8.2M12 13.4v8.2M8.6 18h6.8`,
  },
  // Dragon's head and tail: a horseshoe with knots at its feet.
  trueNode: {
    d: `M8.2 16.6C5.2 14.9 3.6 12.2 3.6 9.6c0-3.8 3.6-6.4 8.4-6.4s8.4 2.6 8.4 6.4c0 2.6-1.6 5.3-4.6 7`
      + `${circle(6.6, 18.4, 2.3)}${circle(17.4, 18.4, 2.3)}`,
  },
  meanNode: {
    d: `M8.2 16.6C5.2 14.9 3.6 12.2 3.6 9.6c0-3.8 3.6-6.4 8.4-6.4s8.4 2.6 8.4 6.4c0 2.6-1.6 5.3-4.6 7`
      + `${circle(6.6, 18.4, 2.3)}${circle(17.4, 18.4, 2.3)}`,
  },
  southNode: {
    d: `M8.2 7.4C5.2 9.1 3.6 11.8 3.6 14.4c0 3.8 3.6 6.4 8.4 6.4s8.4-2.6 8.4-6.4c0-2.6-1.6-5.3-4.6-7`
      + `${circle(6.6, 5.6, 2.3)}${circle(17.4, 5.6, 2.3)}`,
  },
  meanSouthNode: {
    d: `M8.2 7.4C5.2 9.1 3.6 11.8 3.6 14.4c0 3.8 3.6 6.4 8.4 6.4s8.4-2.6 8.4-6.4c0-2.6-1.6-5.3-4.6-7`
      + `${circle(6.6, 5.6, 2.3)}${circle(17.4, 5.6, 2.3)}`,
  },
  chiron: { d: `M10.6 2.8v11.6M10.6 8.8l5.6-5.4M10.6 8.8l5.6 5.4${circle(11.4, 18.2, 3.1)}` },
  lilith: {
    d: 'M14.4 2.8a5.6 5.6 0 1 0 0 10.8 6.6 6.6 0 0 1 0-10.8zM11.4 13.8v7.8M8.2 18.4h6.4',
  },
};

/**
 * Aspect glyphs. The quintile family has no settled symbol, so it is left to
 * the text form (Q, bQ) rather than invented here.
 */
export const ASPECT_PATHS: Readonly<Partial<Record<AspectName, GlyphPath>>> = {
  conjunction: { d: `${circle(9.4, 14.6, 5)}M13 11 19.6 4.4` },
  opposition: { d: `${circle(6.4, 17.6, 3.4)}${circle(17.6, 6.4, 3.4)}M8.8 15.2l6.4-6.4` },
  trine: { d: 'M12 4.2 20.4 19H3.6Z' },
  square: { d: 'M5 5h14v14H5Z' },
  sextile: { d: 'M12 3.4v17.2M4.6 7.7l14.8 8.6M4.6 16.3l14.8-8.6' },
  semisextile: { d: 'M4.4 19.6h15.2M6.2 6l5.8 10.4L17.8 6' },
  quincunx: { d: 'M4.4 4.4h15.2M6.2 18l5.8-10.4L17.8 18' },
  semisquare: { d: 'M19.6 19.4H4.4L17 5.2' },
  sesquiquadrate: { d: 'M5.8 11.6h12.4v8.6H5.8ZM5.8 11.6 18.2 3.8' },
};
