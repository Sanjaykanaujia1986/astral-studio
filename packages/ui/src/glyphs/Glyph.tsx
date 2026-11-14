/**
 * Zodiac, planet and aspect glyphs as React components.
 *
 * Two forms of the same drawings (see `paths.ts`):
 *
 * - `SignGlyph`, `BodyGlyph`, `AspectGlyph` — inline `<svg>` for HTML. They
 *   size with the text (1.15em) and take `currentColor`, so they follow the
 *   theme and any colour a table cell already has.
 * - `svgGlyph` — a `<g>` for drawing INSIDE another SVG (the chart wheel, the
 *   Vedic chart). It is a transform plus literal colours, so the figure stays
 *   self-contained for print and standalone rasterisers.
 *
 * A body or aspect with no drawing (the quintile family) falls back to its
 * text abbreviation rather than to a font glyph that may not exist.
 */
import type { CSSProperties, JSX } from 'react';
import type { AspectName, Body, Element, SignName } from '@astro/engine';
import { ASPECT_PATHS, BODY_PATHS, SIGN_PATHS, type GlyphPath } from './paths.js';
import { ASPECT_GLYPHS, BODY_GLYPHS } from '../chart-wheel/glyphs.js';

const ORDER: readonly SignName[] = [
  'aries', 'taurus', 'gemini', 'cancer', 'leo', 'virgo',
  'libra', 'scorpio', 'sagittarius', 'capricorn', 'aquarius', 'pisces',
];
const ELEMENTS: readonly Element[] = ['fire', 'earth', 'air', 'water'];

/** Fire, earth, air, water, in zodiac order. */
export function elementOfSign(sign: SignName): Element {
  return ELEMENTS[ORDER.indexOf(sign) % 4]!;
}

export interface GlyphProps {
  /** CSS size; defaults to 1.15em so the glyph sits with the surrounding text. */
  readonly size?: number | string;
  /** Stroke width in grid units (the drawing is 24 units square). */
  readonly strokeWidth?: number;
  /** Accessible name. Without it the glyph is decorative and hidden from assistive tech. */
  readonly title?: string;
  readonly className?: string;
  readonly style?: CSSProperties;
}

function Icon({ g, size = '1.15em', strokeWidth = 1.75, title, className, style }: GlyphProps & { readonly g: GlyphPath }): JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24" width={size} height={size}
      fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"
      focusable="false"
      {...(title ? { role: 'img', 'aria-label': title } : { 'aria-hidden': true })}
      className={['as-glyph', className].filter(Boolean).join(' ')}
      style={{ display: 'inline-block', verticalAlign: '-0.22em', flex: 'none', overflow: 'visible', ...style }}
    >
      {title ? <title>{title}</title> : null}
      <path d={g.d} />
      {g.fill ? <path d={g.fill} fill="currentColor" stroke="none" /> : null}
    </svg>
  );
}

/** A zodiac sign. `tinted` colours it by element (the `as-el-*` utilities). */
export function SignGlyph({ sign, tinted = false, className, ...rest }: GlyphProps & {
  readonly sign: SignName; readonly tinted?: boolean;
}): JSX.Element {
  return (
    <Icon g={SIGN_PATHS[sign]} {...rest}
      {...(tinted || className ? { className: [tinted ? `as-el-${elementOfSign(sign)}` : '', className ?? ''].filter(Boolean).join(' ') } : {})} />
  );
}

/** A planet, node or point. */
export function BodyGlyph({ body, ...rest }: GlyphProps & { readonly body: Body | string }): JSX.Element {
  const g = BODY_PATHS[body as Body];
  if (g) return <Icon g={g} {...rest} />;
  return <span aria-hidden="true" className={rest.className}>{BODY_GLYPHS[body as Body]?.abbreviation ?? body.slice(0, 2)}</span>;
}

/** An aspect. The quintile family has no drawing and prints its text symbol. */
export function AspectGlyph({ aspect, ...rest }: GlyphProps & { readonly aspect: AspectName }): JSX.Element {
  const g = ASPECT_PATHS[aspect];
  if (g) return <Icon g={g} {...rest} />;
  return <span aria-hidden="true" className={rest.className} style={rest.style}>{ASPECT_GLYPHS[aspect].symbol}</span>;
}

/**
 * A glyph inside another SVG, centred on (x, y) and `size` user units across.
 * `strokeWidth` is in grid units, so it scales with the glyph. `name` becomes
 * the React key and a `data-glyph` attribute (with the centre), so tests and
 * tools can find what was drawn where without parsing path data.
 */
export function svgGlyph(g: GlyphPath, x: number, y: number, size: number, colour: string, strokeWidth = 1.8, name?: string): JSX.Element {
  const k = size / 24;
  return (
    <g key={name} {...(name ? { 'data-glyph': name, 'data-cx': x.toFixed(2), 'data-cy': y.toFixed(2) } : {})} transform={`translate(${(x - size / 2).toFixed(2)} ${(y - size / 2).toFixed(2)}) scale(${k.toFixed(4)})`}
      fill="none" stroke={colour} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <path d={g.d} />
      {g.fill ? <path d={g.fill} fill={colour} stroke="none" /> : null}
    </g>
  );
}

export { SIGN_PATHS, BODY_PATHS, ASPECT_PATHS };
