/**
 * The shape of interpretation content.
 *
 * The hard rule of this package: it computes no astronomy. Not a longitude,
 * not an orb, not a house cusp. It receives a chart that the engine has
 * already validated and turns measured facts into sentences. If a value is not
 * present on the chart, the interpretation for it is reported as MISSING —
 * never estimated, and never quietly dropped.
 *
 * Content is data, not code. Every string a reader sees comes from a catalogue
 * object that can be replaced, translated, extended or licensed independently,
 * without touching the selection logic. That is what makes it possible to swap
 * in a fuller professional text later, or to hand the same structured facts to
 * an optional AI layer, without the calculation layer noticing.
 */
import type { AspectName, Body, ChartShapeName, Element, Modality, SignName } from '@astro/engine';

/** Which part of a report a delineation belongs to. */
export type SectionId = 'overview' | 'patterns' | 'placements' | 'houses' | 'aspects';

export const SECTIONS: readonly SectionId[] = [
  'overview', 'patterns', 'placements', 'houses', 'aspects',
];

/** House numbers, 1-12. */
export type HouseNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;

export const HOUSE_NUMBERS: readonly HouseNumber[] = [
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
];

/** The bodies the catalogue carries text for. */
export type InterpretedBody = Extract<
  Body,
  'sun' | 'moon' | 'mercury' | 'venus' | 'mars' | 'jupiter' | 'saturn'
  | 'uranus' | 'neptune' | 'pluto' | 'chiron'
>;

export const INTERPRETED_BODIES: readonly InterpretedBody[] = [
  'sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn',
  'uranus', 'neptune', 'pluto', 'chiron',
];

/**
 * One catalogue entry: a name, a handful of keywords and a phrase.
 *
 * `phrase` is written to slot into a composed sentence, which is why entries
 * read as fragments rather than as finished prose. Composition is what keeps
 * the catalogue small enough to be reviewed by a person: forty-odd factors
 * rather than the fifteen hundred combinations they generate.
 */
export interface Factor {
  readonly title: string;
  readonly keywords: readonly string[];
  readonly phrase: string;
}

/** Templates take `{name}` placeholders filled from the factors. */
export interface Templates {
  readonly planetInSign: string;
  readonly planetInHouse: string;
  readonly planetInSignAndHouse: string;
  readonly aspect: string;
  readonly shape: string;
  readonly elementEmphasis: string;
  readonly elementLack: string;
  readonly modalityEmphasis: string;
  readonly hemisphereEmphasis: string;
  readonly ascendant: string;
  readonly midheaven: string;
  readonly retrograde: string;
}

export type HemisphereKey = 'aboveHorizon' | 'belowHorizon' | 'eastern' | 'western';

export const HEMISPHERE_KEYS: readonly HemisphereKey[] = [
  'aboveHorizon', 'belowHorizon', 'eastern', 'western',
];

/**
 * A complete body of interpretation content for one language.
 *
 * `provenance` is not decoration. Astrological delineation is a written
 * tradition with authors, and a reader is entitled to know whether a paragraph
 * comes from a keyword scheme, a named text, or a generated draft. Anything
 * shown to a reader carries its origin.
 */
export interface Catalogue {
  /** BCP 47 tag this catalogue is written in. */
  readonly locale: string;
  /** Bumped when the text changes, so cached reports can be invalidated. */
  readonly revision: string;
  readonly provenance: string;
  /**
   * False when the text has not been checked by a fluent speaker of `locale`.
   * The UI must say so rather than presenting unreviewed content as finished.
   */
  readonly reviewed: boolean;
  readonly templates: Templates;
  readonly bodies: Readonly<Partial<Record<InterpretedBody, Factor>>>;
  readonly signs: Readonly<Partial<Record<SignName, Factor>>>;
  readonly houses: Readonly<Partial<Record<HouseNumber, Factor>>>;
  readonly aspects: Readonly<Partial<Record<AspectName, Factor>>>;
  readonly shapes: Readonly<Partial<Record<ChartShapeName, Factor>>>;
  readonly elements: Readonly<Partial<Record<Element, Factor>>>;
  readonly modalities: Readonly<Partial<Record<Modality, Factor>>>;
  readonly hemispheres: Readonly<Partial<Record<HemisphereKey, Factor>>>;
}

/**
 * What a delineation is founded on.
 *
 * Every sentence names the measured facts it rests on, so a reader — or a
 * reviewer — can trace any claim back to the chart. This is the separation
 * between calculation and interpretation made visible rather than merely
 * asserted in a comment.
 */
export interface DelineationBasis {
  readonly kind:
    | 'planet-in-sign' | 'planet-in-house' | 'aspect' | 'shape'
    | 'element' | 'modality' | 'hemisphere' | 'angle' | 'retrograde';
  readonly bodies?: readonly Body[];
  readonly sign?: SignName;
  readonly house?: HouseNumber;
  readonly aspect?: AspectName;
  /** Measured quantity behind the claim: an orb, a count, an arc. */
  readonly measure?: number;
}

export interface Delineation {
  /** Stable across runs and locales, so a reader can be linked to one. */
  readonly id: string;
  readonly section: SectionId;
  readonly title: string;
  readonly body: string;
  readonly keywords: readonly string[];
  /**
   * Ordering weight, larger first. Derived from the measurement — a tight orb
   * outranks a wide one — never from an opinion about which planet matters.
   */
  readonly weight: number;
  readonly basis: DelineationBasis;
}

/** A catalogue key the chart called for but the catalogue does not carry. */
export interface MissingEntry {
  readonly group: string;
  readonly key: string;
}

export interface InterpretationResult {
  readonly locale: string;
  readonly revision: string;
  readonly provenance: string;
  readonly reviewed: boolean;
  readonly delineations: readonly Delineation[];
  /**
   * Gaps, reported rather than hidden. A report that silently omits a section
   * looks finished when it is not, which is the failure this exists to stop.
   */
  readonly missing: readonly MissingEntry[];
}
