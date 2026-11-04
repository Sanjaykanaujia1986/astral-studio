/**
 * Turning a calculated chart into delineations.
 *
 * The one thing this file must not do is compute astronomy, and it does not:
 * every number it uses — longitude, sign, house, orb, distribution, shape — is
 * read off a chart the engine has already produced and validated. If a fact is
 * absent from the chart (no houses, because the birth time was unknown), the
 * delineations that depend on it are omitted and the omission is reported. It
 * is never filled in with a guess.
 *
 * Output is deterministic: the same chart and catalogue always produce the same
 * delineations in the same order, so a report can be regenerated, diffed and
 * regression-tested.
 */
import {
  chartShape,
  hemispheres,
  type AspectHit,
  type ChartShape,
  type Element,
  type InstantChart,
  type Modality,
  type SignName,
} from '@astro/engine';
import { EN_CATALOGUE } from './catalogue/en.js';
import {
  HEMISPHERE_KEYS,
  INTERPRETED_BODIES,
  type Catalogue,
  type Delineation,
  type Factor,
  type HouseNumber,
  type InterpretationResult,
  type InterpretedBody,
  type MissingEntry,
} from './types.js';

/**
 * Where "emphasis" starts.
 *
 * These are conventions, not measurements, so they live here as named
 * constants with their reasoning attached rather than as bare numbers inside a
 * condition. An even spread would put a quarter of the bodies in each element
 * and a third in each modality; emphasis is called at roughly one and a half
 * times the even share, which is the point at which the imbalance is visible
 * on the wheel rather than merely arithmetic.
 */
export const ELEMENT_EMPHASIS_SHARE = 0.375;
export const MODALITY_EMPHASIS_SHARE = 0.5;
/** A hemisphere holding this share or more is worth remarking on. */
export const HEMISPHERE_EMPHASIS_SHARE = 0.7;

/** Aspects reported by default, tightest first. */
export const DEFAULT_MAX_ASPECTS = 24;

export interface InterpretOptions {
  readonly catalogue?: Catalogue;
  /** Cap on aspect delineations. The tightest orbs survive the cut. */
  readonly maxAspects?: number;
}

/**
 * Fill `{placeholder}` slots.
 *
 * An unfilled placeholder is a content bug, and one that would otherwise reach
 * the reader as literal braces in the middle of a sentence. It throws instead:
 * a catalogue with a typo in a template should fail loudly in test, not print
 * "{signPhrase}" onto a PDF.
 */
export function fill(template: string, values: Readonly<Record<string, string>>): string {
  return template.replace(/\{(\w+)\}/g, (_match, key: string) => {
    const value = values[key];
    if (value === undefined) {
      throw new Error(`interpretation template refers to unknown placeholder {${key}}`);
    }
    return value;
  });
}

/** Format an orb the way the tables do, so a report reads consistently. */
function formatOrb(orb: number): string {
  const total = Math.abs(orb) * 60;
  const degrees = Math.floor(total / 60);
  const minutes = Math.floor(total % 60);
  return `${degrees}°${String(minutes).padStart(2, '0')}'`;
}

/** Collect a factor, recording the gap when the catalogue does not carry it. */
function take(
  group: string,
  key: string,
  factor: Factor | undefined,
  missing: MissingEntry[],
): Factor | undefined {
  if (!factor) missing.push({ group, key });
  return factor;
}

