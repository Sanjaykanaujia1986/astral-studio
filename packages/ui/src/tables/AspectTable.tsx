/**
 * Aspect table.
 *
 * Shows orb, direction of travel and strength. Applying and separating are
 * displayed explicitly rather than left implicit in the orb, because they are
 * the difference between a configuration that is building and one that is
 * releasing — and they cannot be inferred from the orb alone.
 */
import type { JSX } from 'react';
import type { AspectHit, InstantChart } from '@astro/engine';
import { useTranslator, type Translator } from '@astro/i18n';
import { AspectGlyph, BodyGlyph } from '../glyphs/Glyph.js';
import { ASPECT_CLASSES, LIGHT_THEME } from '../chart-wheel/theme.js';
import { formatAngle } from '../format.js';

export interface AspectTableProps {
  readonly chart: InstantChart;
  /** Hide aspects wider than this orb. */
  readonly maxOrb?: number;
  readonly className?: string;
}

const TH = 'px-3 py-2 text-left font-medium text-xs uppercase tracking-wide as-text-muted';
const TD = 'px-3 py-2 whitespace-nowrap tabular-nums';

function MotionCell({ hit, t }: { hit: AspectHit; t: Translator['t'] }): JSX.Element {
  if (hit.exact) {
    return <span className="font-medium as-text-success">{t('motion.exact')}</span>;
  }
  if (hit.motion === 'applying') {
    return (
      <span className="as-text-accent" title={t('motion.applying.hint')}>
        {t('motion.applying')} →
      </span>
    );
  }
  if (hit.motion === 'separating') {
    return (
      <span className="as-text-muted" title={t('motion.separating.hint')}>
        ← {t('motion.separating')}
      </span>
    );
  }
  return (
    <span className="as-text-warning" title={t('motion.stationary.hint')}>
      {t('motion.stationary')}
    </span>
  );
}

export function AspectTable({ chart, maxOrb, className }: AspectTableProps): JSX.Element {
  const { t, n } = useTranslator();
  const hits =
    maxOrb === undefined ? chart.aspects : chart.aspects.filter((h) => h.orb <= maxOrb);

  if (hits.length === 0) {
    return (
      <p className={`px-3 py-6 text-sm as-text-muted ${className ?? ''}`}>
        {t('table.aspects.empty')}
      </p>
    );
  }

  return (
    <div className={`overflow-x-auto ${className ?? ''}`}>
      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">{t('table.caption.aspects')}</caption>
        <thead>
          <tr className="border-b as-border-strong">
            <th scope="col" className={TH}>{t('table.column.aspect')}</th>
            <th scope="col" className={TH}>{t('table.column.orb')}</th>
            <th scope="col" className={TH}>{t('table.column.motion')}</th>
            <th scope="col" className={TH}>{t('table.column.strength')}</th>
          </tr>
        </thead>
        <tbody>
          {hits.map((hit) => {
            const colour = LIGHT_THEME.aspects[ASPECT_CLASSES[hit.aspect]];

            const nameA = t(`body.${hit.bodyA}`);
            const nameB = t(`body.${hit.bodyB}`);
            const aspectName = t(`aspect.${hit.aspect}`);

            return (
              <tr
                key={`${hit.bodyA}-${hit.aspect}-${hit.bodyB}`}
                className="border-b as-border-hair last:border-0"
              >
                <th scope="row" className={`${TD} text-left font-normal`}>
                  <span className="inline-flex items-center gap-1.5">
                    <BodyGlyph body={hit.bodyA} />
                    <AspectGlyph aspect={hit.aspect} className="mx-1" style={{ color: colour }} />
                    <BodyGlyph body={hit.bodyB} />
                    <span className="ml-2 as-text-muted">
                      {nameA} {aspectName} {nameB}
                    </span>
                  </span>
                </th>
                <td className={TD}>{formatAngle(hit.orb, 'minute')}</td>
                <td className={TD}><MotionCell hit={hit} t={t} /></td>
                <td className={TD}>
                  <span className="inline-flex items-center gap-2">
                    <span
                      aria-hidden="true"
                      className="inline-block h-1.5 rounded-full"
                      style={{
                        width: `${Math.max(4, hit.strength * 56)}px`,
                        backgroundColor: colour,
                      }}
                    />
                    <span className="text-xs as-text-muted">
                      {n(hit.strength, { style: 'percent', maximumFractionDigits: 0 })}
                    </span>
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
