/**
 * The complete kuṇḍalī booklet.
 *
 * What matters is agreement: the booklet is printed from the Vedic page and
 * read against it, so its daśā dates and divisional charts must be the
 * engine's own, not a second calculation. The rest is the booklet doing what
 * its switches say, in each language.
 *
 * Synthetic birth data only.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor, within, configure } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { I18nProvider } from '@astro/i18n';
import { VedicChartFigure, LIGHT_THEME, paperSpec } from '@astro/ui';
import { SwissEphWasmProvider, calculateNatalChart, type BirthData, type NatalChart } from '@astro/engine';
import { vedicChart, grahaLongitudes, shodashavarga, dashas, localMidnightJd, YEAR_LENGTHS, varshaphal } from '@astro/vedic';
import { ReportPanel } from '../src/components/ReportPanel.js';
import { KundliBooklet } from '../src/components/vedic/KundliBooklet.js';
import { localDate } from '../src/components/vedic/shared.js';

const SYNTHETIC: BirthData = {
  name: 'Test Subject',
  date: { year: 1990, month: 1, day: 15 },
  time: { hour: 14, minute: 30, second: 0 },
  zone: { kind: 'iana', zone: 'Asia/Kolkata' },
  place: { latitude: 18.9667, longitude: 72.8333, label: 'Mumbai, India' },
};

let provider: SwissEphWasmProvider;
let sidereal: NatalChart;

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
}, 60_000);

afterAll(() => provider.close());

// The booklet is a lazy chunk with a lot to lay out; the first render under a full parallel run is slow.
configure({ asyncUtilTimeout: 20_000 });
afterEach(cleanup);

/** Only the named switches on, so each test lays out the sheets it is about. */
const only = (...on: string[]) => Object.fromEntries(
  ['charts', 'vargas', 'tables', 'strength', 'yogas', 'dasha', 'otherDashas', 'kp', 'western', 'annual', 'transits', 'matching']
    .map((k) => [k, on.includes(k)]),
);

function booklet(sections: Record<string, boolean>, locale: 'en' | 'hi' | 'gu' = 'en') {
  return render(
    <I18nProvider initialLocale={locale}>
      <MemoryRouter>
        <KundliBooklet
          chart={sidereal}
          paper={paperSpec('a4', 'portrait')}
          sections={sections}
          attribution="test"
          generatedIso="2026-11-19T06:00:00Z"
        />
      </MemoryRouter>
    </I18nProvider>,
  );
}

describe('the report type', () => {
  it('opens the booklet from ?type=kundli, with its own switches', async () => {
    render(
      <I18nProvider initialLocale="en">
        <MemoryRouter initialEntries={['/reports?type=kundli']}>
          <ReportPanel chart={sidereal} />
        </MemoryRouter>
      </I18nProvider>,
    );
    expect((screen.getByLabelText('Report') as HTMLSelectElement).value).toBe('kundli');
    expect(await screen.findByText('Complete horoscope')).toBeTruthy();
    const include = screen.getByRole('group', { name: 'Include' });
    expect(within(include).getByLabelText('16 divisional charts')).toBeTruthy();
    expect((screen.getByLabelText('Native') as HTMLSelectElement).value).toBe('male');
  }, 60_000);
});

