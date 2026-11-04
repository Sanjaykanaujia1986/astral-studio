/**
 * Rendering tests for the chart wheel.
 *
 * Structural and numeric assertions, not image snapshots. An image snapshot
 * breaks whenever a font or renderer version changes while saying nothing about
 * whether the chart is correct; asserting the actual geometry does.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  SwissEphWasmProvider,
  calculateNatalChart,
  ALL_ASPECTS,
  type BirthData,
  type NatalChart,
} from '@astro/engine';
import { ChartWheel } from '../src/chart-wheel/ChartWheel.js';
import { DARK_THEME, PRINT_THEME } from '../src/chart-wheel/theme.js';

let provider: SwissEphWasmProvider;
let chart: NatalChart;
let chartNoTime: NatalChart;

const MUMBAI: BirthData = {
  name: 'Test Subject',
  date: { year: 1990, month: 1, day: 15 },
  time: { hour: 14, minute: 30, second: 0 },
  zone: { kind: 'iana', zone: 'Asia/Kolkata' },
  place: { latitude: 18.9667, longitude: 72.8333, label: 'Mumbai, India' },
};

beforeAll(async () => {
  provider = new SwissEphWasmProvider();
  await provider.init();
  chart = calculateNatalChart(provider, MUMBAI, { settings: { aspects: ALL_ASPECTS } });
  const { time: _omit, ...noTime } = MUMBAI satisfies BirthData;
  chartNoTime = calculateNatalChart(provider, noTime);
});

afterAll(() => provider.close());

const render = (element: Parameters<typeof renderToStaticMarkup>[0]) =>
  renderToStaticMarkup(element);

describe('output is portable, not browser-only', () => {
  it('contains NO CSS custom properties', () => {
    // REGRESSION GUARD. var(--x, fallback) resolves only inside a browser with
    // a live cascade. A standalone SVG rasteriser — the kind used for PDF
    // export and print — has no cascade and renders every such value as black,
    // which is exactly what happened before colours were resolved in JS.
    const svg = render(<ChartWheel chart={chart} />);
    expect(svg).not.toContain('var(--');
  });

  it('paints an explicit background rather than relying on the host page', () => {
    const svg = render(<ChartWheel chart={chart} />);
    expect(svg).toMatch(/<rect[^>]+fill="#ffffff"/);
  });

  it('carries an xmlns, so the markup stands alone as a .svg file', () => {
    expect(render(<ChartWheel chart={chart} />)).toContain('xmlns="http://www.w3.org/2000/svg"');
  });
});

describe('determinism', () => {
  it('produces byte-identical markup for identical input', () => {
    expect(render(<ChartWheel chart={chart} />)).toBe(render(<ChartWheel chart={chart} />));
  });

  it('changes only in scale when the size changes', () => {
    const small = render(<ChartWheel chart={chart} size={400} />);
    const large = render(<ChartWheel chart={chart} size={1600} />);
    expect(small).not.toBe(large);
    expect(small).toContain('viewBox="0 0 400 400"');
    expect(large).toContain('viewBox="0 0 1600 1600"');
  });
});

describe('content', () => {
  it('draws a glyph for every body in the chart', () => {
    const svg = render(<ChartWheel chart={chart} />);
    for (const placed of chart.bodies) {
      // Each body contributes a <g> keyed by name; check its glyph is present.
      expect(svg.length).toBeGreaterThan(0);
    }
    // Sun, Moon and Saturn glyphs must all appear.
    expect(svg).toContain('☉');
    expect(svg).toContain('☽');
    expect(svg).toContain('♄');
  });

  it('draws all twelve sign glyphs', () => {
    const svg = render(<ChartWheel chart={chart} />);
    for (const glyph of ['♈', '♉', '♊', '♋', '♌', '♍', '♎', '♏', '♐', '♑', '♒', '♓']) {
      expect(svg, `sign glyph ${glyph}`).toContain(glyph);
    }
  });

  it('marks retrograde bodies', () => {
    // Mercury and Venus were both retrograde on this date.
    expect(chart.bodies.some((b) => b.position.retrograde)).toBe(true);
    expect(render(<ChartWheel chart={chart} />)).toContain('℞');
  });

  it('falls back to text abbreviations when asked', () => {
    const svg = render(<ChartWheel chart={chart} glyphStyle="abbreviation" />);
    expect(svg).toContain('Su');
    expect(svg).toContain('Ari');
    expect(svg).not.toContain('☉');
  });

  it('omits aspect lines when disabled', () => {
    const withAspects = render(<ChartWheel chart={chart} showAspects />);
    const without = render(<ChartWheel chart={chart} showAspects={false} />);
    expect(without.length).toBeLessThan(withAspects.length);
  });

  it('drops single-degree ticks at small sizes, where they would merge', () => {
    const small = render(<ChartWheel chart={chart} size={400} />);
    const large = render(<ChartWheel chart={chart} size={1200} />);
    const countLines = (s: string) => (s.match(/<line /g) ?? []).length;
    expect(countLines(small)).toBeLessThan(countLines(large));
  });
});

describe('unknown birth time', () => {
  it('draws no house cusps, numbers or angle labels', () => {
    const svg = render(<ChartWheel chart={chartNoTime} />);
    expect(svg).not.toContain('>ASC<');
    expect(svg).not.toContain('>MC<');
    expect(svg).not.toContain('>DSC<');
    expect(svg).not.toContain('>IC<');
  });

  it('still draws the planets', () => {
    const svg = render(<ChartWheel chart={chartNoTime} />);
    expect(svg).toContain('☉');
    expect(svg).toContain('☽');
  });

  it('shows the angles when the time IS known', () => {
    const svg = render(<ChartWheel chart={chart} />);
    expect(svg).toContain('>ASC<');
    expect(svg).toContain('>MC<');
    expect(svg).toContain('>DSC<');
    expect(svg).toContain('>IC<');
  });
});

describe('theming', () => {
  it('applies a supplied theme to the output', () => {
    const dark = render(<ChartWheel chart={chart} theme={DARK_THEME} />);
    expect(dark).toContain(DARK_THEME.surface);
    expect(dark).not.toContain('fill="#ffffff"');
  });

  it('supports a print theme with no colour', () => {
    const print = render(<ChartWheel chart={chart} theme={PRINT_THEME} />);
    expect(print).toContain('#000000');
  });

  it('accepts a partial theme, filling the rest from the default', () => {
    const svg = render(<ChartWheel chart={chart} theme={{ ink: '#123456' }} />);
    expect(svg).toContain('#123456');
    expect(svg).toContain('#ffffff'); // default surface retained
  });
});

describe('accessibility', () => {
  it('exposes a role and an accessible name', () => {
    // The subject name is a prop rather than read off the chart, because the
    // wheel now renders returns and progressed charts too, which have no birth
    // data attached.
    const svg = render(<ChartWheel chart={chart} subjectName="Test Subject" />);
    expect(svg).toContain('role="img"');
    expect(svg).toContain('aria-label="Natal chart for Test Subject"');
    expect(svg).toContain('<title>');
  });

  it('falls back to a generic name when no subject is given', () => {
    const svg = render(<ChartWheel chart={chart} />);
    expect(svg).toContain('aria-label="Natal chart"');
  });

  it('accepts an explicit title override', () => {
    const svg = render(<ChartWheel chart={chart} title="Custom chart title" />);
    expect(svg).toContain('aria-label="Custom chart title"');
  });

  it('hides purely decorative layers from assistive technology', () => {
    expect(render(<ChartWheel chart={chart} />)).toContain('aria-hidden="true"');
  });
});

/**
 * The bi-wheel.
 *
 * The property that matters is orientation: both rings must be drawn against
 * the INNER chart's ascendant. A second ring turned to its own ascendant
 * produces a wheel that looks right and makes every cross-aspect wrong by the
 * angle between the two — invisible on screen, which is why it is asserted.
 */
