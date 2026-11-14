/**
 * Sky events: ingresses, stations and declination.
 *
 * These are the things the sky does on its own, as opposed to aspects between
 * a moving body and a chart. They need no chart at all, which is why this
 * panel stands apart from the transit search above it and works before any
 * chart has been cast.
 *
 * The search runs on demand rather than on mount: a year of declination
 * events costs two ephemeris calls per sample per body, and spending that on
 * a reader who only came to look at transits would be rude.
 */
import { useCallback, useMemo, useState, type JSX } from 'react';
import {
  findIngresses,
  findStations,
  findDeclinationEvents,
  julianDay,
  NoStationsError,
  type Body,
  type DeclinationEvent,
  type IngressEvent,
  type SkyEvent,
  type StationEvent,
} from '@astro/engine';
import { BodyGlyph } from '@astro/ui';
import { useTranslator } from '@astro/i18n';
import { getProvider } from '../lib/engine.js';

type Kind = 'ingress' | 'station' | 'declination';

const KINDS: readonly Kind[] = ['ingress', 'station', 'declination'];

/**
 * Bodies offered per search.
 *
 * The Moon is absent from ingresses on purpose: it changes sign every two and
 * a half days, so a year of lunar ingresses is 160 rows that bury everything
 * else. It is absent from stations because it never stations.
 */
const INGRESS_BODIES: readonly Body[] = [
  'sun', 'mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto',
];
const STATION_BODIES: readonly Body[] = [
  'mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto',
];
const DECLINATION_BODIES: readonly Body[] = [
  'sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn',
];

const FIELD = 'w-full max-w-full rounded-md border px-3 py-1.5 text-sm';
const LABEL = 'min-w-0 max-w-full text-sm';
const TH = 'px-2 py-1.5 text-left text-xs font-medium uppercase tracking-wide';
const TD = 'px-2 py-1.5 whitespace-nowrap tabular-nums';

const fieldStyle = {
  borderColor: 'var(--as-border-strong)',
  background: 'var(--as-surface)',
  color: 'var(--as-ink)',
};
const mutedStyle = { color: 'var(--as-ink-muted)' };

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Julian Day at 00:00 UT on an ISO date, or null if the date is unusable. */
function jdFromIso(iso: string): number | null {
  const [year, month, day] = iso.split('-').map(Number);
  if (!year || !month || !day) return null;
  try {
    return julianDay({ year, month, day }, 0);
  } catch {
    return null;
  }
}

