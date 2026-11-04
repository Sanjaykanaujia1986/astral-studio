/**
 * The Vedic workspace.
 *
 * Requires a **sidereal** chart and says so plainly when given a tropical one,
 * rather than converting silently. A tropical chart read as Vedic puts every
 * graha about 24° from where it belongs — wrong rāśi, wrong nakṣatra, wrong
 * daśā lord — and looks entirely normal, which is exactly why the refusal is
 * loud.
 */
import { useEffect, useMemo, useState, type JSX } from 'react';
import type { EphemerisProvider, NatalChart } from '@astro/engine';
import { Link } from 'react-router-dom';
import { useTranslator } from '@astro/i18n';
import { VedicChartFigure, formatLongitude, type VedicLayoutStyle } from '@astro/ui';
import { vedicChart, VARGAS, YEAR_LENGTHS, type Varga, type YearLengthName } from '@astro/vedic';
import { getProvider } from '../lib/engine.js';
import { useSettings } from '../lib/settings.js';

export interface VedicPanelProps {
  readonly chart: NatalChart;
}

const TH = 'px-2 py-1.5 text-left text-xs font-medium uppercase tracking-wide';
const TD = 'px-2 py-1.5 whitespace-nowrap tabular-nums';
const FIELD = 'w-full max-w-full rounded-md border px-3 py-1.5 text-sm';

