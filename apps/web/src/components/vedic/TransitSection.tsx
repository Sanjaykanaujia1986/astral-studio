/**
 * Transit pages: the daily power chart and the Moon's daily tārā for a chosen
 * month, and the year's gochar (sign changes) with their houses, bindus and
 * the daśā running at the time.
 */
import { useMemo, useState, type JSX } from 'react';
import type { EphemerisProvider, NatalChart } from '@astro/engine';
import { useTranslator } from '@astro/i18n';
import {
  SEVEN, NAKSHATRAS, grahaLongitudes, dailyPower, moonTaraSchedule, gochar, localJd, type VedicChart,
} from '@astro/vedic';
import { GRAHA_NAME, RASHI_NAME, ROW, Select, Table, TD, MUTED, localDateTime } from './shared.js';

const gn = (g: string): string => GRAHA_NAME[g] ?? g;
const dashaText = (d: readonly string[]): string => d.map((x) => gn(x).slice(0, 2)).join('/');

export function TransitSection({ vchart, chart, provider }: {
  readonly vchart: VedicChart; readonly chart: NatalChart; readonly provider: EphemerisProvider;
}): JSX.Element {
  const { t, locale } = useTranslator();
  const now = new Date();
  const [year, setYear] = useState(String(now.getFullYear()));
  const [month, setMonth] = useState(String(now.getMonth() + 1));
  const [view, setView] = useState<'power' | 'moon' | 'gochar'>('power');
  const g = useMemo(() => grahaLongitudes(vchart), [vchart]);
  const off = chart.offsetMinutes;
  const ctx = useMemo(() => ({
    birthJd: chart.jdUT, utcOffsetMinutes: off, zodiac: chart.settings.zodiac,
    node: chart.settings.nodeType === 'true' ? 'trueNode' as const : 'meanNode' as const,
  }), [chart, off]);
  const y = Number(year); const m = Number(month);
  const data = useMemo(() => {
    if (view === 'power') return { power: dailyPower(provider, g, ctx, y, m) };
    if (view === 'moon') {
      const from = localJd(y, m, 1, 0, off); const to = localJd(m === 12 ? y + 1 : y, m === 12 ? 1 : m + 1, 1, 0, off);
      return { moon: moonTaraSchedule(provider, g, ctx.zodiac, from, to) };
    }
    return { gochar: gochar(provider, g, ctx, localJd(y, 1, 1, 0, off), localJd(y + 1, 1, 1, 0, off)) };
  }, [view, provider, g, ctx, y, m, off]);
  const monthName = (k: number): string => new Intl.DateTimeFormat(locale.code, { month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(2000, k - 1, 1)));
  const nak = (n: number): string => t(`nakshatra.${NAKSHATRAS[n]!}` as 'nakshatra.ashwini');

  return (
    <section className="as-card">
      <h2 className="as-h2">{t('vedic.section.transits')}</h2>
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <Select label={t('vedic.tb.table')} value={view} onChange={setView}
          options={[['power', t('vedic.tr.power')], ['moon', t('vedic.tr.moon')], ['gochar', t('vedic.tr.gochar')]]} />
        <Select label={t('vedic.varsha.year')} value={year} onChange={setYear}
          options={Array.from({ length: 41 }, (_, i) => String(now.getFullYear() - 10 + i)).map((v) => [v, v] as const)} />
        {view !== 'gochar' ? (
          <Select label={t('vedic.tr.month')} value={month} onChange={setMonth}
            options={Array.from({ length: 12 }, (_, i) => [String(i + 1), monthName(i + 1)] as const)} />
        ) : null}
      </div>

      {data.power ? (
        <>
          <Table head={[t('vedic.tr.day'), ...SEVEN.map(gn), t('vedic.sb.total'), '±28', t('vedic.tr.dasha')]}>
            {data.power.map((d) => (
              <tr key={d.day} style={ROW}>
                <th scope="row" className={`${TD} text-left font-medium`}>{d.day}</th>
                {SEVEN.map((p) => (
                  <td key={p} className={TD} title={RASHI_NAME[d.planets[p].sign]}>
                    <span style={MUTED}>{d.planets[p].house}·</span>{d.planets[p].bindus}
                  </td>
                ))}
                <td className={`${TD} font-semibold`}>{d.total}</td>
                <td className={`${TD} font-semibold`}>{d.score > 0 ? `+${d.score}` : d.score}</td>
                <td className={TD}>{dashaText(d.dasha)}</td>
              </tr>
            ))}
          </Table>
          <p className="as-fineprint mt-3">{t('vedic.tr.powerNote')}</p>
        </>
      ) : null}

      {data.moon ? (
        <>
          <Table head={[t('vedic.column.start'), t('vedic.column.end'), t('vedic.tb.av.nakshatra'), t('vedic.tr.padas'), t('vedic.tb.tara'), t('vedic.tb.sign'), t('vedic.kp.house'), t('vedic.tr.sav')]}>
            {data.moon.map((s) => (
              <tr key={s.startJd} style={ROW}>
                <td className={TD}>{localDateTime(s.startJd, off)}</td>
                <td className={TD}>{localDateTime(s.endJd, off)}</td>
                <th scope="row" className={`${TD} text-left font-medium`}>{nak(s.nakshatra)}</th>
                <td className={TD}>{s.padas.join(', ')}</td>
                <td className={TD}>{t(`vedic.tr.tara.${s.tara}` as 'vedic.tr.tara.janma')}</td>
                <td className={TD}>{RASHI_NAME[s.sign]}</td>
                <td className={TD}>{s.houseFromLagna ?? '—'}</td>
                <td className={TD}>{s.sarva ?? '—'}</td>
              </tr>
            ))}
          </Table>
          <p className="as-fineprint mt-3">{t('vedic.tr.moonNote')}</p>
        </>
      ) : null}

      {data.gochar ? (
        <>
          <Table head={[t('vedic.tr.date'), t('vedic.kp.body'), t('vedic.tr.enters'), t('vedic.tr.fromLagna'), t('vedic.tr.fromMoon'), t('vedic.tr.bindus'), t('vedic.tr.sav'), t('vedic.tr.dasha')]}>
            {data.gochar.map((e) => (
              <tr key={`${e.body}${e.jd}`} style={ROW}>
                <td className={TD}>{localDateTime(e.jd, off)}</td>
                <th scope="row" className={`${TD} text-left font-medium`}>{gn(e.body)}{e.retrograde ? ` (${t('vedic.tr.reentry')})` : ''}</th>
                <td className={TD}>{RASHI_NAME[e.sign]}</td>
                <td className={TD}>{e.houseFromLagna ?? '—'}</td>
                <td className={TD}>{e.houseFromMoon}</td>
                <td className={TD}>{e.bindus ?? '—'}</td>
                <td className={TD}>{e.sarva ?? '—'}</td>
                <td className={TD}>{dashaText(e.dasha)}</td>
              </tr>
            ))}
          </Table>
          <p className="as-fineprint mt-3">{t('vedic.tr.gocharNote')}</p>
        </>
      ) : null}
    </section>
  );
}