function overviewDelineations(
  chart: InstantChart,
  catalogue: Catalogue,
  missing: MissingEntry[],
): Delineation[] {
  const out: Delineation[] = [];

  if (chart.houses) {
    const ascSign = signOf(chart.houses.ascendant);
    const asc = take('signs', ascSign, catalogue.signs[ascSign], missing);
    if (asc) {
      out.push({
        id: `angle:asc:${ascSign}`,
        section: 'overview',
        title: `Ascendant in ${asc.title}`,
        body: fill(catalogue.templates.ascendant, { signPhrase: asc.phrase }),
        keywords: asc.keywords,
        weight: 100,
        basis: { kind: 'angle', sign: ascSign, measure: chart.houses.ascendant },
      });
    }

    const mcSign = signOf(chart.houses.midheaven);
    const mc = take('signs', mcSign, catalogue.signs[mcSign], missing);
    if (mc) {
      out.push({
        id: `angle:mc:${mcSign}`,
        section: 'overview',
        title: `Midheaven in ${mc.title}`,
        body: fill(catalogue.templates.midheaven, { signPhrase: mc.phrase }),
        keywords: mc.keywords,
        weight: 99,
        basis: { kind: 'angle', sign: mcSign, measure: chart.houses.midheaven },
      });
    }
  }

  // Element balance. Both directions are reported: a missing element says as
  // much as a dominant one, and only reporting the dominant one would make
  // every chart look like it has a strength and no gap.
  const elementTotal = chart.elements.total;
  for (const [element, count] of Object.entries(chart.elements.counts) as [Element, number][]) {
    const factor = catalogue.elements[element];
    if (!factor) {
      missing.push({ group: 'elements', key: element });
      continue;
    }
    if (elementTotal > 0 && count / elementTotal >= ELEMENT_EMPHASIS_SHARE) {
      out.push({
        id: `element:emphasis:${element}`,
        section: 'overview',
        title: `${factor.title} emphasis`,
        body: fill(catalogue.templates.elementEmphasis, {
          count: String(count),
          total: String(elementTotal),
          element: factor.title.toLowerCase(),
          elementPhrase: factor.phrase,
        }),
        keywords: factor.keywords,
        weight: 90 + count,
        basis: { kind: 'element', measure: count },
      });
    } else if (count === 0) {
      out.push({
        id: `element:lack:${element}`,
        section: 'overview',
        title: `${factor.title} unoccupied`,
        body: fill(catalogue.templates.elementLack, {
          element: factor.title.toLowerCase(),
          keywords: factor.keywords.join(', '),
        }),
        keywords: factor.keywords,
        weight: 89,
        basis: { kind: 'element', measure: 0 },
      });
    }
  }

  const modalityTotal = chart.modalities.total;
  for (const [modality, count] of Object.entries(chart.modalities.counts) as [Modality, number][]) {
    const factor = catalogue.modalities[modality];
    if (!factor) {
      missing.push({ group: 'modalities', key: modality });
      continue;
    }
    if (modalityTotal > 0 && count / modalityTotal >= MODALITY_EMPHASIS_SHARE) {
      out.push({
        id: `modality:emphasis:${modality}`,
        section: 'overview',
        title: `${factor.title} emphasis`,
        body: fill(catalogue.templates.modalityEmphasis, {
          count: String(count),
          total: String(modalityTotal),
          modality: factor.title.toLowerCase(),
          modalityPhrase: factor.phrase,
        }),
        keywords: factor.keywords,
        weight: 88 + count,
        basis: { kind: 'modality', measure: count },
      });
    }
  }

  const split = hemispheres(chart.bodies, chart.houses);
  if (split) {
    for (const key of HEMISPHERE_KEYS) {
      const count = split[key];
      if (split.total === 0 || count / split.total < HEMISPHERE_EMPHASIS_SHARE) continue;
      const factor = catalogue.hemispheres[key];
      if (!factor) {
        missing.push({ group: 'hemispheres', key });
        continue;
      }
      out.push({
        id: `hemisphere:${key}`,
        section: 'overview',
        title: factor.title,
        body: fill(catalogue.templates.hemisphereEmphasis, {
          count: String(count),
          total: String(split.total),
          hemispherePhrase: factor.phrase,
        }),
        keywords: factor.keywords,
        weight: 80 + count,
        basis: { kind: 'hemisphere', measure: count },
      });
    }
  }

  return out;
}

function patternDelineations(
  shape: ChartShape | undefined,
  catalogue: Catalogue,
  missing: MissingEntry[],
): Delineation[] {
  if (!shape) return [];
  const factor = catalogue.shapes[shape.name];
  if (!factor) {
    missing.push({ group: 'shapes', key: shape.name });
    return [];
  }
  return [{
    id: `shape:${shape.name}`,
    section: 'patterns',
    title: `${factor.title} pattern`,
    body: fill(catalogue.templates.shape, { shapePhrase: factor.phrase }),
    keywords: factor.keywords,
    weight: 95,
    basis: { kind: 'shape', bodies: shape.bodies, measure: shape.occupiedArc },
  }];
}

