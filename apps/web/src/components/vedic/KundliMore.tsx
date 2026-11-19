/**
 * Gemstones as tradition chooses them for this chart, and the KP favourable
 * aspect points. The rules are in packages/vedic (ratna.ts, kp.ts) and
 * docs/VEDIC_CONVENTIONS.md §16.
 */
import type { JSX } from 'react';
import { norm360 } from '@astro/engine';
import { useTranslator, type MessageKey } from '@astro/i18n';
import {
  RATNA, ratnaAdvice, ratnaNakshatras, kpAspectPoints, FAVOURABLE_ANGLES, GRAHAS, WEEKDAY_OF, WEEKDAYS,
  type GrahaLongitudes,
} from '@astro/vedic';
import { ROW, Table, TD, useJy } from './shared.js';

const k = (s: string): MessageKey => s as MessageKey;
const WRAP = { whiteSpace: 'normal' } as const;

export function Ratna({ g }: { readonly g: GrahaLongitudes }): JSX.Element | null {
  const { t } = useTranslator();
  const { gn, nak } = useJy();
  const advice = ratnaAdvice(g);
  if (!advice.length) return null;
  const stone = (b: (typeof GRAHAS)[number]): string => t(k(`vedic.tb.gemName.${b}`));
  return (
    <>
      <p className="report-block mb-2 text-[10.5px] leading-snug">{t('kundli.ratna.intro')}</p>
      <div className="k-dense">
        <Table head={[
          t('vedic.column.body'), t('kundli.ratna.col.stone'), t('kundli.ratna.col.metal'), t('kundli.ratna.col.finger'), t('kundli.ratna.col.day'),
          t('kundli.ratna.col.nak'), t('kundli.ratna.col.apart'), t('kundli.ratna.col.chart'),
        ]}>
          {advice.map((a) => {
            const r = RATNA[a.body];
            const verdict = a.reasons.length
              ? t('kundli.ratna.suggested', { list: a.reasons.map((x) => t(k(`kundli.ratna.why.${x}`))).join(', ') })
              : a.avoid ? t('kundli.ratna.avoid') : '—';
            return (
              <tr key={a.body} style={ROW} className={a.reasons.length ? 'font-semibold' : ''} data-ratna={a.body} data-ratna-verdict={a.reasons.length ? 'suggested' : a.avoid ? 'avoid' : 'neutral'}>
                <th scope="row" className={`${TD} text-left`}>{gn(a.body)}</th>
                <td className={TD}>{stone(a.body)}</td>
                <td className="px-1.5 py-0.5" style={WRAP}>{t(k(`kundli.ratna.metal.${r.metal}`))}</td>
                <td className={TD}>{t(k(`kundli.ratna.finger.${r.finger}`))}</td>
                <td className={TD}>{t(k(`weekday.${WEEKDAYS[WEEKDAY_OF[a.body]]!}`))}</td>
                <td className="px-1.5 py-0.5" style={WRAP}>{ratnaNakshatras(a.body).map(nak).join(', ')}</td>
                <td className="px-1.5 py-0.5" style={WRAP}>{a.contradicts.map(stone).join(', ') || '—'}</td>
                <td className="px-1.5 py-0.5" style={WRAP}>{verdict}</td>
              </tr>
            );
          })}
        </Table>
      </div>
      <p className="as-fineprint mt-2">{t('kundli.ratna.note')}</p>
    </>
  );
}

export function AspectPoints({ g }: { readonly g: GrahaLongitudes }): JSX.Element | null {
  const { t } = useTranslator();
  const { gn, rshort } = useJy();
  if (g.lagna === undefined) return null;
  const rows = [['lagna', g.lagna] as const, ...GRAHAS.map((b) => [b, g.lon[b]] as const)];
  const brief = (lon: number): string => {
    const l = norm360(lon); return `${rshort(Math.floor(l / 30))} ${Math.floor(l % 30)}°`;
  };
  const table = (dir: 'separating' | 'applying'): JSX.Element => (
    <section className="report-block mb-3">
      <h3 className="mb-1 text-[11px] font-semibold">{t(k(`kundli.fav.${dir}`))}</h3>
      <div className="k-dense">
        <Table head={[t('kundli.fav.point'), t('kundli.fav.natal'), ...FAVOURABLE_ANGLES.map((a) => `${dir === 'separating' ? '+' : '−'}${a}°`)]}>
          {rows.map(([b, lon]) => (
            <tr key={b} style={ROW} data-fav={`${dir}-${b}`}>
              <th scope="row" className={`${TD} text-left`}>{b === 'lagna' ? t('vedic.lagna') : gn(b)}</th>
              <td className={`${TD} font-semibold`}>{brief(lon)}</td>
              {kpAspectPoints(lon, dir).map((p, i) => <td key={i} className={TD}>{brief(p)}</td>)}
            </tr>
          ))}
        </Table>
      </div>
    </section>
  );
  return (
    <>
      {table('separating')}
      {table('applying')}
      <p className="as-fineprint mt-1">{t('kundli.fav.note')}</p>
    </>
  );
}
