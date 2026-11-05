/**
 * Alerts on specific events.
 *
 * Each alert is re-evaluated against the ephemeris when this renders, so a
 * row is a calculation rather than a stored result. The matching is done on
 * the transit search's own hits, which means a retrograde loop produces the
 * three passes it really has instead of one.
 *
 * The panel says, above the list and not in a footnote, that nothing runs
 * while the app is closed. An "alert" that silently only fires when you
 * happen to look is the kind of half-truth the brief exists to prevent.
 */
import { useEffect, useMemo, useState, type JSX } from 'react';
import {
  findTransitHits,
  targetsFromChart,
  ALL_ASPECTS,
  type AspectName,
  type Body,
  type NatalChart,
  type TransitHit,
  type TransitTarget,
} from '@astro/engine';
import { useTranslator } from '@astro/i18n';
import { getProvider } from '../lib/engine.js';
import { useAlerts, targetId, type Alert, type AlertTarget } from '../state/alerts.js';

export interface AlertsPanelProps {
  /** Alerts are relative to a chart; without one there is nothing to watch. */
  readonly chart: NatalChart | null;
  /** How far ahead to look, in days. */
  readonly lookaheadDays?: number;
  readonly fromJd: number;
}

const TRANSIT_BODIES: readonly Body[] = [
  'jupiter', 'saturn', 'uranus', 'neptune', 'pluto', 'mars',
];
const ASPECTS: readonly AspectName[] = [
  'conjunction', 'opposition', 'square', 'trine', 'sextile',
];
const TARGET_BODIES: readonly Body[] = [
  'sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn',
];

const FIELD = 'w-full max-w-full rounded-md border px-2 py-1.5 text-sm';
const fieldStyle = {
  borderColor: 'var(--as-border-strong)',
  background: 'var(--as-surface)',
  color: 'var(--as-ink)',
};
const mutedStyle = { color: 'var(--as-ink-muted)' };

interface Match {
  readonly alert: Alert;
  readonly hit: TransitHit;
}

