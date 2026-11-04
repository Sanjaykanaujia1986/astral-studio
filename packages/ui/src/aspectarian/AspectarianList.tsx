/**
 * Exact aspects between transiting bodies, grouped by day.
 *
 * Grouped rather than listed flat because the question people bring to an
 * aspectarian is "what happens on the 14th", not "give me the next 200 events".
 */
import type { JSX } from 'react';
import type { AspectEvent } from '@astro/engine';
import { useTranslator } from '@astro/i18n';
import { ASPECT_GLYPHS, BODY_GLYPHS, GLYPH_FONT_STACK } from '../chart-wheel/glyphs.js';
import { ASPECT_CLASSES, LIGHT_THEME } from '../chart-wheel/theme.js';
import { groupByUtcDay } from './grouping.js';

export interface AspectarianListProps {
  readonly events: readonly AspectEvent[];
  readonly className?: string;
}

export function AspectarianList({ events, className }: AspectarianListProps): JSX.Element {
  const { t, d, n } = useTranslator();

  if (events.length === 0) {
    return (
      <p className={`px-3 py-6 text-sm text-slate-500 ${className ?? ''}`}>
        {t('aspectarian.empty')}
      </p>
    );
  }

  const days = groupByUtcDay(events, (event) => new Date(event.exactUtcIso));

  return (
    <div className={className}>
      <p className="px-3 pb-2 text-xs text-slate-500">
        {t('aspectarian.count', { count: events.length })}
      </p>

      <ul className="divide-y divide-slate-100">
        {[...days.entries()].map(([dayKey, dayEvents]) => (
          <li key={dayKey} className="px-3 py-2">
            <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
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
                const a = BODY_GLYPHS[event.bodyA];
                const b = BODY_GLYPHS[event.bodyB];
                const aspect = ASPECT_GLYPHS[event.aspect];
                const colour = LIGHT_THEME.aspects[ASPECT_CLASSES[event.aspect]];

                return (
                  <li
                    key={`${event.bodyA}-${event.aspect}-${event.bodyB}-${event.exactJd}`}
                    className="flex flex-wrap items-baseline gap-x-2 text-sm"
                  >
                    <span className="w-14 shrink-0 tabular-nums text-slate-500">
                      {d(event.exactUtcIso, {
                        hour: '2-digit',
                        minute: '2-digit',
                        hourCycle: 'h23',
                        timeZone: 'UTC',
                      })}
                    </span>

                    <span className="inline-flex items-baseline gap-1.5">
                      <span aria-hidden="true" style={{ fontFamily: GLYPH_FONT_STACK }}>
                        {a.symbol}
                      </span>
                      <span>{t(`body.${event.bodyA}`)}</span>
                      {event.retrogradeA ? <span className="text-rose-700">℞</span> : null}

                      <span
                        aria-hidden="true"
                        style={{ fontFamily: GLYPH_FONT_STACK, color: colour }}
                        className="px-0.5"
                      >
                        {aspect.symbol}
                      </span>
                      <span style={{ color: colour }}>{t(`aspect.${event.aspect}`)}</span>

                      <span aria-hidden="true" style={{ fontFamily: GLYPH_FONT_STACK }}>
                        {b.symbol}
                      </span>
                      <span>{t(`body.${event.bodyB}`)}</span>
                      {event.retrogradeB ? <span className="text-rose-700">℞</span> : null}
                    </span>

                    {event.totalPasses > 1 ? (
                      <span className="text-xs text-slate-400">
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
