/**
 * "Your day": a plain-language reading of each of the next seven days for the
 * open chart.
 *
 * Every sentence is one engine result put into words, and the card shows how
 * the verdict was scored, so nothing here is a horoscope written for everyone.
 * The rules are in `dayReading` (packages/vedic/src/daily.ts): the Moon's tārā
 * from the birth star, its place from the birth Moon (candra bala) and the
 * planets' aṣṭakavarga points.
 *
 * The reading needs a sidereal chart. A tropical chart is recast in Lahiri
 * from the same birth details rather than refused, because the reader asked
 * about their day, not about zodiac settings. It needs a birth time too: the
 * Moon crosses a whole nakṣatra in about a day, so a date-only chart cannot
 * name the birth star.
 *
 * Days are this device's: midnight to midnight on its clock, which is where
 * the reader is now, not where they were born.
 */
import { useEffect, useMemo, useState, type JSX } from 'react';
import { Link } from 'react-router-dom';
import { calculateChartForInstant, calculateNatalChart, norm360, type InstantChart, type NatalChart } from '@astro/engine';
import { useTranslator, type MessageKey } from '@astro/i18n';
import { ChartWheel, VedicChartFigure } from '@astro/ui';
import { dayReading, grahaLongitudes, vedicChart, SEVEN, type DayReading, type DayTone, type VedicChart } from '@astro/vedic';
import { getProvider } from '../lib/engine.js';
import { useChartTheme } from '../lib/chart-theme.js';
import { useSettings } from '../lib/settings.js';
import { useJy } from './vedic/shared.js';

const DAYS = 7;
const MS_DAY = 86_400_000;
/** UT Julian Day of a JavaScript timestamp. */
const jdOf = (ms: number): number => ms / MS_DAY + 2440587.5;
const msOf = (jd: number): number => (jd - 2440587.5) * MS_DAY;

const TONE_COLOUR: Readonly<Record<DayTone, string>> = {
  supportive: 'var(--as-success-ink)',
  steady: 'var(--as-ink-muted)',
  gentle: 'var(--as-warning-ink)',
};

/**
 * The sky of one day, at the same midday instant the reading is taken at:
 * the Western ring in the chart's own zodiac, and the grahas' sidereal signs
 * for the two Indian squares.
 */
interface Sky {
  readonly wheel: InstantChart;
  readonly grahas: readonly { readonly body: string; readonly signIndex: number; readonly retrograde: boolean }[];
}
interface Day { readonly start: Date; readonly reading: DayReading; readonly sky: Sky }

type View = 'wheel' | 'north' | 'south';
const VIEWS: readonly View[] = ['wheel', 'north', 'south'];
const VIEW_KEY = 'astro.day.view';
function storedView(): View {
  try {
    const v = globalThis.localStorage?.getItem(VIEW_KEY);
    return VIEWS.includes(v as View) ? (v as View) : 'north';
  } catch { return 'north'; }
}

