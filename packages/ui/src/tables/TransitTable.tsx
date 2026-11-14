/**
 * Transit table.
 *
 * Every pass of a retrograde loop is listed, numbered "2 of 3". A planet that
 * crosses a natal point three times over eight months does so at three
 * genuinely different moments, and showing only the first would misdate the
 * other two by months — which are usually the ones people are asking about.
 */
import type { JSX } from 'react';
import type { Body, TransitHit, TransitTarget } from '@astro/engine';
import { useTranslator, type Translator } from '@astro/i18n';
import { AspectGlyph, BodyGlyph } from '../glyphs/Glyph.js';
import { ASPECT_CLASSES, LIGHT_THEME } from '../chart-wheel/theme.js';

export interface TransitTableProps {
  readonly hits: readonly TransitHit[];
  readonly className?: string;
}

const TH = 'px-3 py-2 text-left font-medium text-xs uppercase tracking-wide as-text-muted';
const TD = 'px-3 py-2 whitespace-nowrap';

const ANGLE_KEYS = new Set(['asc', 'mc', 'dsc', 'ic']);

/** Human label for a transit target: a natal body, an angle, or a cusp. */
function targetLabel(target: TransitTarget, t: Translator['t']): string {
  if (target.kind === 'angle' && ANGLE_KEYS.has(target.id)) {
    return t(`angle.${target.id as 'asc' | 'mc' | 'dsc' | 'ic'}`);
  }
  if (target.kind === 'natalBody') return t(`body.${target.id as Body}`);
  return target.id;
}

function targetGlyph(target: TransitTarget): JSX.Element | null {
  return target.kind === 'natalBody' ? <BodyGlyph body={target.id as Body} /> : null;
}

export function TransitTable({ hits, className }: TransitTableProps): JSX.Element {
  const { t, d } = useTranslator();

  if (hits.length === 0) {
    return (
      <p className={`px-3 py-6 text-sm as-text-muted ${className ?? ''}`}>{t('transit.empty')}</p>
    );
  }

  const anyMultiPass = hits.some((h) => h.totalPasses > 1);

  return (
    <div className={className}>
      {anyMultiPass ? (
        <p className="px-3 pb-2 pt-1 text-xs as-text-muted">{t('transit.note.retrograde')}</p>
      ) : null}

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">{t('transit.heading')}</caption>
          <thead>
            <tr className="border-b as-border-strong">
              <th scope="col" className={TH}>{t('transit.column.date')}</th>
              <th scope="col" className={TH}>{t('transit.column.transiting')}</th>
              <th scope="col" className={TH}>{t('table.column.aspect')}</th>
              <th scope="col" className={TH}>{t('transit.column.target')}</th>
              <th scope="col" className={TH}>{t('table.column.motion')}</th>
              <th scope="col" className={TH}>{t('transit.column.pass')}</th>
            </tr>
          </thead>
          <tbody>
            {hits.map((hit) => {
              const colour = LIGHT_THEME.aspects[ASPECT_CLASSES[hit.aspect]];
              const glyph = targetGlyph(hit.target);

              return (
                <tr
                  key={`${hit.transitBody}-${hit.aspect}-${hit.target.id}-${hit.exactJd}`}
                  className="border-b as-border-hair last:border-0"
                >
                  <td className={`${TD} tabular-nums`}>
                    {d(hit.exactUtcIso, {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                      timeZone: 'UTC',
                    })}
                  </td>
                  <td className={TD}>
                    <span className="inline-flex items-center gap-1.5">
                      <BodyGlyph body={hit.transitBody} />
                      {t(`body.${hit.transitBody}`)}
                    </span>
                  </td>
                  <td className={TD}>
                    <span className="inline-flex items-center gap-1.5">
                      <AspectGlyph aspect={hit.aspect} style={{ color: colour }} />
                      {t(`aspect.${hit.aspect}`)}
                    </span>
                  </td>
                  <td className={TD}>
                    <span className="inline-flex items-center gap-1.5">
                      {glyph}
                      {targetLabel(hit.target, t)}
                    </span>
                  </td>
                  <td className={TD}>
                    {hit.direction === 'retrograde' ? (
                      <span className="as-text-danger">℞ {t('motion.retrograde')}</span>
                    ) : (
                      <span className="as-text-muted">{t('motion.direct')}</span>
                    )}
                  </td>
                  <td className={`${TD} as-text-muted`}>
                    {hit.totalPasses > 1
                      ? t('transit.pass.of', { index: hit.passIndex, total: hit.totalPasses })
                      : t('transit.pass.single')}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
