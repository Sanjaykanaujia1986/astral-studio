/**
 * Aspectarian: exact aspects between transiting bodies over a period.
 *
 * ## Why the Moon is opt-out on long views
 *
 * The Moon forms an exact aspect to something every few hours, so a year of
 * lunar aspects is thousands of rows that bury the handful of slow-planet
 * events people are actually looking for — and it dominates the search cost.
 * It defaults on for a day or a week, off for a month or a year, and is always
 * a visible toggle rather than a hidden rule.
 *
 * ## Blocking
 *
 * The search is synchronous. Busy state is set, then the work is deferred by a
 * tick so React can paint the spinner before the main thread stalls. A month is
 * ~200 ms and passes unnoticed; a full year with the Moon is seconds, which is
 * why that combination is not the default. Moving this to a Web Worker is the
 * proper fix and is on the roadmap.
 */
import { useCallback, useEffect, useMemo, useState, type JSX } from 'react';
import {
  julianDay,
  fromJulianDay,
  MAJOR_ASPECTS,
  ALL_ASPECTS,
  type AspectEvent,
  type Body,
} from '@astro/engine';
import { useTranslator } from '@astro/i18n';
import {
  AspectarianList,
  EventCalendar,
  firstDayOfWeek,
  periodRange,
  shiftPeriod,
  utcDayKey,
  type PeriodKind,
} from '@astro/ui';
import { searchAspectarian } from '../lib/search.js';
import { useChartTheme } from '../lib/chart-theme.js';

const CORE_BODIES: readonly Body[] = [
  'sun', 'mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto',
];

const PERIODS: readonly PeriodKind[] = ['day', 'week', 'month', 'year'];

/** Julian Day for a UTC timestamp in milliseconds. */
function jdFromMs(ms: number): number {
  const date = new Date(ms);
  return julianDay(
    { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() },
    date.getUTCHours() + date.getUTCMinutes() / 60,
  );
}

const BUTTON =
  'rounded-md border as-border-strong px-3 py-1.5 text-sm as-hover-inset disabled:opacity-50';

export function AspectarianPanel(): JSX.Element {
  const { t, d, locale } = useTranslator();
  // The aspect hues follow the page, like the wheel's do.
  const chartTheme = useChartTheme();

  const [period, setPeriod] = useState<PeriodKind>('month');
  const [anchor, setAnchor] = useState(() => new Date());
  const [includeMoon, setIncludeMoon] = useState(false);
  const [majorsOnly, setMajorsOnly] = useState(true);
  const [events, setEvents] = useState<readonly AspectEvent[]>([]);
  const [busy, setBusy] = useState(false);
  const [selectedDay, setSelectedDay] = useState<string | undefined>(undefined);

  const weekStart = firstDayOfWeek(locale.intlTag);
  const range = useMemo(
    () => periodRange(anchor, period, weekStart),
    [anchor, period, weekStart],
  );

  // Switching to a long view drops the Moon; switching back restores it. The
  // toggle stays visible so the choice is never silent.
  useEffect(() => {
    setIncludeMoon(period === 'day' || period === 'week');
  }, [period]);

  const bodies = useMemo<readonly Body[]>(
    () => (includeMoon ? (['moon', ...CORE_BODIES] as Body[]) : CORE_BODIES),
    [includeMoon],
  );

  useEffect(() => {
    let cancelled = false;
    setBusy(true);
    setSelectedDay(undefined);

    /*
     * Off the main thread. A year of aspectarian takes about five seconds, and
     * on the main thread that is a frozen tab rather than a slow render — no
     * scrolling, no repaint, and on a phone the system may offer to kill the
     * page. The timeout that used to yield before the stall is gone with it:
     * there is no longer a stall to yield before.
     */
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const found = await searchAspectarian({
            fromJd: jdFromMs(range.fromMs),
            toJd: jdFromMs(range.toMs),
            bodies,
            aspects: majorsOnly ? MAJOR_ASPECTS : ALL_ASPECTS,
          });
          if (!cancelled) setEvents(found);
        } catch (cause) {
          console.error('aspectarian search failed', cause);
          if (!cancelled) setEvents([]);
        } finally {
          if (!cancelled) setBusy(false);
        }
      })();
    }, 0);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [range.fromMs, range.toMs, bodies, majorsOnly]);

  const visibleEvents = useMemo(
    () =>
      selectedDay
        ? events.filter((e) => utcDayKey(new Date(e.exactUtcIso)) === selectedDay)
        : events,
    [events, selectedDay],
  );

  const move = useCallback(
    (delta: number) => setAnchor((current) => shiftPeriod(current, period, delta)),
    [period],
  );

  /** Heading for the current period, formatted by the locale. */
  const heading = useMemo(() => {
    const from = new Date(range.fromMs).toISOString();
    if (period === 'year') return d(from, { year: 'numeric', timeZone: 'UTC' });
    if (period === 'month') return d(from, { month: 'long', year: 'numeric', timeZone: 'UTC' });
    if (period === 'day') return d(from, { dateStyle: 'full', timeZone: 'UTC' });
    const to = new Date(range.toMs - 1).toISOString();
    return `${d(from, { day: 'numeric', month: 'short', timeZone: 'UTC' })} – ${d(to, {
      day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
    })}`;
  }, [range.fromMs, range.toMs, period, d]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 px-3 pt-2">
        <div className="flex rounded-md border as-border-strong">
          {PERIODS.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setPeriod(option)}
              aria-pressed={period === option}
              className={`px-3 py-1.5 text-sm first:rounded-l-md last:rounded-r-md ${
                period === option ? 'bg-slate-900 text-white' : 'as-hover-inset'
              }`}
            >
              {t(`aspectarian.period.${option}`)}
            </button>
          ))}
        </div>

        <button type="button" onClick={() => move(-1)} className={BUTTON}>
          ← {t('aspectarian.previous')}
        </button>
        <button type="button" onClick={() => setAnchor(new Date())} className={BUTTON}>
          {t('aspectarian.today')}
        </button>
        <button type="button" onClick={() => move(1)} className={BUTTON}>
          {t('aspectarian.next')} →
        </button>

        <span className="ml-2 text-sm font-medium as-text">{heading}</span>
        {busy ? (
          <span className="text-xs as-text-muted">{t('transit.calculating')}</span>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-4 px-3 text-sm as-text">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={includeMoon}
            onChange={(e) => setIncludeMoon(e.target.checked)}
          />
          ☽ {t('body.moon')}
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={majorsOnly}
            onChange={(e) => setMajorsOnly(e.target.checked)}
          />
          {t('aspectarian.filter.majorsOnly')}
        </label>
      </div>

      {period === 'month' ? (
        <EventCalendar
          events={events}
          anchor={new Date(range.fromMs)}
          selectedDayKey={selectedDay}
          onSelectDay={(key) => setSelectedDay((current) => (current === key ? undefined : key))}
          className="px-2"
        />
      ) : null}

      <AspectarianList events={visibleEvents} theme={chartTheme} />
    </div>
  );
}
