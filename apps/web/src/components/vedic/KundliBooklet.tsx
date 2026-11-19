/**
 * The complete printed kuṇḍalī: a booklet in the order a traditional
 * horoscope print runs — particulars, grahas, bhāva, the sixteen vargas,
 * friendship and strength, sahams and Jaimini, yogas, aṣṭakavarga, three daśā
 * systems to pratyantar, KP, the sāyana pages, varṣaphal, transits and the
 * matching table.
 *
 * Nothing here calculates on its own account. The tables are the Vedic page's
 * own sections in their print mode (every view at once, no pickers), so the
 * booklet cannot disagree with the screen it was printed from; the pages this
 * file draws itself (cover, particulars, positions, daśā grids) call the same
 * engine functions with the Vedic page's defaults.
 *
 * Left out on purpose: the long predictive readings commercial prints carry
 * ("you will…"). The app separates what is calculated from what is
 * traditionally read into it, and does not print fatalistic predictions.
 */
import { useEffect, useMemo, useState, type JSX, type ReactNode } from 'react';
import type { EphemerisProvider, NatalChart } from '@astro/engine';
import { useTranslator, type MessageKey } from '@astro/i18n';
import {
  BodyGlyph, VedicChartFigure, pageCss,
  type ChartTheme, type PaperSpec, type VedicLayoutStyle,
} from '@astro/ui';
import {
  vedicChart, dashas, subPeriods, runningPath, yearsToYmd, localMidnightJd, grahaLongitudes, YEAR_LENGTHS,
  yogas, avakahada, dignities, shodashavarga, SHODASHA, GRAHAS, SEVEN, varshaphal, type Varsha,
  type DashaNode, type DashaResult, type DashaSystemId, type Graha,
} from '@astro/vedic';
import { getProvider } from '../../lib/engine.js';
import { ROW, Table, TD, localDate, localDateTime, utcOffsetLabel, useJy } from './shared.js';
import { useYogaReason } from './YogaSection.js';
import { TablesSection } from './TablesSection.js';
import { ShadbalaSection } from './ShadbalaSection.js';
import { AshtakavargaSection } from './AshtakavargaSection.js';
import { KpSection } from './KpSection.js';
import { WesternSection } from './WesternSection.js';
import { VarshaphalSection } from './VarshaphalSection.js';
import { SadeSatiSection } from './SadeSatiSection.js';
import { TransitSection } from './TransitSection.js';
import { MatchingSection } from './MatchingSection.js';
import { ALL_KUNDLI_SECTIONS, type KundliSections } from './reportSections.js';

export interface KundliBookletProps {
  readonly chart: NatalChart;
  readonly paper: PaperSpec;
  readonly sections?: Partial<KundliSections>;
  readonly style?: VedicLayoutStyle;
  readonly sex?: 'male' | 'female';
  readonly theme?: Partial<ChartTheme>;
  readonly attribution: string;
  /** Fixed generation timestamp: the "now" for the running daśā, the varṣa year and the transit month. */
  readonly generatedIso: string;
}

/** The sixteen vargas by their Sanskrit names (IAST, written in the reader's script). */
const VARGA_NAME: Readonly<Record<number, string>> = {
  1: 'Rāśi', 2: 'Horā', 3: 'Dreṣkāṇa', 4: 'Caturthāṁśa', 7: 'Saptāṁśa', 9: 'Navāṁśa', 10: 'Daśāṁśa', 12: 'Dvādaśāṁśa',
  16: 'Ṣoḍaśāṁśa', 20: 'Viṁśāṁśa', 24: 'Caturviṁśāṁśa', 27: 'Saptaviṁśāṁśa', 30: 'Triṁśāṁśa', 40: 'Khavedāṁśa',
  45: 'Akṣavedāṁśa', 60: 'Ṣaṣṭyāṁśa',
};
const NODE_GRAHA: Readonly<Record<string, Graha>> = {
  trueNode: 'rahu', meanNode: 'rahu', southNode: 'ketu', meanSouthNode: 'ketu',
};
const DASHA_NAME: Readonly<Record<DashaSystemId, string>> = {
  vimshottari: 'Viṁśottarī', ashtottari: 'Aṣṭottarī', yogini: 'Yoginī',
};

/*
 * The booklet's own type and colour, on top of the report's paper tokens.
 *
 * One accent, a deep saffron-maroon (#8a2c0d, 8.2:1 on white), carries the
 * structure: rules, headings, the table heads' ink. Table heads sit on a pale
 * parchment (#f7efe2) and alternate rows on a lighter one, so a reader can
 * follow a row of twelve signs across without a ruler — the job the printed
 * kuṇḍalī's box rules do. Literal values, like the rest of the print CSS.
 */
