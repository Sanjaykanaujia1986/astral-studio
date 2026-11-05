/**
 * A price series with an anchored Gann fan over it.
 *
 * The fan's slopes come from the construction, not from the plot: zooming or
 * resizing changes the pixels and leaves every line passing through the same
 * prices. The scale that defines "1×1" is printed on the figure itself,
 * because the drawing is meaningless without it and a screenshot travels
 * further than the settings panel.
 */
import type { JSX } from 'react';
import { priceAt, diagonalPriceAt, type Fan, type PriceTimeGrid } from '@astro/gann';
import { resolveTheme, type ChartTheme } from '../chart-wheel/theme.js';
import {
  DEFAULT_PLOT, clipLine, makeScale, priceDomain, priceTicks,
  type PlotBox, type PlotDomain,
} from './plot.js';

export interface GannFanPoint {
  readonly barIndex: number;
  readonly date: string;
  readonly close: number;
}

export interface GannFanFigureProps {
  readonly points: readonly GannFanPoint[];
  readonly fan?: Fan;
  /** Prices projected from planetary longitudes, drawn as horizontals. */
  readonly priceLines?: readonly { readonly price: number; readonly label: string }[];
  /**
   * Notes pinned to a bar and a price.
   *
   * Pinned in DATA coordinates, not pixels: a note fixed to the canvas would
   * drift off its point the first time the figure was resized, and a note
   * that points at the wrong bar is worse than no note.
   */
  readonly notes?: readonly {
    readonly id: string;
    readonly barIndex: number;
    readonly price: number;
    readonly text: string;
  }[];
  readonly box?: PlotBox;
  readonly theme?: Partial<ChartTheme>;
  readonly scaleCaption?: string;
  /** A price-time grid drawn under the series. */
  readonly grid?: PriceTimeGrid;
  readonly className?: string;
}

