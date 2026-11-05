/**
 * The dashboard.
 *
 * Three panes that are genuinely computed, and one that says plainly it does
 * not exist. A landing screen is where fabrication is most tempting and least
 * visible — a plausible "upcoming events" list is indistinguishable from a
 * real one — so each pane here either shows an engine result or states why it
 * is empty.
 *
 * Today's sky needs nothing but the ephemeris and runs offline. Upcoming
 * transits need a chart, and say so rather than picking one. Saved charts need
 * the database, and a failure there is reported as a failure, not as "none".
 * Alerts are not built and are labelled so.
 */
import { useCallback, useEffect, useMemo, useState, type JSX } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  calculateChartForInstant,
  currentPhase,
  findTransitHits,
  julianDay,
  julianDayToIsoUtc,
  targetsFromChart,
  type Body,
  type CurrentPhase,
  type InstantChart,
  type NatalChart,
  type TransitHit,
} from '@astro/engine';
import { useTranslator } from '@astro/i18n';
import { PlanetTable, TransitTable, formatLongitude } from '@astro/ui';
import { getProvider } from '../lib/engine.js';
import { CloudError, getChartSettings, listCharts, type SavedChartSummary } from '../lib/cloud.js';
import { useChartStore } from '../state/chart.js';
import { useSettings } from '../lib/settings.js';
import { AlertsPanel } from './AlertsPanel.js';

const TH = 'px-2 py-1.5 text-left text-xs font-medium uppercase tracking-wide';
const TD = 'px-2 py-1.5 whitespace-nowrap tabular-nums';
const mutedStyle = { color: 'var(--as-ink-muted)' };

/** Bodies whose transits are worth listing. The Moon alone would fill the page. */
const SLOW_BODIES: readonly Body[] = [
  'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto',
];
const LOOKAHEAD_DAYS = 90;

/**
 * Cycle eighths to the names people actually use for the Moon.
 *
 * `labelForPhase` names an eighth of ANY pair's cycle, and "Waning
 * semi-square" is the right term for Saturn and Neptune. For the Moon it is
 * the wrong register: everyone calls that a waning crescent. The mapping is
 * one-to-one, so this renames rather than recomputes.
 */
const LUNAR_PHASE: Readonly<Record<string, string>> = {
  conjunction: 'moonPhase.new',
  waxingSemisquare: 'moonPhase.waxingCrescent',
  waxingSquare: 'moonPhase.firstQuarter',
  waxingSesquiquadrate: 'moonPhase.waxingGibbous',
  opposition: 'moonPhase.full',
  waningSesquiquadrate: 'moonPhase.waningGibbous',
  waningSquare: 'moonPhase.lastQuarter',
  waningSemisquare: 'moonPhase.waningCrescent',
};
const MAX_HITS = 12;

/** Julian Day for this instant, from the device clock. */
function nowJd(): number {
  const now = new Date();
  return julianDay(
    { year: now.getUTCFullYear(), month: now.getUTCMonth() + 1, day: now.getUTCDate() },
    now.getUTCHours() + now.getUTCMinutes() / 60 + now.getUTCSeconds() / 3600,
  );
}

interface Sky {
  readonly chart: InstantChart;
  readonly moon: CurrentPhase;
  readonly retrograde: readonly string[];
}

