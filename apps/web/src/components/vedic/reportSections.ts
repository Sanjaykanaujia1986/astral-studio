/**
 * The printed horoscope's section switches. Kept apart from the report itself
 * so the Reports page can draw its checkboxes without loading @astro/vedic.
 */
/** Which parts of the horoscope to print. */
export interface VedicReportSections {
  readonly charts: boolean;
  readonly planets: boolean;
  readonly panchang: boolean;
  readonly dasha: boolean;
  readonly yogas: boolean;
  readonly ashtakavarga: boolean;
  readonly shadbala: boolean;
  readonly sadeSati: boolean;
}

export const ALL_VEDIC_SECTIONS: VedicReportSections = {
  charts: true, planets: true, panchang: true, dasha: true,
  yogas: true, ashtakavarga: true, shadbala: true, sadeSati: true,
};

export const VEDIC_SECTION_KEYS = Object.keys(ALL_VEDIC_SECTIONS) as (keyof VedicReportSections)[];
