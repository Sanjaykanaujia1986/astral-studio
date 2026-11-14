/**
 * Astral Studio design tokens.
 *
 * Deep violet on near-black, with a lavender day mode.
 *
 * ## The palette changed, and why that was allowed to break a rule
 *
 * An earlier spec said "deep navy, warm ivory, muted gold — no cosmic
 * backgrounds". The product owner asked for the cosmic treatment, which is
 * their call. What did NOT change is that contrast is measured: every value
 * below was computed against WCAG before it was written here, not picked
 * because it looked right on one monitor. Violet on near-black is precisely
 * the palette where legibility fails quietly.
 *
 * ## Why these are literal values in TypeScript
 *
 * The same reason the chart theme is: a token that only resolves inside a live
 * browser cascade renders as nothing in a standalone rasteriser, and this
 * product prints. The tokens are plain data, emitted as CSS custom properties
 * for the app and readable directly by anything that cannot wait for a cascade.
 *
 * ## Why contrast is computed, not asserted
 *
 * "Accessible contrast" is a measurable property, so `theme.test.ts` computes
 * the WCAG ratio for every foreground/background pair these tokens put
 * together and fails below 4.5:1 for body text, 3:1 for large text and UI
 * boundaries. Picking colours that look fine on this monitor is not the same
 * check, and is the usual way a palette ships failing.
 */

export type ThemeMode = 'light' | 'dark';

export interface ColorTokens {
  /** Page background. */
  readonly canvas: string;
  /** Raised surface: cards, panels, the chart mount. */
  readonly surface: string;
  /** A surface one step above `surface` — menus, popovers. */
  readonly raised: string;
  /** Primary body text. */
  readonly ink: string;
  /** Secondary text: labels, captions, hints. */
  readonly inkMuted: string;
  /** Text on top of `accent`. */
  readonly onAccent: string;
  /** Hairlines and table rules. */
  readonly border: string;
  /**
   * Stronger border: focused fields, active edges, control outlines.
   *
   * Held to 3:1 against canvas, surface AND raised, because WCAG 1.4.11 covers
   * boundaries that identify a control. The first values chosen here looked
   * right and measured 2.1-2.5:1 — the contrast test caught them. `border` is
   * the decorative hairline and is deliberately exempt.
   */
  readonly borderStrong: string;
  /** Neon violet. Used for emphasis and CTAs, never as body text. */
  readonly accent: string;
  /** Accent on a surface, darkened enough to read as text. */
  readonly accentInk: string;
  /** The deepest tone, for the nav rail and headers. */
  readonly brand: string;
  readonly onBrand: string;
  /**
   * The accent, lightened to read on `brand`.
   *
   * The rail is a dark ground in BOTH modes, while `accent` flips with the
   * page. Using `accent` for the wordmark therefore measured 3.68:1 in light
   * mode — a dark violet on a dark rail. This token is held to 4.5:1 against
   * `brand` in both themes instead.
   */
  readonly accentOnBrand: string;
  /** Status colours. `*Ink` variants are the readable-on-surface forms. */
  readonly danger: string;
  readonly dangerInk: string;
  readonly warning: string;
  readonly warningInk: string;
  readonly success: string;
  readonly successInk: string;
  /** Focus ring. Must clear 3:1 against both canvas and surface. */
  readonly focus: string;
  /**
   * Element colours for the zodiac glyphs: fire, earth, air, water. The same
   * hues as the chart wheel's sign ring, so a sign reads the same colour in a
   * table as on the wheel. Glyphs are graphics, held to 3:1 against every
   * ground; the light values were darkened until they clear it.
   */
  readonly elFire: string;
  readonly elEarth: string;
  readonly elAir: string;
  readonly elWater: string;
}

/**
 * Light theme — pale lavender ground.
 *
 * Tinted rather than pure white on purpose: a chart wheel printed on pure
 * white has no visual containment, long tables of degrees are easier on an
 * off-white, and the violet cast keeps the two modes recognisably one product
 * rather than two.
 */
export const LIGHT_TOKENS: ColorTokens = {
  canvas: '#f4f1fb',
  surface: '#fdfcff',
  raised: '#ffffff',
  ink: '#1a1033',
  inkMuted: '#595073',
  onAccent: '#ffffff',
  border: '#ded6f0',
  borderStrong: '#8a7fae',
  accent: '#7c3aed',
  accentInk: '#6425d0',
  brand: '#1b0f3a',
  onBrand: '#f3effc',
  accentOnBrand: '#c4a0ff',
  danger: '#b3261e',
  dangerInk: '#8c1d17',
  warning: '#8a5a00',
  warningInk: '#6b4600',
  success: '#1c6b45',
  successInk: '#145235',
  focus: '#5b2bc4',
  elFire: '#c2381f',
  elEarth: '#1f7a4d',
  elAir: '#9a6a0e',
  elWater: '#1d6fa5',
};