export function AlertsPanel({
  chart,
  lookaheadDays = 365,
  fromJd,
}: AlertsPanelProps): JSX.Element {
  const { t, n, d } = useTranslator();
  const { alerts, add, remove, toggle } = useAlerts();

  const [transitBody, setTransitBody] = useState<Body>('saturn');
  const [aspect, setAspect] = useState<AspectName>('conjunction');
  const [targetBody, setTargetBody] = useState<string>('sun');
  const [orb, setOrb] = useState(1);

  const [matches, setMatches] = useState<readonly Match[] | null>(null);
  const [failed, setFailed] = useState(false);

  const enabled = useMemo(() => alerts.filter((alert) => alert.enabled), [alerts]);

  useEffect(() => {
    if (!chart || enabled.length === 0) { setMatches([]); return undefined; }
    let live = true;
    void (async () => {
      try {
        const provider = await getProvider();
        const targets: TransitTarget[] = targetsFromChart(chart);
        const found: Match[] = [];

        for (const alert of enabled) {
          const wanted = targetId(alert.target);
          const target = targets.find((candidate) => candidate.id === wanted);
          if (!target) continue;   // a target this chart does not carry

          const hits = findTransitHits(provider, {
            fromJd,
            toJd: fromJd + lookaheadDays,
            transitBodies: [alert.transitBody],
            targets: [target],
            aspects: [alert.aspect],
          });
          for (const hit of hits) found.push({ alert, hit });
        }

        found.sort((a, b) => a.hit.exactJd - b.hit.exactJd);
        if (live) { setMatches(found); setFailed(false); }
      } catch (cause) {
        console.error('alert evaluation failed', cause);
        if (live) { setMatches([]); setFailed(true); }
      }
    })();
    return () => { live = false; };
  }, [chart, enabled, fromJd, lookaheadDays]);

  const describe = (alert: Alert): string => t('alerts.describe', {
    transit: t(`body.${alert.transitBody}` as 'body.sun'),
    aspect: t(`aspect.${alert.aspect}` as 'aspect.conjunction'),
    target: alert.target.kind === 'angle'
      ? t(`angle.${alert.target.id}` as 'angle.asc')
      : alert.target.kind === 'natalBody'
        ? t(`body.${alert.target.body}` as 'body.sun')
        : `${n(alert.target.longitude)}°`,
    orb: n(alert.orb, { maximumFractionDigits: 2 }),
  });

  const chosenTarget = (): AlertTarget => (targetBody === 'asc' || targetBody === 'mc'
    ? { kind: 'angle', id: targetBody }
    : { kind: 'natalBody', body: targetBody as Body });

  return (
    <div className="flex flex-col gap-4">
      {/*
        First, and not dismissible. A reader who thinks something is watching
        on their behalf will stop checking.
      */}
      <p className="as-body">{t('alerts.notBackground')}</p>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        <label className="text-sm">
          <span className="block font-medium">{t('alerts.transiting')}</span>
          <select
            className={`mt-1 ${FIELD}`} style={fieldStyle}
            value={transitBody}
            onChange={(e) => setTransitBody(e.target.value as Body)}
          >
            {TRANSIT_BODIES.map((body) => (
              <option key={body} value={body}>{t(`body.${body}` as 'body.sun')}</option>
            ))}
          </select>
        </label>

        <label className="text-sm">
          <span className="block font-medium">{t('table.column.aspect')}</span>
          <select
            className={`mt-1 ${FIELD}`} style={fieldStyle}
            value={aspect}
            onChange={(e) => setAspect(e.target.value as AspectName)}
          >
            {ASPECTS.map((name) => (
              <option key={name} value={name}>
                {t(`aspect.${name}` as 'aspect.conjunction')}
              </option>
            ))}
          </select>
        </label>

        <label className="text-sm">
          <span className="block font-medium">{t('alerts.target')}</span>
          <select
            className={`mt-1 ${FIELD}`} style={fieldStyle}
            value={targetBody}
            onChange={(e) => setTargetBody(e.target.value)}
          >
            {TARGET_BODIES.map((body) => (
              <option key={body} value={body}>{t(`body.${body}` as 'body.sun')}</option>
            ))}
            <option value="asc">{t('angle.asc')}</option>
            <option value="mc">{t('angle.mc')}</option>
          </select>
        </label>

        <label className="text-sm">
          <span className="block font-medium">{t('alerts.orb')}</span>
          <input
            type="number" step={0.5} min={0.1} max={10}
            className={`mt-1 ${FIELD}`} style={fieldStyle}
            value={orb}
            onChange={(e) => {
              const parsed = Number(e.target.value);
              if (Number.isFinite(parsed)) setOrb(parsed);
            }}
          />
        </label>

        <div className="flex items-end">
          <button
            type="button"
            className="as-button-primary"
            onClick={() => add({
              transitBody, aspect, target: chosenTarget(), orb: Math.max(0.1, orb),
            })}
          >
            {t('alerts.add')}
          </button>
        </div>
      </div>

      {alerts.length === 0 ? (
        <p className="as-body" style={mutedStyle}>{t('alerts.none')}</p>
      ) : (
        <ul className="as-list">
          {alerts.map((alert) => (
            <li key={alert.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={alert.enabled}
                  onChange={() => toggle(alert.id)}
                  aria-label={describe(alert)}
                />
                <span style={alert.enabled ? undefined : mutedStyle}>{describe(alert)}</span>
              </label>
              <button
                type="button"
                className="text-xs underline"
                style={mutedStyle}
                onClick={() => remove(alert.id)}
              >
                {t('alerts.remove')}
              </button>
            </li>
          ))}
        </ul>
      )}

      {!chart ? (
        <p className="as-body" style={mutedStyle}>{t('alerts.needsChart')}</p>
      ) : failed ? (
        <p className="as-body" role="alert">{t('alerts.failed')}</p>
      ) : matches === null ? (
        <p className="as-body" style={mutedStyle}>{t('alerts.checking')}</p>
      ) : enabled.length === 0 ? null : matches.length === 0 ? (
        <p className="as-body">{t('alerts.noMatches', { days: n(lookaheadDays) })}</p>
      ) : (
        <>
          <h3 className="as-h3">{t('alerts.matches', { count: n(matches.length) })}</h3>
          <ul className="as-list">
            {matches.map(({ alert, hit }) => (
              <li key={`${alert.id}-${hit.exactJd}`} className="text-sm">
                <span className="tabular-nums">
                  {d(hit.exactUtcIso, { dateStyle: 'medium', timeZone: 'UTC' })}
                </span>
                {' — '}
                {describe(alert)}
                {hit.totalPasses > 1 ? (
                  <span style={mutedStyle}>
                    {' '}
                    ({t('transit.pass.of', { index: n(hit.passIndex), total: n(hit.totalPasses) })})
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
          <p className="as-fineprint">{t('alerts.passNote')}</p>
        </>
      )}
    </div>
  );
}

export { ALL_ASPECTS };