describe('the booklet', () => {
  it('prints the engine’s Viṁśottarī dates, to pratyantar', async () => {
    const { container } = booklet(only('dasha'));
    await screen.findByText('Viṁśottarī pratyantar daśā');
    const g = grahaLongitudes(vedicChart(sidereal, { vimshottari: { yearLength: 'julian' } }));
    const want = dashas('vimshottari', g.lon.moon, sidereal.jdUT, {
      yearDays: YEAR_LENGTHS.julian, anchor: 'civilDate',
      localMidnightJd: localMidnightJd(sidereal.jdUT, sidereal.offsetMinutes), spanYears: 120,
    });
    const page = container.querySelector('[data-kundli-page="dasha-vimshottari"]')!;
    const ends = [...page.querySelectorAll('tbody')][0]!.querySelectorAll('tr td:nth-child(3)');
    expect([...ends].map((e) => e.textContent)).toEqual(want.mahadashas.map((m) => localDate(m.endJd, sidereal.offsetMinutes)));
    // Nine mahādaśās, each with its antardaśās laid out to their pratyantars.
    const pr = container.querySelector('[data-kundli-page="pratyantar-vimshottari"]')!;
    expect(pr.querySelectorAll('section').length).toBe(want.mahadashas.length);
  }, 60_000);

  it('draws all sixteen vargas from the engine’s ṣoḍaśavarga', async () => {
    const { container } = booklet(only('vargas'));
    await waitFor(() => expect(container.querySelectorAll('[data-kundli-page^="vargas"] svg[role="img"]').length).toBe(16));
    const labels = [...container.querySelectorAll('[data-kundli-page^="vargas"] svg[role="img"]')].map((s) => s.getAttribute('aria-label')!.split(' — ')[1]);
    expect(labels).toEqual(['D1', 'D2', 'D3', 'D4', 'D7', 'D9', 'D10', 'D12', 'D16', 'D20', 'D24', 'D27', 'D30', 'D40', 'D45', 'D60']);
    // The D60 lagna cell carries the sign the engine computes for it.
    const v = shodashavarga(grahaLongitudes(vedicChart(sidereal)));
    const d60 = [...container.querySelectorAll('svg[role="img"]')].find((s) => s.getAttribute('aria-label')!.endsWith('D60'))!;
    const lagnaCell = [...d60.querySelectorAll('g')].find((c) => c.querySelector('polygon')!.getAttribute('fill') !== 'none')!;
    expect(lagnaCell.querySelector('text')!.textContent).toBe(String(v[60]!.lagna + 1));
  }, 60_000);

  it('prints every varṣa chart from the birth year, with the engine’s mudda dates', async () => {
    const { container } = booklet(only('annual'));
    await waitFor(() => expect(container.querySelectorAll('[data-kundli-page^="varsha-"] [data-varsha-age]').length).toBe(96), { timeout: 40_000 });
    expect(container.querySelectorAll('[data-kundli-page^="varsha-"]').length).toBe(12);
    const v = varshaphal(provider, {
      birthJd: sidereal.jdUT, latitude: sidereal.place.latitude, longitude: sidereal.place.longitude,
      zodiac: sidereal.settings.zodiac, node: 'meanNode', utcOffsetMinutes: sidereal.offsetMinutes,
    }, 36);
    const year = container.querySelector('[data-varsha-age="36"]')!;
    const ends = [...year.querySelectorAll('tbody tr td:nth-child(2)')].map((e) => e.textContent);
    expect(ends).toEqual(v.mudda.map((m) => localDate(m.endJd, sidereal.offsetMinutes)));
    // The Muntha is drawn in its sign.
    const mu = [...year.querySelectorAll('svg text')].find((x) => x.textContent === 'Mu')!;
    expect(mu.closest('g')!.querySelector('text')!.textContent).toBe(String(v.muntha + 1));
  }, 60_000);

  it('leaves out the sheets that are switched off', async () => {
    const { container } = booklet(only('yogas'));
    await screen.findByRole('heading', { name: 'Birth particulars' });
    expect(container.querySelector('[data-kundli-page="kp"]')).toBeNull();
    expect(container.querySelector('[data-kundli-page^="vargas"]')).toBeNull();
    expect(container.querySelector('[data-kundli-page="yogas"]')).not.toBeNull();
    // The contents list follows the switches.
    expect(screen.queryByText('Krishnamurti Paddhati (KP)')).toBeNull();
  }, 60_000);

  it('fills in the ephemeris sheets once the provider resolves', async () => {
    const { container } = booklet(only('strength', 'kp'));
    await waitFor(() => expect(screen.queryByText('Calculating…')).toBeNull());
    expect(container.querySelector('[data-kundli-page="kp-events"] table')).not.toBeNull();
    expect(container.querySelector('[data-kundli-page="shadbala"] table')).not.toBeNull();
  }, 60_000);

  it('prints in Gujarati, without tracking the script apart', async () => {
    const { container } = booklet(only(), 'gu');
    expect(await screen.findByText('સંપૂર્ણ જન્માક્ષર')).toBeTruthy();
    expect(container.querySelector('.kundli-indic')).not.toBeNull();
  }, 60_000);
});

describe('the chart figure with given placements', () => {
  it('draws the signs it is given, each graha in its planet colour', () => {
    const vchart = vedicChart(sidereal);
    const { container } = render(
      <I18nProvider initialLocale="en">
        <VedicChartFigure
          chart={vchart} size={600} tinted label="Test"
          placements={{ lagnaSignIndex: 3, bodies: [{ body: 'sun', signIndex: 5 }, { body: 'rahu', signIndex: 9 }] }}
        />
      </I18nProvider>,
    );
    const svg = container.querySelector('svg')!;
    expect(svg.getAttribute('aria-label')).toMatch(/— Test$/);
    const cells = [...svg.querySelectorAll('g')];
    const lagna = cells.find((c) => c.querySelector('polygon')!.getAttribute('fill') !== 'none')!;
    expect(lagna.querySelector('text')!.textContent).toBe('4');
    const sun = [...svg.querySelectorAll('text')].find((x) => x.textContent === 'Su')!;
    expect(sun.getAttribute('fill')).toBe(LIGHT_THEME.planets.sun);
    expect(sun.closest('g')!.querySelector('text')!.textContent).toBe('6');
    // Rāhu by its graha id gets its short name too, not a two-letter slice of the id.
    expect([...svg.querySelectorAll('text')].some((x) => x.textContent === 'Ra')).toBe(true);
  });

  it('keeps graha names in ink unless tinted', () => {
    const vchart = vedicChart(sidereal);
    const { container } = render(
      <I18nProvider initialLocale="en">
        <VedicChartFigure chart={vchart} size={600} placements={{ lagnaSignIndex: 0, bodies: [{ body: 'sun', signIndex: 0 }] }} />
      </I18nProvider>,
    );
    const sun = [...container.querySelectorAll('text')].find((x) => x.textContent === 'Su')!;
    expect(sun.getAttribute('fill')).toBe(LIGHT_THEME.ink);
  });
});