export function DayPanel({ natal }: { readonly natal: NatalChart }): JSX.Element {
  const { t, d } = useTranslator();
  const { gn, nak } = useJy();
  const [days, setDays] = useState<readonly Day[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [pick, setPick] = useState(0);
  const [view, setView] = useState<View>(storedView);
  const [vchart, setVchart] = useState<VedicChart | null>(null);
  const chartTheme = useChartTheme();
  const settings = useSettings();
  const choose = (v: View): void => {
    setView(v);
    try { globalThis.localStorage?.setItem(VIEW_KEY, v); } catch { /* private window: the choice lasts this visit */ }
  };

  /* Local midnights of today and the six days after, read once per mount. */
  const starts = useMemo(() => {
    const now = new Date();
    return Array.from({ length: DAYS + 1 }, (_, k) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + k));
  }, []);

  useEffect(() => {
    if (!natal.timeKnown) return undefined;
    let live = true;
    setDays(null); setFailed(false);
    void (async () => {
      try {
        const provider = await getProvider();
        const sidereal = natal.settings.zodiac.kind === 'sidereal'
          ? natal
          : calculateNatalChart(provider, natal.input, {
            settings: { ...natal.settings, zodiac: { kind: 'sidereal', ayanamsha: 'lahiri' } },
          });
        const vc = vedicChart(sidereal);
        const g = grahaLongitudes(vc);
        const ctx = {
          birthJd: sidereal.jdUT, utcOffsetMinutes: sidereal.offsetMinutes, zodiac: sidereal.settings.zodiac,
          node: sidereal.settings.nodeType === 'true' ? 'trueNode' as const : 'meanNode' as const,
        };
        const skyAt = (jd: number): Sky => {
          const grahas = SEVEN.map((b) => {
            const p = provider.calc(jd, b, { zodiac: ctx.zodiac });
            return { body: b as string, signIndex: Math.floor(norm360(p.longitude) / 30), retrograde: b !== 'sun' && b !== 'moon' && p.retrograde };
          });
          const rahu = norm360(provider.calc(jd, ctx.node, { zodiac: ctx.zodiac }).longitude);
          grahas.push({ body: 'rahu', signIndex: Math.floor(rahu / 30), retrograde: false });
          grahas.push({ body: 'ketu', signIndex: Math.floor(norm360(rahu + 180) / 30), retrograde: false });
          // Planets only in the outer ring: transiting houses would be the houses of wherever the chart was cast, not of today.
          const wheel = calculateChartForInstant(provider, jd, natal.place, { settings: natal.settings, withHouses: false });
          return { wheel, grahas };
        };
        const out = starts.slice(0, DAYS).map((start, k) => {
          const reading = dayReading(provider, g, ctx, jdOf(start.getTime()), jdOf(starts[k + 1]!.getTime()));
          return { start, reading, sky: skyAt(reading.jd) };
        });
        if (live) { setDays(out); setVchart(vc); }
      } catch (cause) {
        console.error('day reading failed', cause);
        if (live) setFailed(true);
      }
    })();
    return () => { live = false; };
  }, [natal, starts]);

  const name = natal.input.name?.trim();
  const tara = (x: DayReading['tara']): string => t(`vedic.tr.tara.${x}` as MessageKey);
  const time = (jd: number): string => d(new Date(msOf(jd)).toISOString(), { timeStyle: 'short' });
  const signed = (p: number): string => (p > 0 ? `+${p}` : p < 0 ? `−${-p}` : '0');

  const body = (() => {
    if (!natal.timeKnown) return <p className="as-body">{t('dashboard.day.needsTime')}</p>;
    if (failed) return <p className="as-body" role="alert">{t('dashboard.day.failed')}</p>;
    if (!days) return <p className="as-body" style={{ color: 'var(--as-ink-muted)' }}>{t('dashboard.day.loading')}</p>;
    const day = days[Math.min(pick, days.length - 1)]!;
    const r = day.reading;
    const moonKey = r.fromMoon === 8 ? 'moon.eighth' : r.points.candra > 0 ? 'moon.good' : 'moon.neutral';
    return (
      <>
        <div className="-mx-1 mb-4 flex gap-2 overflow-x-auto px-1 pb-1" role="group" aria-label={t('dashboard.day.week')}>
          {days.map((x, k) => (
            <button
              key={x.start.getTime()}
              type="button"
              aria-pressed={k === pick}
              onClick={() => setPick(k)}
              className="flex min-h-[44px] min-w-[76px] shrink-0 cursor-pointer flex-col items-start rounded-lg border px-2.5 py-1.5 text-left text-xs transition-colors"
              style={{
                borderColor: k === pick ? 'var(--as-accent)' : 'var(--as-border)',
                background: k === pick ? 'var(--as-raised)' : 'transparent',
              }}
              data-day-tone={x.reading.tone}
            >
              <span className="font-semibold as-text">
                {k === 0 ? t('dashboard.day.today') : k === 1 ? t('dashboard.day.tomorrow') : d(x.start.toISOString(), { weekday: 'short' })}
              </span>
              <span style={{ color: 'var(--as-ink-muted)' }}>{d(x.start.toISOString(), { day: 'numeric', month: 'short' })}</span>
              <span className="mt-0.5 inline-flex items-center gap-1" style={{ color: TONE_COLOUR[x.reading.tone] }}>
                <span aria-hidden="true" className="inline-block h-2 w-2 rounded-full" style={{ background: 'currentColor' }} />
                {t(`dashboard.day.tone.${x.reading.tone}` as MessageKey)}
              </span>
            </button>
          ))}
        </div>

        <div data-day-reading>
          <p className="mb-1 text-lg font-semibold" style={{ color: TONE_COLOUR[r.tone] }}>
            {t(`dashboard.day.tone.${r.tone}` as MessageKey)}
            <span className="ml-2 text-sm font-normal" style={{ color: 'var(--as-ink-muted)' }}>
              {d(day.start.toISOString(), { weekday: 'long', day: 'numeric', month: 'long' })}
            </span>
          </p>
          <p className="as-body mb-3">{t(`dashboard.day.advice.${r.tone}` as MessageKey)}</p>

          <ul className="as-body flex list-disc flex-col gap-1.5 pl-5">
            <li>{t('dashboard.day.star', { nak: nak(r.nakshatra), tara: tara(r.tara), meaning: t(`dashboard.day.tara.${r.tara}` as MessageKey) })}</li>
            {/* A change before midday: the star above is the new one, so name the one it replaced. */}
            {r.changes.map((c) => (
              <li key={c.jd}>
                {c.jd <= r.jd
                  ? t('dashboard.day.until', { time: time(c.jd), nak: nak(c.before.nakshatra), tara: tara(c.before.tara) })
                  : t('dashboard.day.change', { time: time(c.jd), nak: nak(c.nakshatra), tara: tara(c.tara) })}
              </li>
            ))}
            <li>{t(`dashboard.day.${moonKey}` as MessageKey, { h: r.fromMoon })}</li>
            {r.fromLagna ? (
              <li>{t('dashboard.day.focus', { matters: t(`dashboard.day.focus.${r.fromLagna}` as MessageKey) })}</li>
            ) : null}
            {r.bindus !== undefined ? <li>{t('dashboard.day.strength', { bindus: r.bindus })}</li> : null}
            <li>{t('dashboard.day.period', { md: gn(r.dasha[0]!), ad: gn(r.dasha[1]!), pd: gn(r.dasha[2]!) })}</li>
          </ul>

          <p className="as-fineprint mt-3">
            {t('dashboard.day.score', { tara: signed(r.points.tara), candra: signed(r.points.candra), bindus: signed(r.points.bindus) })}
          </p>
        </div>

        <div className="mt-5 border-t pt-4" style={{ borderColor: 'var(--as-border)' }} data-day-chart={view}>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold as-text">{t('dashboard.day.chart.heading')}</h3>
            <div className="inline-flex rounded-lg border p-0.5" style={{ borderColor: 'var(--as-border)' }} role="group" aria-label={t('dashboard.day.chart.pick')}>
              {VIEWS.map((v) => (
                <button key={v} type="button" aria-pressed={view === v} onClick={() => choose(v)}
                  className="min-h-[44px] cursor-pointer rounded-md px-3 text-xs font-medium transition-colors"
                  style={{ background: view === v ? 'var(--as-raised)' : 'transparent', color: view === v ? 'var(--as-ink)' : 'var(--as-ink-muted)', boxShadow: view === v ? 'inset 0 0 0 1px var(--as-accent)' : 'none' }}>
                  {t(`dashboard.day.chart.${v}` as MessageKey)}
                </button>
              ))}
            </div>
          </div>
          {/* The figures set an inline max-width of 100%, which beats a class on the SVG, so the cap sits on a wrapper. */}
          <div className="mx-auto w-full max-w-[440px]">
          {view === 'wheel' ? (
            <ChartWheel chart={natal} outerChart={day.sky.wheel} outerLabel={d(day.start.toISOString(), { day: 'numeric', month: 'short' })}
              size={520} theme={chartTheme} glyphStyle={settings.glyphStyle} showAspects={false}
              title={t('dashboard.day.chart.wheelTitle', { date: d(day.start.toISOString(), { day: 'numeric', month: 'long' }) })}
              className="w-full" />
          ) : vchart?.lagna ? (
            <VedicChartFigure chart={vchart} style={view} size={420} theme={chartTheme} tinted className="w-full"
              label={t('dashboard.day.chart.vedicTitle', { date: d(day.start.toISOString(), { day: 'numeric', month: 'long' }) })}
              placements={{ lagnaSignIndex: vchart.lagna.signIndex, bodies: day.sky.grahas }} />
          ) : null}
          </div>
          <p className="as-fineprint mt-2">
            {t(view === 'wheel' ? 'dashboard.day.chart.wheelNote' : 'dashboard.day.chart.vedicNote', { date: d(day.start.toISOString(), { day: 'numeric', month: 'long' }) })}
          </p>
        </div>
      </>
    );
  })();

  return (
    <section className="as-card" data-day-panel>
      <h2 className="as-h2">{t('dashboard.day.heading')}</h2>
      {name ? <p className="as-fineprint mb-3">{t('dashboard.day.for', { name })}</p> : null}
      {body}
      <p className="as-fineprint mt-3">{t('dashboard.day.note')}</p>
    </section>
  );
}

/** Shown in the same place when there is no chart yet. */
export function DayPanelEmpty(): JSX.Element {
  const { t } = useTranslator();
  return (
    <section className="as-card" data-day-panel>
      <h2 className="as-h2">{t('dashboard.day.heading')}</h2>
      <p className="as-body">{t('dashboard.day.needsChart')}</p>
      <Link to="/chart" className="as-button-secondary">{t('nav.chartStudio')}</Link>
    </section>
  );
}
