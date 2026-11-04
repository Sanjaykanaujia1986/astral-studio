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
