/**
 * Gann Lab.
 *
 * Two properties are worth a test more than any pixel here.
 *
 * The first is the refusal to draw without a scale. A Gann fan whose slope is
 * not tied to a stated price-per-bar is a decorative line, and it is
 * indistinguishable on screen from one that means something.
 *
 * The second is that the workspace never presents a construction as a finding.
 * The disclosure is asserted, the "not built" list is asserted, and the
 * projection's arithmetic is asserted to be printed, because the derivation is
 * what lets a reader check rather than believe.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { I18nProvider } from '@astro/i18n';
import {
  SwissEphWasmProvider, calculateNatalChart, type BirthData, type NatalChart,
} from '@astro/engine';
import { makeSeries, type Bar } from '@astro/research';
import { GannPanel } from '../src/components/GannPanel.js';
import { useSeriesStore } from '../src/state/series.js';
import { useChartStore } from '../src/state/chart.js';
import { useGannWorkspace } from '../src/state/gann-workspace.js';

let provider: SwissEphWasmProvider;
let chart: NatalChart;

vi.mock('../src/lib/engine.js', () => ({
  getProvider: () => Promise.resolve(provider),
  getLocations: () => new Promise(() => {}),
}));

const MUMBAI: BirthData = {
  name: 'Test Subject',
  date: { year: 1990, month: 1, day: 15 },
  time: { hour: 14, minute: 30, second: 0 },
  zone: { kind: 'iana', zone: 'Asia/Kolkata' },
  place: { latitude: 18.9667, longitude: 72.8333, label: 'Mumbai, India' },
};

/**
 * A deliberately simple series: 21 bars, a V with its low at index 10.
 * Straight arithmetic so every assertion below can be checked by hand.
 */
const BARS: readonly Bar[] = Array.from({ length: 21 }, (_, i) => ({
  date: `2024-01-${String(i + 1).padStart(2, '0')}`,
  close: 100 + Math.abs(i - 10) * 2,
}));

beforeAll(async () => {
  provider = new SwissEphWasmProvider();
  await provider.init();
  chart = calculateNatalChart(provider, MUMBAI, {});
}, 60_000);

afterAll(() => provider.close());

beforeEach(() => {
  useSeriesStore.setState({ series: null, rejected: 0, fileName: null, errorCode: null });
  useChartStore.setState({ chart: null, busy: false, errorCode: null });
});

beforeEach(() => {
  // Both persist to localStorage, so one test's template would otherwise
  // appear in the next test's list.
  localStorage.clear();
  useGannWorkspace.setState({ templates: [], annotations: [] });
});

afterEach(cleanup);

function renderPanel(locale: 'en' | 'hi' | 'gu' = 'en') {
  return render(
    <I18nProvider initialLocale={locale}>
      <MemoryRouter><GannPanel /></MemoryRouter>
    </I18nProvider>,
  );
}

const loadSeries = () => useSeriesStore.setState({ series: makeSeries('TEST', BARS) });

describe('what the workspace says about itself', () => {
  it('states that nothing here is a signal, a target or a level', () => {
    renderPanel();
    expect(screen.getByText(/Nothing here is a signal, a target or a level/i))
      .toBeInTheDocument();
  });

  it('points at Research for the question this workspace will not answer', () => {
    renderPanel();
    expect(screen.getByText(/p-value and a multiple-comparison correction/i))
      .toBeInTheDocument();
  });

  it('lists what it deliberately did not build', () => {
    renderPanel();
    expect(screen.getByText(/Not built in this release/i)).toBeInTheDocument();
    /*
     * The list SHRINKS as things get built, which is the point of keeping it
     * in the workspace rather than in a document: the circular and polygon
     * layouts left it, then the Square of 144 and export. What remains is
     * what genuinely is not there.
     */
    expect(screen.getByText(/Market-data provider/)).toBeInTheDocument();
    // Annotations, templates, export and the Square of 144 have all left the
    // list since it was written. What remains is what genuinely is not there.
    expect(screen.queryByText(/Square of 144/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Annotations, saved templates/)).not.toBeInTheDocument();
  });
});

describe('the construction picker', () => {
  it('offers the three layouts as separate constructions', async () => {
    const user = userEvent.setup();
    renderPanel();
    const picker = screen.getByLabelText('Construction');
    expect(picker).toBeInTheDocument();

    await user.selectOptions(picker, 'circle');
    expect(screen.getByRole('img', { name: /Wheel of 24/ })).toBeInTheDocument();
    // And it says, where the reader is looking, that this is not the square
    // with different edges — the two angles are different functions.
    expect(screen.getByText(/linear in the value; the square/i)).toBeInTheDocument();

    await user.selectOptions(picker, 'polygon');
    expect(screen.getByRole('img', { name: /6-sided spiral/ })).toBeInTheDocument();
  });
});