/**
 * Dark theme — near-black violet ground. The primary mode: the references
 * this was designed against are all night skies.
 *
 * Not a mechanical inversion. The accent violet has to lighten considerably
 * to read as text, which is why `accentInk` exists and differs from `accent`,
 * and the status colours need their own dark-ground values; swapping the
 * light ones would put several below 4.5:1.
 */
export const DARK_TOKENS: ColorTokens = {
  canvas: '#0a0616',
  surface: '#140c2b',
  raised: '#1f1342',
  ink: '#f3effc',
  inkMuted: '#b6abd6',
  onAccent: '#12031f',
  border: '#2e2050',
  borderStrong: '#7a6aa8',
  accent: '#a855f7',
  accentInk: '#cba6ff',
  brand: '#080412',
  onBrand: '#f3effc',
  accentOnBrand: '#cba6ff',
  danger: '#ff8f8a',
  dangerInk: '#ffaba6',
  warning: '#f0c069',
  warningInk: '#f6d394',
  success: '#6fe0a8',
  successInk: '#93ebc0',
  focus: '#b98cff',
  elFire: '#f0785f',
  elEarth: '#4cb583',
  elAir: '#e0b44a',
  elWater: '#5aa9dd',
};

/** Spacing scale, in rem. A 4px base at the default root size. */
export const SPACE = {
  '0': '0',
  '1': '0.25rem',
  '2': '0.5rem',
  '3': '0.75rem',
  '4': '1rem',
  '5': '1.5rem',
  '6': '2rem',
  '7': '3rem',
  '8': '4rem',
} as const;

export const RADIUS = {
  sm: '0.25rem',
  md: '0.5rem',
  lg: '0.75rem',
  full: '9999px',
} as const;

/**
 * Type stacks.
 *
 * `numeric` is a tabular-figure stack: a column of degrees that does not align
 * is harder to scan than one in a less handsome typeface. `glyph` keeps the
 * astrological-symbol fallback chain the chart wheel already relies on.
 */
export const FONTS = {
  sans: "'Inter var', Inter, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif",
  serif: "'Source Serif 4', Georgia, 'Times New Roman', serif",
  numeric: "ui-monospace, 'SF Mono', 'Cascadia Mono', Menlo, Consolas, monospace",
} as const;

export const TOKENS: Readonly<Record<ThemeMode, ColorTokens>> = {
  light: LIGHT_TOKENS,
  dark: DARK_TOKENS,
};

/** Token name -> CSS custom property name. */
/**
 * How opaque the nav rail is over the page behind it.
 *
 * It lives here, beside the tokens, because it is part of what decides
 * whether the text on the rail is readable. The rail shipped at 0.72 and the
 * contrast test passed the whole time — the test measured `accentOnBrand`
 * against the pure `brand` token at 8.35:1, while the rail a reader actually
 * saw composited to 3.59:1 over the light canvas.
 *
 * So the stylesheet reads it from `--as-rail-opacity` and the test composites
 * with the same number. One value, or the two drift again.
 */
export const RAIL_OPACITY = 0.88;