export function DashboardPanel(): JSX.Element {
  const { t, n, d } = useTranslator();
  const settings = useSettings();
  const navigate = useNavigate();
  const natal = useChartStore((s) => s.chart);
  const cast = useChartStore((s) => s.cast);

  const [sky, setSky] = useState<Sky | null>(null);
  const [skyFailed, setSkyFailed] = useState(false);
  const [hits, setHits] = useState<readonly TransitHit[] | null>(null);
  const [saved, setSaved] = useState<readonly SavedChartSummary[] | null>(null);
  const [savedError, setSavedError] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);

  /*
   * One instant for the whole screen. Reading the clock separately in each
   * pane would let the sky and the transit window disagree by the time the
   * ephemeris finished loading, which is the sort of inconsistency nobody
   * notices and everybody half-trusts.
   */
  const jd = useMemo(nowJd, []);

  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const provider = await getProvider();
        /*
         * No houses. "Today's sky" is geocentric and placeless: houses would
         * need an observer, and quietly using 0°N 0°E would produce an
         * ascendant that looks real and belongs to nobody.
         */
        const chart = calculateChartForInstant(
          provider, jd, { latitude: 0, longitude: 0 }, { withHouses: false },
        );
        const moon = currentPhase(provider, jd, 'moon', 'sun');
        const retrograde = chart.bodies
          .filter((placed) => placed.position.retrograde)
          .map((placed) => placed.position.body);
        if (live) setSky({ chart, moon, retrograde });
      } catch (cause) {
        console.error('dashboard sky failed', cause);
        if (live) setSkyFailed(true);
      }
    })();
    return () => { live = false; };
  }, [jd]);

  useEffect(() => {
    if (!natal) { setHits(null); return undefined; }
    let live = true;
    void (async () => {
      try {
        const provider = await getProvider();
        const found = findTransitHits(provider, {
          fromJd: jd,
          toJd: jd + LOOKAHEAD_DAYS,
          transitBodies: SLOW_BODIES,
          /*
           * The ASC and MC only. An aspect to the descendant is the same
           * aspect to the ascendant seen from the other end, so including
           * both angles made every hit appear twice and spent half of a
           * twelve-row dashboard restating itself.
           */
          targets: targetsFromChart(natal).filter(
            (target) => target.kind !== 'angle' || target.id === 'asc' || target.id === 'mc',
          ),
          aspects: ['conjunction', 'opposition', 'square', 'trine', 'sextile'],
        });
        if (live) setHits(found.slice(0, MAX_HITS));
      } catch (cause) {
        console.error('dashboard transits failed', cause);
        if (live) setHits([]);
      }
    })();
    return () => { live = false; };
  }, [natal, jd]);

  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const charts = await listCharts();
        if (live) setSaved(charts.slice(0, 5));
      } catch (cause) {
        // A database failure is reported as one. Showing "no saved charts"
        // here would tell the reader their charts are gone.
        if (live) {
          setSaved([]);
          setSavedError(cause instanceof CloudError ? cause.code : 'unknown');
        }
      }
    })();
    return () => { live = false; };
  }, []);

  const open = useCallback(async (entry: SavedChartSummary) => {
    setOpening(true);
    try {
      await cast(entry.birth, await getChartSettings(entry.id), settings.orbProfile);
      navigate('/chart');
    } catch (cause) {
      setSavedError(cause instanceof CloudError ? cause.code : 'unknown');
    } finally {
      setOpening(false);
    }
  }, [cast, navigate, settings.orbProfile]);

  const signLabel = (index: number) =>
    t(`sign.${(['aries', 'taurus', 'gemini', 'cancer', 'leo', 'virgo', 'libra', 'scorpio',
      'sagittarius', 'capricorn', 'aquarius', 'pisces'] as const)[index]!}`);

  return (
    <div className="flex flex-col gap-5">
      {/* ----------------------------------------------- today's sky */}
      <section className="as-card">
        <h2 className="as-h2">{t('dashboard.today.heading')}</h2>

        {skyFailed ? (
          <p className="as-body" role="alert">{t('dashboard.today.failed')}</p>
        ) : !sky ? (
          <p className="as-body" style={mutedStyle}>{t('dashboard.today.loading')}</p>
        ) : (
          <>
            <p className="as-fineprint mb-3">
              {t('dashboard.today.asOf', {
                instant: d(julianDayToIsoUtc(jd), { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }),
              })}
            </p>

            <dl className="mb-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-xs uppercase tracking-wide" style={mutedStyle}>
                  {t('dashboard.today.moonPhase')}
                </dt>
                <dd>
                  {t((LUNAR_PHASE[sky.moon.nearestLabel] ?? 'moonPhase.new') as 'moonPhase.new')}
                  {' · '}
                  {n(sky.moon.phaseAngle, { maximumFractionDigits: 1 })}°
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide" style={mutedStyle}>
                  {t('dashboard.today.moonSign')}
                </dt>
                <dd>
                  {signLabel(Math.floor(
                    (sky.chart.bodies.find((b) => b.position.body === 'moon')?.position.longitude ?? 0) / 30,
                  ))}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide" style={mutedStyle}>
                  {t('dashboard.today.retrograde')}
                </dt>
                <dd>
                  {sky.retrograde.length === 0
                    ? t('dashboard.today.noneRetrograde')
                    : sky.retrograde.map((body) => t(`body.${body}` as 'body.sun')).join(', ')}
                </dd>
              </div>
            </dl>

            <PlanetTable chart={sky.chart} precision={settings.precision} />

            <p className="as-fineprint mt-3">{t('dashboard.today.offline')}</p>
          </>
        )}
      </section>

      {/* ------------------------------------------ upcoming transits */}
      <section className="as-card">
        <h2 className="as-h2">
          {t('dashboard.upcoming.heading', { days: n(LOOKAHEAD_DAYS) })}
        </h2>

        {!natal ? (
          <>
            <p className="as-body">{t('dashboard.upcoming.needsChart')}</p>
            <Link to="/chart" className="as-button-secondary">{t('nav.chartStudio')}</Link>
          </>
        ) : hits === null ? (
          <p className="as-body" style={mutedStyle}>{t('dashboard.upcoming.searching')}</p>
        ) : hits.length === 0 ? (
          <p className="as-body">
            {t('dashboard.upcoming.none', { days: n(LOOKAHEAD_DAYS) })}
          </p>
        ) : (
          <TransitTable hits={hits} />
        )}

        <p className="as-fineprint mt-3">{t('dashboard.upcoming.scope')}</p>
      </section>

      {/* --------------------------------------------- saved charts */}
      <section className="as-card">
        <h2 className="as-h2">{t('dashboard.saved.heading')}</h2>

        {savedError ? (
          <p className="as-body" role="alert">
            {t('dashboard.saved.failed')}
            {' '}
            <span style={mutedStyle}>{savedError}</span>
          </p>
        ) : saved === null ? (
          <p className="as-body" style={mutedStyle}>{t('cloud.loading')}</p>
        ) : saved.length === 0 ? (
          <>
            <p className="as-body">{t('dashboard.saved.none')}</p>
            <Link to="/chart" className="as-button-secondary">{t('nav.chartStudio')}</Link>
          </>
        ) : (
          <ul className="as-list">
            {saved.map((entry) => (
              <li key={entry.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <button
                  type="button"
                  className="as-button-secondary"
                  disabled={opening}
                  onClick={() => void open(entry)}
                >
                  {entry.name}
                </button>
                <span className="text-sm" style={mutedStyle}>
                  {[entry.summary.sun, entry.summary.moon, entry.summary.ascendant]
                    .filter(Boolean).join(' · ')}
                </span>
                <span className="as-fineprint">
                  {d(entry.created_at, { dateStyle: 'medium' })}
                </span>
              </li>
            ))}
          </ul>
        )}

        <p className="as-fineprint mt-3">{t('dashboard.saved.scope')}</p>
      </section>

      {/* ------------------------------------------------------ alerts */}
      <section className="as-card">
        <h2 className="as-h2">{t('dashboard.alerts.heading')}</h2>
        <AlertsPanel chart={natal} fromJd={jd} />
        <p className="as-fineprint mt-3">{t('alerts.kept')}</p>
      </section>
    </div>
  );
}

/** Re-exported for the route, which needs the natal type for nothing else. */
export type { NatalChart };
