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
import { VedicChartFigure, SignPosition, BodyGlyph, type VedicLayoutStyle } from '@astro/ui';
import { vedicChart, VARGAS, type Varga } from '@astro/vedic';
import { getProvider } from '../lib/engine.js';
import { DashaSection } from './vedic/DashaSection.js';
import { SadeSatiSection } from './vedic/SadeSatiSection.js';
import { MatchingSection } from './vedic/MatchingSection.js';
import { YogaSection } from './vedic/YogaSection.js';
import { KpSection } from './vedic/KpSection.js';
import { AshtakavargaSection } from './vedic/AshtakavargaSection.js';
import { ShadbalaSection } from './vedic/ShadbalaSection.js';
import { VarshaphalSection } from './vedic/VarshaphalSection.js';
import { TablesSection } from './vedic/TablesSection.js';
import { TransitSection } from './vedic/TransitSection.js';
import { WesternSection } from './vedic/WesternSection.js';
import { useSettings } from '../lib/settings.js';
import { useChartTheme } from '../lib/chart-theme.js';

export interface VedicPanelProps {
  readonly chart: NatalChart;
}

const TH = 'px-2 py-1.5 text-left text-xs font-medium uppercase tracking-wide';
const TD = 'px-2 py-1.5 whitespace-nowrap tabular-nums';
const FIELD = 'w-full max-w-full rounded-md border px-3 py-1.5 text-sm';

export function VedicPanel({ chart }: VedicPanelProps): JSX.Element {
  const { t, n, d } = useTranslator();
  const settings = useSettings();
  const chartTheme = useChartTheme();
  const [style, setStyle] = useState<VedicLayoutStyle>('north');
  const [varga, setVarga] = useState<Varga>('D1');

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
      vimshottari: { yearLength: 'julian' },
      ...(provider ? { provider, place: chart.place } : {}),
    });
  }, [chart, isSidereal, provider]);

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

        {/*
          The figure follows the page, like the wheel does. Without this it
          drew a white square on the night sky and took its labels from the
          light palette — grey on white at 3.65:1.
        */}
        <VedicChartFigure
          theme={chartTheme}
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
                    <SignPosition longitude={result.lagna.longitude} precision={settings.precision} label={sign(result.lagna.signIndex)} />
                  </td>
                  <td className={TD}>1</td>
                  <td className={TD}>{t(`nakshatra.${result.lagna.nakshatra.nakshatra}` as 'nakshatra.ashwini')}</td>
                  <td className={TD}>{n(result.lagna.nakshatra.pada)}</td>
                </tr>
              ) : null}
              {result.placements.map((p) => (
                <tr key={p.body} style={{ borderBottom: '1px solid var(--as-border)' }}>
                  <th scope="row" className={`${TD} text-left font-normal`}>
                    <span className="inline-flex items-center gap-2">
                      <BodyGlyph body={p.body} className="as-text-accent" />
                      {t(`body.${p.body}` as 'body.sun')}{p.retrograde ? ' ℞' : ''}
                    </span>
                  </th>
                  {/*
                    The same formatter, precision and padding as the Western
                    planet table. A decimal degree here would be the only
                    place in the product reading 1.23° where everywhere else
                    reads 01°13'.
                  */}
                  <td className={TD}>
                    <SignPosition longitude={p.longitude} precision={settings.precision} label={sign(p.signIndex)} />
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

      <DashaSection vchart={result} chart={chart} />

      {provider ? <SadeSatiSection vchart={result} chart={chart} provider={provider} /> : null}

      <YogaSection vchart={result} />

      {provider && result.lagna ? <TablesSection vchart={result} chart={chart} provider={provider} /> : null}

      {result.lagna ? <AshtakavargaSection vchart={result} /> : null}

      {provider && result.lagna ? <ShadbalaSection vchart={result} chart={chart} provider={provider} /> : null}

      {provider && result.lagna ? <KpSection chart={chart} provider={provider} /> : null}

      {provider && result.lagna ? <VarshaphalSection chart={chart} provider={provider} /> : null}

      {provider && result.lagna ? <TransitSection vchart={result} chart={chart} provider={provider} /> : null}

      {provider ? <WesternSection chart={chart} provider={provider} /> : null}

      <MatchingSection vchart={result} chart={chart} />

      <p className="as-fineprint">{t('vedic.conventions')}</p>
    </div>
  );
}