/** `base` laid over `behind` at `alpha`, the way CSS composites in sRGB. */
export function compositeOver(base: string, behind: string, alpha: number): string {
  const channels = (h: string): number[] =>
    [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const a = channels(base);
  const b = channels(behind);
  return `#${a
    .map((v, i) => Math.round(v * alpha + b[i]! * (1 - alpha)).toString(16).padStart(2, '0'))
    .join('')}`;
}

export function cssVariableName(token: keyof ColorTokens): string {
  return `--as-${token.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;
}

/**
 * The tokens as a CSS rule set for both modes.
 *
 * Dark is delivered three ways on purpose, matching how a theme is actually
 * chosen: an explicit `[data-theme]` choice wins in both directions, and the
 * system preference applies only when no explicit choice is stamped.
 */
export function themeCss(): string {
  const declarations = (tokens: ColorTokens, indent: string): string =>
    (Object.keys(tokens) as (keyof ColorTokens)[])
      .map((key) => `${indent}${cssVariableName(key)}: ${tokens[key]};`)
      .join('\n');

  return [
    ':root {',
    declarations(LIGHT_TOKENS, '  '),
    `  --as-font-sans: ${FONTS.sans};`,
    `  --as-font-serif: ${FONTS.serif};`,
    `  --as-font-numeric: ${FONTS.numeric};`,
    `  --as-rail-opacity: ${RAIL_OPACITY};`,
    '  color-scheme: light;',
    '}',
    '',
    '@media (prefers-color-scheme: dark) {',
    '  :root:not([data-theme="light"]) {',
    declarations(DARK_TOKENS, '    '),
    '    color-scheme: dark;',
    '  }',
    '}',
    '',
    ':root[data-theme="dark"] {',
    declarations(DARK_TOKENS, '  '),
    '  color-scheme: dark;',
    '}',
    '',
    ':root[data-theme="light"] {',
    declarations(LIGHT_TOKENS, '  '),
    '  color-scheme: light;',
    '}',
    '',
    /*
     * Paper.
     *
     * A printed document is on white whatever the screen is doing, and the
     * report reuses the SAME table components as the app. Without this the
     * tables would inherit the dark theme's near-white ink onto paper. The
     * light tokens are redeclared on the subtree rather than on the root, so
     * the document is light while the page around it stays as the reader set
     * it.
     */
    '.as-paper {',
    declarations(LIGHT_TOKENS, '  '),
    '  color-scheme: light;',
    '}',
    '',
    /*
     * Utilities named after a ROLE, not a swatch.
     *
     * Emitted beside the tokens so they cannot drift from them, and so the
     * report document gets them too. The palette classes they replace
     * (`text-slate-700`, `text-rose-700`, ...) were chosen against the
     * original ivory theme and never re-measured after the redesign: on the
     * dark theme they came out at 1.84:1 and 3.16:1.
     */
    '.as-text { color: var(--as-ink); }',
    '.as-text-muted { color: var(--as-ink-muted); }',
    '.as-text-danger { color: var(--as-danger-ink); }',
    '.as-text-warning { color: var(--as-warning-ink); }',
    '.as-text-success { color: var(--as-success-ink); }',
    '.as-text-accent { color: var(--as-accent-ink); }',
    '.as-el-fire { color: var(--as-el-fire); }',
    '.as-el-earth { color: var(--as-el-earth); }',
    '.as-el-air { color: var(--as-el-air); }',
    '.as-el-water { color: var(--as-el-water); }',
    '.as-border-strong { border-color: var(--as-border-strong); }',
    '.as-border-hair { border-color: var(--as-border); }',
    '.as-surface-solid { background-color: var(--as-raised); }',
    // A panel set INTO a card, and the hover tint. Both derive from the ink,
    // so they darken a light theme and lighten a dark one without naming a
    // colour for either.
    '.as-surface-inset {',
    '  background-color: color-mix(in srgb, var(--as-ink) 7%, transparent);',
    '}',
    /*
     * Calendar density bands. Three steps of accent mixed INTO an opaque
     * surface, rather than three fixed pale blues — those were chosen for the
     * ivory theme and left a near-white cell on the night sky, with themed
     * ink on top of it at 1.06:1.
     */
    '.as-density-1 {',
    '  background-color: color-mix(in srgb, var(--as-accent) 14%, var(--as-raised));',
    '}',
    '.as-density-2 {',
    '  background-color: color-mix(in srgb, var(--as-accent) 26%, var(--as-raised));',
    '}',
    '.as-density-3 {',
    '  background-color: color-mix(in srgb, var(--as-accent) 40%, var(--as-raised));',
    '}',
    '.as-hover-inset:hover {',
    '  background-color: color-mix(in srgb, var(--as-ink) 10%, transparent);',
    '}',
    '.as-hover-tint:hover {',
    '  background-color: color-mix(in srgb, var(--as-ink) 12%, transparent);',
    '}',
  ].join('\n');
}

// --------------------------------------------------------------------------
// Contrast
// --------------------------------------------------------------------------

/** Parse `#rrggbb` into 0-255 channels. */
export function parseHex(hex: string): readonly [number, number, number] {
  const match = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) throw new RangeError(`expected #rrggbb, received ${hex}`);
  const value = Number.parseInt(match[1]!, 16);
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}

/** Relative luminance, per WCAG 2.x. */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = parseHex(hex).map((channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio, 1..21. Symmetric in its arguments. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [lighter, darker] = la > lb ? [la, lb] : [lb, la];
  return (lighter + 0.05) / (darker + 0.05);
}
