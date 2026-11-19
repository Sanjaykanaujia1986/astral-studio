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
import { norm360, SIGNS, type Body } from '@astro/engine';
import {
  vedicChart, dashas, subPeriods, runningPath, yearsToYmd, localMidnightJd, grahaLongitudes, YEAR_LENGTHS,
  yogas, dignities, shodashavarga, vargaSarva, SHODASHA, GRAHAS, SEVEN, varshaphal, type Varsha,
  birthDay, limbSpans, hinduCalendar, baladi, charaKarakas, fortuna, gulikaMandi, LIMBS, MASA, RITU, SAMVATSARA,
  kpLords, sripati, chalit, arcHouse, arudhas, rasiDrishti, ashtakavarga, AV_OWNERS, SIGN_LORDS, WEEKDAYS,
  tithiFrom, yogaFrom, karanaFrom, bhavaFacts, sadeSati, progression, functionalNature, FUNCTIONAL_NATURES,
  type DashaNode, type DashaResult, type DashaSystemId, type Graha, type Limb, type Avastha,
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
import { BhavaReading, MahadashaAnalysis, Sarvatobhadra, Remedies } from './KundliExtras.js';
import { GrahaReadings, DashaReadings } from './Phala.js';

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
/** Sanskrit names, IAST; `sc` writes them in the reader's script. */
const AVASTHA_NAME: Readonly<Record<Avastha, string>> = { bala: 'Bāla', kumara: 'Kumāra', yuva: 'Yuva', vriddha: 'Vṛddha', mrita: 'Mṛta' };
const KARAKA_NAME = ['Ātmakāraka', 'Amātyakāraka', 'Bhrātṛkāraka', 'Mātṛkāraka', 'Putrakāraka', 'Jñātikāraka', 'Dārakāraka'] as const;
const NATURE_NAME = ['Cara', 'Sthira', 'Dvisvabhāva'] as const;
const ELEMENT_KEY = ['element.fire', 'element.earth', 'element.air', 'element.water'] as const;
/** The south node is not a body the ephemeris serves: it is the north node's opposite point. */
const NORTH_OF: Readonly<Record<string, Body>> = { southNode: 'trueNode', meanSouthNode: 'meanNode' };

const pad2 = (x: number): string => String(x).padStart(2, '0');
/** Hours as HH:MM:SS. */
const hms = (hours: number): string => {
  const s = Math.round(hours * 3600);
  return `${pad2(Math.floor(s / 3600))}:${pad2(Math.floor(s / 60) % 60)}:${pad2(s % 60)}`;
};
/** Signed degrees as ±D°MM′SS″. */
const dmsSigned = (x: number): string => {
  const s = Math.round(Math.abs(x) * 3600);
  return `${x < 0 ? '−' : '+'}${Math.floor(s / 3600)}°${pad2(Math.floor(s / 60) % 60)}′${pad2(s % 60)}″`;
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
  const { gn, gshort, rn, rshort, sc, signDms, nak } = useJy();
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
  const dashaFrom = useMemo(() => (system: DashaSystemId, lon: number): DashaResult => dashas(system, lon, chart.jdUT, {
    yearDays: YEAR_LENGTHS.julian,
    anchor: 'civilDate',
    localMidnightJd: localMidnightJd(chart.jdUT, off),
    spanYears: 120,
  }), [chart.jdUT, off]);
  const dashaOf = useMemo(() => (system: DashaSystemId): DashaResult => dashaFrom(system, g.lon.moon), [dashaFrom, g]);
  const vim = useMemo(() => dashaOf('vimshottari'), [dashaOf]);
  const nowJd = Date.parse(generatedIso) / 86_400_000 + 2440587.5;
  const now = new Date(generatedIso);
  const age = Math.max(0, Math.min(100, Math.floor((nowJd - chart.jdUT) / 365.2564)));

  const yogaList = useMemo(() => yogas(g).filter((y) => y.holds || y.holdsWithNodes), [g]);
  const vargas = useMemo(() => (hasLagna ? shodashavarga(g) : null), [g, hasLagna]);
  const vargaAv = useMemo(() => (hasLagna ? vargaSarva(g) : null), [g, hasLagna]);
  const dig = useMemo(() => new Map(dignities(g).map((d) => [d.body, d])), [g]);
  const zodiac = chart.settings.zodiac;

  /*
   * The particulars a printed kuṇḍalī opens with — the day, the calendar, the
   * pañcāṅga's spans — and the ephemeris figures of the graha tables: motion,
   * latitude and declination, the cusps, Gulika and Māndi, the true node.
   */
  const ex = useMemo(() => {
    if (!provider) return null;
    const place = { latitude: chart.place.latitude, longitude: chart.place.longitude };
    const jd = chart.jdUT;
    const motion = new Map(vchart.placements.map((p) => {
      const north = NORTH_OF[p.body];
      const q = provider.calc(jd, north ?? (p.body as Body), { zodiac, includeEquatorial: true });
      const flip = north ? -1 : 1;
      return [p.body, { speed: q.longitudeSpeed, latitude: flip * q.latitude, declination: flip * (q.equatorial?.declination ?? 0) }] as const;
    }));
    const h = hasLagna ? provider.houses(jd, place.latitude, place.longitude, 'placidus', { zodiac }) : undefined;
    return {
      day: birthDay(provider, jd, place, off),
      cal: hinduCalendar(provider, jd, zodiac, chart.input.date),
      spans: limbSpans(provider, jd, zodiac),
      upa: hasLagna ? gulikaMandi(provider, jd, place, zodiac, off) : undefined,
      motion,
      houses: h,
      chalit: h ? chalit(g, sripati(h.ascendant, h.midheaven).sandhi) : [],
      trueRahu: vchart.usesMeanNodes ? provider.calc(jd, 'trueNode', { zodiac }).longitude : undefined,
      tropicalSun: provider.calc(jd, 'sun').longitude,
    };
  }, [provider, chart, vchart, g, zodiac, off, hasLagna]);

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

  const day = ex?.day; const cal = ex?.cal;
  const wait = t('report.vedic.pending');
  const asht = useMemo(() => dashaOf('ashtottari'), [dashaOf]);
  const balance = (d: DashaResult): string => {
    const b = yearsToYmd(d.balanceYears);
    return t('vedic.dasha.balanceYmd', { lord: gn(d.firstLord), y: b.years, m: b.months, d: b.days });
  };
  /** Local clock time of an instant, HH:MM:SS. */
  const clock = (jd: number): string => hms((((jd + 0.5 + off / 1440) % 1) + 1) % 1 * 24);
  const ghati = (x: number): string => {
    const v = Math.round(x * 3600);
    return `${pad2(Math.floor(v / 3600))}:${pad2(Math.floor(v / 60) % 60)}:${pad2(v % 60)}`;
  };
  const fortunaLon = fortuna(g);
  const LIMB_KEY: Readonly<Record<Limb, MessageKey>> = {
    rasi: 'kundli.rashi', tithi: 'vedic.panchang.tithi', nakshatra: 'vedic.panchang.nakshatra', yoga: 'vedic.panchang.yoga', karana: 'vedic.panchang.karana',
  };
  const limbName = (limb: Limb): string => t(LIMB_KEY[limb]);
  /** A limb's name from its index, by asking the pañcāṅga functions about a longitude inside it. */
  const limbValue = (limb: Limb, i: number): string => {
    switch (limb) {
      case 'rasi': return rn(i);
      case 'nakshatra': return nak(i);
      case 'tithi': {
        const x = tithiFrom(0, i * 12 + 6);
        return `${t(`vedic.paksha.${x.paksha}` as 'vedic.paksha.shukla')} ${n(x.inPaksha)} · ${t(x.nameKey as 'tithi.purnima')}`;
      }
      case 'yoga': return t(yogaFrom(0, i * (40 / 3) + 1).nameKey as 'yoga.vishkambha');
      case 'karana': return t(karanaFrom(0, i * 6 + 3).nameKey as 'karana.bava');
    }
  };
  const lagnaSign = vchart.lagna?.signIndex ?? 0;
  /** A row of the longitudes table for a point that is not a graha: lagna, Gulika, Māndi, Fortuna, MC. */
  const pointRow = (key: string, label: ReactNode, lon: number): JSX.Element => {
    const l = kpLords(lon);
    const ni = Math.floor(norm360(lon) / (40 / 3));
    const pada = Math.floor((norm360(lon) % (40 / 3)) / (10 / 3)) + 1;
    return (
      <tr key={key} style={ROW}>
        <th scope="row" className={`${TD} text-left font-normal`}>{label}</th>
        <td className={TD}>{signDms(lon)}</td>
        <td className={TD}>{nak(ni)} {n(pada)}</td>
        <td className={TD}>{gn(l.sign)}</td>
        <td className={TD}>{gn(l.star)}</td>
        <td className={TD}>{gn(l.sub)}</td>
        <td className={TD}>{hasLagna ? n(((Math.floor(norm360(lon) / 30) - lagnaSign + 12) % 12) + 1) : '—'}</td>
        <td className={TD}>—</td>
        <td className={TD}>—</td>
        <td className={TD}>—</td>
      </tr>
    );
  };

  const placementsFor = (lagnaSignIndex: number) => ({
    lagnaSignIndex,
    bodies: vchart.placements.map((p) => ({ body: p.body, signIndex: p.signIndex, retrograde: p.retrograde })),
  });

  const av = useMemo(() => ashtakavarga(g), [g]);
  const facts = useMemo(() => bhavaFacts(g), [g]);

  /** Mahādaśā from each graha and the lagna, for one system. */
  const fromEach = (system: DashaSystemId): JSX.Element => (
      <Page title={t(system === 'vimshottari' ? 'kundli.page.dashaFromEach' : 'kundli.page.ashtFromEach')} id={`${system}-from-each`}>
        <div className="k-mini grid grid-cols-5 gap-x-3 gap-y-3">
          {[...(g.lagna !== undefined ? [['lagna', g.lagna] as const] : []), ...GRAHAS.map((b) => [b, g.lon[b]] as const)].map(([b, lon]) => {
            const d = dashaFrom(system, lon);
            const label = b === 'lagna' ? t('vedic.lagna') : gn(b);
            return (
              <div key={b} className="report-block" data-dasha-from={b}>
                <h4>{t('kundli.fromBody', { body: label })} · {nak(Math.floor(norm360(lon) / (40 / 3)))}</h4>
                <table className="w-full border-collapse" style={{ border: 0 }}>
                  <tbody>
                    {d.mahadashas.map((m) => (
                      <tr key={m.path.join('/')}>
                        <td className="whitespace-nowrap">{gn(m.lord)}</td>
                        <td className="whitespace-nowrap text-right tabular-nums">{localDate(m.endJd, off)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>
        <p className="as-fineprint mt-2">{t('kundli.dashaFromNote')}</p>
      </Page>
  );

  /** The running mahādaśā and its antardaśās, at a glance. */
  const mdAnalysis = (() => {
    const md = runningPath(vim, nowJd, 1)[0];
    if (!md || !vargas || !hasLagna) return null;
    const running = new Set(runningPath(vim, nowJd, 2).map((r) => r.path.join('/')));
    return (
      <Page title={`${t('kundli.page.mdAnalysis')} · ${gn(md.lord)} · ${localDate(Math.max(md.startJd, vim.anchorJd), off)} – ${localDate(md.endJd, off)}`} id="md-analysis">
        <MahadashaAnalysis g={g} md={md} running={running} d9={vargas[9]!} birthJd={chart.jdUT} off={off} />
      </Page>
    );
  })();

  /** Sidereal transit longitudes at the generation instant, for the Sarvatobhadra. */
  const transitNow = useMemo(() => {
    if (!provider) return undefined;
    const out = {} as Record<Graha, number>;
    for (const b of SEVEN) out[b] = provider.calc(nowJd, b, { zodiac }).longitude;
    const node = provider.calc(nowJd, vchart.usesMeanNodes ? 'meanNode' : 'trueNode', { zodiac }).longitude;
    out.rahu = norm360(node); out.ketu = norm360(node + 180);
    return out;
  }, [provider, nowJd, zodiac, vchart.usesMeanNodes]);

  const sadeSatiNow = useMemo(() => {
    if (!provider) return false;
    return sadeSati(provider, g.lon.moon, chart.jdUT, { zodiac, years: 120 }).spells
      .some((x) => x.kind === 'sadeSati' && nowJd >= x.startJd && nowJd < x.endJd);
  }, [provider, g, chart.jdUT, zodiac, nowJd]);

  /** Every year's progressed (sāyana) positions, a day for a year. */
  const progressions = useMemo(() => {
    if (!provider || !include.annual) return null;
    const o = {
      birthJd: chart.jdUT, latitude: chart.place.latitude, longitude: chart.place.longitude,
      node: chart.settings.nodeType === 'true' ? 'trueNode' as const : 'meanNode' as const, utcOffsetMinutes: off,
    };
    return Array.from({ length: VARSHA_YEARS }, (_, a) => ({ age: a, p: progression(provider, o, a) }));
  }, [provider, include.annual, chart, off]);

  /** Sign and degree in the reader's script, short enough for twelve columns. */
  const brief = (lon: number): string => {
    const l = norm360(lon); const sg = Math.floor(l / 30); const m = Math.floor((l - sg * 30) * 60);
    return `${rshort(sg)} ${Math.floor(m / 60)}°${pad2(m % 60)}′`;
  };
  const YEAR_COLS: readonly (Graha | 'lagna')[] = ['lagna', ...GRAHAS];
  const yearTable = (rows: readonly { age: number; jd: number; lagna: number; lon: Readonly<Record<Graha, number>>; extra?: string }[], withExtra: boolean): JSX.Element => (
    <div className="k-dense">
      <Table head={[t('vedic.varsha.age'), t('vedic.varsha.date'), ...YEAR_COLS.map((b) => (b === 'lagna' ? t('vedic.lagna') : gn(b))), ...(withExtra ? [t('vedic.varsha.munthaHouse')] : [])]}>
        {rows.map((r) => (
          <tr key={r.age} style={ROW}>
            <th scope="row" className={`${TD} text-left font-medium`}>{r.age}</th>
            <td className={`${TD} tabular-nums`}>{localDate(r.jd, off)}</td>
            {YEAR_COLS.map((b) => <td key={b} className={TD}>{brief(b === 'lagna' ? r.lagna : r.lon[b])}</td>)}
            {withExtra ? <td className={TD}>{r.extra}</td> : null}
          </tr>
        ))}
      </Table>
    </div>
  );

  /** This year's varṣa in a sentence: facts, then what tradition reads the mudda lord's house for. */
  const yearSummary = (() => {
    const v = varshas?.[age];
    if (!v) return null;
    const m = v.mudda.find((x) => nowJd >= x.startJd && nowJd < x.endJd);
    if (!m) return null;
    const ls = Math.floor(v.positions.lagna / 30);
    const h = ((Math.floor(v.positions.lon[m.lord] / 30) - ls + 12) % 12) + 1;
    return (
      <p className="report-block mb-3 text-[10.5px] leading-snug" data-year-summary>
        {t('kundli.year.summary', {
          age, at: localDateTime(v.startJd, off), lagna: rn(ls), mh: v.munthaHouse, today: localDate(nowJd, off),
          lord: gn(m.lord), end: localDate(m.endJd, off), h, matters: t(`kundli.bh.m.${h}` as 'kundli.bh.m.1'),
        })}
      </p>
    );
  })();

  /** The running antardaśā's pratyantars, each to its sūkṣmas with their end dates and times. */
  const sukshma = (() => {
    const path = runningPath(vim, nowJd, 2);
    const md = path[0]; const ad = path[1];
    if (!md || !ad) return null;
    const running = new Set(runningPath(vim, nowJd, 4).map((r) => r.path.join('/')));
    return (
      <Page title={`${t('kundli.page.sukshma')} · ${gn(md.lord)} / ${gn(ad.lord)}`} id="sukshma">
        <p className="as-fineprint mb-2">{t('kundli.sukshmaNote', { offset: utcOffsetLabel(off) })}</p>
        <div className="k-mini grid grid-cols-3 gap-x-4 gap-y-2">
          {subPeriods(ad).map((pd) => (
            <div key={pd.path.join('/')} className="report-block">
              <h4 className={running.has(pd.path.join('/')) ? 'font-bold' : ''}>
                {gn(md.lord)}–{gn(ad.lord)}–{gn(pd.lord)} · {localDate(pd.endJd, off)}
              </h4>
              <table className="w-full border-collapse" style={{ border: 0 }}>
                <tbody>
                  {subPeriods(pd).map((sk) => (
                    <tr key={sk.path.join('/')} className={running.has(sk.path.join('/')) ? 'font-semibold' : ''}>
                      <td className="whitespace-nowrap">{gn(sk.lord)}</td>
                      <td className="whitespace-nowrap text-right tabular-nums">{localDateTime(sk.endJd, off)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      </Page>
    );
  })();

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
          [t('kundli.f.weekday'), day ? t(`weekday.${WEEKDAYS[day.weekday]!}` as 'weekday.ravivara') : wait],
          [t('report.vedic.timeZone'), utcOffsetLabel(off)],
          [t('summary.birthplace'), chart.place.label ?? '—'],
          [t('report.vedic.coordinates'), `${n(chart.place.latitude, { maximumFractionDigits: 4 })}°, ${n(chart.place.longitude, { maximumFractionDigits: 4 })}°`],
          [t('kundli.native'), t(sex === 'male' ? 'kundli.male' : 'kundli.female')],
          [t('vedic.panchang.sunrise'), day ? (day.sunriseJd !== undefined ? clock(day.sunriseJd) : '—') : wait],
          [t('kundli.f.sunset'), day ? (day.sunsetJd !== undefined ? clock(day.sunsetJd) : '—') : wait],
          [t('kundli.f.dayLength'), day ? (day.dayHours !== undefined ? hms(day.dayHours) : '—') : wait],
          [t('kundli.f.ghati'), day ? (day.ghatis !== undefined ? ghati(day.ghatis) : '—') : wait],
          [t('kundli.f.lmt'), day ? hms(day.localMeanTime) : wait],
          [t('kundli.f.ltc'), day ? `${day.localCorrectionMinutes < 0 ? '−' : '+'}${hms(Math.abs(day.localCorrectionMinutes) / 60)}` : wait],
          [t('kundli.f.lst'), day ? hms(day.siderealTime) : wait],
          [t('vedic.ayanamsha'), `${t(`ayanamsha.${vchart.ayanamshaName}` as 'ayanamsha.lahiri')} · ${n(vchart.ayanamsha, { maximumFractionDigits: 4 })}°`],
          [t('summary.nodeType'), vchart.usesMeanNodes ? t('vedic.nodes.mean') : t('vedic.nodes.true')],
          [t('vedic.lagna'), vchart.lagna ? signDms(vchart.lagna.longitude) : '—'],
          [t('report.vedic.moon'), moon ? `${rn(moon.signIndex)} · ${nak(moon.nakshatra.index)} ${n(moon.nakshatra.pada)}` : '—'],
          [t('kundli.f.westernSun'), ex ? t(`sign.${SIGNS[Math.floor(norm360(ex.tropicalSun) / 30)]!}` as 'sign.aries') : wait],
          [t('kundli.f.ayana'), cal ? t(`kundli.f.${cal.ayana}`) : wait],
          [t('kundli.f.gola'), cal ? t(`kundli.f.${cal.gola}`) : wait],
          [t('kundli.f.ritu'), cal ? sc(RITU[cal.ritu]!) : wait],
          [t('kundli.f.shaka'), cal ? `${cal.shaka} · ${sc(SAMVATSARA[cal.samvatsara]!)}` : wait],
          [t('kundli.f.vikrama'), cal ? t('kundli.f.vikramaValue', { c: String(cal.vikramaChaitradi), k: String(cal.vikramaKarttikadi) }) : wait],
          [t('kundli.f.amanta'), cal ? `${cal.adhika ? `${t('kundli.f.adhika')} ` : ''}${sc(MASA[cal.amanta]!)}` : wait],
          [t('kundli.f.purnimanta'), cal ? `${cal.adhika ? `${t('kundli.f.adhika')} ` : ''}${sc(MASA[cal.purnimanta]!)}` : wait],
          [t('kundli.balance'), balance(vim)],
          [t('kundli.f.ashtottariBalance'), balance(asht)],
          [t('report.generated'), localDate(nowJd, off)],
        ]} />
        <section className="report-block mt-5">
          <h3 className="as-h3 report-heading mb-2">{t('kundli.contents')}</h3>
          <ol className="grid grid-cols-3 gap-x-6 gap-y-0.5 text-[10.5px]" style={{ listStyle: 'decimal inside' }}>
            {CONTENTS.filter(([k]) => k === 'always' || include[k]).map(([, key]) => <li key={key}>{t(key)}</li>)}
          </ol>
        </section>
        <p className="as-fineprint mt-4">{t('kundli.abbreviations')}: {GRAHAS.map((x) => `${t(`jy.short.${x}` as 'jy.short.sun')} = ${gn(x)}`).join(' · ')} · {t('kundli.short.mandi')} = {t('kundli.mandi')} · {t('kundli.short.fortuna')} = {t('kundli.fortuna')} · ℞ = {t('kundli.retrograde')}</p>
      </Page>

      {/* ---- pañcāṅga spans, avakahaḍā, conventions ---- */}
      <Page title={t('kundli.page.panchang')} id="panchang">
        <h3 className="as-h3 report-heading mb-1">{t('kundli.spans')}</h3>
        {ex ? (
          <Table head={[t('kundli.col.limb'), t('kundli.col.name'), t('vedic.column.start'), t('vedic.column.end')]}>
            {LIMBS.flatMap((limb) => ex.spans[limb].map((sp, k) => (
              <tr key={`${limb}${k}`} style={ROW} className={k === 1 ? 'font-semibold' : ''}>
                {k === 0 ? <th scope="rowgroup" rowSpan={3} className={`${TD} text-left align-middle font-medium`}>{limbName(limb)}</th> : null}
                <td className={TD}>{limbValue(limb, sp.index)}{k === 1 ? <span className="ms-1 as-text-muted">●</span> : null}</td>
                <td className={`${TD} tabular-nums`}>{localDateTime(sp.startJd, off)}</td>
                <td className={`${TD} tabular-nums`}>{localDateTime(sp.endJd, off)}</td>
              </tr>
            )))}
          </Table>
        ) : pending}
        <p className="as-fineprint mt-1">{t('kundli.spansNote', { offset: utcOffsetLabel(off) })}</p>
        <div className="mt-4">
          {provider ? <TablesSection vchart={vchart} chart={chart} provider={provider} print={{ views: ['avakahada'] }} /> : pending}
        </div>
      </Page>

      {/* ---- grahas ---- */}
      <Page title={t('kundli.page.grahas')} id="grahas">
        <Table head={[
          t('vedic.column.body'), t('vedic.kp.longitude'), `${t('vedic.column.nakshatra')} · ${t('vedic.column.pada')}`,
          t('kundli.col.rl'), t('kundli.col.nl'), t('kundli.col.sl'), t('vedic.column.house'), t('vedic.tb.status'), t('kundli.col.avastha'), t('vedic.tb.combust'),
        ]}>
          {vchart.lagna ? pointRow('lagna', <span className="font-semibold">{t('vedic.lagna')}</span>, vchart.lagna.longitude) : null}
          {vchart.placements.map((p) => {
            const d = dig.get((NODE_GRAHA[p.body] ?? p.body) as Graha);
            const l = kpLords(p.longitude);
            return (
              <tr key={p.body} style={ROW}>
                <th scope="row" className={`${TD} text-left font-normal`}>
                  <span className="inline-flex items-center gap-1.5">
                    <BodyGlyph body={p.body} tinted />
                    {t(`body.${p.body}` as 'body.sun')}{p.retrograde ? ' ℞' : ''}
                  </span>
                </th>
                <td className={TD}>{signDms(p.longitude)}</td>
                <td className={TD}>{nak(p.nakshatra.index)} {n(p.nakshatra.pada)}</td>
                <td className={TD}>{gn(l.sign)}</td>
                <td className={TD}>{gn(l.star)}</td>
                <td className={TD}>{gn(l.sub)}</td>
                <td className={TD}>{p.house === 0 ? '—' : n(p.house)}</td>
                <td className={TD}>{d ? t(`vedic.tb.dig.${d.status}` as 'vedic.tb.dig.own') : '—'}</td>
                <td className={TD}>{sc(AVASTHA_NAME[baladi(p.longitude)])}</td>
                <td className={TD}>{d?.combust ? t('vedic.tb.yes') : '—'}</td>
              </tr>
            );
          })}
          {ex?.upa ? pointRow('gulika', t('kundli.gulika'), ex.upa.gulika.longitude) : null}
          {ex?.upa ? pointRow('mandi', t('kundli.mandi'), ex.upa.mandi.longitude) : null}
          {fortunaLon !== undefined ? pointRow('fortuna', t('kundli.fortuna'), fortunaLon) : null}
          {ex?.houses ? pointRow('mc', t('kundli.mc'), ex.houses.midheaven) : null}
        </Table>
        <p className="as-fineprint mt-1">
          {vargas ? t('kundli.vargottama', { list: GRAHAS.filter((b) => vargas[1]![b] === vargas[9]![b]).map((b) => gn(b)).join(', ') || '—' }) : null}
          {ex?.trueRahu !== undefined ? ` ${t('kundli.trueNode', { pos: signDms(ex.trueRahu) })}` : null}
        </p>
        <p className="as-fineprint mt-0.5">{t('kundli.lordsNote')}</p>


        {hasLagna && include.charts ? (
          <div className="report-block mt-3 flex justify-center gap-6">
            <figure style={figure(Math.min(74, (W - 8) / 2))}>
              <figcaption className="mb-1 text-center text-[11px] font-semibold">{t('report.vedic.lagnaChart')}</figcaption>
              <VedicChartFigure
                chart={vchart} style={style} size={1000} tinted label={t('report.vedic.lagnaChart')} {...themeProp}
                placements={{
                  ...placementsFor(vchart.lagna!.signIndex),
                  bodies: [
                    ...placementsFor(vchart.lagna!.signIndex).bodies,
                    ...(ex?.upa ? [{ body: 'mandi', signIndex: Math.floor(ex.upa.mandi.longitude / 30), text: t('kundli.short.mandi') }] : []),
                    ...(fortunaLon !== undefined ? [{ body: 'fortuna', signIndex: Math.floor(fortunaLon / 30), text: t('kundli.short.fortuna') }] : []),
                  ],
                }}
              />
            </figure>
            {moon ? (
              <figure style={figure(Math.min(74, (W - 8) / 2))}>
                <figcaption className="mb-1 text-center text-[11px] font-semibold">{t('kundli.moonChart')}</figcaption>
                <VedicChartFigure chart={vchart} style={style} size={1000} tinted placements={placementsFor(moon.signIndex)} label={t('kundli.moonChart')} {...themeProp} />
              </figure>
            ) : null}
          </div>
        ) : null}
      </Page>

      {/* ---- motion, latitude, declination; the rāśi conventions ---- */}
      <Page title={t('kundli.page.motion')} id="motion">
        {ex ? (
          <Table head={[t('vedic.column.body'), t('vedic.west.speed'), t('vedic.west.latitude'), t('vedic.west.declination')]}>
            {vchart.placements.map((p) => {
              const m = ex.motion.get(p.body)!;
              return (
                <tr key={p.body} style={ROW}>
                  <th scope="row" className={`${TD} text-left font-normal`}>{t(`body.${p.body}` as 'body.sun')}</th>
                  <td className={`${TD} tabular-nums`}>{dmsSigned(m.speed)}</td>
                  <td className={`${TD} tabular-nums`}>{dmsSigned(m.latitude)}</td>
                  <td className={`${TD} tabular-nums`}>{dmsSigned(m.declination)}</td>
                </tr>
              );
            })}
          </Table>
        ) : pending}
        <section className="report-block mt-6">
          <h3 className="as-h3 report-heading mb-1">{t('kundli.conventionsTable')}</h3>
          <Table head={[t('vedic.column.sign'), t('vedic.column.lord'), t('kundli.col.element'), t('kundli.col.nature')]}>
            {Array.from({ length: 12 }, (_, s) => (
              <tr key={s} style={ROW}>
                <th scope="row" className={`${TD} text-left font-medium`}>{n(s + 1)} · {rn(s)}</th>
                <td className={TD}>{gn(SIGN_LORDS[s]!)}</td>
                <td className={TD}>{t(ELEMENT_KEY[s % 4]!)}</td>
                <td className={TD}>{sc(NATURE_NAME[s % 3]!)}</td>
              </tr>
            ))}
          </Table>
        </section>
      </Page>

      {/* ---- bhāva, sudarśana ---- */}
      {include.tables && hasLagna ? (
        <Page title={t('kundli.page.bhava')} id="bhava">
          {provider ? <TablesSection vchart={vchart} chart={chart} provider={provider} print={{ views: ['chalit', 'sudarshana'] }} /> : pending}
        </Page>
      ) : null}

      {/* ---- chalit, cusp and bhāva charts ---- */}
      {include.charts && hasLagna ? (
        <Page title={t('kundli.page.bhavaCharts')} id="bhava-charts">
          {ex?.houses ? (
            <>
              <div className="report-block flex justify-center gap-6">
                {([
                  ['kundli.chalitChart', (b: Graha) => ex.chalit.find((c) => c.body === b)!.bhava],
                  ['kundli.cuspChart', (b: Graha) => arcHouse(ex.houses!.cusps.map(norm360), g.lon[b])],
                ] as const).map(([key, houseOf]) => (
                  <figure key={key} style={figure(Math.min(72, (W - 8) / 2))}>
                    <figcaption className="mb-1 text-center text-[11px] font-semibold">{t(key)}</figcaption>
                    <VedicChartFigure
                      chart={vchart} style={style} size={1000} tinted label={t(key)} {...themeProp}
                      placements={{
                        lagnaSignIndex: lagnaSign,
                        bodies: GRAHAS.map((b) => ({ body: b, signIndex: (lagnaSign + houseOf(b) - 1) % 12, retrograde: b !== 'rahu' && b !== 'ketu' && g.retrograde[b] })),
                      }}
                    />
                  </figure>
                ))}
              </div>
              <p className="as-fineprint mt-2">{t('kundli.bhavaNote')}</p>
            </>
          ) : pending}
        </Page>
      ) : null}
      {include.charts && hasLagna ? (
        <Page title={t('kundli.bhavaKundli')} id="bhava-kundli">
          <p className="as-fineprint mb-2">{t('kundli.fn.note')}</p>
          <div className="grid grid-cols-4 gap-x-3 gap-y-2.5">
            {Array.from({ length: 12 }, (_, h) => {
              const fn = functionalNature((lagnaSign + h) % 12, g);
              return (
                <figure key={h} className="report-block" data-bhava-kundli={h + 1}>
                  <figcaption className="text-center text-[9.5px] font-semibold">{t('kundli.houseN', { n: h + 1 })}</figcaption>
                  <VedicChartFigure chart={vchart} style={style} size={500} tinted label={t('kundli.houseN', { n: h + 1 })}
                    placements={placementsFor((lagnaSign + h) % 12)} {...themeProp} />
                  <dl className="mt-0.5 text-[8.5px] leading-tight">
                    {FUNCTIONAL_NATURES.map((n) => (
                      <div key={n} className="flex gap-1" data-fn={n}>
                        <dt className={n === 'benefic' ? 'font-semibold' : n === 'malefic' ? 'font-semibold as-text-muted' : 'as-text-muted'}>{t(`kundli.fn.${n}`)}:</dt>
                        <dd>{GRAHAS.filter((b) => fn[b] === n).map((b) => gshort(b)).join(', ') || '—'}</dd>
                      </div>
                    ))}
                  </dl>
                </figure>
              );
            })}
          </div>
        </Page>
      ) : null}

      {/* ---- the sixteen vargas, six to a sheet ---- */}
      {include.vargas && vargas ? [0, 9].map((from) => (
        <Page key={from} title={`${t('kundli.page.vargas')} · ${from / 9 + 1}/2`} id={`vargas-${from / 9 + 1}`}>
          <div className="grid grid-cols-3 gap-x-4 gap-y-3">
            {SHODASHA.slice(from, from + 9).map((d) => (
              <figure key={d} className="report-block">
                <figcaption className="mb-0.5 text-center text-[10px] font-semibold">
                  D{d} · {sc(VARGA_NAME[d]!)}
                  <span className="block text-[8.5px] font-normal as-text-muted">{t(`kundli.varga.${d}` as 'kundli.varga.1')}</span>
                </figcaption>
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
          {from === 0 ? <p className="as-fineprint mt-2">{t('kundli.vargaNote')}</p> : null}
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

      {/* ---- Jaimini: kārakas, kāraka and pada charts, graha dṛṣṭi ---- */}
      {include.tables && hasLagna && vargas ? (() => {
        const ck = charaKarakas(g); const ak = ck[0]!.body; const ar = arudhas(g);
        const d1 = (lagnaSignIndex: number) => placementsFor(lagnaSignIndex);
        const charts: readonly (readonly [MessageKey, { lagnaSignIndex: number; bodies: { body: string; signIndex: number; retrograde?: boolean; text?: string }[] }])[] = [
          ['kundli.karakaChart', d1(Math.floor(g.lon[ak] / 30))],
          ['kundli.karakamsaChart', { lagnaSignIndex: vargas[9]![ak], bodies: GRAHAS.map((b) => ({ body: b, signIndex: vargas[9]![b] })) }],
          ['kundli.arudhaChart', d1(ar[0]!)],
          ['kundli.upapadaChart', d1(ar[11]!)],
          ['kundli.padaChart', { lagnaSignIndex: lagnaSign, bodies: ar.map((s, i) => ({ body: 'pada', signIndex: s, text: `A${i + 1}` })) }],
        ];
        return (
          <Page title={t('kundli.page.jaiminiCharts')} id="jaimini-charts">
            <div className="grid grid-cols-3 gap-x-4 gap-y-2">
              <section className="report-block">
                <Table head={[t('kundli.col.karaka'), t('vedic.column.body'), t('kundli.col.inSign')]}>
                  {ck.map((k, i) => (
                    <tr key={k.karaka} style={ROW} className={i === 0 ? 'font-semibold' : ''}>
                      <th scope="row" className={`${TD} text-left font-medium`}>{sc(KARAKA_NAME[i]!)}</th>
                      <td className={TD}>{gn(k.body)}</td>
                      <td className={`${TD} tabular-nums`}>{signDms(k.degrees).replace(/^\S+\s/, '')}</td>
                    </tr>
                  ))}
                </Table>
              </section>
              {charts.map(([key, pl]) => (
                <figure key={key} className="report-block">
                  <figcaption className="mb-0.5 text-center text-[10px] font-semibold">{t(key)}</figcaption>
                  <VedicChartFigure chart={vchart} style={style} size={600} tinted label={t(key)} placements={pl} {...themeProp} />
                </figure>
              ))}
            </div>
            <h3 className="as-h3 report-heading mb-1 mt-3">{t('kundli.grahaDrishti')}</h3>
            <Table head={[t('vedic.column.body'), t('kundli.col.aspHouses'), t('kundli.col.aspGrahas')]}>
              {GRAHAS.map((b) => {
                const asp = rasiDrishti(Math.floor(g.lon[b] / 30));
                return (
                  <tr key={b} style={ROW}>
                    <th scope="row" className={`${TD} text-left font-medium`}>{gn(b)}</th>
                    <td className={TD}>{asp.map((x) => n(((x - lagnaSign + 12) % 12) + 1)).join(', ')}</td>
                    <td className={TD}>{GRAHAS.filter((o) => o !== b && asp.includes(Math.floor(g.lon[o] / 30))).map((o) => gn(o)).join(', ') || '—'}</td>
                  </tr>
                );
              })}
            </Table>
            <p className="as-fineprint mt-2">{t('kundli.jaiminiNote')}</p>
          </Page>
        );
      })() : null}

      {include.tables && facts.length ? [0, 6].map((from) => (
        <Page key={from} title={`${t('kundli.page.bhavaReading')} · ${from / 6 + 1}/2`} id={`bhava-reading-${from / 6 + 1}`}>
          {from === 0 ? <p className="as-fineprint mb-2">{t('kundli.bh.note')}</p> : null}
          <BhavaReading facts={facts.slice(from, from + 6)} />
        </Page>
      )) : null}
      {include.tables && hasLagna ? ([0, 1] as const).map((part) => (
        <Page key={`ph${part}`} title={`${t('kundli.page.phalaGrahas')} · ${part + 1}/2`} id={`phala-${part + 1}`}>
          <GrahaReadings g={g} part={part} />
        </Page>
      )) : null}

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
          <Page title={t('kundli.page.binduCharts')} id="bindu-charts">
            <div className="grid grid-cols-3 gap-x-4 gap-y-2">
              {[...AV_OWNERS.map((o) => [o, av.bhinna[o].totals] as const), ['sarva', av.sarva] as const].map(([o, bindus]) => {
                const label = o === 'sarva' ? t('vedic.av.sarva') : o === 'lagna' ? t('vedic.lagna') : gn(o);
                return (
                  <figure key={o} className="report-block" data-bindu={o}>
                    <figcaption className="mb-0.5 text-center text-[10px] font-semibold">
                      {label} · {bindus.reduce((x, y) => x + y, 0)}
                    </figcaption>
                    <VedicChartFigure
                      chart={vchart} style={style} size={600} tinted label={label} {...themeProp}
                      placements={{ lagnaSignIndex: lagnaSign, bodies: bindus.map((v, s) => ({ body: o === 'sarva' || o === 'lagna' ? 'point' : o, signIndex: s, text: String(v) })) }}
                    />
                  </figure>
                );
              })}
            </div>
            <p className="as-fineprint mt-2">{t('kundli.binduNote')}</p>
          </Page>
          {vargas && vargaAv ? (
            <Page title={t('kundli.page.vargaAv')} id="varga-ashtakavarga">
              <div className="grid grid-cols-4 gap-x-3 gap-y-2">
                {SHODASHA.map((d) => (
                  <figure key={d} className="report-block" data-varga-av={d}>
                    <figcaption className="text-center text-[9.5px] font-semibold">D{d} · {sc(VARGA_NAME[d]!)}</figcaption>
                    <VedicChartFigure
                      chart={vchart} style={style} size={500} tinted label={`D${d} · ${t('vedic.av.sarva')}`} {...themeProp}
                      placements={{
                        lagnaSignIndex: vargas[d]!.lagna,
                        bodies: [
                          ...GRAHAS.map((b) => ({ body: b, signIndex: vargas[d]![b] })),
                          ...vargaAv[d]!.map((v, s) => ({ body: 'point' as const, signIndex: s, text: String(v) })),
                        ],
                      }}
                    />
                  </figure>
                ))}
              </div>
              <p className="as-fineprint mt-2">{t('kundli.vargaAvNote')}</p>
            </Page>
          ) : null}
        </>
      ) : null}

      {include.dasha ? (
        <>
          {dashaPages('vimshottari', vim, true)}
          {sukshma}
          {fromEach('vimshottari')}
          {mdAnalysis}
          {hasLagna ? (
            <Page title={t('kundli.page.phalaDasha')} id="phala-dasha">
              <DashaReadings g={g} vim={vim} nowJd={nowJd} birthJd={chart.jdUT} off={off} varsha={varshas?.[age]} />
            </Page>
          ) : null}
        </>
      ) : null}
      {include.otherDashas ? (
        <>
          {dashaPages('ashtottari', asht, true)}
          {fromEach('ashtottari')}
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
          {yearSummary}
          {provider ? <div className="k-dense"><VarshaphalSection chart={chart} provider={provider} print={{ age }} /></div> : pending}
        </Page>
      ) : null}

      {include.annual && hasLagna && varshas ? [0, 1].map((half) => (
        <Page key={`v${half}`} title={`${t('kundli.page.varshaAll')} · ${half + 1}/2`} id={`varsha-all-${half + 1}`}>
          {yearTable(varshas.slice(half * 48, half * 48 + 48).map((v) => ({
            age: v.age, jd: v.startJd, lagna: v.positions.lagna, lon: v.positions.lon, extra: String(v.munthaHouse),
          })), true)}
        </Page>
      )) : null}
      {include.annual && hasLagna && progressions ? [0, 1].map((half) => (
        <Page key={`p${half}`} title={`${t('kundli.page.progressionAll')} · ${half + 1}/2`} id={`progression-all-${half + 1}`}>
          {yearTable(progressions.slice(half * 48, half * 48 + 48).map(({ age: a, p }) => ({ age: a, jd: p.jd, lagna: p.lagna, lon: p.lon })), false)}
        </Page>
      )) : null}

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

      {include.transits ? (
        <Page title={t('kundli.page.sbc')} id="sarvatobhadra">
          <Sarvatobhadra g={g} {...(transitNow ? { transit: transitNow } : {})} transitLabel={localDate(nowJd, off)} />
        </Page>
      ) : null}

      {include.matching ? (
        <Page title={t('vedic.section.matching')} id="matching">
          <MatchingSection vchart={vchart} chart={chart} print={{ sex }} />
        </Page>
      ) : null}

      {include.tables ? (
        <Page title={t('kundli.page.remedies')} id="remedies">
          <Remedies g={g} dasha={vim} nowJd={nowJd} sadeSatiNow={sadeSatiNow} />
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
  ['always', 'kundli.page.panchang'],
  ['always', 'kundli.page.grahas'],
  ['always', 'kundli.page.motion'],
  ['tables', 'kundli.page.bhava'],
  ['charts', 'kundli.page.bhavaCharts'],
  ['charts', 'kundli.bhavaKundli'],
  ['vargas', 'kundli.page.vargas'],
  ['tables', 'vedic.tb.view.vargas'],
  ['tables', 'vedic.tb.view.friendship'],
  ['strength', 'vedic.section.shadbala'],
  ['tables', 'kundli.page.taraSahams'],
  ['tables', 'kundli.page.jaimini'],
  ['tables', 'kundli.page.jaiminiCharts'],
  ['tables', 'kundli.page.bhavaReading'],
  ['tables', 'kundli.page.phalaGrahas'],
  ['yogas', 'vedic.section.yogas'],
  ['strength', 'vedic.section.ashtakavarga'],
  ['strength', 'kundli.page.binduCharts'],
  ['strength', 'kundli.page.vargaAv'],
  ['dasha', 'kundli.toc.vimshottari'],
  ['dasha', 'kundli.page.sukshma'],
  ['dasha', 'kundli.page.dashaFromEach'],
  ['dasha', 'kundli.page.mdAnalysis'],
  ['dasha', 'kundli.page.phalaDasha'],
  ['otherDashas', 'kundli.toc.otherDashas'],
  ['otherDashas', 'kundli.page.ashtFromEach'],
  ['kp', 'vedic.section.kp'],
  ['western', 'vedic.section.western'],
  ['annual', 'vedic.section.varshaphal'],
  ['annual', 'kundli.page.varshaAll'],
  ['annual', 'kundli.page.progressionAll'],
  ['annual', 'kundli.varshaChartsTitle'],
  ['transits', 'vedic.section.transits'],
  ['transits', 'kundli.page.sbc'],
  ['matching', 'vedic.section.matching'],
  ['tables', 'kundli.page.remedies'],
];

