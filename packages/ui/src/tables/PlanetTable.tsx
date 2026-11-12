/**
 * Planetary positions table.
 *
 * Two densities: `compact` for phones and side panels, `detailed` for desktop
 * and print. On narrow screens the table scrolls horizontally inside its own
 * container rather than forcing the page to scroll or shrinking text below
 * legibility — a data table that has to be squinted at is worse than one that
 * has to be swiped.
 */
import type { JSX } from 'react';
import type { InstantChart, PlacedBody } from '@astro/engine';
import { useTranslator } from '@astro/i18n';
import { BODY_GLYPHS, GLYPH_FONT_STACK } from '../chart-wheel/glyphs.js';
import {
  formatLongitude,
  formatSignedDegrees,
  formatSpeed,
  type DegreePrecision,
} from '../format.js';

export interface PlanetTableProps {
  readonly chart: InstantChart;
  readonly density?: 'compact' | 'detailed';
  readonly precision?: DegreePrecision;
  readonly className?: string;
}

const TH = 'px-3 py-2 text-left font-medium text-xs uppercase tracking-wide as-text-muted';
const TD = 'px-3 py-2 whitespace-nowrap tabular-nums';

function BodyCell({ placed, label }: { placed: PlacedBody; label: string }): JSX.Element {
  const glyph = BODY_GLYPHS[placed.position.body];
  return (
    <th scope="row" className={`${TD} text-left font-medium`}>
      <span className="inline-flex items-center gap-2">
        <span aria-hidden="true" style={{ fontFamily: GLYPH_FONT_STACK }} className="text-lg">
          {glyph.symbol}
        </span>
        <span>{label}</span>
      </span>
    </th>
  );
}

export function PlanetTable({
  chart,
  density = 'detailed',
  precision = 'minute',
  className,
}: PlanetTableProps): JSX.Element {
  const { t, n } = useTranslator();
  const detailed = density === 'detailed';
  const hasHouses = chart.houses !== undefined;

  return (
    <div className={`overflow-x-auto ${className ?? ''}`}>
      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">{t('table.caption.planets')}</caption>
        <thead>
          <tr className="border-b as-border-strong">
            <th scope="col" className={TH}>{t('table.column.body')}</th>
            <th scope="col" className={TH}>{t('table.column.position')}</th>
            {hasHouses ? <th scope="col" className={TH}>{t('table.column.house')}</th> : null}
            <th scope="col" className={TH}>{t('table.column.motion')}</th>
            {detailed ? <th scope="col" className={TH}>{t('table.column.speed')}</th> : null}
            {detailed ? <th scope="col" className={TH}>{t('table.column.latitude')}</th> : null}
            {detailed ? <th scope="col" className={TH}>{t('table.column.declination')}</th> : null}
          </tr>
        </thead>
        <tbody>
          {chart.bodies.map((placed) => {
            const p = placed.position;
            return (
              <tr key={p.body} className="border-b as-border-hair last:border-0">
                <BodyCell placed={placed} label={t(`body.${p.body}`)} />
                <td className={TD}>
                  {formatLongitude(p.longitude, { precision, signLabel: t(`sign.${placed.sign.sign}`) })}
                </td>
                {hasHouses ? (
                  <td className={`${TD} as-text-muted`}>
                    {placed.house === undefined ? '—' : n(placed.house)}
                  </td>
                ) : null}
                <td className={TD}>
                  {p.stationary ? (
                    <span className="as-text-warning">{t('motion.stationary')}</span>
                  ) : p.retrograde ? (
                    <span className="as-text-danger">℞ {t('motion.retrograde')}</span>
                  ) : (
                    <span className="as-text-muted">{t('motion.direct')}</span>
                  )}
                </td>
                {detailed ? (
                  <td className={`${TD} as-text-muted`}>
                    {p.stationary ? t('motion.stationary') : formatSpeed(p.longitudeSpeed)}
                  </td>
                ) : null}
                {detailed ? (
                  <td className={`${TD} as-text-muted`}>{formatSignedDegrees(p.latitude)}</td>
                ) : null}
                {detailed ? (
                  <td className={`${TD} as-text-muted`}>
                    {p.equatorial ? formatSignedDegrees(p.equatorial.declination) : '—'}
                  </td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
