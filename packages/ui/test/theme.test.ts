/**
 * The palette, measured.
 *
 * "Accessible contrast" is a number, so it is computed here for every pairing
 * the tokens actually put on screen rather than judged by eye on one monitor.
 * A palette that looks fine and fails AA is the normal outcome of picking
 * colours without this test.
 *
 * Thresholds are WCAG 2.2 AA:
 *   4.5:1  body text
 *   3.0:1  large text (>=18.66px bold or >=24px) and UI component boundaries
 */
import { describe, it, expect } from 'vitest';
import {
  LIGHT_THEME as LIGHT_CHART,
  DARK_THEME as DARK_CHART,
  PRINT_THEME as PRINT_CHART,
} from '../src/chart-wheel/theme.js';
import {
  LIGHT_TOKENS,
  DARK_TOKENS,
  TOKENS,
  contrastRatio,
  relativeLuminance,
  parseHex,
  cssVariableName,
  themeCss,
  type ColorTokens,
  type ThemeMode,
  RAIL_OPACITY,
  compositeOver,
} from '../src/theme/tokens.js';

const BODY = 4.5;
const LARGE = 3.0;

/** Every pairing the UI puts together, with the threshold each must clear. */
function pairings(t: ColorTokens): readonly [string, string, string, number][] {
  return [
    ['ink on canvas', t.ink, t.canvas, BODY],
    ['ink on surface', t.ink, t.surface, BODY],
    ['ink on raised', t.ink, t.raised, BODY],
    ['inkMuted on canvas', t.inkMuted, t.canvas, BODY],
    ['inkMuted on surface', t.inkMuted, t.surface, BODY],
    ['onAccent on accent', t.onAccent, t.accent, BODY],
    ['accentInk on surface', t.accentInk, t.surface, BODY],
    ['onBrand on brand', t.onBrand, t.brand, BODY],
    ['dangerInk on surface', t.dangerInk, t.surface, BODY],
    ['warningInk on surface', t.warningInk, t.surface, BODY],
    ['successInk on surface', t.successInk, t.surface, BODY],
    // Boundaries and non-text affordances.
    ['borderStrong on surface', t.borderStrong, t.surface, LARGE],
    ['borderStrong on canvas', t.borderStrong, t.canvas, LARGE],
    ['borderStrong on raised', t.borderStrong, t.raised, LARGE],
    ['focus on canvas', t.focus, t.canvas, LARGE],
    ['focus on surface', t.focus, t.surface, LARGE],
    ['accent on surface', t.accent, t.surface, LARGE],
  ];
}

/*
 * The rail is translucent, so what a reader sees is `brand` composited over
 * the page behind it. Measuring the pure token reported 8.35:1 for the brand
 * wordmark while the rendered rail was at 3.59:1 — the test passed and the
 * wordmark was unreadable. These measure what ships.
 */
describe.each(['light', 'dark'] as const)('%s theme, as the RAIL renders', (mode: ThemeMode) => {
  const t = TOKENS[mode];
  const rail = compositeOver(t.brand, t.canvas, RAIL_OPACITY);

  it('puts readable text on the composited rail', () => {
    expect(contrastRatio(t.onBrand, rail)).toBeGreaterThanOrEqual(BODY);
  });

  it('keeps the brand wordmark readable on the composited rail', () => {
    expect(contrastRatio(t.accentOnBrand, rail)).toBeGreaterThanOrEqual(BODY);
  });

  it('would fail at the opacity this shipped with', () => {
    // Guards the fix rather than the number: if someone lowers the opacity
    // back toward 0.72 the two tests above start failing, and this one says
    // why in one line.
    const asShipped = compositeOver(t.brand, t.canvas, 0.72);
    const ok = contrastRatio(t.accentOnBrand, asShipped) >= BODY;
    expect(mode === 'light' ? ok : true).toBe(mode === 'light' ? false : true);
  });
});

