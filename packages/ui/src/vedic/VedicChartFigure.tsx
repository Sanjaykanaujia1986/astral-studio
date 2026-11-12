/**
 * North and South Indian chart figures.
 *
 * SVG, deterministic, and — like the Western wheel — using literal colours
 * resolved in JavaScript rather than CSS custom properties, so the figure
 * survives being handed to a print renderer that has no cascade.
 *
 * The two layouts answer to different fixed points (signs for South, houses
 * for North), which `layout.ts` handles; this file only draws.
 */
import type { JSX } from 'react';
import { SIGNS } from '@astro/engine';
import { useTranslator } from '@astro/i18n';
import type { VedicChart, Varga } from '@astro/vedic';
import { SIGN_GLYPHS, BODY_GLYPHS, GLYPH_FONT_STACK } from '../chart-wheel/glyphs.js';
import { resolveTheme, type ChartTheme } from '../chart-wheel/theme.js';
import {
  northIndianCells, southIndianCells, signForCell, houseForCell, bodySlots,
  GLYPH_SIZE,
  type VedicLayoutStyle,
} from './layout.js';

export interface VedicChartFigureProps {
  readonly chart: VedicChart;
  readonly style?: VedicLayoutStyle;
  /** Which divisional to draw. Defaults to the rāśi chart. */
  readonly varga?: Varga;
  readonly size?: number;
  readonly theme?: Partial<ChartTheme>;
  /**
   * Accepted and ignored.
   *
   * Kept so a caller that sets it for every figure does not have to special
   * case this one, but a rāśi chart is always drawn with the two-letter
   * graha names — see `GRAHA_NAMES` for why the symbols are not an option
   * here.
   */
  readonly glyphStyle?: 'symbol' | 'abbreviation';
  readonly className?: string;
}

/**
 * The two-letter names a rāśi chart is read by.
 *
 * ## Why this figure does not use the astronomical symbols
 *
 * ☊ and ☋ — Rāhu and Ketu — are the same horseshoe, one of them turned
 * over. At the size a chart cell affords they are not reliably
 * distinguishable, and they are the one pair in a Jyotiṣa chart that must
 * never be confused: they are always opposite, so reading one for the other
 * reflects half the chart. The outer planets have the same problem for a
 * different reason — ♅ ♆ ♇ are not symbols most readers of an Indian chart
 * have memorised.
 *
 * Su/Mo/Ma/Me/Ju/Ve/Sa/Ra/Ke is the convention printed in Indian ephemerides
 * and software, so this is the familiar form rather than a substitute for one.
 * The Western wheel still honours the reader's Glyph style setting; this
 * figure does not, deliberately.
 */
const GRAHA_NAMES: Readonly<Record<string, string>> = {
  sun: 'Su',
  moon: 'Mo',
  mars: 'Ma',
  mercury: 'Me',
  jupiter: 'Ju',
  venus: 'Ve',
  saturn: 'Sa',
  trueNode: 'Ra',
  meanNode: 'Ra',
  southNode: 'Ke',
  meanSouthNode: 'Ke',
  uranus: 'Ur',
  neptune: 'Ne',
  pluto: 'Pl',
  chiron: 'Ch',
  lilith: 'Li',
};

/** Short body label. Vedic charts are crowded; full names do not fit. */
function bodyLabel(body: string): string {
  const name = GRAHA_NAMES[body];
  if (name) return name;
  const glyph = BODY_GLYPHS[body as keyof typeof BODY_GLYPHS];
  return glyph ? glyph.abbreviation : body.slice(0, 2);
}

export function VedicChartFigure({
  chart,
  style = 'north',
  varga = 'D1',
  size = 420,
  theme,
  className,
}: VedicChartFigureProps): JSX.Element {
  const { t } = useTranslator();
  const colours = resolveTheme(theme);
  const cells = style === 'north' ? northIndianCells() : southIndianCells();

  const lagnaSignIndex = chart.lagna?.signIndex ?? 0;

  /*
   * For a divisional chart the bodies' signs come from the varga, not the
   * rāśi. Falling back to the rāśi placements when a varga has not been built
   * would silently draw a D-1 chart under a D-9 heading.
   */
  const vargaChart = chart.vargas[varga];
  const bodiesBySign = new Map<number, string[]>();
  if (varga === 'D1' || !vargaChart) {
    for (const placement of chart.placements) {
      const list = bodiesBySign.get(placement.signIndex) ?? [];
      list.push(bodyLabel(placement.body) + (placement.retrograde ? '℞' : ''));
      bodiesBySign.set(placement.signIndex, list);
    }
  } else {
    for (const placement of vargaChart.placements) {
      const list = bodiesBySign.get(placement.signIndex) ?? [];
      list.push(bodyLabel(placement.body));
      bodiesBySign.set(placement.signIndex, list);
    }
  }

  const effectiveLagna = varga === 'D1' || !vargaChart
    ? lagnaSignIndex
    : vargaChart.lagnaSignIndex;

  const title = t(`vedic.layout.${style}` as 'vedic.layout.north');
  const f = (n: number) => (n * size).toFixed(2);

  return (
    <svg
      className={className}
      viewBox={`0 0 ${size} ${size}`}
      width="100%"
      height="100%"
      role="img"
      aria-label={`${title} — ${varga}`}
      style={{ maxWidth: `${size}px`, height: 'auto', display: 'block' }}
      xmlns="http://www.w3.org/2000/svg"
    >
      <title>{`${title} — ${varga}`}</title>
      <rect x={0} y={0} width={size} height={size} fill={colours.surface} />

      {cells.map((cell, index) => {
        const sign = signForCell(style, index, effectiveLagna);
        const house = houseForCell(style, index, effectiveLagna);
        const isLagna = house === 1;
        const bodies = bodiesBySign.get(sign) ?? [];

        return (
          <g key={index}>
            <polygon
              points={cell.points.map(([x, y]) => `${f(x)},${f(y)}`).join(' ')}
              fill={isLagna ? colours.faint : 'none'}
              stroke={colours.ink}
              strokeWidth={1}
            />

            {/*
              The sign number, which is how Indian charts are read — a reader
              identifies Aries as "1", not by a glyph. The glyph is added
              beside it for people who read the chart the Western way.
            */}
            <text
              x={f(cell.label[0])}
              y={f(cell.label[1])}
              fill={colours.muted}
              fontSize={size * 0.032}
              fontWeight={600}
              textAnchor={style === 'north' ? 'middle' : 'start'}
            >
              {sign + 1}
              <tspan fontFamily={GLYPH_FONT_STACK} dx={size * 0.012}>
                {SIGN_GLYPHS[SIGNS[sign]!].symbol}
              </tspan>
            </text>

            {bodySlots(cell, bodies.length, style).map((slot, row) => (
              <text
                key={bodies[row]! + row}
                x={f(slot.x)}
                y={f(slot.y)}
                fill={colours.ink}
                fontSize={size * GLYPH_SIZE * slot.scale}
                /*
                 * Bold, and in the body font rather than the glyph stack:
                 * these are letters now, and the glyph stack picks fonts for
                 * symbol coverage rather than for reading two letters at
                 * 12px. The retrograde mark is still a glyph, so it keeps
                 * the stack on its own tspan.
                 */
                fontWeight={600}
                textAnchor={style === 'north' ? 'middle' : 'start'}
                dominantBaseline="middle"
              >
                {bodies[row]}
              </text>
            ))}
          </g>
        );
      })}
    </svg>
  );
}
