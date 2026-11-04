/**
 * Astral Studio design tokens.
 *
 * Deep navy, warm ivory, muted gold.
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
  /** Muted gold. Used for emphasis, never as body text. */
  readonly accent: string;
  /** Accent on a surface, darkened enough to read as text. */
  readonly accentInk: string;
  /** Navy brand tone, for the nav rail and headers. */
  readonly brand: string;
  readonly onBrand: string;
  /** Status colours. `*Ink` variants are the readable-on-surface forms. */
  readonly danger: string;
  readonly dangerInk: string;
  readonly warning: string;
  readonly warningInk: string;
  readonly success: string;
  readonly successInk: string;
  /** Focus ring. Must clear 3:1 against both canvas and surface. */
  readonly focus: string;
}

/**
 * Light theme — warm ivory ground.
 *
 * Ivory rather than white on purpose: a chart wheel printed on pure white has
 * no visual containment, and long tables of degrees are easier on an off-white.
 */
export const LIGHT_TOKENS: ColorTokens = {
  canvas: '#f7f4ed',
  surface: '#fffdf8',
  raised: '#ffffff',
  ink: '#161d2b',
  inkMuted: '#5a6271',
  onAccent: '#1a1206',
  border: '#ddd6c7',
  borderStrong: '#8c8371',
  accent: '#a98437',
  accentInk: '#6d5420',
  brand: '#141d32',
  onBrand: '#f2efe6',
  danger: '#b3261e',
  dangerInk: '#8c1d17',
  warning: '#8a5a00',
  warningInk: '#6b4600',
  success: '#1c6b45',
  successInk: '#145235',
  focus: '#2f5fb3',
};

/**
 * Dark theme — deep navy ground.
 *
 * Not a mechanical inversion. Gold has to lighten considerably to read on
 * navy, and the status colours need their own dark-ground values; swapping the
 * light ones would put several below 4.5:1.
 */
export const DARK_TOKENS: ColorTokens = {
  canvas: '#0d1322',
  surface: '#151d30',
  raised: '#1d273e',
  ink: '#eceadf',
  inkMuted: '#a7b0c2',
  onAccent: '#161004',
  border: '#2b3650',
  borderStrong: '#6b7896',
  accent: '#d9b367',
  accentInk: '#e4c488',
  brand: '#0a0f1c',
  onBrand: '#eceadf',
  danger: '#ef8a80',
  dangerInk: '#f4a69e',
  warning: '#e0b25c',
  warningInk: '#ecc689',
  success: '#6fcf9b',
  successInk: '#8fdbb1',
  focus: '#7aa7f0',
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
