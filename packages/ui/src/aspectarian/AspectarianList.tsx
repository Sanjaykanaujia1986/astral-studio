/**
 * Exact aspects between transiting bodies, grouped by day.
 *
 * Grouped rather than listed flat because the question people bring to an
 * aspectarian is "what happens on the 14th", not "give me the next 200 events".
 */
import type { JSX } from 'react';
import type { AspectEvent } from '@astro/engine';
import { useTranslator } from '@astro/i18n';
import { AspectGlyph, BodyGlyph } from '../glyphs/Glyph.js';
import { ASPECT_CLASSES, LIGHT_THEME, type ChartTheme } from '../chart-wheel/theme.js';
import { groupByUtcDay } from './grouping.js';

export interface AspectarianListProps {
  /**
   * Which palette the aspect names are coloured from.
   *
   * It used to be `LIGHT_THEME` unconditionally, so on the dark theme the
   * hard/soft/neutral hues — picked to read on paper — sat on the night sky
   * at 2.84:1, 3.68:1 and 3.94:1. The caller passes the palette the page is
   * actually showing; the default keeps the old behaviour for a caller that
   * has no theme to give.
   */
  readonly theme?: ChartTheme;
  readonly events: readonly AspectEvent[];
  readonly className?: string;
}

export function AspectarianList(
  { events, className, theme = LIGHT_THEME }: AspectarianListProps,
): JSX.Element {
  const { t, d, n } = useTranslator();

  if (events.length === 0) {
    return (
      <p className={`px-3 py-6 text-sm as-text-muted ${className ?? ''}`}>
        {t('aspectarian.empty')}
      </p>
    );
  }

  const days = groupByUtcDay(events, (event) => new Date(event.exactUtcIso));

  return (
    <div className={className}>
      <p className="px-3 pb-2 text-xs as-text-muted">
        {t('aspectarian.count', { count: events.length })}
      </p>

      <ul className="divide-y divide-slate-100">
        {[...days.entries()].map(([dayKey, dayEvents]) => (
          <li key={dayKey} className="px-3 py-2">
            <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide as-text-muted">
              {d(`${dayKey}T00:00:00Z`, {
                weekday: 'short',
                day: 'numeric',
                month: 'short',
                year: 'numeric',
                timeZone: 'UTC',
              })}
            </h4>

            <ul className="space-y-1">
              {dayEvents.map((event) => {
                const colour = theme.aspects[ASPECT_CLASSES[event.aspect]];

                return (
                  <li
                    key={`${event.bodyA}-${event.aspect}-${event.bodyB}-${event.exactJd}`}
                    className="flex flex-wrap items-baseline gap-x-2 text-sm"
                  >
                    <span className="w-14 shrink-0 tabular-nums as-text-muted">
                      {d(event.exactUtcIso, {
                        hour: '2-digit',
                        minute: '2-digit',
                        hourCycle: 'h23',
                        timeZone: 'UTC',
                      })}
                    </span>

                    <span className="inline-flex items-center gap-1.5">
                      <BodyGlyph body={event.bodyA} />
                      <span>{t(`body.${event.bodyA}`)}</span>
                      {event.retrogradeA ? <span className="as-text-danger">℞</span> : null}

                      <AspectGlyph aspect={event.aspect} className="mx-0.5" style={{ color: colour }} />
                      <span style={{ color: colour }}>{t(`aspect.${event.aspect}`)}</span>

                      <BodyGlyph body={event.bodyB} />
                      <span>{t(`body.${event.bodyB}`)}</span>
                      {event.retrogradeB ? <span className="as-text-danger">℞</span> : null}
                    </span>

                    {event.totalPasses > 1 ? (
                      <span className="text-xs as-text-muted">
                        {t('transit.pass.of', {
                          index: n(event.passIndex),
                          total: n(event.totalPasses),
                        })}
                      </span>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
}