function bookletCss(paper: PaperSpec, runningHead: string): string {
  const head = JSON.stringify(runningHead.replace(/[\u0000-\u001f\\]/g, ' '));
  return [
    pageCss(paper),
    `@page { @bottom-center { content: ${head} "  ·  " counter(page); font: 8px 'Source Serif 4', Georgia, serif; color: #6b5a4a; } }`,
    '.kundli { font-family: var(--as-font-sans); }',
    '.kundli .k-band { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; border-top: 2px solid #8a2c0d; border-bottom: 1px solid #8a2c0d; padding: 3px 2px; margin-bottom: 10px; font-size: 9px; letter-spacing: .08em; text-transform: uppercase; color: #6b2a10; }',
    '.kundli .k-band b { font-family: var(--as-font-serif); font-size: 11px; letter-spacing: .02em; text-transform: none; color: #2a1a10; }',
    '.kundli .k-title { font-family: var(--as-font-serif); text-align: center; font-size: 16px; font-weight: 600; color: #8a2c0d; margin: 2px 0 10px; }',
    '.kundli .k-title::after { content: ""; display: block; width: 72px; margin: 4px auto 0; border-top: 1px solid #c9a27a; }',
    '.kundli .as-h3 { font-family: var(--as-font-serif); font-size: 12px; font-weight: 600; color: #8a2c0d; border-bottom: 1px solid #e3cfb4; padding-bottom: 1px; }',
    '.kundli table { border: 1px solid #e3cfb4; }',
    '.kundli thead th { background: #f7efe2; color: #5a2410 !important; font-size: 8.5px; }',
    '.kundli tbody tr:nth-child(even) { background: #fcf8f2; }',
    '.kundli .text-sm { font-size: 10.5px; line-height: 1.45; }',
    '.kundli .as-fineprint { font-size: 8.5px; line-height: 1.4; color: #6b5a4a; }',
    // The sections lay two tables side by side above 1024px of viewport; a
    // sheet of paper is narrower than that, so on paper every pair would stack
    // and the page run long. Side by side when both fit, stacked when the
    // first is too wide (the sāyana positions) — never overlapping.
    '.kundli .lg\\:grid-cols-2 { display: flex; flex-wrap: wrap; column-gap: 20px; }',
    '.kundli .lg\\:grid-cols-2 > * { flex: 1 1 auto; }',
    '.kundli .k-dl dt { font-size: 8px; letter-spacing: .06em; text-transform: uppercase; color: #6b5a4a; }',
    '.kundli .k-dl dd { font-size: 11px; }',
    '.kundli .k-mini { font-size: 8.5px; line-height: 1.2; }',
    '.kundli .k-dense table { font-size: 8.5px; }',
    '.kundli .k-dense th, .kundli .k-dense td { padding: 1px 3px; }',
    '.kundli .k-mini td { padding: 0 2px; }',
    '.kundli .k-mini h4 { font-size: 9px; font-weight: 600; border-bottom: 1px solid #e3cfb4; color: #5a2410; }',
    '@media screen { .kundli .report-page { background: #fffdf9; } }',
    // Letter-spacing pulls Devanagari and Gujarati conjuncts apart; tracking is for Latin small caps only.
    '.kundli-indic .k-band, .kundli-indic .k-band b, .kundli-indic .k-dl dt, .kundli-indic .k-sub { letter-spacing: 0 !important; }',
  ].join('\n');
}

