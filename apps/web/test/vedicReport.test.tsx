/**
 * The printed Vedic horoscope.
 *
 * The test that matters most is agreement: the printout must carry the same
 * daśā dates as the Vedic page the reader checked it against. Everything else
 * — which sheets exist, the sidereal refusal, the translation — is the report
 * builder doing what its controls say.
 *
 * Synthetic birth data only.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { render, screen, cleanup, within, waitFor, fireEvent, configure } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { I18nProvider } from '@astro/i18n';
import {
  SwissEphWasmProvider,
  calculateNatalChart,
  type BirthData,
  type NatalChart,
} from '@astro/engine';
import { ReportPanel } from '../src/components/ReportPanel.js';
import { VedicPanel } from '../src/components/VedicPanel.js';

const SYNTHETIC: BirthData = {
  name: 'Test Subject',
  date: { year: 1990, month: 1, day: 15 },
  time: { hour: 14, minute: 30, second: 0 },
  zone: { kind: 'iana', zone: 'Asia/Kolkata' },
  place: { latitude: 18.9667, longitude: 72.8333, label: 'Mumbai, India' },
};

let provider: SwissEphWasmProvider;
let sidereal: NatalChart;
let tropical: NatalChart;

vi.mock('../src/lib/engine.js', () => ({
  getProvider: () => Promise.resolve(provider),
  getLocations: () => new Promise(() => {}),
}));

beforeAll(async () => {
  provider = new SwissEphWasmProvider();
  await provider.init();
  sidereal = calculateNatalChart(provider, SYNTHETIC, {
    settings: { zodiac: { kind: 'sidereal', ayanamsha: 'lahiri' }, nodeType: 'mean' },
  });
  tropical = calculateNatalChart(provider, SYNTHETIC, {
    settings: { zodiac: { kind: 'tropical' } },
  });
}, 60_000);

afterAll(() => provider.close());

// The report is a lazy chunk; its first import under a full parallel run takes longer than the 1s default.
configure({ asyncUtilTimeout: 10_000 });
afterEach(cleanup);

function renderReport(chart: NatalChart, url = '/reports?type=vedic', locale: 'en' | 'hi' | 'gu' = 'en') {
  return render(
    <I18nProvider initialLocale={locale}>
      <MemoryRouter initialEntries={[url]}>
        <ReportPanel chart={chart} />
      </MemoryRouter>
    </I18nProvider>,
  );
}

/** Rows of the first table under a heading, as cell text. */
function tableAfter(container: HTMLElement, heading: RegExp): string[][] {
  const h = [...container.querySelectorAll('h2')].find((x) => heading.test(x.textContent ?? ''));
  if (!h) throw new Error(`no heading ${heading}`);
  let el: Element | null = h.nextElementSibling;
  while (el && !el.querySelector('table')) el = el.nextElementSibling;
  const table = el!.querySelector('table')!;
  return [...table.querySelectorAll('tbody tr')].map((r) => [...r.children].map((c) => (c.textContent ?? '').trim()));
}

describe('the report type', () => {
  it('opens on the Vedic horoscope from the link the Vedic page uses', async () => {
    renderPanel();
    const link = screen.getByRole('link', { name: 'Print horoscope' });
    expect(link.getAttribute('href')).toBe('/reports?type=vedic');
    cleanup();

    renderReport(sidereal);
    expect((screen.getByLabelText('Report') as HTMLSelectElement).value).toBe('vedic');
    expect(await screen.findByText('Janma kuṇḍalī')).toBeTruthy();
  });

  it('stays on the Western report without the parameter', () => {
    renderReport(sidereal, '/reports');
    expect((screen.getByLabelText('Report') as HTMLSelectElement).value).toBe('western');
    expect(screen.queryByText('Janma kuṇḍalī')).toBeNull();
  });

  it('refuses a tropical chart, as the Vedic page does', () => {
    renderReport(tropical);
    expect(screen.getByText(/sidereal/i)).toBeTruthy();
    expect(screen.queryByText('Janma kuṇḍalī')).toBeNull();
    expect((screen.getByRole('button', { name: 'Print / Save as PDF' }) as HTMLButtonElement).disabled).toBe(true);
  });
});

function renderPanel() {
  return render(
    <I18nProvider initialLocale="en">
      <MemoryRouter>
        <VedicPanel chart={sidereal} />
      </MemoryRouter>
    </I18nProvider>,
  );
}

describe('the printed horoscope', () => {
  it('draws the lagna and navāṁśa charts', async () => {
    const { container } = renderReport(sidereal);
    await screen.findByText('Lagna chart (D1)');
    expect(screen.getByText('Navāṁśa chart (D9)')).toBeTruthy();
    const figures = [...container.querySelectorAll('.report-root svg[role="img"]')].map((s) => s.getAttribute('aria-label') ?? '');
    expect(figures.some((l) => l.endsWith('D1'))).toBe(true);
    expect(figures.some((l) => l.endsWith('D9'))).toBe(true);
  });

  it('prints the same mahādaśā dates as the Vedic page', async () => {
    const page = renderPanel();
    const screenRows = tableAfter(page.container, /^Daśā$/).map((r) => [r[1], r[2]]);
    cleanup();

    const { container } = renderReport(sidereal);
    await screen.findByText('Viṁśottarī mahādaśā');
    const printed = tableAfter(container, /mahādaśā/).map((r) => [r[1], r[2]]);
    expect(printed.length).toBeGreaterThanOrEqual(9);
    expect(printed).toEqual(screenRows);
  });

  it('lists the antardaśās of every mahādaśā', async () => {
    const { container } = renderReport(sidereal);
    await screen.findByText('Antardaśā (end dates) · UTC+05:30');
    const blocks = container.querySelectorAll('.report-root .grid-cols-3 > .report-block');
    expect(blocks.length).toBe(tableAfter(container, /mahādaśā/).length);
    // A full mahādaśā has nine antardaśās; only the first can be cut short by the birth.
    expect(blocks[1]!.querySelectorAll('tr').length).toBe(9);
  });

  it('fills in the sections that need the ephemeris once it resolves', async () => {
    const { container } = renderReport(sidereal);
    await waitFor(() => expect(screen.queryByText('Calculating…')).toBeNull());
    expect(tableAfter(container, /^Ṣaḍbala$/).length).toBe(5);
    expect(tableAfter(container, /^Sāḍe-sātī$/).length).toBeGreaterThan(0);
  });

  it('leaves out a section that is switched off', async () => {
    const { container } = renderReport(sidereal);
    await screen.findByText('Viṁśottarī mahādaśā');
    const pages = container.querySelectorAll('.report-page').length;
    fireEvent.click(within(screen.getByRole('group', { name: 'Include' })).getByLabelText('Daśā'));
    expect(screen.queryByText('Viṁśottarī mahādaśā')).toBeNull();
    expect(container.querySelectorAll('.report-page').length).toBe(pages - 1);
  });

  it('prints in Hindi', async () => {
    renderReport(sidereal, '/reports?type=vedic', 'hi');
    expect(await screen.findByText('जन्म कुंडली')).toBeTruthy();
    expect(screen.getByText('लग्न कुंडली (D1)')).toBeTruthy();
    expect(screen.getByText('विंशोत्तरी महादशा')).toBeTruthy();
  });
});
