/**
 * Text forms of the body, sign and aspect glyphs.
 *
 * The product DRAWS its glyphs (see `../glyphs/paths.ts`): the Unicode
 * symbols render differently on every platform, some as colour emoji, and a
 * machine without a symbol font prints empty boxes. What stays here is the
 * text side: `abbreviation` for the reader's "abbreviation" glyph setting and
 * for points with no drawing, `label` for names, and `symbol` as a last
 * resort for anything not yet drawn (the quintile family's Q and bQ).
 */
import type { AspectName, Body, SignName } from '@astro/engine';

/** Faces that carry the Miscellaneous Symbols block, in preference order. */
export const GLYPH_FONT_STACK =
  "'Segoe UI Symbol', 'Apple Symbols', 'Noto Sans Symbols2', 'DejaVu Sans', sans-serif";

export interface Glyph {
  readonly symbol: string;
  readonly abbreviation: string;
  readonly label: string;
}

export const BODY_GLYPHS: Readonly<Record<Body, Glyph>> = {
  sun:       { symbol: '☉', abbreviation: 'Su', label: 'Sun' },
  moon:      { symbol: '☽', abbreviation: 'Mo', label: 'Moon' },
  mercury:   { symbol: '☿', abbreviation: 'Me', label: 'Mercury' },
  venus:     { symbol: '♀', abbreviation: 'Ve', label: 'Venus' },
  mars:      { symbol: '♂', abbreviation: 'Ma', label: 'Mars' },
  jupiter:   { symbol: '♃', abbreviation: 'Ju', label: 'Jupiter' },
  saturn:    { symbol: '♄', abbreviation: 'Sa', label: 'Saturn' },
  uranus:    { symbol: '♅', abbreviation: 'Ur', label: 'Uranus' },
  neptune:   { symbol: '♆', abbreviation: 'Ne', label: 'Neptune' },
  pluto:     { symbol: '♇', abbreviation: 'Pl', label: 'Pluto' },
  // Both axes share the ascending/descending glyphs, because that is what the
  // symbols mean. The ABBREVIATIONS differ, so a chart showing the mean axis
  // cannot be mistaken for one showing the true axis in a monochrome print
  // where the glyphs are identical.
  meanNode:      { symbol: '☊', abbreviation: 'mNN', label: 'Mean North Node' },
  trueNode:      { symbol: '☊', abbreviation: 'NN',  label: 'True North Node' },
  southNode:     { symbol: '☋', abbreviation: 'SN',  label: 'True South Node' },
  meanSouthNode: { symbol: '☋', abbreviation: 'mSN', label: 'Mean South Node' },
  chiron:    { symbol: '⚷', abbreviation: 'Ch', label: 'Chiron' },
  lilith:    { symbol: '⚸', abbreviation: 'Li', label: 'Lilith' },
};

export const SIGN_GLYPHS: Readonly<Record<SignName, Glyph>> = {
  aries:       { symbol: '♈', abbreviation: 'Ari', label: 'Aries' },
  taurus:      { symbol: '♉', abbreviation: 'Tau', label: 'Taurus' },
  gemini:      { symbol: '♊', abbreviation: 'Gem', label: 'Gemini' },
  cancer:      { symbol: '♋', abbreviation: 'Can', label: 'Cancer' },
  leo:         { symbol: '♌', abbreviation: 'Leo', label: 'Leo' },
  virgo:       { symbol: '♍', abbreviation: 'Vir', label: 'Virgo' },
  libra:       { symbol: '♎', abbreviation: 'Lib', label: 'Libra' },
  scorpio:     { symbol: '♏', abbreviation: 'Sco', label: 'Scorpio' },
  sagittarius: { symbol: '♐', abbreviation: 'Sag', label: 'Sagittarius' },
  capricorn:   { symbol: '♑', abbreviation: 'Cap', label: 'Capricorn' },
  aquarius:    { symbol: '♒', abbreviation: 'Aqu', label: 'Aquarius' },
  pisces:      { symbol: '♓', abbreviation: 'Pis', label: 'Pisces' },
};

export const ASPECT_GLYPHS: Readonly<Record<AspectName, Glyph>> = {
  conjunction:    { symbol: '☌', abbreviation: 'con', label: 'Conjunction' },
  opposition:     { symbol: '☍', abbreviation: 'opp', label: 'Opposition' },
  trine:          { symbol: '△', abbreviation: 'tri', label: 'Trine' },
  square:         { symbol: '□', abbreviation: 'squ', label: 'Square' },
  sextile:        { symbol: '⚹', abbreviation: 'sex', label: 'Sextile' },
  quincunx:       { symbol: '⚻', abbreviation: 'qcx', label: 'Quincunx' },
  semisextile:    { symbol: '⚺', abbreviation: 'ssx', label: 'Semi-sextile' },
  semisquare:     { symbol: '∠', abbreviation: 'ssq', label: 'Semi-square' },
  sesquiquadrate: { symbol: '⚼', abbreviation: 'sqq', label: 'Sesquiquadrate' },
  quintile:       { symbol: 'Q',      abbreviation: 'qui', label: 'Quintile' },
  biquintile:     { symbol: 'bQ',     abbreviation: 'bqu', label: 'Bi-quintile' },
};