function Facts({ rows, cols = 3 }: { readonly rows: readonly (readonly [string, ReactNode])[]; readonly cols?: 2 | 3 | 4 }): JSX.Element {
  const grid = cols === 4 ? 'grid-cols-4' : cols === 3 ? 'grid-cols-3' : 'grid-cols-2';
  return (
    <dl className={`k-dl report-block grid gap-x-6 gap-y-1.5 ${grid}`}>
      {rows.map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

/** A lotus of twelve petals round a ring of twelve — the twelve signs about the native. Decoration only. */
function Mandala({ size = 120 }: { readonly size?: number }): JSX.Element {
  const petals = Array.from({ length: 12 }, (_, i) => i * 30);
  return (
    <svg width={size} height={size} viewBox="-60 -60 120 120" aria-hidden="true">
      <circle r={57} fill="none" stroke="#c9a27a" strokeWidth={0.8} />
      <circle r={53} fill="none" stroke="#8a2c0d" strokeWidth={1.4} />
      {petals.map((a) => (
        <g key={a} transform={`rotate(${a})`}>
          <path d="M0 -50 C 9 -40, 9 -28, 0 -20 C -9 -28, -9 -40, 0 -50 Z" fill="#f7efe2" stroke="#8a2c0d" strokeWidth={0.9} />
          <line x1={0} y1={-20} x2={0} y2={-14} stroke="#c9a27a" strokeWidth={0.8} />
        </g>
      ))}
      <circle r={14} fill="#fffdf9" stroke="#8a2c0d" strokeWidth={1.2} />
      <circle r={5} fill="#8a2c0d" />
    </svg>
  );
}

export function KundliBooklet({
  chart, paper, sections, style = 'north', sex = 'male', theme, attribution, generatedIso,
}: KundliBookletProps): JSX.Element {
  const { t, n, locale } = useTranslator();
  const { gn, rn, sc, signDms, nak } = useJy();
  const reason = useYogaReason();
  const include: KundliSections = { ...ALL_KUNDLI_SECTIONS, ...sections };
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
  const hasLagna = vchart.lagna !== undefined;

  // The Vedic page's daśā defaults: from the Moon, civil-date anchor, 365.25-day years.
  const dashaOf = useMemo(() => (system: DashaSystemId): DashaResult => dashas(system, g.lon.moon, chart.jdUT, {
    yearDays: YEAR_LENGTHS.julian,
    anchor: 'civilDate',
    localMidnightJd: localMidnightJd(chart.jdUT, off),
    spanYears: 120,
  }), [g, chart.jdUT, off]);
  const vim = useMemo(() => dashaOf('vimshottari'), [dashaOf]);
  const nowJd = Date.parse(generatedIso) / 86_400_000 + 2440587.5;
  const now = new Date(generatedIso);
  const age = Math.max(0, Math.min(100, Math.floor((nowJd - chart.jdUT) / 365.2564)));

  const yogaList = useMemo(() => yogas(g).filter((y) => y.holds || y.holdsWithNodes), [g]);
  const vargas = useMemo(() => (hasLagna ? shodashavarga(g) : null), [g, hasLagna]);
  const dig = useMemo(() => new Map(dignities(g).map((d) => [d.body, d])), [g]);

  /*
   * Every varṣa from the birth year, as the printed kuṇḍalī carries them: 96
   * years, eight to a sheet. The same function and options as the Varṣaphal
   * page, so a year read here matches the year picked there.
   */
  const VARSHA_YEARS = 96;
  const varshas = useMemo((): readonly Varsha[] | null => {
    if (!provider || !hasLagna || !include.annual) return null;
    const o = {
      birthJd: chart.jdUT, latitude: chart.place.latitude, longitude: chart.place.longitude, zodiac: chart.settings.zodiac,
      node: chart.settings.nodeType === 'true' ? 'trueNode' as const : 'meanNode' as const, utcOffsetMinutes: off,
    };
    return Array.from({ length: VARSHA_YEARS }, (_, a) => varshaphal(provider, o, a));
  }, [provider, hasLagna, include.annual, chart, off]);

  const name = chart.input.name || t('report.untitledSubject');
  const moon = vchart.placements.find((p) => p.body === 'moon');
  const pc = vchart.panchang;
  const a = avakahada(g.lon.moon);
  const figure = (mm: number) => ({ width: `${mm}mm` });
  const W = paper.contentWidthMm;
  const themeProp = theme ? { theme } : {};
  const ymd = (years: number): string => { const y = yearsToYmd(years); return t('vedic.dasha.ymd', { y: y.years, m: y.months, d: y.days }); };
  const localTime = (iso: string): string => localDateTime(Date.parse(iso) / 86_400_000 + 2440587.5, off).slice(11);
  const pending = <p className="text-[11px] as-text-muted">{t('report.vedic.pending')}</p>;

  const Page = ({ title, children, id }: { readonly title: string; readonly children: ReactNode; readonly id?: string }): JSX.Element => (
    <article className="report-page" data-kundli-page={id}>
      <div className="k-band"><b>{name}</b><span>{t('report.vedic.title')}</span></div>
      <h2 className="k-title report-heading">{title}</h2>
      {children}
    </article>
  );

  /** Daśā table plus its antardaśā grid, for any of the three systems. */
  const dashaPages = (system: DashaSystemId, result: DashaResult, withPratyantar: boolean): JSX.Element => {
    const running = new Set(runningPath(result, nowJd, 3).map((r) => r.path.join('/')));
    const start = (m: DashaNode): string => localDate(Math.max(m.startJd, result.anchorJd), off);
    const bal = yearsToYmd(result.balanceYears);
    const title = `${sc(DASHA_NAME[system])} ${t('vedic.section.dasha')}`;
    return (
      <>
        <Page title={title} id={`dasha-${system}`}>
          <p className="report-block mb-2 text-[11px]">
            {t('vedic.dasha.balanceYmd', { lord: gn(result.firstLord), y: bal.years, m: bal.months, d: bal.days })}
          </p>
          <Table head={[t('vedic.column.lord'), t('vedic.column.start'), t('vedic.column.end'), t('vedic.column.period')]}>
            {result.mahadashas.map((m) => (
              <tr key={m.path.join('/')} style={ROW} className={running.has(m.path.join('/')) ? 'font-semibold' : ''}>
                <th scope="row" className={`${TD} text-left font-medium`}>
                  {gn(m.lord)}{running.has(m.path.join('/')) ? <span className="ms-1 as-text-muted">●</span> : null}
                </th>
                <td className={TD}>{start(m)}</td>
                <td className={TD}>{localDate(m.endJd, off)}</td>
                <td className={TD}>{ymd(m.years)}</td>
              </tr>
            ))}
          </Table>
          <h3 className="as-h3 report-heading mb-1 mt-4">{t('report.vedic.antardasha')} · {utcOffsetLabel(off)}</h3>
          <div className="k-mini grid grid-cols-3 gap-x-4 gap-y-2">
            {result.mahadashas.map((m) => (
              <div key={m.path.join('/')} className="report-block">
                <h4>{gn(m.lord)} · {start(m)}</h4>
                <table className="w-full border-collapse" style={{ border: 0 }}>
                  <tbody>
                    {subPeriods(m).filter((s) => s.endJd > result.anchorJd).map((s) => (
                      <tr key={s.path.join('/')} className={running.has(s.path.join('/')) ? 'font-semibold' : ''}>
                        <td className="whitespace-nowrap">{gn(m.lord)}–{gn(s.lord)}</td>
                        <td className="whitespace-nowrap text-right tabular-nums">{localDate(s.endJd, off)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        </Page>
        {withPratyantar ? (
          <Page title={`${sc(DASHA_NAME[system])} ${t('kundli.pratyantar')}`} id={`pratyantar-${system}`}>
            <p className="as-fineprint mb-2">{t('kundli.pratyantarNote', { offset: utcOffsetLabel(off) })}</p>
            {result.mahadashas.map((m) => (
              <section key={m.path.join('/')} className="mb-2">
                <h3 className="as-h3 report-heading mb-1">{t('kundli.mahaOf', { lord: gn(m.lord) })} · {start(m)} – {localDate(m.endJd, off)}</h3>
                <div className="k-mini grid grid-cols-5 gap-x-3 gap-y-1.5">
                  {subPeriods(m).filter((s) => s.endJd > result.anchorJd).map((s) => (
                    <div key={s.path.join('/')} className="report-block">
                      <h4>{gn(m.lord)}–{gn(s.lord)}</h4>
                      <table className="w-full border-collapse" style={{ border: 0 }}>
                        <tbody>
                          {subPeriods(s).filter((p) => p.endJd > result.anchorJd).map((p) => (
                            <tr key={p.path.join('/')} className={running.has(p.path.join('/')) ? 'font-semibold' : ''}>
                              <td className="whitespace-nowrap">{gn(p.lord)}</td>
                              <td className="whitespace-nowrap text-right tabular-nums">{localDate(p.endJd, off)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </Page>
        ) : null}
      </>
    );
  };

  const placementsFor = (lagnaSignIndex: number) => ({
    lagnaSignIndex,
    bodies: vchart.placements.map((p) => ({ body: p.body, signIndex: p.signIndex, retrograde: p.retrograde })),
  });

  return (
    <div className={`report-root kundli as-paper as-text${locale.code === 'en' ? '' : ' kundli-indic'}`}>
      <style>{bookletCss(paper, name)}</style>

      {/* ---- cover ---- */}
      <article className="report-page" data-kundli-page="cover">
        <div className="flex flex-col items-center text-center" style={{ paddingTop: '6mm' }}>
          <Mandala size={96} />
          <p className="k-sub mt-3 text-[10px] uppercase tracking-[0.3em]" style={{ color: '#8a2c0d' }}>{t('kundli.subtitle')}</p>
          <h1 className="mt-1 text-[28px] font-semibold" style={{ fontFamily: 'var(--as-font-serif)', color: '#2a1a10' }}>{t('report.vedic.title')}</h1>
          <p className="mt-2 text-[17px]" style={{ fontFamily: 'var(--as-font-serif)' }}>{name}</p>
          <p className="mt-1 text-[11px] as-text-muted">
            {t(sex === 'male' ? 'kundli.male' : 'kundli.female')} · {localDateTime(chart.jdUT, off)} ({utcOffsetLabel(off)})
            {chart.place.label ? ` · ${chart.place.label}` : ''}
          </p>
        </div>
        {hasLagna && include.charts ? (
          <figure className="report-block mx-auto mt-5" style={figure(Math.min(W * 0.62, paper.contentHeightMm - 150))}>
            <VedicChartFigure chart={vchart} style={style} size={1000} tinted {...themeProp} />
            <figcaption className="mt-1 text-center text-[10px] as-text-muted">{t('report.vedic.lagnaChart')}</figcaption>
          </figure>
        ) : null}
        <div className="mt-5 border-t pt-3" style={{ borderColor: '#e3cfb4' }}>
          <Facts cols={4} rows={[
            [t('vedic.lagna'), vchart.lagna ? rn(vchart.lagna.signIndex) : '—'],
            [t('kundli.rashi'), moon ? rn(moon.signIndex) : '—'],
            [t('vedic.column.nakshatra'), moon ? `${nak(moon.nakshatra.index)} ${n(moon.nakshatra.pada)}` : '—'],
            [t('vedic.panchang.tithi'), pc ? `${t(pc.tithi.nameKey as 'tithi.purnima')} · ${t(`vedic.paksha.${pc.tithi.paksha}` as 'vedic.paksha.shukla')}` : '—'],
            [t('vedic.panchang.vara'), pc?.vara ? t(`weekday.${pc.vara}` as 'weekday.ravivara') : '—'],
            [t('vedic.panchang.yoga'), pc ? t(pc.yoga.nameKey as 'yoga.vishkambha') : '—'],
            [t('vedic.panchang.karana'), pc ? t(pc.karana.nameKey as 'karana.bava') : '—'],
            [t('kundli.runningDasha'), runningPath(vim, nowJd, 2).map((r) => gn(r.lord)).join(' / ') || '—'],
          ]} />
        </div>
        <p className="as-fineprint mt-5 text-center">{attribution}</p>
      </article>

      {/* ---- particulars ---- */}
      <Page title={t('kundli.page.particulars')} id="particulars">
        <h3 className="as-h3 report-heading mb-2">{t('report.vedic.birthDetails')}</h3>
        <Facts rows={[
          [t('report.vedic.dateTime'), localDateTime(chart.jdUT, off)],
          [t('report.vedic.timeZone'), utcOffsetLabel(off)],
          [t('summary.birthplace'), chart.place.label ?? '—'],
          [t('report.vedic.coordinates'), `${n(chart.place.latitude, { maximumFractionDigits: 4 })}°, ${n(chart.place.longitude, { maximumFractionDigits: 4 })}°`],
          [t('vedic.ayanamsha'), `${t(`ayanamsha.${vchart.ayanamshaName}` as 'ayanamsha.lahiri')} · ${n(vchart.ayanamsha, { maximumFractionDigits: 4 })}°`],
          [t('summary.nodeType'), vchart.usesMeanNodes ? t('vedic.nodes.mean') : t('vedic.nodes.true')],
          [t('vedic.lagna'), vchart.lagna ? signDms(vchart.lagna.longitude) : '—'],
          [t('report.vedic.moon'), moon ? `${rn(moon.signIndex)} · ${nak(moon.nakshatra.index)} ${n(moon.nakshatra.pada)}` : '—'],
          [t('vedic.panchang.sunrise'), pc?.sunriseIso ? `${localTime(pc.sunriseIso)} (${utcOffsetLabel(off)})` : '—'],
          [t('kundli.balance'), (() => { const b = yearsToYmd(vim.balanceYears); return t('vedic.dasha.balanceYmd', { lord: gn(vim.firstLord), y: b.years, m: b.months, d: b.days }); })()],
          [t('kundli.native'), t(sex === 'male' ? 'kundli.male' : 'kundli.female')],
          [t('report.generated'), localDate(nowJd, off)],
        ]} />
        <div className="mt-5 grid grid-cols-2 gap-6">
          <section>
            <h3 className="as-h3 report-heading mb-2">{t('vedic.section.panchang')}</h3>
            {pc ? (
              <Facts cols={2} rows={[
                [t('vedic.panchang.tithi'), `${t(pc.tithi.nameKey as 'tithi.purnima')} · ${t(`vedic.paksha.${pc.tithi.paksha}` as 'vedic.paksha.shukla')}`],
                [t('vedic.panchang.vara'), pc.vara ? t(`weekday.${pc.vara}` as 'weekday.ravivara') : (provider ? '—' : t('report.vedic.pending'))],
                [t('vedic.panchang.nakshatra'), t(`nakshatra.${pc.nakshatra.nakshatra}` as 'nakshatra.ashwini')],
                [t('vedic.panchang.yoga'), t(pc.yoga.nameKey as 'yoga.vishkambha')],
                [t('vedic.panchang.karana'), t(pc.karana.nameKey as 'karana.bava')],
                [t('vedic.panchang.sunrise'), pc.sunriseIso ? localTime(pc.sunriseIso) : '—'],
              ]} />
            ) : pending}
          </section>
          <section>
            <h3 className="as-h3 report-heading mb-2">{t('vedic.tb.avakahada')}</h3>
            <Facts cols={2} rows={[
              [t('vedic.tb.av.nakshatra'), `${nak(a.nakshatra)} ${a.pada}`],
              [t('vedic.tb.av.syllable'), sc(a.syllable)],
              [t('vedic.tb.av.varna'), sc(a.varna)],
              [t('vedic.tb.av.vashya'), sc(a.vashya)],
              [t('vedic.tb.av.yoni'), sc(a.yoni)],
              [t('vedic.tb.av.gana'), sc(a.gana)],
              [t('vedic.tb.av.nadi'), sc(a.nadi)],
              [t('vedic.tb.av.tattva'), sc(a.tattva)],
              [t('vedic.tb.av.signLord'), gn(a.signLord)],
              [t('vedic.tb.av.starLord'), gn(a.nakshatraLord)],
            ]} />
          </section>
        </div>
        <section className="report-block mt-5">
          <h3 className="as-h3 report-heading mb-2">{t('kundli.contents')}</h3>
          <ol className="grid grid-cols-3 gap-x-6 gap-y-0.5 text-[10.5px]" style={{ listStyle: 'decimal inside' }}>
            {CONTENTS.filter(([k]) => k === 'always' || include[k]).map(([, key]) => <li key={key}>{t(key)}</li>)}
          </ol>
        </section>
        <p className="as-fineprint mt-4">{t('kundli.abbreviations')}: {GRAHAS.map((x) => `${t(`jy.short.${x}` as 'jy.short.sun')} = ${gn(x)}`).join(' · ')} · ℞ = {t('kundli.retrograde')}</p>
      </Page>

      {/* ---- grahas ---- */}
      <Page title={t('kundli.page.grahas')} id="grahas">
        <Table head={[t('vedic.column.body'), t('vedic.kp.longitude'), t('vedic.column.nakshatra'), t('vedic.column.pada'), t('vedic.tb.av.starLord'), t('vedic.column.house'), t('vedic.tb.status'), t('vedic.tb.combust')]}>
          {vchart.lagna ? (
            <tr style={ROW}>
              <th scope="row" className={`${TD} text-left font-semibold`}>{t('vedic.lagna')}</th>
              <td className={TD}>{signDms(vchart.lagna.longitude)}</td>
              <td className={TD}>{nak(vchart.lagna.nakshatra.index)}</td>
              <td className={TD}>{n(vchart.lagna.nakshatra.pada)}</td>
              <td className={TD}>{gn(vchart.lagna.nakshatra.lord)}</td>
              <td className={TD}>{n(1)}</td>
              <td className={TD}>—</td>
              <td className={TD}>—</td>
            </tr>
          ) : null}
          {vchart.placements.map((p) => {
            const d = dig.get((NODE_GRAHA[p.body] ?? p.body) as Graha);
            return (
              <tr key={p.body} style={ROW}>
                <th scope="row" className={`${TD} text-left font-normal`}>
                  <span className="inline-flex items-center gap-1.5">
                    <BodyGlyph body={p.body} tinted />
                    {t(`body.${p.body}` as 'body.sun')}{p.retrograde ? ' ℞' : ''}
                  </span>
                </th>
                <td className={TD}>{signDms(p.longitude)}</td>
                <td className={TD}>{nak(p.nakshatra.index)}</td>
                <td className={TD}>{n(p.nakshatra.pada)}</td>
                <td className={TD}>{gn(p.nakshatra.lord)}</td>
                <td className={TD}>{p.house === 0 ? '—' : n(p.house)}</td>
                <td className={TD}>{d ? t(`vedic.tb.dig.${d.status}` as 'vedic.tb.dig.own') : '—'}</td>
                <td className={TD}>{d?.combust ? t('vedic.tb.yes') : '—'}</td>
              </tr>
            );
          })}
        </Table>
        {hasLagna && include.charts ? (
          <div className="report-block mt-5 flex justify-center gap-6">
            <figure style={figure((W - 8) / 2)}>
              <figcaption className="mb-1 text-center text-[11px] font-semibold">{t('report.vedic.lagnaChart')}</figcaption>
              <VedicChartFigure chart={vchart} style={style} size={1000} tinted {...themeProp} />
            </figure>
            {moon ? (
              <figure style={figure((W - 8) / 2)}>
                <figcaption className="mb-1 text-center text-[11px] font-semibold">{t('kundli.moonChart')}</figcaption>
                <VedicChartFigure chart={vchart} style={style} size={1000} tinted placements={placementsFor(moon.signIndex)} label={t('kundli.moonChart')} {...themeProp} />
              </figure>
            ) : null}
          </div>
        ) : null}
      </Page>

      {/* ---- bhāva, sudarśana ---- */}
      {include.tables && hasLagna ? (
        <Page title={t('kundli.page.bhava')} id="bhava">
          {provider ? <TablesSection vchart={vchart} chart={chart} provider={provider} print={{ views: ['chalit', 'sudarshana'] }} /> : pending}
        </Page>
      ) : null}

      {/* ---- the sixteen vargas, six to a sheet ---- */}
      {include.vargas && vargas ? [0, 9].map((from) => (
        <Page key={from} title={`${t('kundli.page.vargas')} · ${from / 9 + 1}/2`} id={`vargas-${from / 9 + 1}`}>
          <div className="grid grid-cols-3 gap-x-4 gap-y-3">
            {SHODASHA.slice(from, from + 9).map((d) => (
              <figure key={d} className="report-block">
                <figcaption className="mb-0.5 text-center text-[10px] font-semibold">D{d} · {sc(VARGA_NAME[d]!)}</figcaption>
                <VedicChartFigure
                  chart={vchart} style={style} size={600} tinted label={`D${d}`} {...themeProp}
                  placements={{
                    lagnaSignIndex: vargas[d]!.lagna,
                    bodies: GRAHAS.map((b) => ({ body: b, signIndex: vargas[d]![b], retrograde: d === 1 && b !== 'rahu' && b !== 'ketu' && Boolean(vchart.placements.find((p) => p.body === b)?.retrograde) })),
                  }}
                />
              </figure>
            ))}
          </div>
        </Page>
      )) : null}

      {include.tables && hasLagna ? (
        <>
          <Page title={t('vedic.tb.view.vargas')} id="varga-tables">
            {provider ? <TablesSection vchart={vchart} chart={chart} provider={provider} print={{ views: ['vargas', 'vimshopaka', 'dignity'] }} /> : pending}
          </Page>
          <Page title={t('vedic.tb.view.friendship')} id="friendship">
            {provider ? <TablesSection vchart={vchart} chart={chart} provider={provider} print={{ views: ['friendship'] }} /> : pending}
          </Page>
        </>
      ) : null}

      {include.strength && hasLagna ? (
        <Page title={t('vedic.section.shadbala')} id="shadbala">
          {provider ? <ShadbalaSection vchart={vchart} chart={chart} provider={provider} print /> : pending}
        </Page>
      ) : null}

      {include.tables && hasLagna ? (
        <>
          <Page title={t('kundli.page.taraSahams')} id="tara">
            {provider ? <TablesSection vchart={vchart} chart={chart} provider={provider} print={{ views: ['tara', 'sahams'] }} /> : pending}
          </Page>
          <Page title={t('kundli.page.jaimini')} id="jaimini">
            {provider ? <TablesSection vchart={vchart} chart={chart} provider={provider} print={{ views: ['lagnas', 'favourable'] }} /> : pending}
          </Page>
        </>
      ) : null}

      {/* ---- yogas ---- */}
      {include.yogas ? (
        <Page title={`${t('vedic.section.yogas')} (${n(yogaList.length)})`} id="yogas">
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
        </Page>
      ) : null}

      {include.strength && hasLagna ? (
        <>
          <Page title={t('vedic.section.ashtakavarga')} id="ashtakavarga">
            <AshtakavargaSection vchart={vchart} print="summary" />
          </Page>
          <Page title={t('kundli.page.bhinna')} id="bhinna">
            <AshtakavargaSection vchart={vchart} print="contributors" />
          </Page>
        </>
      ) : null}

      {include.dasha ? dashaPages('vimshottari', vim, true) : null}
      {include.otherDashas ? (
        <>
          {dashaPages('ashtottari', dashaOf('ashtottari'), false)}
          {dashaPages('yogini', dashaOf('yogini'), false)}
        </>
      ) : null}

      {include.kp && hasLagna ? (
        <>
          <Page title={t('vedic.section.kp')} id="kp">
            {provider ? <KpSection chart={chart} provider={provider} print={{ parts: ['cusps', 'planets'] }} /> : pending}
          </Page>
          <Page title={`${t('vedic.kp.significators')} · ${t('vedic.kp.fourStep')}`} id="kp-steps">
            {provider ? <KpSection chart={chart} provider={provider} print={{ parts: ['significators', 'fourStep'] }} /> : pending}
          </Page>
          <Page title={t('vedic.kp.events')} id="kp-events">
            {provider ? <KpSection chart={chart} provider={provider} print={{ parts: ['events'] }} /> : pending}
          </Page>
        </>
      ) : null}

      {include.western ? (
        <>
          <Page title={t('vedic.section.western')} id="western">
            {provider ? <WesternSection chart={chart} provider={provider} print={{ views: ['positions'] }} /> : pending}
          </Page>
          <Page title={t('vedic.section.western')} id="aspects">
            {provider ? <WesternSection chart={chart} provider={provider} print={{ views: ['aspects', 'cuspAspects'] }} /> : pending}
          </Page>
        </>
      ) : null}

      {include.annual && hasLagna ? (
        <Page title={t('vedic.section.varshaphal')} id="varshaphal">
          {provider ? <div className="k-dense"><VarshaphalSection chart={chart} provider={provider} print={{ age }} /></div> : pending}
        </Page>
      ) : null}

      {/* ---- the yearly varṣa charts, eight to a sheet ---- */}
      {include.annual && hasLagna ? (varshas ? Array.from({ length: VARSHA_YEARS / 8 }, (_, sheet) => {
        const run = varshas.slice(sheet * 8, sheet * 8 + 8);
        const yearOf = (v: Varsha): string => localDate(v.startJd, off).slice(6);
        return (
          <Page key={sheet} id={`varsha-${sheet + 1}`}
            title={t('kundli.varshaCharts', { from: yearOf(run[0]!), to: yearOf(run[run.length - 1]!) })}>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2">
              {run.map((v) => (
                <section key={v.age} className="report-block" data-varsha-age={v.age}>
                  <h3 className="as-h3 report-heading mb-0.5 flex items-baseline justify-between">
                    <span>{yearOf(v)}</span>
                    <span className="text-[8.5px] font-normal as-text-muted" style={{ fontFamily: 'var(--as-font-sans)' }}>
                      {t('kundli.varshaAge', { age: v.age })} · {localDateTime(v.startJd, off)} · {t('vedic.varsha.muntha', { sign: rn(v.muntha), house: v.munthaHouse })}
                    </span>
                  </h3>
                  <div className="flex items-start gap-2">
                    <div style={figure(48)}>
                      <VedicChartFigure
                        chart={vchart} style={style} size={500} tinted label={`${t('vedic.varsha.lagna')} ${yearOf(v)}`} {...themeProp}
                        placements={{
                          lagnaSignIndex: Math.floor(v.positions.lagna / 30),
                          bodies: [
                            ...GRAHAS.map((b) => ({
                              body: b, signIndex: Math.floor(v.positions.lon[b] / 30),
                              retrograde: (SEVEN as readonly string[]).includes(b) && v.positions.retrograde[b],
                            })),
                            { body: 'muntha', signIndex: v.muntha },
                          ],
                        }}
                      />
                    </div>
                    <table className="k-mini flex-1 border-collapse">
                      <tbody>
                        {v.mudda.map((m, i) => (
                          <tr key={i} className={nowJd >= m.startJd && nowJd < m.endJd ? 'font-semibold' : ''}>
                            <td className="whitespace-nowrap">{gn(m.lord)}</td>
                            <td className="whitespace-nowrap text-right tabular-nums">{localDate(m.endJd, off)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              ))}
            </div>
            {sheet === 0 ? <p className="as-fineprint mt-2">{t('kundli.varshaNote')}</p> : null}
          </Page>
        );
      }) : <Page title={t('kundli.varshaChartsTitle')} id="varsha-pending">{pending}</Page>) : null}

      {include.transits ? (
        <>
          <Page title={t('vedic.section.sadeSati')} id="sadesati">
            {provider ? <SadeSatiSection vchart={vchart} chart={chart} provider={provider} print /> : pending}
          </Page>
          {hasLagna ? (
            <>
              <Page title={`${t('vedic.tr.gochar')} · ${now.getUTCFullYear()}`} id="gochar">
                {provider ? <TransitSection vchart={vchart} chart={chart} provider={provider} print={{ view: 'gochar', year: now.getUTCFullYear(), month: now.getUTCMonth() + 1 }} /> : pending}
              </Page>
              <Page title={`${t('vedic.tr.power')} · ${monthLabel(now)}`} id="power">
                {provider ? <TransitSection vchart={vchart} chart={chart} provider={provider} print={{ view: 'power', year: now.getUTCFullYear(), month: now.getUTCMonth() + 1 }} /> : pending}
              </Page>
              <Page title={`${t('vedic.tr.moon')} · ${monthLabel(now)}`} id="moon-tara">
                {provider ? <TransitSection vchart={vchart} chart={chart} provider={provider} print={{ view: 'moon', year: now.getUTCFullYear(), month: now.getUTCMonth() + 1 }} /> : pending}
              </Page>
            </>
          ) : null}
        </>
      ) : null}

      {include.matching ? (
        <Page title={t('vedic.section.matching')} id="matching">
          <MatchingSection vchart={vchart} chart={chart} print={{ sex }} />
        </Page>
      ) : null}

      {/* ---- closing note ---- */}
      <Page title={t('kundli.page.notes')} id="notes">
        <p className="text-sm">{t('kundli.closing')}</p>
        <p className="as-fineprint mt-3">{t('vedic.conventions')}</p>
        <p className="as-fineprint mt-3">{attribution}</p>
        <div className="mt-8 flex justify-center"><Mandala size={64} /></div>
      </Page>
    </div>
  );
}

function monthLabel(d: Date): string {
  return `${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;
}

/** The contents list, in page order: [the switch that prints it, its title]. */
const CONTENTS: readonly (readonly [keyof KundliSections | 'always', MessageKey])[] = [
  ['always', 'kundli.page.particulars'],
  ['always', 'kundli.page.grahas'],
  ['tables', 'kundli.page.bhava'],
  ['vargas', 'kundli.page.vargas'],
  ['tables', 'vedic.tb.view.vargas'],
  ['tables', 'vedic.tb.view.friendship'],
  ['strength', 'vedic.section.shadbala'],
  ['tables', 'kundli.page.taraSahams'],
  ['tables', 'kundli.page.jaimini'],
  ['yogas', 'vedic.section.yogas'],
  ['strength', 'vedic.section.ashtakavarga'],
  ['dasha', 'kundli.toc.vimshottari'],
  ['otherDashas', 'kundli.toc.otherDashas'],
  ['kp', 'vedic.section.kp'],
  ['western', 'vedic.section.western'],
  ['annual', 'vedic.section.varshaphal'],
  ['annual', 'kundli.varshaChartsTitle'],
  ['transits', 'vedic.section.transits'],
  ['matching', 'vedic.section.matching'],
];