function placementDelineations(
  chart: InstantChart,
  catalogue: Catalogue,
  missing: MissingEntry[],
): Delineation[] {
  const out: Delineation[] = [];
  const interpreted = new Set<string>(INTERPRETED_BODIES);

  for (const placed of chart.bodies) {
    const body = placed.position.body;
    if (!interpreted.has(body)) continue;
    const key = body as InterpretedBody;

    const bodyFactor = take('bodies', key, catalogue.bodies[key], missing);
    const signFactor = take('signs', placed.sign.sign, catalogue.signs[placed.sign.sign], missing);
    if (!bodyFactor || !signFactor) continue;

    const house = placed.house as HouseNumber | undefined;
    const houseFactor = house === undefined
      ? undefined
      : take('houses', String(house), catalogue.houses[house], missing);

    const title = houseFactor
      ? `${bodyFactor.title} in ${signFactor.title}, ${ordinal(house!)} house`
      : `${bodyFactor.title} in ${signFactor.title}`;

    out.push({
      id: houseFactor
        ? `placement:${key}:${placed.sign.sign}:${house}`
        : `placement:${key}:${placed.sign.sign}`,
      section: houseFactor ? 'houses' : 'placements',
      title,
      body: houseFactor
        ? fill(catalogue.templates.planetInSignAndHouse, {
            bodyPhrase: bodyFactor.phrase,
            signPhrase: signFactor.phrase,
            housePhrase: houseFactor.phrase,
          })
        : fill(catalogue.templates.planetInSign, {
            bodyPhrase: bodyFactor.phrase,
            signPhrase: signFactor.phrase,
          }),
      keywords: [...bodyFactor.keywords, ...signFactor.keywords],
      // Chart order, not an opinion about which planet is important.
      weight: 70 - chart.bodies.indexOf(placed),
      basis: {
        kind: houseFactor ? 'planet-in-house' : 'planet-in-sign',
        bodies: [body],
        sign: placed.sign.sign,
        ...(house === undefined ? {} : { house }),
        measure: placed.position.longitude,
      },
    });

    // Retrograde is a measured fact, so it gets its own note rather than being
    // folded into the placement text where it could not be traced.
    if (placed.position.retrograde && !placed.position.stationary) {
      out.push({
        id: `retrograde:${key}`,
        section: 'placements',
        title: `${bodyFactor.title} retrograde`,
        body: fill(catalogue.templates.retrograde, { bodyPhrase: bodyFactor.phrase }),
        keywords: bodyFactor.keywords,
        weight: 60,
        basis: {
          kind: 'retrograde',
          bodies: [body],
          measure: placed.position.longitudeSpeed,
        },
      });
    }
  }

  return out;
}

function aspectDelineations(
  aspects: readonly AspectHit[],
  catalogue: Catalogue,
  missing: MissingEntry[],
  limit: number,
): Delineation[] {
  const interpreted = new Set<string>(INTERPRETED_BODIES);
  const out: Delineation[] = [];

  // Tightest first. Strength already encodes orb relative to the orb allowed
  // for that aspect, so a 1 degree quintile is not outranked by a 5 degree
  // conjunction merely because conjunctions get a wider allowance.
  const ordered = [...aspects]
    .filter((hit) => interpreted.has(hit.bodyA) && interpreted.has(hit.bodyB))
    .sort((a, b) => b.strength - a.strength || a.orb - b.orb);

  for (const hit of ordered) {
    if (out.length >= limit) break;
    const a = take('bodies', hit.bodyA, catalogue.bodies[hit.bodyA as InterpretedBody], missing);
    const b = take('bodies', hit.bodyB, catalogue.bodies[hit.bodyB as InterpretedBody], missing);
    const aspect = take('aspects', hit.aspect, catalogue.aspects[hit.aspect], missing);
    if (!a || !b || !aspect) continue;

    /*
     * Deliberately built from names and keywords rather than from the two
     * bodies' full phrases.
     *
     * Those phrases are comma-laden noun clauses written to sit alone in a
     * placement sentence. Joining two of them with "and" yields text like
     * "The need for safety, and the rhythm of instinctive response and what is
     * valued, and how closeness is offered pull at an awkward angle" — which
     * is grammatical and unreadable. The keyword form says the same thing and
     * can be scanned.
     */
    const sentence = fill(catalogue.templates.aspect, {
      a: a.title,
      b: b.title,
      aKeywords: a.keywords.slice(0, 2).join(', '),
      bKeywords: b.keywords.slice(0, 2).join(', '),
      aspectPhrase: aspect.phrase,
    });

    out.push({
      id: `aspect:${hit.bodyA}:${hit.aspect}:${hit.bodyB}`,
      section: 'aspects',
      title: `${a.title} ${aspect.title.toLowerCase()} ${b.title} · orb ${formatOrb(hit.orb)}`,
      body: sentence,
      keywords: aspect.keywords,
      // Strength is the measurement; scaling it keeps aspects below the
      // structural material of the overview in a merged ordering.
      weight: 50 * hit.strength,
      basis: {
        kind: 'aspect',
        bodies: [hit.bodyA, hit.bodyB],
        aspect: hit.aspect,
        measure: hit.orb,
      },
    });
  }

  return out;
}

