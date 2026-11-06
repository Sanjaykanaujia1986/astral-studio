/**
 * Which palette a chart figure draws in.
 *
 * ## Why this exists
 *
 * The chart theme and the page theme were independent, and the default chart
 * theme was `light`. On the old ivory ground nobody noticed. On a night sky
 * it put a white disc in the middle of the page — the figure stopped reading
 * as part of the product and started reading as a pasted screenshot.
 *
 * So the default is now `auto`: follow the page. `light`, `dark` and `print`
 * remain explicit choices, because a reader printing a chart wants the print
 * palette regardless of what their screen is doing.
 *
 * ## Why it reads the DOM rather than a media query alone
 *
 * The page honours an explicit `data-theme` on the root when the reader has
 * chosen one, and falls back to `prefers-color-scheme` when they have not.
 * Consulting only the media query would ignore the explicit choice; consulting
 * only the attribute would ignore the system setting. Both, in that order.
 */
import { useEffect, useState } from 'react';
import { DARK_THEME, LIGHT_THEME, PRINT_THEME, type ChartTheme } from '@astro/ui';
import { useSettings, type ChartThemeName } from './settings.js';

export const CHART_THEMES: Readonly<Record<'light' | 'dark' | 'print', ChartTheme>> = {
  light: LIGHT_THEME,
  dark: DARK_THEME,
  print: PRINT_THEME,
};

/** What the page is actually showing right now. */
export function resolvePageMode(): 'light' | 'dark' {
  if (typeof document === 'undefined') return 'light';
  const explicit = document.documentElement.getAttribute('data-theme');
  if (explicit === 'dark' || explicit === 'light') return explicit;
  return globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/**
 * The resolved chart palette, re-resolved when the page appearance changes.
 *
 * Subscribed rather than read once: a reader switching their OS to dark mode
 * with the app open would otherwise keep a light wheel until they reloaded.
 */
export function useChartTheme(): ChartTheme {
  const name: ChartThemeName = useSettings((state) => state.theme);
  const [pageMode, setPageMode] = useState<'light' | 'dark'>(resolvePageMode);

  useEffect(() => {
    if (name !== 'auto') return undefined;

    const update = () => setPageMode(resolvePageMode());
    update();

    const query = globalThis.matchMedia?.('(prefers-color-scheme: dark)');
    query?.addEventListener('change', update);
    // The explicit attribute is set by the app itself, so an observer is the
    // only way to notice it without every caller remembering to tell us.
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });

    return () => {
      query?.removeEventListener('change', update);
      observer.disconnect();
    };
  }, [name]);

  if (name === 'auto') return CHART_THEMES[pageMode];
  return CHART_THEMES[name];
}
