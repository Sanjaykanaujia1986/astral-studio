/**
 * House cusps table.
 *
 * Renders nothing when the birth time is unknown — houses are omitted from the
 * chart in that case, and an empty table implying they exist would be worse
 * than no table.
 */
import type { JSX } from 'react';
import { norm360, type InstantChart } from '@astro/engine';
import { useTranslator } from '@astro/i18n';
import { signPosition } from '@astro/engine';
import { formatAngle, type DegreePrecision } from '../format.js';
import { SignPosition } from './SignPosition.js';

export interface HouseTableProps {
  readonly chart: InstantChart;
  readonly precision?: DegreePrecision;
  readonly showSpan?: boolean;
  readonly className?: string;
}

const TH = 'px-3 py-2 text-left font-medium text-xs uppercase tracking-wide as-text-muted';
const TD = 'px-3 py-2 whitespace-nowrap tabular-nums';

/** Message keys for the four cardinal cusps. */
const ANGLE_KEY = {
  1: 'angle.asc',
  4: 'angle.ic',
  7: 'angle.dsc',
  10: 'angle.mc',
} as const;

export function HouseTable({
  chart,
  precision = 'minute',
  showSpan = true,
  className,
}: HouseTableProps): JSX.Element | null {
  const { t, n } = useTranslator();
  const houses = chart.houses;
  if (!houses) return null;

  return (
    <div className={`overflow-x-auto ${className ?? ''}`}>
      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">{t('table.caption.houses')}</caption>
        <thead>
          <tr className="border-b as-border-strong">
            <th scope="col" className={TH}>{t('table.column.house')}</th>
            <th scope="col" className={TH}>{t('table.column.cusp')}</th>
            {showSpan ? <th scope="col" className={TH}>{t('table.column.span')}</th> : null}
          </tr>
        </thead>
        <tbody>
          {houses.cusps.map((cusp, index) => {
            const houseNumber = index + 1;
            const next = houses.cusps[(index + 1) % 12]!;
            // Houses are unequal in quadrant systems, so the span is computed
            // per house rather than assumed to be 30 degrees.
            const span = norm360(next - cusp);
            const angleKey = ANGLE_KEY[houseNumber as keyof typeof ANGLE_KEY];

            return (
              <tr
                key={houseNumber}
                className={`border-b as-border-hair last:border-0 ${angleKey ? 'font-medium' : ''}`}
              >
                <th scope="row" className={`${TD} text-left`}>
                  {n(houseNumber)}
                  {angleKey ? (
                    <span className="ml-2 rounded as-surface-inset px-1.5 py-0.5 text-xs as-text-muted">
                      {t(angleKey)}
                    </span>
                  ) : null}
                </th>
                <td className={TD}>
                  <SignPosition longitude={cusp} precision={precision} label={t(`sign.${signPosition(cusp).sign}`)} />
                </td>
                {showSpan ? (
                  <td className={`${TD} as-text-muted`}>{formatAngle(span, 'minute')}</td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