const ORDINALS: readonly string[] = [
  '', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth',
  'seventh', 'eighth', 'ninth', 'tenth', 'eleventh', 'twelfth',
];

function ordinal(house: number): string {
  return ORDINALS[house] ?? String(house);
}

/** Sign of a longitude, without importing the wheel's formatting. */
function signOf(longitude: number): SignName {
  const SIGN_ORDER: readonly SignName[] = [
    'aries', 'taurus', 'gemini', 'cancer', 'leo', 'virgo',
    'libra', 'scorpio', 'sagittarius', 'capricorn', 'aquarius', 'pisces',
  ];
  const index = Math.floor(((longitude % 360) + 360) % 360 / 30);
  return SIGN_ORDER[index]!;
}

/**
 * Interpret a chart.
 *
 * Works on any `InstantChart` — natal, return, progressed or Davison — because
 * a delineation is about positions, and where the moment came from is the
 * caller's business, not this module's.
 */
export function interpretChart(
  chart: InstantChart,
  options: InterpretOptions = {},
): InterpretationResult {
  const catalogue = options.catalogue ?? EN_CATALOGUE;
  const limit = options.maxAspects ?? DEFAULT_MAX_ASPECTS;
  const missing: MissingEntry[] = [];

  const delineations = [
    ...overviewDelineations(chart, catalogue, missing),
    ...patternDelineations(chartShape(chart.bodies), catalogue, missing),
    ...placementDelineations(chart, catalogue, missing),
    ...aspectDelineations(chart.aspects, catalogue, missing, limit),
  ];

  // Deduplicate the missing list: one absent catalogue entry can be asked for
  // many times, and a report of forty identical gaps hides how many there are.
  const seen = new Set<string>();
  const uniqueMissing = missing.filter((entry) => {
    const key = `${entry.group}/${entry.key}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return {
    locale: catalogue.locale,
    revision: catalogue.revision,
    provenance: catalogue.provenance,
    reviewed: catalogue.reviewed,
    delineations,
    missing: uniqueMissing,
  };
}

/** Delineations for one section, in weight order. */
export function sectionOf(
  result: InterpretationResult,
  section: Delineation['section'],
): readonly Delineation[] {
  return result.delineations
    .filter((d) => d.section === section)
    .sort((a, b) => b.weight - a.weight);
}

/**
 * Which catalogue keys are present, so a catalogue can be checked for holes
 * before it is shipped rather than after a reader finds an empty section.
 */
export function catalogueCoverage(catalogue: Catalogue): {
  readonly complete: boolean;
  readonly missing: readonly MissingEntry[];
} {
  const missing: MissingEntry[] = [];
  const check = (group: string, keys: readonly string[], table: Readonly<Record<string, unknown>>) => {
    for (const key of keys) if (!table[key]) missing.push({ group, key });
  };

  check('bodies', INTERPRETED_BODIES, catalogue.bodies);
  check('signs', [
    'aries', 'taurus', 'gemini', 'cancer', 'leo', 'virgo',
    'libra', 'scorpio', 'sagittarius', 'capricorn', 'aquarius', 'pisces',
  ], catalogue.signs);
  check('houses', ['1','2','3','4','5','6','7','8','9','10','11','12'], catalogue.houses);
  check('aspects', [
    'conjunction', 'opposition', 'square', 'trine', 'sextile', 'quincunx',
    'semisextile', 'semisquare', 'sesquiquadrate', 'quintile', 'biquintile',
  ], catalogue.aspects);
  check('shapes', [
    'bundle', 'bowl', 'bucket', 'locomotive', 'seesaw', 'splash', 'splay',
  ], catalogue.shapes);
  check('elements', ['fire', 'earth', 'air', 'water'], catalogue.elements);
  check('modalities', ['cardinal', 'fixed', 'mutable'], catalogue.modalities);
  check('hemispheres', HEMISPHERE_KEYS, catalogue.hemispheres);

  return { complete: missing.length === 0, missing };
}
