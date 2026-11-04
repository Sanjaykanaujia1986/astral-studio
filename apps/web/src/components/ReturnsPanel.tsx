/**
 * Returns, progressions and directions for the displayed chart.
 *
 * All four techniques produce a chart for a different moment, so they share one
 * panel and one renderer. The differences that matter to the reader — that a
 * solar return is a solved instant rather than a birthday, that solar arc
 * positions are directed rather than observed — are stated on screen, not left
 * for them to infer.
 */
import { useCallback, useMemo, useState, type JSX } from 'react';
import {
  findNextReturn,
  natalLongitudeOf,
  secondaryProgression,
  solarArcDirections,
  julianDay,
  julianDayToIsoUtc,
  TROPICAL_YEAR_DAYS,
  JULIAN_YEAR_DAYS,
  type InstantChart,
  type NatalChart,
  type SolarArcChart,
} from '@astro/engine';
import { useTranslator } from '@astro/i18n';
import { ChartWheel, PlanetTable, formatLongitude, formatAngle } from '@astro/ui';
import { getProvider } from '../lib/engine.js';
import { useSettings } from '../lib/settings.js';

type Technique = 'solar' | 'lunar' | 'saturn' | 'progressed' | 'solarArc';

const TECHNIQUES: readonly Technique[] = ['solar', 'lunar', 'saturn', 'progressed', 'solarArc'];

export interface ReturnsPanelProps {
  readonly chart: NatalChart;
}

interface Outcome {
  readonly technique: Technique;
  readonly exactUtcIso: string;
  readonly ageYears: number;
  readonly chart?: InstantChart;
  readonly directed?: SolarArcChart;
}

