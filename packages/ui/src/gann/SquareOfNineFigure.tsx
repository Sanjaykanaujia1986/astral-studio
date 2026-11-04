/**
 * The Square of Nine as a drawn grid.
 *
 * Like the chart wheel and the Vedic figures, colours are resolved in
 * JavaScript rather than through CSS custom properties, so the SVG survives a
 * print renderer with no cascade.
 *
 * The two crosses are drawn from the cells' own geometry, so they stay correct
 * under a shifted origin or a non-unit increment — settings under which the
 * usual "highlight the perfect squares" shortcut quietly highlights nothing.
 */
import type { JSX } from 'react';
import type { SquareOfNine, SquareCell } from '@astro/gann';
import { resolveTheme, type ChartTheme } from '../chart-wheel/theme.js';

export interface SquareOfNineFigureProps {
  readonly square: SquareOfNine;
  readonly size?: number;
  readonly theme?: Partial<ChartTheme>;
  /** Values to mark, e.g. prices projected from planetary longitudes. */
  readonly marks?: readonly { readonly value: number; readonly label: string }[];
  /** Highlight the cell nearest this value, for "where am I" on a big square. */
  readonly focusValue?: number;
  readonly className?: string;
  /** Rounding for the printed values. Prices are rarely integers. */
  readonly decimals?: number;
}

/**
 * Nearest cell by value, for a price that falls between two cells.
 *
 * Returns undefined for a value OUTSIDE the square rather than clamping it to
 * the nearest edge. Clamping looked harmless and was not: with a square of
 * 121 cells and planets projected into the hundreds, every body was marked on
 * the same outermost cell, which reads as a cluster of planets at one price.
 * A value off the square is a reason to widen the square, not to draw it
 * somewhere it is not.
 */
function nearestCell(square: SquareOfNine, value: number): SquareCell | undefined {
  const { increment } = square.settings;
  const tolerance = Math.abs(increment) / 2;
  let best: SquareCell | undefined;
  let smallest = Infinity;
  for (const cell of square.cells) {
    const distance = Math.abs(cell.value - value);
    if (distance < smallest) { smallest = distance; best = cell; }
  }
  return smallest <= tolerance ? best : undefined;
}

/** At most three labels in a cell; more than that is unreadable at any size. */
function joinLabels(labels: readonly string[]): string {
  if (labels.length <= 3) return labels.join(' ');
  return `${labels.slice(0, 3).join(' ')} +${labels.length - 3}`;
}

export function SquareOfNineFigure({
  square,
  size = 520,
  theme,
  marks = [],
  focusValue,
  className,
  decimals = 0,
}: SquareOfNineFigureProps): JSX.Element {
  const colours = resolveTheme(theme);
  const { side } = square;
  const cellSize = size / side;
  const half = (side - 1) / 2;

  // Lattice (x right, y up, centre 0,0) to SVG (y down, origin top-left).
  const px = (x: number) => (x + half) * cellSize;
  const py = (y: number) => (half - y) * cellSize;

  const labelsByValue = new Map<number, string[]>();
  let offSquare = 0;
  for (const mark of marks) {
    const cell = nearestCell(square, mark.value);
    if (!cell) { offSquare += 1; continue; }
    const list = labelsByValue.get(cell.value) ?? [];
    list.push(mark.label);
    labelsByValue.set(cell.value, list);
  }
  const markByValue = new Map(
    [...labelsByValue].map(([value, labels]) => [value, joinLabels(labels)]),
  );

  const focusCell = focusValue === undefined ? undefined : nearestCell(square, focusValue);
  const fontSize = Math.min(cellSize * 0.3, 13);

  return (
    <svg
      className={className}
      viewBox={`0 0 ${size} ${size}`}
      width="100%"
      height="100%"
      role="img"
      aria-label={`Square of Nine, ${side} by ${side}, origin ${square.settings.originValue}`}
      style={{ maxWidth: `${size}px`, height: 'auto', display: 'block' }}
      xmlns="http://www.w3.org/2000/svg"
    >
      <title>{`Square of Nine · origin ${square.settings.originValue} · step ${square.settings.increment}`}</title>
      <rect x={0} y={0} width={size} height={size} fill={colours.surface} />

      {offSquare > 0 ? (
        <text
          x={size / 2}
          y={12}
          textAnchor="middle"
          fontSize={11}
          fill={colours.muted}
        >
          {`${offSquare} value${offSquare === 1 ? '' : 's'} fall outside this square`}
        </text>
      ) : null}

      {square.cells.map((cell) => {
        const onCross = cell.onCardinalCross || cell.onDiagonalCross;
        const isCentre = cell.ring === 0;
        const marked = markByValue.get(cell.value);
        const isFocus = focusCell !== undefined && cell.value === focusCell.value;

        const fill = isFocus
          ? colours.aspects.soft
          : marked
            ? colours.elements.air
            : isCentre
              ? colours.faint
              : cell.onDiagonalCross
                ? colours.faint
                : onCross
                  ? colours.surface
                  : 'none';

        return (
          <g key={`${cell.x},${cell.y}`}>
            <rect
              x={px(cell.x)}
              y={py(cell.y)}
              width={cellSize}
              height={cellSize}
              fill={fill}
              fillOpacity={isFocus || marked ? 0.35 : 1}
              stroke={onCross ? colours.ink : colours.faint}
              strokeWidth={onCross ? 1.2 : 0.6}
            />
            <text
              x={px(cell.x) + cellSize / 2}
              y={py(cell.y) + cellSize / 2 + fontSize * 0.35}
              textAnchor="middle"
              fontSize={fontSize}
              fill={onCross || isCentre ? colours.ink : colours.muted}
              fontWeight={isCentre ? 600 : 400}
            >
              {cell.value.toFixed(decimals)}
            </text>
            {marked ? (
              <text
                x={px(cell.x) + cellSize / 2}
                y={py(cell.y) + cellSize - 2}
                textAnchor="middle"
                fontSize={Math.min(cellSize * 0.24, 10)}
                fill={colours.ink}
              >
                {marked}
              </text>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}
