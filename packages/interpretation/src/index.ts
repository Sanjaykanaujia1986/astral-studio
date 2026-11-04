/**
 * @astro/interpretation — delineation content and the composer that selects it.
 *
 * Kept in its own package for one reason: it must be impossible for
 * interpretation to leak into calculation. `@astro/engine` does not depend on
 * this package and never will, so no amount of editing here can change a
 * number. The dependency runs one way only.
 *
 * ```ts
 * const result = interpretChart(chart);
 * for (const d of sectionOf(result, 'overview')) console.log(d.title, d.body);
 * ```
 */
export {
  interpretChart, sectionOf, catalogueCoverage, fill,
  ELEMENT_EMPHASIS_SHARE, MODALITY_EMPHASIS_SHARE, HEMISPHERE_EMPHASIS_SHARE,
  DEFAULT_MAX_ASPECTS,
  type InterpretOptions,
} from './compose.js';
export { chartFacts, type ChartFacts, type FactAngles, type FactAspect, type FactPosition } from './facts.js';
export { EN_CATALOGUE } from './catalogue/en.js';
export { CATALOGUES, catalogueFor, INTERPRETATION_LOCALES } from './registry.js';
export {
  SECTIONS, HOUSE_NUMBERS, HEMISPHERE_KEYS, INTERPRETED_BODIES,
  type Catalogue, type Delineation, type DelineationBasis, type Factor,
  type HemisphereKey, type HouseNumber, type InterpretationResult,
  type InterpretedBody, type MissingEntry, type SectionId, type Templates,
} from './types.js';
