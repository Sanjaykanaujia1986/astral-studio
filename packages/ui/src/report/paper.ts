/**
 * Page geometry for printed reports.
 *
 * Pure arithmetic, no DOM: the page box, the printable area inside the
 * margins, and the CSS that tells the browser what paper it is aiming at.
 * Keeping it separate from the components means the layout maths can be tested
 * without rendering anything.
 *
 * ## Why millimetres, and why the browser's own print path
 *
 * A chart wheel is vector. Handing it to a JavaScript PDF library would mean
 * either rasterising it — throwing away the precision the engine works so hard
 * for — or reimplementing text shaping and font embedding badly. The browser's
 * print pipeline already does both correctly, keeps the SVG as vector, embeds a
 * subset of whatever font actually rendered the glyphs, and needs no
 * dependency, no network and no server. "Save as PDF" in the print dialog is
 * therefore the export path.
 *
 * The trade-off is real and worth stating: the application cannot write a PDF
 * file on its own, and the reader has to pick the destination. That is
 * acceptable here. Silently downgrading a vector chart to a bitmap would not
 * be.
 *
 * The one thing the browser will not infer is the paper. `@page { size }` must
 * be emitted explicitly, or an A3 landscape report gets laid out for whatever
 * the printer defaults to and every page break lands in the wrong place.
 */

export type PaperSize = 'a4' | 'a3';
export type Orientation = 'portrait' | 'landscape';

/** ISO 216 dimensions, portrait, in millimetres. */
export const PAPER_SIZES: Readonly<Record<PaperSize, { readonly widthMm: number; readonly heightMm: number }>> = {
  a4: { widthMm: 210, heightMm: 297 },
  a3: { widthMm: 297, heightMm: 420 },
};

/**
 * Default margin.
 *
 * 15mm clears the unprintable edge of essentially every consumer printer
 * (typically 5-10mm) with room to spare, and leaves a comfortable text measure
 * on A4 portrait.
 */
export const DEFAULT_MARGIN_MM = 15;

/** CSS reference pixels per inch. Fixed by the CSS specification, not by the device. */
export const CSS_DPI = 96;
export const MM_PER_INCH = 25.4;

export interface PaperSpec {
  readonly size: PaperSize;
  readonly orientation: Orientation;
  /** Page width in mm, after orientation is applied. */
  readonly widthMm: number;
  readonly heightMm: number;
  readonly marginMm: number;
  /** Printable area inside the margins. */
  readonly contentWidthMm: number;
  readonly contentHeightMm: number;
}

/** Millimetres to CSS pixels. Exact: 96px = 1in = 25.4mm. */
export function mmToPx(mm: number): number {
  return (mm * CSS_DPI) / MM_PER_INCH;
}

export function pxToMm(px: number): number {
  return (px * MM_PER_INCH) / CSS_DPI;
}

/**
 * Resolve a paper choice into a page box.
 *
 * Landscape swaps the dimensions rather than rotating the content, because
 * `@page { size: 297mm 210mm }` is what the browser actually needs; giving it
 * the portrait numbers and rotating with a transform produces a page that
 * previews correctly and prints wrong.
 */
export function paperSpec(
  size: PaperSize,
  orientation: Orientation,
  marginMm: number = DEFAULT_MARGIN_MM,
): PaperSpec {
  const base = PAPER_SIZES[size];
  const widthMm = orientation === 'portrait' ? base.widthMm : base.heightMm;
  const heightMm = orientation === 'portrait' ? base.heightMm : base.widthMm;

  if (marginMm < 0 || marginMm * 2 >= Math.min(widthMm, heightMm)) {
    throw new RangeError(
      `margin ${marginMm}mm leaves no printable area on ${size} ${orientation}`,
    );
  }

  return {
    size,
    orientation,
    widthMm,
    heightMm,
    marginMm,
    contentWidthMm: widthMm - marginMm * 2,
    contentHeightMm: heightMm - marginMm * 2,
  };
}

/**
 * Largest square that fits the printable area, less any space reserved for a
 * heading and a footer on the same page.
 *
 * The wheel is square; fitting it to the width alone overflows a landscape
 * page, and fitting to the height alone wastes a portrait one.
 */
export function wheelSizeMm(spec: PaperSpec, reservedMm = 0): number {
  return Math.max(0, Math.min(spec.contentWidthMm, spec.contentHeightMm - reservedMm));
}

/**
 * Print CSS for a paper spec.
 *
 * Deliberately emits literal values rather than custom properties, for the
 * same reason the chart theme does: this stylesheet has to survive being
 * handed to a print renderer, which has no cascade to resolve `var()` against.
 *
 * `@page` is the load-bearing rule. Everything else guards against the two
 * failure modes that make a printed report unusable — a table row split across
 * a page break, and a section heading stranded at the foot of a page.
 */
export function pageCss(spec: PaperSpec): string {
  const { widthMm, heightMm, marginMm } = spec;
  return [
    `@page { size: ${widthMm}mm ${heightMm}mm; margin: ${marginMm}mm; }`,
    /*
     * Report density, applied on screen as well as on paper so the preview is
     * the document rather than a roomier approximation of it.
     *
     * The tables are the application's own components, sized for a screen at
     * arm's length. At that density twenty-four rows of positions and cusps run
     * past the foot of an A4 page and strand a two-line remainder on a second
     * sheet. 10px is about 7.5pt — the size a printed ephemeris table has used
     * for a century, and comfortably legible on paper where a screen's
     * subpixel blur does not apply.
     */
    '.report-root table { font-size: 10px; }',
    '.report-root th, .report-root td { padding: 2px 6px; }',
    // The tables scroll sideways on a phone; on a page there is nowhere to
    // scroll to, and a hidden overflow would silently clip a column.
    '.report-root .overflow-x-auto { overflow: visible; }',
    '@media print {',
    '  html, body { background: #ffffff; margin: 0; padding: 0; }',
    // On screen the pages are separate cards; on paper the page box IS the
    // page, so the simulated margins and shadows have to come off or the
    // content is inset twice.
    '  .report-page {',
    `    width: ${spec.contentWidthMm}mm;`,
    '    min-height: 0;',
    '    margin: 0;',
    '    padding: 0;',
    '    box-shadow: none;',
    '    border: 0;',
    '    break-after: page;',
    '  }',
    '  .report-page:last-child { break-after: auto; }',
    '  .report-block { break-inside: avoid; }',
    '  .report-heading { break-after: avoid; }',
    '  table { break-inside: auto; }',
    '  tr, img, svg { break-inside: avoid; }',
    '  thead { display: table-header-group; }',
    '  tfoot { display: table-footer-group; }',
    '  a { text-decoration: none; color: inherit; }',
    '}',
    '@media screen {',
    '  .report-page {',
    `    width: ${widthMm}mm;`,
    `    min-height: ${heightMm}mm;`,
    `    padding: ${marginMm}mm;`,
    '    margin: 0 auto 12mm;',
    '    background: #ffffff;',
    '    border: 1px solid #d8dce3;',
    '    box-shadow: 0 1px 3px rgba(15, 23, 42, 0.08);',
    '    box-sizing: border-box;',
    '  }',
    '}',
  ].join('\n');
}