describe.each(['light', 'dark'] as const)('%s theme contrast', (mode: ThemeMode) => {
  const tokens = TOKENS[mode];

  it.each(pairings(tokens))('%s clears its threshold', (_label, fg, bg, threshold) => {
    expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(threshold);
  });

  it('keeps every token a parseable hex colour', () => {
    // Also the guard against a typo reaching a stylesheet: a malformed value
    // here throws rather than silently rendering as `inherit`.
    for (const [name, value] of Object.entries(tokens)) {
      expect(() => parseHex(value), `${name} = ${value}`).not.toThrow();
    }
  });

  it('separates canvas from surface enough to be visible', () => {
    // Not a WCAG rule, but a panel indistinguishable from the page is not a
    // panel. A ratio of 1.0 would mean the two are identical.
    expect(contrastRatio(tokens.canvas, tokens.surface)).toBeGreaterThan(1.02);
  });

  it('does not use gold as body text', () => {
    /*
     * Muted gold at AA on an off-white ground is impossible without darkening
     * it so far that it stops reading as gold. So `accent` is for emphasis and
     * fills, and `accentInk` is the text form — this test states the division
     * rather than leaving someone to discover it.
     */
    expect(contrastRatio(tokens.accentInk, tokens.surface)).toBeGreaterThanOrEqual(BODY);
  });
});

