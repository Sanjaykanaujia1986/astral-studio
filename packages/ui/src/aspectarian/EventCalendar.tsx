/**
 * Month calendar showing where exact aspects fall.
 *
 * Density at a glance: the point of a calendar view is spotting the clustered
 * days, which a chronological list buries. Selecting a day surfaces its events.
 */
import type { JSX } from 'react';
import type { AspectEvent } from '@astro/engine';
import { useTranslator } from '@astro/i18n';
import {
  firstDayOfWeek,
  groupByUtcDay,
  monthGrid,
  utcDayKey,
  weekdayLabels,
} from './grouping.js';

export interface EventCalendarProps {
  readonly events: readonly AspectEvent[];
  /** Any date inside the month to display. */
  readonly anchor: Date;
  readonly selectedDayKey?: string | undefined;
  readonly onSelectDay?: (dayKey: string) => void;
  readonly className?: string;
}

/**
 * Background weight for a day's event count.
 *
 * Deliberately coarse. A continuous scale invites the reader to compare two
 * similar days by shade, which the eye cannot do reliably; three bands say
 * "some / more / many" and stop there.
 */
function densityClass(count: number): string {
  if (count === 0) return 'bg-white';
  if (count <= 2) return 'bg-sky-50';
  if (count <= 5) return 'bg-sky-100';
  return 'bg-sky-200';
}

export function EventCalendar({
  events,
  anchor,
  selectedDayKey,
  onSelectDay,
  className,
}: EventCalendarProps): JSX.Element {
  const { t, d, n, locale } = useTranslator();

  const weekStart = firstDayOfWeek(locale.intlTag);
  const weeks = monthGrid(anchor.getUTCFullYear(), anchor.getUTCMonth(), weekStart);
  const byDay = groupByUtcDay(events, (event) => new Date(event.exactUtcIso));
  const todayKey = utcDayKey(new Date());

  return (
    <div className={className}>
      <table className="w-full table-fixed border-collapse">
        <caption className="px-3 pb-2 text-left text-xs text-slate-500">
          {t('calendar.legend')}
        </caption>
        <thead>
          <tr>
            {weekdayLabels(locale.intlTag, weekStart).map((label) => (
              <th
                key={label}
                scope="col"
                className="px-1 pb-1 text-center text-xs font-medium uppercase tracking-wide text-slate-500"
              >
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((week) => (
            <tr key={week[0]!.dayKey}>
              {week.map((cell) => {
                const count = byDay.get(cell.dayKey)?.length ?? 0;
                const isSelected = cell.dayKey === selectedDayKey;
                const isToday = cell.dayKey === todayKey;

                return (
                  <td key={cell.dayKey} className="p-0.5 align-top">
                    <button
                      type="button"
                      onClick={() => onSelectDay?.(cell.dayKey)}
                      aria-pressed={isSelected}
                      aria-label={`${d(`${cell.dayKey}T00:00:00Z`, {
                        dateStyle: 'full',
                        timeZone: 'UTC',
                      })} — ${
                        count === 0
                          ? t('calendar.noEvents')
                          : t('aspectarian.count', { count })
                      }`}
                      className={[
                        'flex h-14 w-full flex-col items-start rounded border px-1.5 py-1 text-left transition',
                        densityClass(count),
                        cell.inMonth ? 'text-slate-900' : 'text-slate-300',
                        isSelected ? 'border-slate-900 ring-1 ring-slate-900' : 'border-slate-200',
                        'hover:border-slate-400',
                      ].join(' ')}
                    >
                      <span
                        className={`text-xs tabular-nums ${isToday ? 'font-bold underline' : ''}`}
                      >
                        {n(cell.date.getUTCDate())}
                      </span>
                      {count > 0 && cell.inMonth ? (
                        <span className="mt-auto text-xs font-medium text-sky-800 tabular-nums">
                          {n(count)}
                        </span>
                      ) : null}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