export function SkyEventsPanel(): JSX.Element {
  const { t, n, d } = useTranslator();

  const [kind, setKind] = useState<Kind>('ingress');
  const [fromDate, setFromDate] = useState(todayIsoDate);
  const [months, setMonths] = useState(12);
  const [selected, setSelected] = useState<readonly Body[]>(['sun', 'mercury', 'venus', 'mars']);
  const [events, setEvents] = useState<readonly SkyEvent[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const available = kind === 'ingress'
    ? INGRESS_BODIES
    : kind === 'station' ? STATION_BODIES : DECLINATION_BODIES;

  // A body offered for one search may not exist in another: switching from
  // ingresses to stations must not leave the Sun selected and then fail.
  const chosen = useMemo(
    () => selected.filter((body) => available.includes(body)),
    [selected, available],
  );

  const run = useCallback(async () => {
    const fromJd = jdFromIso(fromDate);
    if (fromJd === null || chosen.length === 0) return;
    const toJd = fromJd + months * 30.436875;

    setBusy(true);
    setError(null);
    setEvents(null);
    // Yield so the busy state paints before the synchronous search stalls.
    await new Promise((resolve) => { setTimeout(resolve, 0); });

    try {
      const provider = await getProvider();
      const common = { fromJd, toJd, bodies: chosen };

      if (kind === 'ingress') {
        setEvents(findIngresses(provider, common));
      } else if (kind === 'station') {
        // Non-strict: the picker already excludes bodies that never station,
        // and a mixed list should not fail because of one of them.
        setEvents(findStations(provider, { ...common, strict: false }));
      } else {
        setEvents(findDeclinationEvents(provider, {
          ...common,
          include: ['equatorCrossing', 'maximum', 'minimum'],
          // Pairs are every chosen body against every other, which is what
          // "parallels among these" means; n is small by construction.
          pairs: chosen.flatMap((a, i) => chosen.slice(i + 1).map((b) => [a, b] as const)),
        }));
      }
    } catch (cause) {
      console.error('sky event search failed', cause);
      setError(cause instanceof NoStationsError
        ? t('skyEvents.error.neverStations')
        : t('error.unknown'));
    } finally {
      setBusy(false);
    }
  }, [kind, fromDate, months, chosen, t]);

  const toggle = (body: Body) => {
    setSelected((current) => (current.includes(body)
      ? current.filter((b) => b !== body)
      : [...current, body]));
  };

  const describe = (event: SkyEvent): string => {
    if (event.kind === 'ingress') {
      const e = event as IngressEvent;
      return t(e.retrograde ? 'skyEvents.ingress.back' : 'skyEvents.ingress.into', {
        body: t(`body.${e.body}` as 'body.sun'),
        sign: t(`sign.${e.sign}` as 'sign.aries'),
        from: t(`sign.${e.fromSign}` as 'sign.aries'),
      });
    }
    if (event.kind === 'station') {
      const e = event as StationEvent;
      return t(`skyEvents.station.${e.direction}` as 'skyEvents.station.direct', {
        body: t(`body.${e.body}` as 'body.sun'),
        sign: t(`sign.${e.sign}` as 'sign.aries'),
        degrees: n(e.longitude - e.signIndex * 30, { maximumFractionDigits: 2 }),
      });
    }
    const e = event as DeclinationEvent;
    return t(`skyEvents.declination.${e.type}` as 'skyEvents.declination.maximum', {
      body: t(`body.${e.body}` as 'body.sun'),
      other: e.otherBody ? t(`body.${e.otherBody}` as 'body.sun') : '',
      declination: n(e.declination, { maximumFractionDigits: 2 }),
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className={LABEL}>
          <span className="block font-medium">{t('skyEvents.kind')}</span>
          <select
            className={`mt-1 ${FIELD}`}
            style={fieldStyle}
            value={kind}
            onChange={(event) => { setKind(event.target.value as Kind); setEvents(null); }}
          >
            {KINDS.map((option) => (
              <option key={option} value={option}>
                {t(`skyEvents.kind.${option}` as 'skyEvents.kind.ingress')}
              </option>
            ))}
          </select>
        </label>

        <label className={LABEL}>
          <span className="block font-medium">{t('skyEvents.from')}</span>
          <input
            type="date"
            className={`mt-1 ${FIELD}`}
            style={fieldStyle}
            value={fromDate}
            onChange={(event) => setFromDate(event.target.value)}
          />
        </label>

        <label className={LABEL}>
          <span className="block font-medium">{t('skyEvents.months')}</span>
          <select
            className={`mt-1 ${FIELD}`}
            style={fieldStyle}
            value={months}
            onChange={(event) => setMonths(Number(event.target.value))}
          >
            {[3, 6, 12, 24, 60].map((count) => (
              <option key={count} value={count}>{n(count)}</option>
            ))}
          </select>
        </label>
      </div>

      <fieldset>
        <legend className="text-sm font-medium">{t('skyEvents.bodies')}</legend>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
          {available.map((body) => (
            <label key={body} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={chosen.includes(body)}
                onChange={() => toggle(body)}
              />
              <BodyGlyph body={body} className="as-text-accent" />
              {t(`body.${body}` as 'body.sun')}
            </label>
          ))}
        </div>
      </fieldset>

      <div>
        <button
          type="button"
          className="as-button-primary"
          onClick={() => void run()}
          disabled={busy || chosen.length === 0}
        >
          {busy ? t('skyEvents.searching') : t('skyEvents.search')}
        </button>
      </div>

      {error ? <p role="alert" className="as-body" style={{ color: 'var(--as-danger)' }}>{error}</p> : null}

      {events === null ? null : events.length === 0 ? (
        <p className="as-body">{t('skyEvents.none')}</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--as-border)' }}>
                  <th className={TH} style={mutedStyle}>{t('transit.column.date')}</th>
                  <th className={TH} style={mutedStyle}>{t('skyEvents.column.event')}</th>
                </tr>
              </thead>
              <tbody>
                {events.map((event) => (
                  <tr
                    key={`${event.kind}-${event.jd}-${describe(event)}`}
                    style={{ borderBottom: '1px solid var(--as-border)' }}
                  >
                    <td className={TD}>
                      {d(event.utcIso, {
                        dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC',
                      })}
                    </td>
                    <td className="px-2 py-1.5">{describe(event)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="as-fineprint">{t('skyEvents.count', { count: n(events.length) })}</p>
        </>
      )}

      <p className="as-fineprint">{t('skyEvents.note')}</p>
    </div>
  );
}
