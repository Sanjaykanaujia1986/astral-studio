import { describe, it, expect } from 'vitest';
import {
  paperSpec,
  pageCss,
  mmToPx,
  pxToMm,
  wheelSizeMm,
  PAPER_SIZES,
  DEFAULT_MARGIN_MM,
} from '../src/report/paper.js';

describe('paper dimensions', () => {
  it('uses the ISO 216 sizes', () => {
    expect(PAPER_SIZES.a4).toEqual({ widthMm: 210, heightMm: 297 });
    expect(PAPER_SIZES.a3).toEqual({ widthMm: 297, heightMm: 420 });
  });

  it('keeps the ISO relationship: A3 is A4 doubled along the short edge', () => {
    // Independent check on the constants. If either were mistyped, this fails
    // even though each looks plausible on its own.
    expect(PAPER_SIZES.a3.widthMm).toBe(PAPER_SIZES.a4.heightMm);
    expect(PAPER_SIZES.a3.heightMm).toBeCloseTo(PAPER_SIZES.a4.widthMm * 2, 0);
  });

  it('swaps the dimensions for landscape', () => {
    const portrait = paperSpec('a4', 'portrait');
    const landscape = paperSpec('a4', 'landscape');
    expect(portrait.widthMm).toBe(landscape.heightMm);
    expect(portrait.heightMm).toBe(landscape.widthMm);
  });

  it('subtracts the margin from both edges', () => {
    const spec = paperSpec('a4', 'portrait', 20);
    expect(spec.contentWidthMm).toBe(210 - 40);
    expect(spec.contentHeightMm).toBe(297 - 40);
  });

  it('defaults to a margin that clears a typical printer edge', () => {
    expect(paperSpec('a4', 'portrait').marginMm).toBe(DEFAULT_MARGIN_MM);
    expect(DEFAULT_MARGIN_MM).toBeGreaterThanOrEqual(10);
  });

  it('refuses a margin that would leave nothing to print on', () => {
    expect(() => paperSpec('a4', 'portrait', 105)).toThrow(/printable area/);
    expect(() => paperSpec('a4', 'portrait', -1)).toThrow(/printable area/);
  });
});

describe('unit conversion', () => {
  it('matches the CSS definition: 96px = 1in = 25.4mm', () => {
    /*
     * Checked to within a part in 10^12, not for bit equality. 25.4 has no
     * exact binary representation, so mmToPx(25.4) lands on 95.99999999999999
     * — an error of 1e-14 px, roughly a ten-thousandth of an atom across a
     * page. The conversion is correct; the arithmetic is merely binary.
     */
    expect(mmToPx(25.4)).toBeCloseTo(96, 12);
    expect(pxToMm(96)).toBeCloseTo(25.4, 12);
  });

  it('round-trips', () => {
    for (const mm of [1, 15, 210, 297, 420]) {
      expect(pxToMm(mmToPx(mm))).toBeCloseTo(mm, 10);
    }
  });
});

describe('wheelSizeMm', () => {
  it('fits the square to the smaller edge of the content box', () => {
    // Portrait is narrower than it is tall, so width binds.
    expect(wheelSizeMm(paperSpec('a4', 'portrait'))).toBe(210 - 30);
    // Landscape is wider than it is tall, so height binds. Fitting to width
    // here would push the wheel off the bottom of the page.
    expect(wheelSizeMm(paperSpec('a4', 'landscape'))).toBe(210 - 30);
  });

  it('accounts for space reserved above and below', () => {
    const spec = paperSpec('a3', 'landscape');
    expect(wheelSizeMm(spec, 60)).toBe(spec.contentHeightMm - 60);
  });

  it('never returns a negative size', () => {
    expect(wheelSizeMm(paperSpec('a4', 'portrait'), 10_000)).toBe(0);
  });
});

describe('the generated print stylesheet', () => {
  it('states the paper size explicitly', () => {
    // Without this the browser lays out for its default paper and every page
    // break lands in the wrong place.
    expect(pageCss(paperSpec('a3', 'landscape'))).toContain('size: 420mm 297mm');
    expect(pageCss(paperSpec('a4', 'portrait'))).toContain('size: 210mm 297mm');
  });

  it('uses no CSS custom properties', () => {
    // Same rule as the chart theme: a standalone print renderer has no
    // cascade, and every var() would resolve to nothing.
    for (const size of ['a4', 'a3'] as const) {
      for (const orientation of ['portrait', 'landscape'] as const) {
        expect(pageCss(paperSpec(size, orientation))).not.toContain('var(--');
      }
    }
  });

  it('protects rows and headings from page breaks', () => {
    const css = pageCss(paperSpec('a4', 'portrait'));
    expect(css).toContain('break-inside: avoid');
    expect(css).toContain('.report-heading { break-after: avoid; }');
    // Repeating the header on a table that spills onto a second sheet.
    expect(css).toContain('thead { display: table-header-group; }');
  });

  it('starts each explicit page on a new sheet, except the last', () => {
    const css = pageCss(paperSpec('a4', 'portrait'));
    expect(css).toContain('break-after: page');
    expect(css).toContain('.report-page:last-child { break-after: auto; }');
  });

  it('removes the simulated page chrome when printing', () => {
    // On screen the pages are cards with a border, a shadow and padding that
    // stands in for the margin. On paper the @page margin already provides
    // that inset, so leaving the padding in would inset the content twice.
    const css = pageCss(paperSpec('a4', 'portrait'));
    const print = css.slice(css.indexOf('@media print'), css.indexOf('@media screen'));
    expect(print).toContain('box-shadow: none');
    expect(print).toContain('padding: 0');
  });
});
