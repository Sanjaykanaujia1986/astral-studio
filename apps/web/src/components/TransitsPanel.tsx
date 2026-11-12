/**
 * Transit search for the displayed chart.
 *
 * Run on demand rather than automatically. A year of transits for every body is
 * roughly a second of synchronous ephemeris work, which would freeze the page
 * on every chart cast — and most of the time the reader has not asked for it.
 *
 * The default body set is Mars outward. Transits from the Moon and the inner
 * planets are numerous and short-lived; leading with them buries the slow
 * transits that people actually plan around.
 */
import { useCallback, useMemo, useState, type JSX } from 'react';
import {
  targetsFromChart,
  julianDay,
  MAJOR_ASPECTS,
  type Body,
  type NatalChart,
  type TransitHit,
} from '@astro/engine';
import { useTranslator } from '@astro/i18n';
import { TransitTable } from '@astro/ui';
import { searchTransits } from '../lib/search.js';

export interface TransitsPanelProps {
  readonly chart: NatalChart;
}

const SLOW_BODIES: readonly Body[] = [
  'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto',
];
const ALL_TRANSIT_BODIES: readonly Body[] = [
  'sun', 'mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto',
];

const RANGES = [
  { months: 3, key: 'months' as const, count: 3 },
  { months: 6, key: 'months' as const, count: 6 },
  { months: 12, key: 'years' as const, count: 1 },
  { months: 24, key: 'years' as const, count: 2 },
];

const FIELD =
  'rounded-md border as-border-strong px-3 py-1.5 text-sm focus:as-border-strong focus:outline-none focus:ring-1 focus:ring-slate-500';

export function TransitsPanel({ chart }: TransitsPanelProps): JSX.Element {
  const { t } = useTranslator();
  const [months, setMonths] = useState(12);
  const [includeFast, setIncludeFast] = useState(false);
  const [hits, setHits] = useState<readonly TransitHit[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const targets = useMemo(() => targetsFromChart(chart), [chart]);

  const run = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const now = new Date();
      const fromJd = julianDay(
        { year: now.getUTCFullYear(), month: now.getUTCMonth() + 1, day: now.getUTCDate() },
        0,
      );
      // Off the main thread: a year of transits against a natal chart takes
      // roughly four seconds, which the UI cannot spend frozen.
      setHits(
        await searchTransits({
          fromJd,
          // Approximating a month as 30.44 days is fine for a search window;
          // the exact times inside it are solved, not stepped.
          toJd: fromJd + months * 30.4375,
          transitBodies: includeFast ? ALL_TRANSIT_BODIES : SLOW_BODIES,
          targets,
          aspects: MAJOR_ASPECTS,
        }),
      );
    } catch (cause) {
      console.error('transit search failed', cause);
      setError(t('error.unknown'));
      setHits(null);
    } finally {
      setBusy(false);
    }
  }, [months, includeFast, targets, t]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3 px-3 pt-2">
        <label className="text-sm">
          <span className="block font-medium as-text">{t('transit.range')}</span>
          <select
            value={months}
            onChange={(e) => setMonths(Number(e.target.value))}
            className={`mt-1 ${FIELD}`}
          >
            {RANGES.map((range) => (
              <option key={range.months} value={range.months}>
                {range.key === 'months'
                  ? t('transit.range.months', { count: range.count })
                  : t('transit.range.years', { count: range.count })}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-2 pb-2 text-sm as-text">
          <input
            type="checkbox"
            checked={includeFast}
            onChange={(e) => setIncludeFast(e.target.checked)}
          />
          {t('transit.bodies')}: ☉ ☿ ♀
        </label>

        <button
          type="button"
          onClick={() => void run()}
          disabled={busy}
          className="ml-auto rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
        >
          {busy ? t('transit.calculating') : t('transit.calculate')}
        </button>
      </div>

      {error ? (
        <p role="alert" className="px-3 text-sm as-text-danger">{error}</p>
      ) : null}

      {hits ? <TransitTable hits={hits} /> : null}
    </div>
  );
}
