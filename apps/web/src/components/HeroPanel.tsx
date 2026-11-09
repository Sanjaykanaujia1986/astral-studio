/**
 * The welcome hero.
 *
 * Shown on the dashboard only while there is no chart. Once one exists the
 * dashboard has real content — today's sky, upcoming transits, saved charts —
 * and a marketing panel above it would be in the way every single visit.
 *
 * ## The wheel is real
 *
 * It is the product's own `ChartWheel`, drawn for **this moment** from the
 * bundled ephemeris, not an illustration of a chart. A decorative SVG zodiac
 * would have been easier and would also have been the first fabricated
 * calculation in the product: a reader cannot tell a picture of a chart from
 * a chart, which is exactly why it has to be one.
 */
import { useEffect, useState, type JSX } from 'react';
import { Link } from 'react-router-dom';
import {
  calculateChartForInstant,
  julianDay,
  type InstantChart,
} from '@astro/engine';
import { useTranslator } from '@astro/i18n';
import { ChartWheel } from '@astro/ui';
import { getProvider } from '../lib/engine.js';
import { useSettings } from '../lib/settings.js';
import { useChartTheme } from '../lib/chart-theme.js';
import { BRAND } from '../brand.js';

/** Julian Day for this instant, from the device clock. */
function nowJd(): number {
  const now = new Date();
  return julianDay(
    { year: now.getUTCFullYear(), month: now.getUTCMonth() + 1, day: now.getUTCDate() },
    now.getUTCHours() + now.getUTCMinutes() / 60,
  );
}

export function HeroPanel(): JSX.Element {
  const { t } = useTranslator();
  const settings = useSettings();
  const chartTheme = useChartTheme();
  const [sky, setSky] = useState<InstantChart | null>(null);

  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const provider = await getProvider();
        /*
         * No houses: the hero has no observer, and an ascendant drawn from an
         * assumed location would be a real-looking number belonging to
         * nobody. The wheel orients on 0 Aries instead, which it already
         * handles for a chart with no birth time.
         */
        const chart = calculateChartForInstant(
          provider, nowJd(), { latitude: 0, longitude: 0 }, { withHouses: false },
        );
        if (live) setSky(chart);
      } catch (cause) {
        // The hero is decoration with a real engine behind it. If the engine
        // is not ready the copy still stands; it does not get a fake wheel.
        console.error('hero wheel failed', cause);
      }
    })();
    return () => { live = false; };
  }, []);

  const [lead, ...rest] = BRAND.name.split(' ');

  return (
    <section className="as-hero">
      <div>
        {/*
          An h2, not an h1. The page scaffold already emits "Dashboard" as
          the document heading, and two h1s on one page is a heading-order
          defect a screen-reader user hits before anyone else notices. The
          visual weight is the class, not the level.
        */}
        <h2 className="as-hero-title">
          {t('hero.welcome')}
          <br />
          <span className="as-hero-accent">{lead}</span>
          {rest.length > 0 ? ` ${rest.join(' ')}` : null}
        </h2>

        <p className="as-hero-lede">{t('hero.lede')}</p>

        <div className="as-hero-actions">
          <Link to="/chart" className="as-button-primary">
            {t('hero.getStarted')}
          </Link>
          <Link to="/events" className="as-button-secondary" style={{ marginBlockStart: 0 }}>
            {t('hero.exploreSky')}
          </Link>
        </div>

        <p className="as-fineprint mt-6">{t('hero.offline')}</p>
      </div>

      <div className="as-hero-figure">
        {sky ? (
          <ChartWheel
            chart={sky}
            size={520}
            showAspects
            /*
             * Transparent ground for the hero only. Everywhere else the
             * wheel is a figure ON a card and needs its own surface; here it
             * floats on the sky, and an opaque disc would cut a hole in it.
             */
            theme={{ ...chartTheme, surface: 'transparent' }}
            glyphStyle={settings.glyphStyle}
            title={t('hero.wheelTitle')}
            className="w-full"
          />
        ) : (
          /*
           * A sized placeholder rather than nothing: an element that appears
           * at 520px once the ephemeris loads would shove the copy up the
           * page, which is the layout shift Core Web Vitals measures.
           */
          <div
            aria-hidden="true"
            style={{ aspectRatio: '1 / 1', width: '100%', maxWidth: 520 }}
          />
        )}
      </div>
    </section>
  );
}
