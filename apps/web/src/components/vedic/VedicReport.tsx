/**
 * The printed Vedic horoscope (janma kuṇḍalī).
 *
 * Built the way the Western report is: one React tree that is both the
 * preview and the printed document, laid out in `.report-page` sheets at the
 * chosen paper size, on the light `as-paper` tokens whatever the screen is
 * doing. "Save as PDF" in the browser's print dialogue keeps the charts vector.
 *
 * Every number comes from the same functions, with the same defaults, as the
 * Vedic page (Viṁśottarī counted from 00:00 local on the birth date, 365.25-day
 * years, dates in the birth time zone), so the printout cannot disagree with
 * the screen the reader just checked it against.
 *
 * The sections that need the ephemeris again (the vāra, ṣaḍbala, Saturn's
 * transits) say they are calculating until the provider resolves, rather than
 * printing a gap that looks like an empty result.
 */
import { useEffect, useMemo, useState, type JSX, type ReactNode } from 'react';
import type { EphemerisProvider, NatalChart } from '@astro/engine';
import { useTranslator } from '@astro/i18n';
import {
  BodyGlyph, SignPosition, VedicChartFigure, pageCss,
  type ChartTheme, type DegreePrecision, type PaperSpec, type VedicLayoutStyle,
} from '@astro/ui';
import {
  vedicChart, dashas, subPeriods, runningPath, yearsToYmd, localMidnightJd, grahaLongitudes, YEAR_LENGTHS,
  yogas, ashtakavarga, AV_OWNERS, shadbala, SEVEN, sadeSati, avakahada, englishSpelling, NAKSHATRAS,
} from '@astro/vedic';
import { getProvider } from '../../lib/engine.js';
import { ROW, Table, TD, localDate, localDateTime, utcOffsetLabel, fix, useJy } from './shared.js';
import { useYogaReason } from './YogaSection.js';

import { ALL_VEDIC_SECTIONS, type VedicReportSections } from './reportSections.js';

export { ALL_VEDIC_SECTIONS, VEDIC_SECTION_KEYS, type VedicReportSections } from './reportSections.js';

export interface VedicReportProps {
  readonly chart: NatalChart;
  readonly paper: PaperSpec;
  readonly sections?: Partial<VedicReportSections>;
  readonly style?: VedicLayoutStyle;
  readonly precision?: DegreePrecision;
  readonly theme?: Partial<ChartTheme>;
  readonly attribution: string;
  /** Fixed generation timestamp: also the "now" the running daśā is marked against. */
  readonly generatedIso: string;
}

const H2 = 'report-heading mb-2 text-sm font-semibold';
/*
 * The antardaśā grid is the densest thing in the horoscope: up to 99 rows. At
 * the report's 10px table size it runs a line past an A4 sheet and strands the
 * footer on a blank page, so it is set a size smaller and closer, as printed
 * kuṇḍalīs set it.
 */
const COMPACT = { fontSize: '9px', lineHeight: 1.25 } as const;
const CELL = { padding: '0 2px' } as const;

