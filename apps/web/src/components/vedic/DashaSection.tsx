/**
 * Daśā explorer: Viṁśottarī, Aṣṭottarī and Yoginī, counted from the Moon or
 * any other graha / the lagna, drilled down to prāṇa daśā.
 *
 * Defaults reproduce the reference horoscope software: clock from 00:00 local
 * on the birth date, 365.25-day years, dates in the birth time zone.
 */
import { useMemo, useState, type JSX } from 'react';
import type { NatalChart } from '@astro/engine';
import { useTranslator } from '@astro/i18n';
import {
  dashas, subPeriods, runningPath, yearsToYmd, localMidnightJd, grahaLongitudes, YEAR_LENGTHS,
  DASHA_SYSTEMS, type DashaNode, type DashaSystemId, type VedicChart, type YearLengthName, type Graha,
} from '@astro/vedic';
import { GRAHA_NAME, ROW, Select, Table, TD, localDate, utcOffsetLabel, MUTED } from './shared.js';

const LEVELS = ['Mahā', 'Antar', 'Pratyantar', 'Sūkṣma', 'Prāṇa'];
type From = Graha | 'lagna';

export function DashaSection({ vchart, chart }: { readonly vchart: VedicChart; readonly chart: NatalChart }): JSX.Element {
  const { t } = useTranslator();
  const [system, setSystem] = useState<DashaSystemId>('vimshottari');
  const [from, setFrom] = useState<From>('moon');
  const [anchor, setAnchor] = useState<'civilDate' | 'birthMoment'>('civilDate');
  const [yearLength, setYearLength] = useState<YearLengthName>('julian');
  const [trail, setTrail] = useState<readonly DashaNode[]>([]);
  const off = chart.offsetMinutes;

  const g = useMemo(() => grahaLongitudes(vchart), [vchart]);
  const fromOptions: From[] = vchart.lagna ? ['moon', 'lagna', 'sun', 'mars', 'mercury', 'jupiter', 'venus', 'saturn', 'rahu', 'ketu'] : ['moon', 'sun', 'mars', 'mercury', 'jupiter', 'venus', 'saturn', 'rahu', 'ketu'];
  const lon = from === 'lagna' ? g.lagna! : g.lon[from];

  const result = useMemo(() => dashas(system, lon, chart.jdUT, {
    yearDays: YEAR_LENGTHS[yearLength],
    anchor,
    localMidnightJd: localMidnightJd(chart.jdUT, off),
    spanYears: 120,
  }), [system, lon, chart.jdUT, yearLength, anchor, off]);

  const now = Date.now() / 86_400_000 + 2440587.5;
  const running = useMemo(() => runningPath(result, now, 5), [result, now]);
  const runningIds = new Set(running.map((r) => r.path.join('/')));
  const rows = trail.length === 0 ? result.mahadashas : subPeriods(trail[trail.length - 1]!);
  const bal = yearsToYmd(result.balanceYears);
  const name = (l: string) => GRAHA_NAME[l] ?? l;
  const reset = <T,>(set: (v: T) => void) => (v: T) => { set(v); setTrail([]); };

  return (
    <section className="as-card">
      <h2 className="as-h2">{t('vedic.section.dasha')}</h2>
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <Select label={t('vedic.dasha.system')} value={system} onChange={reset(setSystem)}
          options={[['vimshottari', 'Viṁśottarī (120)'], ['ashtottari', 'Aṣṭottarī (108)'], ['yogini', 'Yoginī (36)']]} />
        <Select label={t('vedic.dasha.from')} value={from} onChange={reset(setFrom)}
          options={fromOptions.map((f) => [f, name(f)] as const)} />
        <Select label={t('vedic.dasha.anchor')} value={anchor} onChange={reset(setAnchor)}
          options={[['civilDate', t('vedic.dasha.anchor.civilDate')], ['birthMoment', t('vedic.dasha.anchor.birthMoment')]]} />
        <Select label={t('vedic.dasha.yearLength')} value={yearLength} onChange={reset(setYearLength)}
          options={(Object.keys(YEAR_LENGTHS) as YearLengthName[]).map((k) => [k, `${k} · ${YEAR_LENGTHS[k]} d`] as const)} />
      </div>

      <p className="mb-2 text-sm">
        {t('vedic.dasha.balanceYmd', { lord: name(result.firstLord), y: bal.years, m: bal.months, d: bal.days })}
        {running.length > 0 ? (
          <span className="ms-2" style={MUTED}>
            · {t('vedic.dasha.running')}: {running.map((r) => name(r.lord)).join(' / ')}
          </span>
        ) : null}
      </p>

      <nav className="mb-2 flex flex-wrap items-center gap-1 text-sm" aria-label={t('vedic.dasha.levels')}>
        <button type="button" className="as-button-secondary" onClick={() => setTrail([])} disabled={trail.length === 0}>
          {LEVELS[0]} ({DASHA_SYSTEMS[system].lords.length})
        </button>
        {trail.map((n, i) => (
          <button key={n.path.join('/')} type="button" className="as-button-secondary"
            onClick={() => setTrail(trail.slice(0, i + 1))} disabled={i === trail.length - 1}>
            › {n.path.map(name).join(' / ')}
          </button>
        ))}
      </nav>

      <Table head={[`${LEVELS[trail.length]} ${t('vedic.column.lord')}`, t('vedic.column.start'), t('vedic.column.end'), t('vedic.column.period')]}>
        {rows.map((r) => {
          const isRunning = runningIds.has(r.path.join('/'));
          const canOpen = r.level < 5;
          return (
            <tr key={r.path.join('/') + r.startJd} style={{ ...ROW, ...(isRunning ? { background: 'var(--as-accent-soft, rgba(80,120,255,.12))' } : {}) }}>
              <th scope="row" className={`${TD} text-left font-medium`}>
                {canOpen ? (
                  <button type="button" className="underline decoration-dotted" onClick={() => setTrail([...trail, r])}>
                    {name(r.lord)}
                  </button>
                ) : name(r.lord)}
                {isRunning ? <span className="ms-1 text-xs" style={MUTED}>● {t('vedic.dasha.running')}</span> : null}
              </th>
              <td className={TD}>{localDate(Math.max(r.startJd, result.anchorJd), off)}</td>
              <td className={TD}>{localDate(r.endJd, off)}</td>
              <td className={TD}>{(() => { const y = yearsToYmd(r.years); return `${y.years}y ${y.months}m ${y.days}d`; })()}</td>
            </tr>
          );
        })}
      </Table>
      <p className="as-fineprint mt-3">
        {t('vedic.dasha.note', { offset: utcOffsetLabel(off) })}
      </p>
    </section>
  );
}