export function VedicPanel({ chart }: VedicPanelProps): JSX.Element {
  const { t, n, d } = useTranslator();
  const settings = useSettings();
  const [style, setStyle] = useState<VedicLayoutStyle>('north');
  const [varga, setVarga] = useState<Varga>('D1');
  const [yearLength, setYearLength] = useState<YearLengthName>('gregorian');

  const isSidereal = chart.settings.zodiac.kind === 'sidereal';

  /*
   * Four of the five limbs of the pañcāṅga, and everything else on this
   * screen, are functions of longitudes the chart already carries. Only the
   * vāra needs the ephemeris again, for real sunrise. So the chart renders
   * from the first frame and the vāra appears when the provider resolves —
   * which, since the chart was cast with it, is immediate in practice. Until
   * then the vāra is marked pending rather than filled in from midnight.
   */
  const [provider, setProvider] = useState<EphemerisProvider | null>(null);
  useEffect(() => {
    let live = true;
    void getProvider().then((p) => { if (live) setProvider(p); });
    return () => { live = false; };
  }, []);

  const result = useMemo(() => {
    if (!isSidereal) return null;
    return vedicChart(chart, {
      vimshottari: { yearLength },
      ...(provider ? { provider, place: chart.place } : {}),
    });
  }, [chart, isSidereal, yearLength, provider]);

  if (!isSidereal || !result) {
    return (
      <section className="as-card" style={{ borderColor: 'var(--as-accent)' }}>
        <p className="as-body">{t('vedic.needsSidereal')}</p>
        <Link to="/chart" className="as-button-secondary">{t('vedic.openChartStudio')}</Link>
      </section>
    );
  }

  const sign = (index: number) =>
    t(`sign.${['aries','taurus','gemini','cancer','leo','virgo','libra','scorpio','sagittarius','capricorn','aquarius','pisces'][index]}` as 'sign.aries');

  return (
    <div className="flex flex-col gap-5">
      <section className="as-card">
        <h2 className="as-h2">{t('vedic.section.rashi')}</h2>
        <div className="mb-3 flex flex-wrap items-end gap-3">
          <label className="min-w-0 max-w-full text-sm">
            <span className="block font-medium">{t('vedic.layout.label')}</span>
            <select
              value={style}
              onChange={(e) => setStyle(e.target.value as VedicLayoutStyle)}
              className={`mt-1 ${FIELD}`}
              style={{ borderColor: 'var(--as-border-strong)', background: 'var(--as-surface)', color: 'var(--as-ink)' }}
            >
              <option value="north">{t('vedic.layout.north')}</option>
              <option value="south">{t('vedic.layout.south')}</option>
            </select>
          </label>

          <label className="min-w-0 max-w-full text-sm">
            <span className="block font-medium">{t('vedic.varga.label')}</span>
            <select
              value={varga}
              onChange={(e) => setVarga(e.target.value as Varga)}
              className={`mt-1 ${FIELD}`}
              style={{ borderColor: 'var(--as-border-strong)', background: 'var(--as-surface)', color: 'var(--as-ink)' }}
            >
              {VARGAS.map((v) => (
                <option key={v} value={v}>
                  {v} · {t(`varga.sig.${v}` as 'varga.sig.D1')}
                </option>
              ))}
            </select>
          </label>

          <p className="ml-auto text-xs" style={{ color: 'var(--as-ink-muted)' }}>
            {t('vedic.ayanamsha')}: {t(`ayanamsha.${result.ayanamshaName}` as 'ayanamsha.lahiri')}
            {' · '}
            {n(result.ayanamsha, { maximumFractionDigits: 4 })}°
            {' · '}
            {result.usesMeanNodes ? t('vedic.nodes.mean') : t('vedic.nodes.true')}
          </p>
        </div>

        <VedicChartFigure
          chart={result}
          style={style}
          varga={varga}
          size={400}
          glyphStyle={settings.glyphStyle}
          className="mx-auto"
        />
      </section>

      <section className="as-card">
        <h2 className="as-h2">{t('vedic.section.placements')}</h2>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--as-border)' }}>
                {['body', 'sign', 'house', 'nakshatra', 'pada'].map((c) => (
                  <th key={c} className={TH} style={{ color: 'var(--as-ink-muted)' }}>
                    {t(`vedic.column.${c}` as 'vedic.column.body')}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.lagna ? (
                <tr style={{ borderBottom: '1px solid var(--as-border)' }}>
                  <th scope="row" className={`${TD} text-left font-medium`}>{t('vedic.lagna')}</th>
                  <td className={TD}>
                    {formatLongitude(result.lagna.longitude, {
                      precision: settings.precision,
                      signLabel: sign(result.lagna.signIndex),
                    })}
                  </td>
                  <td className={TD}>1</td>
                  <td className={TD}>{t(`nakshatra.${result.lagna.nakshatra.nakshatra}` as 'nakshatra.ashwini')}</td>
                  <td className={TD}>{n(result.lagna.nakshatra.pada)}</td>
                </tr>
              ) : null}
              {result.placements.map((p) => (
                <tr key={p.body} style={{ borderBottom: '1px solid var(--as-border)' }}>
                  <th scope="row" className={`${TD} text-left font-normal`}>
                    {t(`body.${p.body}` as 'body.sun')}{p.retrograde ? ' ℞' : ''}
                  </th>
                  {/*
                    The same formatter, precision and padding as the Western
                    planet table. A decimal degree here would be the only
                    place in the product reading 1.23° where everywhere else
                    reads 01°13'.
                  */}
                  <td className={TD}>
                    {formatLongitude(p.longitude, {
                      precision: settings.precision,
                      signLabel: sign(p.signIndex),
                    })}
                  </td>
                  <td className={TD}>{p.house === 0 ? '—' : n(p.house)}</td>
                  <td className={TD}>{t(`nakshatra.${p.nakshatra.nakshatra}` as 'nakshatra.ashwini')}</td>
                  <td className={TD}>{n(p.nakshatra.pada)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {result.panchang ? (
        <section className="as-card">
          <h2 className="as-h2">{t('vedic.section.panchang')}</h2>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
            {([
              ['vedic.panchang.tithi',
                `${t(result.panchang.tithi.nameKey as 'tithi.purnima')} · ${t(`vedic.paksha.${result.panchang.tithi.paksha}` as 'vedic.paksha.shukla')}`],
              ['vedic.panchang.vara',
                result.panchang.vara ? t(`weekday.${result.panchang.vara}` as 'weekday.ravivara') : '—'],
              ['vedic.panchang.nakshatra',
                t(`nakshatra.${result.panchang.nakshatra.nakshatra}` as 'nakshatra.ashwini')],
              ['vedic.panchang.yoga', t(result.panchang.yoga.nameKey as 'yoga.vishkambha')],
              ['vedic.panchang.karana', t(result.panchang.karana.nameKey as 'karana.bava')],
              ['vedic.panchang.sunrise',
                result.panchang.sunriseIso
                  ? d(result.panchang.sunriseIso, { timeStyle: 'short', timeZone: 'UTC' }) + ' UTC'
                  : '—'],
            ] as const).map(([key, value]) => (
              <div key={key}>
                <dt className="text-xs uppercase tracking-wide" style={{ color: 'var(--as-ink-muted)' }}>
                  {t(key)}
                </dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          {result.panchang.varaUnavailableReason ? (
            <p className="as-fineprint mt-3">{t('vedic.panchang.noSunrise')}</p>
          ) : null}
          {!provider ? (
            <p className="as-fineprint mt-3">{t('vedic.panchang.sunrisePending')}</p>
          ) : null}
        </section>
      ) : null}

      {result.dasha ? (
        <section className="as-card">
          <h2 className="as-h2">{t('vedic.section.dasha')}</h2>
          <div className="mb-3 flex flex-wrap items-end gap-3">
            <label className="min-w-0 max-w-full text-sm">
              <span className="block font-medium">{t('vedic.dasha.yearLength')}</span>
              <select
                value={yearLength}
                onChange={(e) => setYearLength(e.target.value as YearLengthName)}
                className={`mt-1 ${FIELD}`}
                style={{ borderColor: 'var(--as-border-strong)', background: 'var(--as-surface)', color: 'var(--as-ink)' }}
              >
                {(Object.keys(YEAR_LENGTHS) as YearLengthName[]).map((name) => (
                  <option key={name} value={name}>{name} · {YEAR_LENGTHS[name]} d</option>
                ))}
              </select>
            </label>
            <p className="text-xs" style={{ color: 'var(--as-ink-muted)' }}>
              {t('vedic.balance', {
                years: n(result.dasha.balanceYears, { maximumFractionDigits: 2 }),
                lord: t(`dashaLord.${result.dasha.periods[0]!.lord}` as 'dashaLord.ketu'),
              })}
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--as-border)' }}>
                  <th className={TH} style={{ color: 'var(--as-ink-muted)' }}>{t('vedic.column.lord')}</th>
                  <th className={TH} style={{ color: 'var(--as-ink-muted)' }}>{t('vedic.column.dates')}</th>
                  <th className={TH} style={{ color: 'var(--as-ink-muted)' }}>{t('vedic.column.period')}</th>
                </tr>
              </thead>
              <tbody>
                {result.dasha.periods.map((period) => (
                  <tr key={period.lord + period.startJd} style={{ borderBottom: '1px solid var(--as-border)' }}>
                    <th scope="row" className={`${TD} text-left font-medium`}>
                      {t(`dashaLord.${period.lord}` as 'dashaLord.ketu')}
                    </th>
                    <td className={TD}>
                      {d(period.startIso, { dateStyle: 'medium', timeZone: 'UTC' })}
                      {' → '}
                      {d(period.endIso, { dateStyle: 'medium', timeZone: 'UTC' })}
                    </td>
                    <td className={TD}>{n(period.years, { maximumFractionDigits: 2 })} y</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="as-fineprint mt-3">
            {t('vedic.yearLength', {
              days: n(result.dasha.yearLengthDays, { maximumFractionDigits: 4 }),
              name: result.dasha.yearLengthName,
            })}
          </p>
        </section>
      ) : null}

      <p className="as-fineprint">{t('vedic.conventions')}</p>
    </div>
  );
}