describe('the Square of Nine', () => {
  it('draws the published layout and names its settings', () => {
    renderPanel();
    const figure = screen.getByRole('img', { name: /Square of Nine/ });
    expect(figure).toBeInTheDocument();
    expect(screen.getByText(/Origin 1, step 1/)).toBeInTheDocument();
  });

  it('warns that the grid and the spiral angle are different constructions', () => {
    // The defect this whole module is organised around: reading an angle off
    // the printed grid and feeding it to the √ formula mixes two systems.
    renderPanel();
    expect(screen.getByText(/4 sits due south of centre/)).toBeInTheDocument();
  });

  it('redraws when the origin changes', async () => {
    const user = userEvent.setup();
    renderPanel();
    const origin = screen.getByLabelText('Centre value');
    await user.clear(origin);
    await user.type(origin, '100');
    expect(screen.getByText(/Origin 100, step 1/)).toBeInTheDocument();
  });
});

describe('the fan', () => {
  it('asks for a series rather than inventing prices', () => {
    renderPanel();
    expect(screen.getByText(/A fan is anchored to a price series/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Research/ })).toHaveAttribute('href', '/research');
  });

  it('anchors to the lowest close by default and scales every ratio', () => {
    loadSeries();
    renderPanel();
    // The V bottoms at index 10, price 100.
    expect(screen.getByLabelText('Anchor bar')).toHaveValue(10);

    const table = screen.getAllByRole('table')[0]!;
    const primary = within(table).getByRole('row', { name: /^1×1/ });
    // 1 price unit per bar, ten bars from the anchor to the last: 110.
    expect(primary.textContent).toContain('110');
  });

  it('refuses to draw a fan when the scale is not usable', () => {
    /*
     * The assertion this file exists for. "1×1" names no line until the
     * reader says what one bar is worth in price, so a zero scale produces a
     * stated refusal rather than a flat fan that looks deliberate.
     */
    loadSeries();
    renderPanel();
    const priceUnits = screen.getByLabelText('Price units');
    expect(screen.queryByText(/names no line/i)).not.toBeInTheDocument();

    useSeriesStore.setState({ series: makeSeries('TEST', BARS) });
    priceUnits.focus();
    return userEvent.clear(priceUnits).then(() => userEvent.type(priceUnits, '0')).then(() => {
      expect(screen.getByRole('alert').textContent).toMatch(/names no line/i);
      expect(screen.queryByRole('row', { name: /^1×1/ })).not.toBeInTheDocument();
    });
  });

  it('prints the scale on the figure, where a screenshot carries it', () => {
    loadSeries();
    renderPanel();
    expect(screen.getByRole('img', { name: /Gann fan anchored at 2024-01-11/ }))
      .toBeInTheDocument();
  });

  it('says that time is bars, not calendar days', () => {
    loadSeries();
    renderPanel();
    expect(screen.getByText(/bars, not calendar days/i)).toBeInTheDocument();
  });

  it('measures the move from the anchor and names the nearest standard ratio', () => {
    loadSeries();
    renderPanel();
    // Anchor (10, 100) to last (20, 120): 10 bars, +20, twice the 1×1.
    const measured = screen.getByText(/10 bars, 20 price/);
    expect(measured.textContent).toContain('2×1');
  });

  it('says the degree figure describes the axes, not the market', () => {
    loadSeries();
    renderPanel();
    expect(screen.getByText(/describes the axes, not the market/i)).toBeInTheDocument();
  });
});

