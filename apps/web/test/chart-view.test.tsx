/**
 * The Chart Studio view controls.
 *
 * ## The property that matters
 *
 * These controls change the DRAWING and nothing else. The aspects are
 * computed whatever the checkbox says, and which ones exist is decided by the
 * orb profile — so hiding the lines must leave the aspect table exactly as it
 * was. A reader who unticks a box and watches rows disappear from a table has
 * been told, by the product, that an aspect stopped existing.
 *
 * That is the assertion this file is mostly here for. The rest is wiring.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { I18nProvider } from '@astro/i18n';
import {
  SwissEphWasmProvider, type BirthData,
} from '@astro/engine';
import { ChartStudioRoute } from '../src/shell/routes.js';
import { useChartStore } from '../src/state/chart.js';
import { useSettings, DEFAULT_DISPLAY_SETTINGS } from '../src/lib/settings.js';

let provider: SwissEphWasmProvider;

vi.mock('../src/lib/engine.js', () => ({
  getProvider: () => Promise.resolve(provider),
  getLocations: () => new Promise(() => {}),
}));

vi.mock('../src/lib/cloud.js', () => ({
  CloudError: class CloudError extends Error {
    code: string;
    constructor(code: string) { super(code); this.code = code; }
  },
  listCharts: () => Promise.resolve([]),
  getChartSettings: () => Promise.resolve({}),
  getOwnerKey: () => 'a'.repeat(64),
  setOwnerKey: () => true,
  saveChart: () => Promise.reject(new Error('not used')),
  deleteChart: () => Promise.resolve(),
}));

const MUMBAI: BirthData = {
  name: 'View Test',
  date: { year: 1990, month: 1, day: 15 },
  time: { hour: 14, minute: 30, second: 0 },
  zone: { kind: 'iana', zone: 'Asia/Kolkata' },
  place: { latitude: 18.9667, longitude: 72.8333, label: 'Mumbai, India' },
};

beforeAll(async () => {
  provider = new SwissEphWasmProvider();
  await provider.init();
}, 60_000);

afterAll(() => provider.close());

beforeEach(async () => {
  localStorage.clear();
  useSettings.setState({ ...DEFAULT_DISPLAY_SETTINGS });
  useChartStore.setState({ chart: null, busy: false, hydrating: false, errorCode: null });
  await useChartStore.getState().cast(MUMBAI, {}, 'standard');
});

afterEach(cleanup);

function renderStudio() {
  return render(
    <I18nProvider initialLocale="en">
      <MemoryRouter><ChartStudioRoute /></MemoryRouter>
    </I18nProvider>,
  );
}

/** The wheel's own SVG, found by the card that carries the view controls. */
function wheelSvg(): SVGSVGElement {
  const card = [...document.querySelectorAll('section')]
    .find((s) => /Chart view/.test(s.textContent ?? ''));
  const svg = card?.querySelector('svg');
  if (!svg) throw new Error('wheel not rendered');
  return svg as SVGSVGElement;
}

describe('what the view controls do not touch', () => {
  it('hides aspect lines without removing a single aspect from the table', async () => {
    const user = userEvent.setup();
    renderStudio();

    const table = screen.getByRole('table', { name: /aspect/i });
    const before = within(table).getAllByRole('row').length;
    const linesBefore = wheelSvg().querySelectorAll('line').length;
    expect(before).toBeGreaterThan(1);

    await user.click(screen.getByLabelText('Aspect lines'));

    // Fewer lines drawn...
    expect(wheelSvg().querySelectorAll('line').length).toBeLessThan(linesBefore);
    // ...and not one row fewer in the table.
    expect(within(screen.getByRole('table', { name: /aspect/i })).getAllByRole('row')).toHaveLength(
      before,
    );
  });

  it('says so in words, next to the control', () => {
    renderStudio();
    expect(screen.getByText(/These change the drawing, not the chart/i)).toBeInTheDocument();
    expect(screen.getByText(/decided by the orb profile/i)).toBeInTheDocument();
  });
});

describe('the controls themselves', () => {
  it('starts with aspects and ticks drawn, at the standard size', () => {
    renderStudio();
    expect(screen.getByLabelText('Aspect lines')).toBeChecked();
    expect(screen.getByLabelText('Degree ticks')).toBeChecked();
    expect(screen.getByLabelText('Figure size')).toHaveValue('standard');
  });

  it('draws the ticks and the aspects independently', async () => {
    const user = userEvent.setup();
    renderStudio();
    const all = wheelSvg().querySelectorAll('line').length;

    await user.click(screen.getByLabelText('Degree ticks'));
    const noTicks = wheelSvg().querySelectorAll('line').length;

    await user.click(screen.getByLabelText('Aspect lines'));
    const neither = wheelSvg().querySelectorAll('line').length;

    // Each removes its own share, and the shares do not overlap: if one
    // checkbox were wired to both settings these would collapse together.
    expect(noTicks).toBeLessThan(all);
    expect(neither).toBeLessThan(noTicks);
    expect(all - noTicks).not.toBe(all - neither);
  });

  it('changes the size the figure is capped at', async () => {
    const user = userEvent.setup();
    renderStudio();
    const wrapper = () => wheelSvg().parentElement!;
    expect(wrapper().style.maxWidth).toBe('680px');

    await user.selectOptions(screen.getByLabelText('Figure size'), 'compact');
    expect(wrapper().style.maxWidth).toBe('520px');

    await user.selectOptions(screen.getByLabelText('Figure size'), 'large');
    expect(wrapper().style.maxWidth).toBe('900px');
  });

  it('remembers the choices, like every other display setting', async () => {
    const user = userEvent.setup();
    renderStudio();
    await user.click(screen.getByLabelText('Aspect lines'));
    await user.selectOptions(screen.getByLabelText('Figure size'), 'large');

    const stored = JSON.parse(localStorage.getItem('astro.display')!) as Record<string, unknown>;
    expect(stored.wheelAspects).toBe(false);
    expect(stored.wheelSize).toBe('large');
  });
});