export function GannFanFigure({
  points,
  fan,
  priceLines = [],
  notes = [],
  box = DEFAULT_PLOT,
  theme,
  scaleCaption,
  grid,
  className,
}: GannFanFigureProps): JSX.Element {
  const colours = resolveTheme(theme);

  const relevant = [
    ...points.map((p) => p.close),
    ...priceLines.map((l) => l.price),
    ...notes.map((note) => note.price),
    ...(fan ? [fan.anchor.price] : []),
  ];
  const { minPrice, maxPrice } = priceDomain(relevant);
  const domain: PlotDomain = {
    firstBar: points[0]?.barIndex ?? 0,
    lastBar: points[points.length - 1]?.barIndex ?? 1,
    minPrice,
    maxPrice,
  };
  const scale = makeScale(domain, box);

  const path = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${scale.xOf(p.barIndex).toFixed(2)},${scale.yOf(p.close).toFixed(2)}`)
    .join(' ');

  return (
    <svg
      className={className}
      viewBox={`0 0 ${box.width} ${box.height}`}
      width="100%"
      height="100%"
      role="img"
      aria-label={
        fan
          ? `Price series with a Gann fan anchored at ${fan.anchor.date}, ${scaleCaption ?? ''}`
          : 'Price series'
      }
      style={{ maxWidth: `${box.width}px`, height: 'auto', display: 'block' }}
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect x={0} y={0} width={box.width} height={box.height} fill={colours.surface} />

      {/*
        The grid, under everything else. Only the harmonic fractions are
        drawn: the uniform cell lines carry nothing the scale does not
        already say, and 144 of them would be a grey block.
      */}
      {grid ? (
        <g>
          {grid.levels.map((level) => {
            const y = scale.yOf(level.price);
            if (y < box.padTop || y > box.height - box.padBottom) return null;
            return (
              <g key={`grid-level-${level.label}`}>
                <line
                  x1={box.padLeft} x2={box.width - box.padRight}
                  y1={y} y2={y}
                  stroke={colours.elements.earth}
                  strokeWidth={level.fraction === 0.5 ? 1 : 0.6}
                  strokeOpacity={0.5}
                />
                <text
                  x={box.padLeft + 2} y={y - 2}
                  fontSize={9} fill={colours.elements.earth}
                >
                  {level.label}
                </text>
              </g>
            );
          })}
          {grid.columns.map((column) => {
            const x = scale.xOf(column.barIndex);
            if (x < box.padLeft || x > box.width - box.padRight) return null;
            return (
              <line
                key={`grid-column-${column.label}`}
                x1={x} x2={x}
                y1={box.padTop} y2={box.height - box.padBottom}
                stroke={colours.elements.earth}
                strokeWidth={column.fraction === 0.5 ? 1 : 0.6}
                strokeOpacity={0.4}
                strokeDasharray="3 3"
              />
            );
          })}
          {(() => {
            // The diagonal, which IS the 1x1 on this grid's scale.
            const clip = clipLine(
              grid.settings.anchor.barIndex,
              grid.settings.anchor.price,
              grid.diagonalSlopePerBar,
              domain,
            );
            if (!clip) return null;
            return (
              <line
                x1={scale.xOf(clip.fromBar)}
                y1={scale.yOf(diagonalPriceAt(grid, clip.fromBar))}
                x2={scale.xOf(clip.toBar)}
                y2={scale.yOf(diagonalPriceAt(grid, clip.toBar))}
                stroke={colours.elements.earth}
                strokeWidth={1.2}
              />
            );
          })()}
        </g>
      ) : null}

      {priceTicks(domain).map((tick) => (
        <g key={tick}>
          <line
            x1={box.padLeft}
            x2={box.width - box.padRight}
            y1={scale.yOf(tick)}
            y2={scale.yOf(tick)}
            stroke={colours.faint}
            strokeWidth={0.6}
          />
          <text
            x={box.padLeft - 6}
            y={scale.yOf(tick) + 3}
            textAnchor="end"
            fontSize={10}
            fill={colours.muted}
          >
            {tick}
          </text>
        </g>
      ))}

      {priceLines.map((line) => (
        <g key={`${line.label}-${line.price}`}>
          <line
            x1={box.padLeft}
            x2={box.width - box.padRight}
            y1={scale.yOf(line.price)}
            y2={scale.yOf(line.price)}
            stroke={colours.elements.air}
            strokeWidth={1}
            strokeDasharray="4 3"
          />
          <text
            x={box.width - box.padRight - 2}
            y={scale.yOf(line.price) - 3}
            textAnchor="end"
            fontSize={10}
            fill={colours.elements.air}
          >
            {line.label}
          </text>
        </g>
      ))}

      {fan
        ? fan.lines.map((line) => {
            const clip = clipLine(fan.anchor.barIndex, fan.anchor.price, line.slopePerBar, domain);
            if (!clip) return null;
            return (
              <g key={line.label}>
                <line
                  x1={scale.xOf(clip.fromBar)}
                  y1={scale.yOf(priceAt(fan, line, clip.fromBar))}
                  x2={scale.xOf(clip.toBar)}
                  y2={scale.yOf(priceAt(fan, line, clip.toBar))}
                  stroke={line.isPrimary ? colours.aspects.hard : colours.aspects.neutral}
                  strokeWidth={line.isPrimary ? 1.6 : 0.8}
                />
                <text
                  x={scale.xOf(clip.toBar) - 2}
                  y={scale.yOf(priceAt(fan, line, clip.toBar)) - 3}
                  textAnchor="end"
                  fontSize={9}
                  fill={line.isPrimary ? colours.aspects.hard : colours.muted}
                >
                  {line.label}
                </text>
              </g>
            );
          })
        : null}

      <path d={path} fill="none" stroke={colours.ink} strokeWidth={1.4} />

      {fan ? (
        <circle
          cx={scale.xOf(fan.anchor.barIndex)}
          cy={scale.yOf(fan.anchor.price)}
          r={3.5}
          fill={colours.aspects.hard}
        />
      ) : null}

      {/* Notes last, so they sit above the series they annotate. */}
      {notes.map((note) => {
        const x = scale.xOf(note.barIndex);
        const y = scale.yOf(note.price);
        if (x < box.padLeft || x > box.width - box.padRight) return null;
        // Flip the label inboard near the right edge so it is not clipped.
        const flip = x > box.width - box.padRight - 90;
        return (
          <g key={note.id}>
            <circle cx={x} cy={y} r={3} fill={colours.aspects.soft} />
            <text
              x={flip ? x - 6 : x + 6}
              y={y - 5}
              textAnchor={flip ? 'end' : 'start'}
              fontSize={10}
              fill={colours.aspects.soft}
            >
              {note.text.length > 28 ? `${note.text.slice(0, 27)}…` : note.text}
            </text>
          </g>
        );
      })}

      <line
        x1={box.padLeft}
        x2={box.width - box.padRight}
        y1={box.height - box.padBottom}
        y2={box.height - box.padBottom}
        stroke={colours.ink}
        strokeWidth={0.8}
      />
      {points.length > 0 ? (
        <>
          <text x={box.padLeft} y={box.height - 8} fontSize={10} fill={colours.muted}>
            {points[0]!.date}
          </text>
          <text
            x={box.width - box.padRight}
            y={box.height - 8}
            textAnchor="end"
            fontSize={10}
            fill={colours.muted}
          >
            {points[points.length - 1]!.date}
          </text>
        </>
      ) : null}

      {scaleCaption ? (
        <text x={box.padLeft} y={box.padTop + 8} fontSize={10} fill={colours.muted}>
          {scaleCaption}
        </text>
      ) : null}
    </svg>
  );
}
