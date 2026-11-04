/**
 * The circle and the polygon spiral, drawn.
 *
 * One figure for both because both are radial — a value sits at an angle and
 * a radius — whereas the Square of Nine is a lattice and has its own file.
 * Sharing a renderer with the square would mean one component deciding which
 * geometry it was drawing, which is how the two constructions get conflated.
 *
 * Colours resolved in JavaScript, as everywhere else here, so the SVG stands
 * up in a print renderer with no cascade.
 */
import type { JSX } from 'react';
import {
  polygonPoint,
  type CircleChart,
  type PolygonChart,
} from '@astro/gann';
import { resolveTheme, type ChartTheme } from '../chart-wheel/theme.js';

export interface RadialMark {
  readonly value: number;
  readonly label: string;
}

export interface RadialLayoutFigureProps {
  readonly chart: CircleChart | PolygonChart;
  readonly size?: number;
  readonly theme?: Partial<ChartTheme>;
  readonly marks?: readonly RadialMark[];
  readonly className?: string;
  readonly decimals?: number;
}

interface Placed {
  readonly value: number;
  readonly x: number;
  readonly y: number;
  readonly emphasis: boolean;
  readonly ring: number;
}

function isPolygon(chart: CircleChart | PolygonChart): chart is PolygonChart {
  return 'sides' in chart.settings;
}

/** Unit coordinates, y up, centre at the origin. */
function place(chart: CircleChart | PolygonChart): readonly Placed[] {
  if (isPolygon(chart)) {
    const maxRing = Math.max(1, chart.settings.rings);
    return chart.cells.map((cell) => {
      const [x, y] = polygonPoint(cell);
      return {
        value: cell.value,
        x: x / maxRing,
        y: y / maxRing,
        emphasis: cell.corner,
        ring: cell.ring,
      };
    });
  }

  const turns = Math.max(1, chart.settings.turns);
  return chart.cells.map((cell) => {
    const radians = (cell.angle * Math.PI) / 180;
    // The innermost turn sits at a third of the radius, so the centre stays
    // readable instead of collapsing every early value onto one point.
    const radius = (cell.turn + 1) / (turns + 0.5);
    return {
      value: cell.value,
      x: radius * Math.sin(radians),
      y: radius * Math.cos(radians),
      emphasis: cell.division === 0,
      ring: cell.turn,
    };
  });
}

export function RadialLayoutFigure({
  chart,
  size = 420,
  theme,
  marks = [],
  className,
  decimals = 0,
}: RadialLayoutFigureProps): JSX.Element {
  const colours = resolveTheme(theme);
  const placed = place(chart);
  const half = size / 2;
  // Leave room for the outermost labels, which sit ON the outer radius.
  const scale = half * 0.86;

  const px = (x: number) => half + x * scale;
  const py = (y: number) => half - y * scale;

  const markByValue = new Map<number, string>();
  let offChart = 0;
  for (const mark of marks) {
    const nearest = placed.reduce<Placed | undefined>(
      (best, cell) => (best === undefined
        || Math.abs(cell.value - mark.value) < Math.abs(best.value - mark.value)
        ? cell
        : best),
      undefined,
    );
    const increment = Math.abs(chart.settings.increment);
    if (!nearest || Math.abs(nearest.value - mark.value) > increment / 2) {
      // Same rule as the square: a value off the chart is a reason to widen
      // the chart, not to draw it at the nearest edge.
      offChart += 1;
      continue;
    }
    const existing = markByValue.get(nearest.value);
    markByValue.set(nearest.value, existing ? `${existing} ${mark.label}` : mark.label);
  }

  const rings = isPolygon(chart) ? chart.settings.rings : chart.settings.turns;
  const label = isPolygon(chart)
    ? `${chart.settings.sides}-sided spiral, ${rings} rings`
    : `Wheel of ${chart.settings.divisions}, ${rings} turns`;
  const fontSize = Math.max(7, Math.min(size * 0.026, 12));

  return (
    <svg
      className={className}
      viewBox={`0 0 ${size} ${size}`}
      width="100%"
      height="100%"
      role="img"
      aria-label={label}
      style={{ maxWidth: `${size}px`, height: 'auto', display: 'block' }}
      xmlns="http://www.w3.org/2000/svg"
    >
      <title>{label}</title>
      <rect x={0} y={0} width={size} height={size} fill={colours.surface} />

      {/* Guide rings, so a reader can see which turn a value is on. */}
      {Array.from({ length: rings }, (_, i) => {
        const radius = isPolygon(chart)
          ? ((i + 1) / Math.max(1, rings)) * scale
          : ((i + 1) / (rings + 0.5)) * scale;
        return (
          <circle
            key={i}
            cx={half}
            cy={half}
            r={radius}
            fill="none"
            stroke={colours.faint}
            strokeWidth={0.6}
          />
        );
      })}

      {/* Spokes at the emphasised positions: the wheel's zero degree, or the
          polygon's vertices. */}
      {placed.filter((cell) => cell.emphasis && cell.ring === rings - (isPolygon(chart) ? 0 : 1))
        .map((cell) => (
          <line
            key={`spoke-${cell.value}`}
            x1={half}
            y1={half}
            x2={px(cell.x)}
            y2={py(cell.y)}
            stroke={colours.faint}
            strokeWidth={0.6}
          />
        ))}

      {placed.map((cell) => {
        const marked = markByValue.get(cell.value);
        return (
          <g key={`${cell.value}-${cell.ring}`}>
            {marked ? (
              <circle
                cx={px(cell.x)}
                cy={py(cell.y)}
                r={fontSize * 1.1}
                fill={colours.elements.air}
                fillOpacity={0.35}
              />
            ) : null}
            <text
              x={px(cell.x)}
              y={py(cell.y)}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={fontSize}
              fontWeight={cell.emphasis ? 600 : 400}
              fill={cell.emphasis ? colours.ink : colours.muted}
            >
              {cell.value.toFixed(decimals)}
            </text>
            {marked ? (
              <text
                x={px(cell.x)}
                y={py(cell.y) + fontSize * 1.6}
                textAnchor="middle"
                fontSize={fontSize * 0.85}
                fill={colours.ink}
              >
                {marked}
              </text>
            ) : null}
          </g>
        );
      })}

      {offChart > 0 ? (
        <text
          x={half}
          y={size - 4}
          textAnchor="middle"
          fontSize={fontSize}
          fill={colours.muted}
        >
          {`${offChart} value${offChart === 1 ? '' : 's'} fall outside this chart`}
        </text>
      ) : null}
    </svg>
  );
}