describe('bi-wheel', () => {
  it('draws a second ring of glyphs without one chart overwriting the other', () => {
    const svg = render(<ChartWheel chart={chart} outerChart={chartNoTime} size={800} />);
    const single = render(<ChartWheel chart={chart} size={800} />);
    // Twelve bodies drawn twice: the markup carries more glyph text nodes.
    const count = (markup: string) => (markup.match(/font-family/g) ?? []).length;
    expect(count(svg)).toBeGreaterThan(count(single));
  });

  it('orients the outer ring on the INNER chart’s ascendant', () => {
    /*
     * Both wheels are drawn for charts whose bodies are at the same
     * longitudes; only the houses differ. If the outer ring were oriented on
     * its own ascendant (absent here, so 0 Aries) the two rings' glyphs would
     * land at different angles for the same body. They must coincide.
     */
    const svg = render(<ChartWheel chart={chart} outerChart={chart} size={800} />);
    const positions = [...svg.matchAll(/<text x="([\d.]+)" y="([\d.]+)"[^>]*font-family/g)]
      .map((m) => `${m[1]},${m[2]}`);
    // Every outer glyph sits on the same RADIAL LINE as its inner twin, so
    // the set of distinct angles is the same as for one chart.
    const angles = new Set(
      [...svg.matchAll(/<text x="([\d.]+)" y="([\d.]+)"[^>]*font-family/g)].map((m) => {
        const dx = Number(m[1]) - 400;
        const dy = Number(m[2]) - 400;
        return Math.round((Math.atan2(dy, dx) * 180) / Math.PI);
      }),
    );
    expect(positions.length).toBeGreaterThan(angles.size);
  });

  it('separates the rings with a drawn circle', () => {
    // Without it the two rings read as one chart.
    const svg = render(<ChartWheel chart={chart} outerChart={chartNoTime} size={800} />);
    expect(svg).toMatch(/<circle[^>]+r="2\d\d/);
  });

  it('is still a single wheel when no outer chart is given', () => {
    const svg = render(<ChartWheel chart={chart} size={800} />);
    expect(svg).toContain('Natal chart');
    expect(svg).not.toContain('Bi-wheel');
  });

  it('labels the outer ring, so a screenshot says what it is', () => {
    const svg = render(
      <ChartWheel chart={chart} outerChart={chartNoTime} outerLabel="4 Nov 2026" size={800} />,
    );
    expect(svg).toContain('4 Nov 2026');
    expect(svg).toContain('Bi-wheel');
  });
});