describe('the planetary projection', () => {
  it('asks for a chart rather than inventing longitudes', () => {
    renderPanel();
    expect(screen.getByText(/reads planetary longitudes from a chart/i)).toBeInTheDocument();
  });

  it('projects every body and prints the arithmetic that produced each price', () => {
    useChartStore.setState({ chart });
    renderPanel();
    const table = screen.getAllByRole('table').at(-1)!;
    const sun = within(table).getByRole('row', { name: /^Sun/ });
    // Linear, 1 unit per degree, from a base of 0°: the price IS the longitude.
    expect(sun.textContent).toMatch(/294\./);
    // And the derivation is on screen, so the reader can check rather than believe.
    expect(sun.textContent).toContain('× 1');
  });

  it('names the zodiac, because tropical and sidereal differ by about 24°', () => {
    useChartStore.setState({ chart });
    renderPanel();
    expect(screen.getByText(/Tropical longitudes from the chart/)).toBeInTheDocument();
    expect(screen.getByText(/differ by about 24°/)).toBeInTheDocument();
  });

  it('warns that picking the turn nearest the price is fitting after the fact', async () => {
    const user = userEvent.setup();
    useChartStore.setState({ chart });
    loadSeries();
    renderPanel();
    await user.selectOptions(screen.getByLabelText('Mapping'), 'square');
    expect(screen.getByText(/fitting after the fact, not a method/i)).toBeInTheDocument();
  });
});

describe('the Square of 144', () => {
  it('is off until asked for, and then states all three inputs', async () => {
    const user = userEvent.setup();
    loadSeries();
    renderPanel();

    expect(screen.queryByLabelText('Price per cell')).not.toBeInTheDocument();
    await user.click(screen.getByLabelText(/Overlay a price.time grid/));

    // None of the three has a default worth guessing, so all three are shown.
    expect(screen.getByLabelText('Price per cell')).toBeInTheDocument();
    expect(screen.getByLabelText('Bars per cell')).toBeInTheDocument();
    expect(screen.getByLabelText('Cells per side')).toBeInTheDocument();
    expect(screen.getByText(/144×144 from the fan/)).toBeInTheDocument();
  });

  it('says that its diagonal is the 1×1 on the same scale', () => {
    // Two statements of the same price-per-bar. A reader offered both without
    // being told they agree would reasonably assume they are independent.
    loadSeries();
    renderPanel();
    return userEvent.click(screen.getByLabelText(/Overlay a price.time grid/)).then(() => {
      expect(screen.getByText(/diagonal is the 1×1 on this scale/)).toBeInTheDocument();
    });
  });
});

describe('export', () => {
  it('offers the drawing as a file, with its settings in the title', () => {
    renderPanel();
    expect(screen.getAllByRole('button', { name: 'Download SVG' }).length)
      .toBeGreaterThan(0);
  });
});

describe('notes and templates', () => {
  it('pins a note to a bar and a price, not to the canvas', async () => {
    /*
     * The distinction worth testing: a note fixed to a pixel drifts off its
     * point the first time the figure is resized, and a note pointing at the
     * wrong bar is worse than no note.
     */
    const user = userEvent.setup();
    loadSeries();
    renderPanel();

    await user.type(screen.getByLabelText('Note'), 'low of the move');
    const bar = screen.getByLabelText('Bar');
    await user.clear(bar);
    await user.type(bar, '10');
    await user.click(screen.getByRole('button', { name: 'Pin to the price chart' }));

    // Twice over, and both matter: once drawn on the figure at its data
    // point, once in the list where it can be removed.
    const occurrences = screen.getAllByText('low of the move');
    expect(occurrences).toHaveLength(2);
    expect(occurrences.some((node) => node.tagName.toLowerCase() === 'text')).toBe(true);
    expect(screen.getByText(/bar 10/)).toBeInTheDocument();
  });

  it('saves the settings as a template and puts them back', async () => {
    const user = userEvent.setup();
    renderPanel();

    const origin = screen.getByLabelText('Centre value');
    await user.clear(origin);
    await user.type(origin, '250');
    await user.type(screen.getByLabelText('Template name'), 'wheat');
    await user.click(screen.getByRole('button', { name: 'Save current settings' }));

    // Change the setting, then restore it from the template.
    await user.clear(origin);
    await user.type(origin, '1');
    expect(screen.getByText(/Origin 1, step 1/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'wheat' }));
    expect(screen.getByText(/Origin 250, step 1/)).toBeInTheDocument();
  });

  it('says where notes and templates are kept', () => {
    renderPanel();
    expect(screen.getByText(/kept in this browser only/i)).toBeInTheDocument();
  });
});

describe('translation', () => {
  it('leaves no English chrome in the Hindi workspace', () => {
    renderPanel('hi');
    expect(screen.queryByText('Square of Nine')).not.toBeInTheDocument();
    expect(screen.queryByText('Centre value')).not.toBeInTheDocument();
  });

  it('translates the disclosure into Gujarati', () => {
    renderPanel('gu');
    expect(screen.getByText(/સંકેત, લક્ષ્ય કે સ્તર નથી/)).toBeInTheDocument();
  });
});