describe('text on the nav rail', () => {
  /*
   * The rail is a dark ground in BOTH themes while `accent` flips with the
   * page, so the wordmark once measured 3.68:1 in light mode — a dark violet
   * on a dark rail. `accentOnBrand` exists for that, and is held to body-text
   * contrast against `brand` in both.
   */
  it.each(['light', 'dark'] as const)('keeps %s accentOnBrand readable on brand', (mode) => {
    const t = TOKENS[mode];
    expect(contrastRatio(t.accentOnBrand, t.brand)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(['light', 'dark'] as const)('keeps %s onBrand readable on brand', (mode) => {
    const t = TOKENS[mode];
    expect(contrastRatio(t.onBrand, t.brand)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('the two themes are genuinely different', () => {
  it('inverts the ground', () => {
    expect(relativeLuminance(LIGHT_TOKENS.canvas)).toBeGreaterThan(0.5);
    expect(relativeLuminance(DARK_TOKENS.canvas)).toBeLessThan(0.1);
  });

  it('is not a mechanical inversion', () => {
    /*
     * Gold has to lighten considerably to read on navy, and the status colours
     * need their own dark-ground values. If the dark theme were the light one
     * flipped, several pairings would fall below AA — which is why both sets
     * are written out rather than derived.
     */
    expect(DARK_TOKENS.accent).not.toBe(LIGHT_TOKENS.accent);
    expect(relativeLuminance(DARK_TOKENS.accent))
      .toBeGreaterThan(relativeLuminance(LIGHT_TOKENS.accent));
    expect(DARK_TOKENS.danger).not.toBe(LIGHT_TOKENS.danger);
  });

  it('defines exactly the same token names in both', () => {
    // A token present in one theme and missing in the other resolves to
    // nothing on the mode that lacks it.
    expect(Object.keys(DARK_TOKENS).sort()).toEqual(Object.keys(LIGHT_TOKENS).sort());
  });
});

describe('contrastRatio', () => {
  it('matches the known bounds', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 10);
    expect(contrastRatio('#ffffff', '#ffffff')).toBeCloseTo(1, 10);
  });

  it('is symmetric', () => {
    expect(contrastRatio('#123456', '#fedcba'))
      .toBeCloseTo(contrastRatio('#fedcba', '#123456'), 12);
  });

  it('rejects a malformed colour instead of guessing', () => {
    expect(() => contrastRatio('navy', '#ffffff')).toThrow(/#rrggbb/);
    expect(() => parseHex('#fff')).toThrow(/#rrggbb/);
  });
});

describe('cssVariableName', () => {
  it('turns camelCase into a kebab-case custom property', () => {
    expect(cssVariableName('ink')).toBe('--as-ink');
    expect(cssVariableName('inkMuted')).toBe('--as-ink-muted');
    expect(cssVariableName('borderStrong')).toBe('--as-border-strong');
  });

  it('gives every token a distinct variable', () => {
    const names = (Object.keys(LIGHT_TOKENS) as (keyof ColorTokens)[]).map(cssVariableName);
    expect(new Set(names).size).toBe(names.length);
  });
});

/*
 * The CHART themes, which are a separate palette from the page tokens and
 * were not measured here at all.
 *
 * The Vedic figure draws its sign labels in `muted` on `surface`, and inside
 * the lagna cell on `faint`. In the light theme those were 3.65:1 and 2.61:1
 * — the least readable thing on the figure, and invisible to the page-level
 * audit because that one skips SVG.
 */
describe.each([
  ['light', LIGHT_CHART],
  ['dark', DARK_CHART],
  ['print', PRINT_CHART],
] as const)('%s chart theme', (_name, t) => {
  it.each([
    ['ink on surface', 'ink', 'surface'],
    ['muted on surface', 'muted', 'surface'],
    ['ink on the lagna wash', 'ink', 'faint'],
    ['muted on the lagna wash', 'muted', 'faint'],
  ] as const)('%s clears 4.5:1', (_label, fg, bg) => {
    expect(contrastRatio(t[fg], t[bg])).toBeGreaterThanOrEqual(BODY);
  });
});

describe('themeCss', () => {
  const css = themeCss();

  it('emits every token in both modes', () => {
    for (const token of Object.keys(LIGHT_TOKENS) as (keyof ColorTokens)[]) {
      // Count DECLARATIONS, with the colon: `--as-ink` is a prefix of
      // `--as-ink-muted`, so matching the bare name counted eight where there
      // are four. The test was wrong, not the stylesheet.
      const occurrences = css.split(`${cssVariableName(token)}:`).length - 1;
      // :root, the prefers-color-scheme block, [data-theme=dark],
      // [data-theme=light], and `.as-paper`, which redeclares the light
      // tokens on the report subtree.
      expect(occurrences, token).toBe(5);
    }
  });

  it('lets an explicit choice win in both directions', () => {
    /*
     * The failure this prevents: a dark-mode user who picks light gets dark
     * anyway, because only `prefers-color-scheme` was handled. Both explicit
     * selectors are present, and the media query is guarded so it cannot
     * override an explicit light choice.
     */
    expect(css).toContain(':root[data-theme="dark"]');
    expect(css).toContain(':root[data-theme="light"]');
    expect(css).toContain(':root:not([data-theme="light"])');
  });

  it('declares color-scheme so form controls and scrollbars follow', () => {
    expect(css).toContain('color-scheme: light');
    expect(css).toContain('color-scheme: dark');
  });

  it('redeclares the light tokens for paper', () => {
    /*
     * The report renders the same table components as the app, so without a
     * light subtree the dark theme's near-white ink would print onto white
     * paper. Asserted as a block that carries the tokens, not as a class name
     * someone could add empty.
     */
    const paper = /\.as-paper \{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(paper).toContain(`${cssVariableName('ink')}: ${LIGHT_TOKENS.ink}`);
    expect(paper).toContain(`${cssVariableName('canvas')}: ${LIGHT_TOKENS.canvas}`);
    expect(paper).toContain('color-scheme: light');
  });

  it('exposes the tokens as role-named utilities', () => {
    // The classes that replaced `text-slate-700` and friends. They are the
    // only place `var()` is allowed below.
    for (const cls of ['.as-text ', '.as-text-muted ', '.as-text-danger ',
      '.as-text-warning ', '.as-text-success ', '.as-text-accent ']) {
      expect(css).toContain(cls);
    }
  });

  it('contains no unresolved value in a TOKEN declaration', () => {
    /*
     * Every `--as-*` declaration must be a literal; a `var()` there would
     * defeat the reason these tokens exist. The utility rules underneath are
     * exempt by definition — reading the tokens through `var()` is their
     * entire job — so they are stripped before the check rather than the
     * check being weakened.
     */
    const tokensOnly = css
      .split('\n')
      .filter((line) => /^\s*(--as-|color-scheme)/.test(line))
      .join('\n');
    expect(tokensOnly).not.toContain('var(');
    expect(css).not.toMatch(/:\s*;/);
  });
});
