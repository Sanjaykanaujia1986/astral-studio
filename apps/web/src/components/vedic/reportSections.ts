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

/** The complete booklet's switches: groups of sheets, in the order they print. */
export interface KundliSections {
  readonly charts: boolean;
  readonly vargas: boolean;
  readonly tables: boolean;
  readonly strength: boolean;
  readonly yogas: boolean;
  readonly dasha: boolean;
  readonly otherDashas: boolean;
  readonly kp: boolean;
  readonly western: boolean;
  readonly annual: boolean;
  readonly transits: boolean;
  readonly matching: boolean;
}

export const ALL_KUNDLI_SECTIONS: KundliSections = {
  charts: true, vargas: true, tables: true, strength: true, yogas: true, dasha: true,
  otherDashas: true, kp: true, western: true, annual: true, transits: true, matching: true,
};

export const KUNDLI_SECTION_KEYS = Object.keys(ALL_KUNDLI_SECTIONS) as (keyof KundliSections)[];
