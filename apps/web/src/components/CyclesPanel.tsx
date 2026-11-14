/**
 * Synodic cycle explorer.
 *
 * Deliberately generic: pick any two bodies. The lunation, the Jupiter-Saturn
 * great conjunction and the Mars-Jupiter cycle all run through the same code,
 * which is the point of the engine and worth exposing rather than hiding behind
 * a menu of named cycles.
 */
import { useCallback, useMemo, useState, type JSX } from 'react';
import {
  currentPhase,
  expectedSynodicPeriod,
  orderBySpeed,
  julianDay,
  type Body,
  type CycleAnalysis,
  type CurrentPhase,
} from '@astro/engine';
import { useTranslator } from '@astro/i18n';
import { BODY_GLYPHS, GLYPH_FONT_STACK } from '@astro/ui';
import { getProvider } from '../lib/engine.js';
import { searchCycle } from '../lib/search.js';

const CYCLE_BODIES: readonly Body[] = [
  'moon', 'sun', 'mercury', 'venus', 'mars', 'jupiter', 'saturn',
  'uranus', 'neptune', 'pluto',
];

const DIVISION_CHOICES = [1, 4, 8] as const;

const FIELD =
  'rounded-md border as-border-strong px-3 py-1.5 text-sm focus:as-border-strong focus:outline-none focus:ring-1 focus:ring-slate-500';
const TH = 'px-3 py-2 text-left text-xs font-medium uppercase tracking-wide as-text-muted';
const TD = 'px-3 py-2 whitespace-nowrap';

function todayJd(): number {
  const now = new Date();
  return julianDay(
    { year: now.getUTCFullYear(), month: now.getUTCMonth() + 1, day: now.getUTCDate() },
    0,
  );
}