const FIELD =
  'rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500';

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function ReturnsPanel({ chart }: ReturnsPanelProps): JSX.Element {
  const { t, d, n } = useTranslator();
  const settings = useSettings();

  const [technique, setTechnique] = useState<Technique>('solar');
  const [dateText, setDateText] = useState(todayIsoDate);
  const [useJulianYear, setUseJulianYear] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const targetJd = useMemo(() => {
    const [year, month, day] = dateText.split('-').map(Number);
    if (!year || !month || !day) return null;
    return julianDay({ year, month, day }, 0);
  }, [dateText]);

  const run = useCallback(async () => {
    if (targetJd === null) return;
    setBusy(true);
    setError(null);
    try {
      const provider = await getProvider();
      const place = chart.place;
      const yearLengthDays = useJulianYear ? JULIAN_YEAR_DAYS : TROPICAL_YEAR_DAYS;

      if (technique === 'progressed') {
        const progressed = secondaryProgression(provider, {
          natalJd: chart.jdUT, targetJd, place, yearLengthDays,
        });
        setOutcome({
          technique,
          exactUtcIso: progressed.progressedUtcIso,
          ageYears: progressed.elapsedYears,
          chart: progressed.chart,
        });
      } else if (technique === 'solarArc') {
        const directed = solarArcDirections(provider, {
          natalJd: chart.jdUT, targetJd, place, yearLengthDays, natalChart: chart,
        });
        setOutcome({
          technique,
          exactUtcIso: julianDayToIsoUtc(targetJd),
          ageYears: directed.elapsedYears,
          directed,
        });
      } else {
        const body = technique === 'solar' ? 'sun' : technique === 'lunar' ? 'moon' : 'saturn';
        // Search from just before the requested date so the return falling on
        // that very day is still found.
        const result = findNextReturn(provider, {
          body,
          natalLongitude: natalLongitudeOf(chart, body),
          fromJd: targetJd - 1,
          place,
        });
        setOutcome({
          technique,
          exactUtcIso: result.exactUtcIso,
          ageYears: (result.exactJd - chart.jdUT) / TROPICAL_YEAR_DAYS,
          chart: result.chart,
        });
      }
    } catch (cause) {
      console.error('return/progression failed', cause);
      setError(t('error.unknown'));
      setOutcome(null);
    } finally {
      setBusy(false);
    }
  }, [technique, targetJd, chart, useJulianYear, t]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 px-3 pt-2">
        <label className="text-sm">
          <span className="block font-medium text-slate-700">{t('returns.technique')}</span>
          <select
            value={technique}
            onChange={(e) => { setTechnique(e.target.value as Technique); setOutcome(null); }}
            className={`mt-1 ${FIELD}`}
          >
            {TECHNIQUES.map((option) => (
              <option key={option} value={option}>{t(`returns.${option}`)}</option>
            ))}
          </select>
        </label>

        <label className="text-sm">
          <span className="block font-medium text-slate-700">{t('returns.forDate')}</span>
          <input
            type="date"
            value={dateText}
            onChange={(e) => setDateText(e.target.value)}
            className={`mt-1 ${FIELD}`}
          />
        </label>

        {technique === 'progressed' || technique === 'solarArc' ? (
          <label className="text-sm">
            <span className="block font-medium text-slate-700">{t('progression.yearLength')}</span>
            <select
              value={useJulianYear ? 'julian' : 'tropical'}
              onChange={(e) => setUseJulianYear(e.target.value === 'julian')}
              className={`mt-1 ${FIELD}`}
            >
              <option value="tropical">{t('progression.yearLength.tropical')}</option>
              <option value="julian">{t('progression.yearLength.julian')}</option>
            </select>
          </label>
        ) : null}

        <button
          type="button"
          onClick={() => void run()}
          disabled={busy || targetJd === null}
          className="ml-auto rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
        >
          {busy ? t('transit.calculating') : t('returns.calculate')}
        </button>
      </div>

      {technique === 'solar' ? (
        <p className="px-3 text-xs text-slate-500">{t('returns.notBirthday')}</p>
      ) : null}
      {technique === 'solarArc' ? (
        <p className="px-3 text-xs text-slate-500">{t('progression.directedNote')}</p>
      ) : null}

      {error ? <p role="alert" className="px-3 text-sm text-rose-700">{error}</p> : null}

      {outcome ? (
        <div className="space-y-4">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 px-3 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-500">
                {outcome.technique === 'progressed'
                  ? t('progression.progressedDate')
                  : t('returns.exactMoment')}
              </dt>
              <dd className="tabular-nums">
                {d(outcome.exactUtcIso, {
                  dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC',
                })}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-500">{t('returns.age')}</dt>
              <dd className="tabular-nums">
                {n(outcome.ageYears, { maximumFractionDigits: 2 })}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-500">{t('returns.place')}</dt>
              <dd className="truncate">{chart.place.label ?? t('returns.place.birth')}</dd>
            </div>
            {outcome.directed ? (
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-500">{t('returns.arc')}</dt>
                <dd className="tabular-nums">{formatAngle(outcome.directed.arc, 'minute')}</dd>
              </div>
            ) : null}
          </dl>

          {outcome.chart ? (
            <>
              <p className="px-3 text-xs text-slate-500">{t('returns.place.note')}</p>
              <div className="rounded-lg border border-slate-200 p-3">
                <ChartWheel
                  chart={outcome.chart}
                  size={760}
                  glyphStyle={settings.glyphStyle}
                  className="mx-auto max-w-[600px]"
                  title={t(`returns.${outcome.technique}`)}
                />
              </div>
              <PlanetTable chart={outcome.chart} precision={settings.precision} />
            </>
          ) : null}

          {outcome.directed ? (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-300">
                    <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                      {t('table.column.body')}
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                      {t('table.column.position')}
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                      {t('returns.arc')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {outcome.directed.positions.map((position) => (
                    <tr key={position.body} className="border-b border-slate-100 last:border-0">
                      <th scope="row" className="px-3 py-2 text-left font-normal">
                        {t(`body.${position.body}`)}
                      </th>
                      <td className="px-3 py-2 tabular-nums">
                        {formatLongitude(position.longitude, { precision: settings.precision })}
                      </td>
                      <td className="px-3 py-2 tabular-nums text-slate-500">
                        {formatLongitude(position.natalLongitude, { precision: 'degree' })} →
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