function Footer({ attribution, generatedIso }: { attribution: string; generatedIso: string }): JSX.Element {
  const { t, d } = useTranslator();
  return (
    <footer className="report-footer mt-6 border-t as-border-strong pt-2 text-[9px] leading-snug as-text-muted">
      <p>{attribution}</p>
      <p>
        {t('report.generated')}:{' '}
        {d(generatedIso, { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' })} UTC
      </p>
    </footer>
  );
}

/** Label-value pairs in a grid, the way a printed kuṇḍalī lays out its particulars. */
function Facts({ rows, cols = 3 }: { rows: readonly (readonly [string, ReactNode])[]; cols?: 2 | 3 }): JSX.Element {
  return (
    <dl className={`report-block grid gap-x-6 gap-y-1.5 text-[11px] ${cols === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
      {rows.map(([k, v]) => (
        <div key={k}>
          <dt className="text-[9px] uppercase tracking-wide as-text-muted">{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

const Pending = (): JSX.Element => {
  const { t } = useTranslator();
  return <p className="text-[11px] as-text-muted">{t('report.vedic.pending')}</p>;
};

export function VedicReport({
  chart, paper, sections, style = 'north', precision = 'minute', theme, attribution, generatedIso,
}: VedicReportProps): JSX.Element {
  const { t, n } = useTranslator();
  const { gn, rn, sc } = useJy();
  const reason = useYogaReason();
  const include: VedicReportSections = { ...ALL_VEDIC_SECTIONS, ...sections };
  const off = chart.offsetMinutes;

  const [provider, setProvider] = useState<EphemerisProvider | null>(null);
  useEffect(() => {
    let live = true;
    void getProvider().then((p) => { if (live) setProvider(p); });
    return () => { live = false; };
  }, []);

  const vchart = useMemo(() => vedicChart(chart, {
    vimshottari: { yearLength: 'julian' },
    ...(provider ? { provider, place: chart.place } : {}),
  }), [chart, provider]);
  const g = useMemo(() => grahaLongitudes(vchart), [vchart]);

  // The Vedic page's defaults: from the Moon, civil-date anchor, 365.25-day years.
  const dasha = useMemo(() => dashas('vimshottari', g.lon.moon, chart.jdUT, {
    yearDays: YEAR_LENGTHS.julian,
    anchor: 'civilDate',
    localMidnightJd: localMidnightJd(chart.jdUT, off),
    spanYears: 120,
  }), [g, chart.jdUT, off]);
  const nowJd = Date.parse(generatedIso) / 86_400_000 + 2440587.5;
  const running = new Set(runningPath(dasha, nowJd, 2).map((r) => r.path.join('/')));

  const yogaList = useMemo(() => yogas(g).filter((y) => y.holds || y.holdsWithNodes), [g]);
  const av = useMemo(() => (vchart.lagna ? ashtakavarga(g) : null), [vchart, g]);
  const sb = useMemo(() => (provider && vchart.lagna ? shadbala(provider, g, {
    jdUT: chart.jdUT, latitude: chart.place.latitude, longitude: chart.place.longitude,
    zodiac: chart.settings.zodiac, utcOffsetMinutes: off,
  }) : null), [provider, vchart, g, chart, off]);
  const ss = useMemo(() => (provider ? sadeSati(provider, g.lon.moon, chart.jdUT, {
    zodiac: chart.settings.zodiac, years: 100, ...(g.lagna === undefined ? {} : { lagna: g.lagna }),
  }) : null), [provider, g, chart]);

  const signName = (i: number): string => rn(i);
  const nakName = (i: number): string => t(`nakshatra.${NAKSHATRAS[i]!}` as 'nakshatra.ashwini');
  const ymd = (years: number): string => { const y = yearsToYmd(years); return t('vedic.dasha.ymd', { y: y.years, m: y.months, d: y.days }); };
  const footer = <Footer attribution={attribution} generatedIso={generatedIso} />;
  const moon = vchart.placements.find((p) => p.body === 'moon');
  const heading = chart.input.name || t('report.untitledSubject');
  const figureMm = Math.min((paper.contentWidthMm - 8) / 2, paper.contentHeightMm - 100);
  const a = avakahada(g.lon.moon);
  const pc = vchart.panchang;

  const localTime = (iso: string): string => {
    const jd = Date.parse(iso) / 86_400_000 + 2440587.5;
    return localDateTime(jd, off).slice(11);
  };

  return (
    <div className="report-root as-paper as-text">
      <style>{pageCss(paper)}</style>

      {/* ---- particulars and the two charts ---- */}
      <article className="report-page">
        <header className="report-block mb-4 border-b as-border-strong pb-3">
          <p className="text-[10px] uppercase tracking-widest as-text-muted">{t('report.vedic.title')}</p>
          <h1 className="text-lg font-semibold">{heading}</h1>
          <p className="text-[11px] as-text-muted">
            {localDateTime(chart.jdUT, off)} ({utcOffsetLabel(off)}){chart.place.label ? ` · ${chart.place.label}` : ''}
          </p>
        </header>

        <h2 className={H2}>{t('report.vedic.birthDetails')}</h2>
        <Facts rows={[
          [t('report.vedic.dateTime'), `${localDateTime(chart.jdUT, off)}`],
          [t('report.vedic.timeZone'), utcOffsetLabel(off)],
          [t('summary.birthplace'), chart.place.label ?? '—'],
          [t('report.vedic.coordinates'), `${n(chart.place.latitude, { maximumFractionDigits: 4 })}°, ${n(chart.place.longitude, { maximumFractionDigits: 4 })}°`],
          [t('vedic.ayanamsha'), `${t(`ayanamsha.${vchart.ayanamshaName}` as 'ayanamsha.lahiri')} · ${n(vchart.ayanamsha, { maximumFractionDigits: 4 })}°`],
          [t('summary.nodeType'), vchart.usesMeanNodes ? t('vedic.nodes.mean') : t('vedic.nodes.true')],
          [t('vedic.lagna'), vchart.lagna ? <SignPosition longitude={vchart.lagna.longitude} precision={precision} label={signName(vchart.lagna.signIndex)} /> : '—'],
          [t('report.vedic.moon'), moon ? `${signName(moon.signIndex)} · ${nakName(moon.nakshatra.index)} ${n(moon.nakshatra.pada)}` : '—'],
          [t('vedic.panchang.sunrise'), pc?.sunriseIso ? `${localTime(pc.sunriseIso)} (${utcOffsetLabel(off)})` : '—'],
        ]} />

        {include.charts ? (
          <div className="report-block mt-5 flex justify-center gap-8">
            {(['D1', 'D9'] as const).map((v) => (
              <figure key={v} style={{ width: `${figureMm}mm` }}>
                <figcaption className="mb-1 text-center text-[11px] font-semibold">
                  {t(v === 'D1' ? 'report.vedic.lagnaChart' : 'report.vedic.navamshaChart')}
                </figcaption>
                <VedicChartFigure chart={vchart} style={style} varga={v} size={1000} {...(theme ? { theme } : {})} />
              </figure>
            ))}
          </div>
        ) : null}

        {include.planets ? (
          <section className="mt-5">
            <h2 className={H2}>{t('vedic.section.placements')}</h2>
            <Table head={[t('vedic.column.body'), t('vedic.column.sign'), t('vedic.column.nakshatra'), t('vedic.column.pada'), t('vedic.tb.av.starLord'), t('vedic.column.house')]}>
              {vchart.lagna ? (
                <tr style={ROW}>
                  <th scope="row" className={`${TD} text-left font-semibold`}>{t('vedic.lagna')}</th>
                  <td className={TD}><SignPosition longitude={vchart.lagna.longitude} precision={precision} label={signName(vchart.lagna.signIndex)} /></td>
                  <td className={TD}>{nakName(vchart.lagna.nakshatra.index)}</td>
                  <td className={TD}>{n(vchart.lagna.nakshatra.pada)}</td>
                  <td className={TD}>{gn(vchart.lagna.nakshatra.lord)}</td>
                  <td className={TD}>{n(1)}</td>
                </tr>
              ) : null}
              {vchart.placements.map((p) => (
                <tr key={p.body} style={ROW}>
                  <th scope="row" className={`${TD} text-left font-normal`}>
                    <span className="inline-flex items-center gap-1.5">
                      <BodyGlyph body={p.body} tinted />
                      {t(`body.${p.body}` as 'body.sun')}{p.retrograde ? ' ℞' : ''}
                    </span>
                  </th>
                  <td className={TD}><SignPosition longitude={p.longitude} precision={precision} label={signName(p.signIndex)} /></td>
                  <td className={TD}>{nakName(p.nakshatra.index)}</td>
                  <td className={TD}>{n(p.nakshatra.pada)}</td>
                  <td className={TD}>{gn(p.nakshatra.lord)}</td>
                  <td className={TD}>{p.house === 0 ? '—' : n(p.house)}</td>
                </tr>
              ))}
            </Table>
          </section>
        ) : null}

        {footer}
      </article>

      {/* ---- pañcāṅga, avakahaḍā, yogas ---- */}
      {include.panchang || include.yogas ? (
        <article className="report-page">
          {include.panchang ? (
            <>
              {pc ? (
                <section className="mb-5">
                  <h2 className={H2}>{t('vedic.section.panchang')}</h2>
                  <Facts rows={[
                    [t('vedic.panchang.tithi'), `${t(pc.tithi.nameKey as 'tithi.purnima')} · ${t(`vedic.paksha.${pc.tithi.paksha}` as 'vedic.paksha.shukla')}`],
                    [t('vedic.panchang.vara'), pc.vara ? t(`weekday.${pc.vara}` as 'weekday.ravivara') : (provider ? '—' : t('report.vedic.pending'))],
                    [t('vedic.panchang.nakshatra'), t(`nakshatra.${pc.nakshatra.nakshatra}` as 'nakshatra.ashwini')],
                    [t('vedic.panchang.yoga'), t(pc.yoga.nameKey as 'yoga.vishkambha')],
                    [t('vedic.panchang.karana'), t(pc.karana.nameKey as 'karana.bava')],
                    [t('vedic.panchang.sunrise'), pc.sunriseIso ? `${localTime(pc.sunriseIso)} (${utcOffsetLabel(off)})` : '—'],
                  ]} />
                </section>
              ) : null}
              <section>
                <h2 className={H2}>{t('vedic.tb.avakahada')}</h2>
                <Facts rows={[
                  [t('vedic.tb.av.nakshatra'), `${nakName(a.nakshatra)} ${a.pada}`],
                  [t('vedic.tb.av.syllable'), sc(a.syllable) === englishSpelling(a.syllable) ? sc(a.syllable) : `${sc(a.syllable)} (${englishSpelling(a.syllable)})`],
                  [t('vedic.tb.av.varna'), sc(a.varna)],
                  [t('vedic.tb.av.vashya'), sc(a.vashya)],
                  [t('vedic.tb.av.yoni'), sc(a.yoni)],
                  [t('vedic.tb.av.gana'), sc(a.gana)],
                  [t('vedic.tb.av.nadi'), sc(a.nadi)],
                  [t('vedic.tb.av.tattva'), sc(a.tattva)],
                  [t('vedic.tb.av.yunja'), sc(a.yunja)],
                  [t('vedic.tb.av.signLord'), gn(a.signLord)],
                  [t('vedic.tb.av.starLord'), gn(a.nakshatraLord)],
                ]} />
              </section>
            </>
          ) : null}

          {include.yogas ? (
            <section className="mt-5">
              <h2 className={H2}>{t('vedic.section.yogas')} ({n(yogaList.length)})</h2>
              {yogaList.length ? (
                <Table head={[t('vedic.yoga.name'), t('vedic.yoga.reason')]}>
                  {yogaList.map((y) => (
                    <tr key={y.id} style={ROW}>
                      <th scope="row" className={`${TD} text-left align-top font-medium`}>
                        {sc(y.name)}{!y.holds ? <span className="ms-1 as-text-muted">({t('vedic.yoga.withNodes', { v: '✓' })})</span> : null}
                      </th>
                      <td className="px-1.5 py-0.5" style={{ whiteSpace: 'normal' }}>{reason(y)}</td>
                    </tr>
                  ))}
                </Table>
              ) : <p className="text-[11px] as-text-muted">{t('report.vedic.noYogas')}</p>}
              <p className="as-fineprint mt-2">{t('vedic.yoga.note')}</p>
            </section>
          ) : null}
          {footer}
        </article>
      ) : null}

      {/* ---- Viṁśottarī ---- */}
      {include.dasha ? (
        <article className="report-page">
          <h2 className={H2}>{t('report.vedic.mahadasha')}</h2>
          <p className="report-block mb-2 text-[11px]">
            {(() => { const b = yearsToYmd(dasha.balanceYears); return t('vedic.dasha.balanceYmd', { lord: gn(dasha.firstLord), y: b.years, m: b.months, d: b.days }); })()}
          </p>
          <Table head={[t('vedic.column.lord'), t('vedic.column.start'), t('vedic.column.end'), t('vedic.column.period')]}>
            {dasha.mahadashas.map((m) => (
              <tr key={m.path.join('/')} style={ROW}>
                <th scope="row" className={`${TD} text-left font-medium`}>
                  {gn(m.lord)}{running.has(m.path.join('/')) ? <span className="ms-1 as-text-muted">●</span> : null}
                </th>
                <td className={TD}>{localDate(Math.max(m.startJd, dasha.anchorJd), off)}</td>
                <td className={TD}>{localDate(m.endJd, off)}</td>
                <td className={TD}>{ymd(m.years)}</td>
              </tr>
            ))}
          </Table>

          <h2 className={`${H2} mt-5`}>{t('report.vedic.antardasha')} · {utcOffsetLabel(off)}</h2>
          <div className="grid grid-cols-3 gap-x-4 gap-y-2">
            {dasha.mahadashas.map((m) => (
              <div key={m.path.join('/')} className="report-block">
                <h3 className="mb-0.5 border-b as-border-strong text-[10px] font-semibold">
                  {gn(m.lord)} · {localDate(Math.max(m.startJd, dasha.anchorJd), off)}
                </h3>
                <table className="w-full border-collapse" style={COMPACT}>
                  <tbody>
                    {subPeriods(m).filter((s) => s.endJd > dasha.anchorJd).map((s) => (
                      <tr key={s.path.join('/')} className={running.has(s.path.join('/')) ? 'font-semibold' : ''}>
                        <td className="whitespace-nowrap" style={CELL}>{gn(m.lord)}–{gn(s.lord)}</td>
                        <td className="whitespace-nowrap text-right tabular-nums" style={CELL}>{localDate(s.endJd, off)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
          {footer}
        </article>
      ) : null}

      {/* ---- aṣṭakavarga, ṣaḍbala, sāḍe-sātī ---- */}
      {include.ashtakavarga || include.shadbala || include.sadeSati ? (
        <article className="report-page">
          {include.ashtakavarga && av ? (
            <section className="mb-5">
              <h2 className={H2}>{t('vedic.section.ashtakavarga')}</h2>
              <Table head={['', ...Array.from({ length: 12 }, (_, s) => signName(s)), t('vedic.av.total')]}>
                {AV_OWNERS.map((o) => (
                  <tr key={o} style={ROW}>
                    <th scope="row" className={`${TD} text-left font-medium`}>{gn(o)}</th>
                    {av.bhinna[o].totals.map((x, s) => <td key={s} className={`${TD} text-center`}>{x}</td>)}
                    <td className={`${TD} text-center font-semibold`}>{av.bhinna[o].totals.reduce((p, x) => p + x, 0)}</td>
                  </tr>
                ))}
                <tr style={ROW}>
                  <th scope="row" className={`${TD} text-left font-semibold`}>{t('vedic.av.sarva')}</th>
                  {av.sarva.map((x, s) => <td key={s} className={`${TD} text-center font-semibold`}>{x}</td>)}
                  <td className={`${TD} text-center font-semibold`}>{av.sarva.reduce((p, x) => p + x, 0)}</td>
                </tr>
              </Table>
            </section>
          ) : null}

          {include.shadbala && vchart.lagna ? (
            <section className="mb-5">
              <h2 className={H2}>{t('report.vedic.include.shadbala')}</h2>
              {sb ? (
                <Table head={['', ...SEVEN.map((x) => gn(x))]}>
                  {(['total', 'rupas', 'minimum', 'ratio', 'rank'] as const).map((id) => (
                    <tr key={id} style={ROW}>
                      <th scope="row" className={`${TD} text-left ${id === 'ratio' ? 'font-semibold' : 'font-normal'}`}>{t(`vedic.sb.${id}` as 'vedic.sb.total')}</th>
                      {SEVEN.map((x) => (
                        <td key={x} className={`${TD} ${id === 'ratio' ? 'font-semibold' : ''}`}>
                          {id === 'rank' ? sb.rows.rank[x] : fix(sb.rows[id][x])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </Table>
              ) : <Pending />}
            </section>
          ) : null}

          {include.sadeSati ? (
            <section>
              <h2 className={H2}>{t('report.vedic.include.sadeSati')}</h2>
              {ss ? (
                <>
                  <p className="mb-2 text-[11px] as-text-muted">{t('vedic.sadeSati.lede', { moon: signName(Math.floor(g.lon.moon / 30)) })}</p>
                  <Table head={[t('vedic.sadeSati.kind'), t('vedic.column.start'), t('vedic.column.end')]}>
                    {ss.spells.map((s) => (
                      <tr key={s.startJd} style={ROW}>
                        <th scope="row" className={`${TD} text-left font-medium`}>{t(s.kind === 'sadeSati' ? 'vedic.ss.kind.sadeSati' : 'vedic.ss.kind.panauti')}</th>
                        <td className={TD}>{localDate(s.startJd, off)}</td>
                        <td className={TD}>{localDate(s.endJd, off)}</td>
                      </tr>
                    ))}
                  </Table>
                </>
              ) : <Pending />}
            </section>
          ) : null}
          <p className="as-fineprint mt-5">{t('vedic.conventions')}</p>
          {footer}
        </article>
      ) : null}
    </div>
  );
}