export function CyclesPanel(): JSX.Element {
  const { t, d, n } = useTranslator();

  const [fast, setFast] = useState<Body>('jupiter');
  const [slow, setSlow] = useState<Body>('saturn');
  const [divisions, setDivisions] = useState<number>(1);
  const [years, setYears] = useState(90);
  const [result, setResult] = useState<CycleAnalysis | null>(null);
  const [phase, setPhase] = useState<CurrentPhase | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const samePair = fast === slow;
  const estimate = useMemo(
    () => (samePair ? null : expectedSynodicPeriod(fast, slow)),
    [fast, slow, samePair],
  );

  const run = useCallback(async () => {
    if (samePair) return;
    setBusy(true);
    setError(null);
    // Yield so the busy state paints before the synchronous search stalls.
    await new Promise((resolve) => setTimeout(resolve, 0));
    try {
      const provider = await getProvider();
      // Order defensively: a phase computed with the slower body first would
      // run backwards, and the labels would read waxing for waning.
      const [a, b] = orderBySpeed(fast, slow);
      const from = todayJd() - (years * 365.2422) / 2;
      setResult(
        await searchCycle({
          bodyA: a, bodyB: b,
          fromJd: from, toJd: from + years * 365.2422,
          divisions,
        }),
      );
      setPhase(currentPhase(provider, todayJd(), a, b));
    } catch (cause) {
      console.error('cycle analysis failed', cause);
      setError(t('error.unknown'));
      setResult(null);
    } finally {
      setBusy(false);
    }
  }, [fast, slow, divisions, years, samePair, t]);

  const glyph = (body: Body) => BODY_GLYPHS[body].symbol;

  return (
    <div className="space-y-4">
      <p className="px-3 pt-2 text-xs as-text-muted">{t('cycles.note')}</p>

      <div className="flex flex-wrap items-end gap-3 px-3">
        <label className="text-sm">
          <span className="block font-medium as-text">{t('cycles.faster')}</span>
          <select value={fast} onChange={(e) => setFast(e.target.value as Body)} className={`mt-1 ${FIELD}`}>
            {CYCLE_BODIES.map((body) => (
              <option key={body} value={body}>{t(`body.${body}`)}</option>
            ))}
          </select>
        </label>

        <label className="text-sm">
          <span className="block font-medium as-text">{t('cycles.slower')}</span>
          <select value={slow} onChange={(e) => setSlow(e.target.value as Body)} className={`mt-1 ${FIELD}`}>
            {CYCLE_BODIES.map((body) => (
              <option key={body} value={body}>{t(`body.${body}`)}</option>
            ))}
          </select>
        </label>

        <label className="text-sm">
          <span className="block font-medium as-text">{t('cycles.divisions')}</span>
          <select
            value={divisions}
            onChange={(e) => setDivisions(Number(e.target.value))}
            className={`mt-1 ${FIELD}`}
          >
            {DIVISION_CHOICES.map((choice) => (
              <option key={choice} value={choice}>
                {t(`cycles.divisions.${choice}` as 'cycles.divisions.1')}
              </option>
            ))}
          </select>
        </label>

        <label className="text-sm">
          <span className="block font-medium as-text">{t('cycles.years')}</span>
          <input
            type="number"
            min={1}
            max={400}
            value={years}
            onChange={(e) => setYears(Math.max(1, Math.min(400, Number(e.target.value) || 1)))}
            className={`mt-1 w-24 ${FIELD}`}
          />
        </label>

        <button
          type="button"
          onClick={() => void run()}
          disabled={busy || samePair}
          className="ml-auto rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
        >
          {busy ? t('transit.calculating') : t('cycles.calculate')}
        </button>
      </div>

      {estimate !== null ? (
        <p className="px-3 text-xs as-text-muted">
          <span aria-hidden="true" style={{ fontFamily: GLYPH_FONT_STACK }}>
            {glyph(fast)} {glyph(slow)}
          </span>{' '}
          {t('cycles.period.expected')}: {t('unit.days', { n: n(estimate, { maximumFractionDigits: 1 }) })}
          {' · '}
          {t('unit.years', { n: n(estimate / 365.2422, { maximumFractionDigits: 2 }) })}
        </p>
      ) : null}

      {error ? <p role="alert" className="px-3 text-sm as-text-danger">{error}</p> : null}

      {result ? (
        <div className="space-y-4">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 px-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-xs uppercase tracking-wide as-text-muted">
                {t('cycles.period.observed')}
              </dt>
              <dd className="tabular-nums">
                {result.observedPeriodDays === undefined
                  ? '—'
                  : `${t('unit.days', { n: n(result.observedPeriodDays, { maximumFractionDigits: 1 }) })} · ${t('unit.years', {
                      n: n(result.observedPeriodDays / 365.2422, { maximumFractionDigits: 2 }),
                    })}`}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide as-text-muted">
                {t('cycles.conjunctions')}
              </dt>
              <dd className="tabular-nums">{n(result.conjunctions.length)}</dd>
            </div>
            {phase ? (
              <div>
                <dt className="text-xs uppercase tracking-wide as-text-muted">
                  {t('cycles.currentPhase')}
                </dt>
                <dd className="tabular-nums">
                  {n(phase.phaseAngle, { maximumFractionDigits: 1 })}° ·{' '}
                  {phase.waxing ? t('cycles.waxing') : t('cycles.waning')}
                </dd>
              </div>
            ) : null}
          </dl>

          {result.conjunctions.some((c) => c.multiple) ? (
            <p className="mx-3 rounded border border-sky-200 bg-sky-50 p-2 text-xs text-sky-900">
              {t('cycles.multipleNote')}
            </p>
          ) : null}

          {result.events.length === 0 ? (
            <p className="px-3 py-6 text-sm as-text-muted">{t('cycles.empty')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <caption className="sr-only">{t('cycles.title')}</caption>
                <thead>
                  <tr className="border-b as-border-strong">
                    <th className={TH}>{t('transit.column.date')}</th>
                    <th className={TH}>{t('cycles.divisions')}</th>
                    <th className={TH}>{t('transit.column.pass')}</th>
                  </tr>
                </thead>
                <tbody>
                  {result.events.slice(0, 200).map((event) => (
                    <tr
                      key={`${event.phase}-${event.jd}`}
                      className="border-b as-border-hair last:border-0"
                    >
                      <td className={`${TD} tabular-nums`}>
                        {d(event.utcIso, { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' })}
                      </td>
                      <td className={TD}>
                        <span className="tabular-nums as-text-muted">
                          {n(event.phase)}°
                        </span>{' '}
                        {t(`phase.${event.label as 'conjunction'}`)}
                      </td>
                      <td className={`${TD} as-text-muted`}>
                        {event.totalPasses > 1
                          ? t('transit.pass.of', {
                              index: n(event.passIndex), total: n(event.totalPasses),
                            })
                          : t('transit.pass.single')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
