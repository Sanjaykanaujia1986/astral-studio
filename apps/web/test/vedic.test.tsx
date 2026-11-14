/**
 * The Vedic workspace.
 *
 * The assertion that matters most here is the refusal: given a tropical chart,
 * the panel must say so and refuse to draw. A tropical chart read as Vedic is
 * the one error in this module that cannot be spotted by looking at the screen
 * — every graha sits in a plausible rāśi, roughly 24° from the right one — so
 * nothing but a test can keep the guard honest.
 *
 * The charts are real. A hand-built fixture would let the guard pass while the
 * thing it guards (`chart.settings.zodiac.kind`) was renamed underneath it.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { render, screen, cleanup, within, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { I18nProvider } from '@astro/i18n';
import {
  SwissEphWasmProvider,
  calculateNatalChart,
  type BirthData,
  type NatalChart,
} from '@astro/engine';
import { VedicPanel } from '../src/components/VedicPanel.js';

const MUMBAI: BirthData = {
  name: 'Test Subject',
  date: { year: 1990, month: 1, day: 15 },
  time: { hour: 14, minute: 30, second: 0 },
  zone: { kind: 'iana', zone: 'Asia/Kolkata' },
  place: { latitude: 18.9667, longitude: 72.8333, label: 'Mumbai, India' },
};

let provider: SwissEphWasmProvider;
let sidereal: NatalChart;
let tropical: NatalChart;

// The panel asks the app's singleton for a provider, to resolve real sunrise
// for the vāra. It gets the same instance the fixtures were cast with.
vi.mock('../src/lib/engine.js', () => ({
  getProvider: () => Promise.resolve(provider),
  getLocations: () => new Promise(() => {}),
}));

beforeAll(async () => {
  provider = new SwissEphWasmProvider();
  await provider.init();
  sidereal = calculateNatalChart(provider, MUMBAI, {
    settings: { zodiac: { kind: 'sidereal', ayanamsha: 'lahiri' }, nodeType: 'mean' },
  });
  tropical = calculateNatalChart(provider, MUMBAI, {
    settings: { zodiac: { kind: 'tropical' } },
  });
}, 60_000);

afterAll(() => provider.close());
afterEach(cleanup);

function renderPanel(chart: NatalChart, locale: 'en' | 'hi' | 'gu' = 'en') {
  return render(
    <I18nProvider initialLocale={locale}>
      <MemoryRouter>
        <VedicPanel chart={chart} />
      </MemoryRouter>
    </I18nProvider>,
  );
}

describe('the sidereal requirement', () => {
  it('refuses a tropical chart instead of silently misreading it', () => {
    const { container } = renderPanel(tropical);
    expect(screen.getByText(/needs sidereal longitudes/i)).toBeInTheDocument();
    // And draws nothing: no figure, no placement table, no daśā.
    expect(container.querySelector('svg')).toBeNull();
    expect(container.querySelector('table')).toBeNull();
  });

  it('names the size of the error it is refusing to make', () => {
    // "24 degrees" is the whole reason for the refusal. A bare "wrong zodiac"
    // leaves the reader free to assume it is a preference.
    renderPanel(tropical);
    expect(screen.getByText(/about 24°/)).toBeInTheDocument();
  });

  it('offers the way out', () => {
    renderPanel(tropical);
    expect(screen.getByRole('link', { name: /Chart Studio/ }))
      .toHaveAttribute('href', '/chart');
  });

  it('renders a sidereal chart', () => {
    renderPanel(sidereal);
    expect(screen.queryByText(/needs sidereal longitudes/i)).not.toBeInTheDocument();
    expect(screen.getByRole('img', { name: /North Indian/ })).toBeInTheDocument();
  });
});

describe('placements', () => {
  it('gives every graha a rāśi, a nakṣatra and a pāda', () => {
    renderPanel(sidereal);
    const table = screen.getAllByRole('table')[0]!;
    const rows = within(table).getAllByRole('row');
    // Header, lagna, then one row per body.
    expect(rows.length).toBe(2 + sidereal.bodies.length);

    /*
     * The Sun's own line, in full: 1.23° Capricorn, eighth bhāva from a Gemini
     * lagna, Uttarāṣāḍhā pāda 2. Facts of the fixture rather than of the
     * layout, so they fail loudly if the sidereal conversion, the whole-sign
     * counting or the nakṣatra arithmetic drifts. The degree and the rāśi
     * share one cell, so the match spans both.
     */
    const sun = rows.find((r) => within(r).queryByText(/^Sun$/));
    expect(sun).toBeDefined();
    /*
     * Bhāva 9, not 8. These expectations were written against a lagna that
     * was the TROPICAL ascendant — the provider called `swe_houses`, which
     * has no flags and always answers tropical, so a sidereal chart got
     * sidereal bodies and tropical houses. The lagna moved a whole sign when
     * that was fixed, and every whole-sign house count moved with it.
     */
    expect(sun!.textContent).toBe("Sun01°13' Capricorn9Uttarāṣāḍhā2");
  });

  it('counts houses from the lagna, whole-sign', () => {
    renderPanel(sidereal);
    const table = screen.getAllByRole('table')[0]!;
    const lagna = within(table).getByRole('row', { name: /Lagna/ });
    // The lagna's own house is 1 by definition, and its degree is shown: in
    // Jyotiṣa the exact lagna decides the nakṣatra and pāda of the chart.
    /*
     * Taurus 8°09', not Gemini 1°53'. The old value was the tropical
     * ascendant: 61.8875° minus the 1990 ayanaṁśa of 23.7215° is 38.1660°,
     * which is Taurus 8.166°. Verified against an independently printed
     * jātaka, and held by the invariant in packages/engine/test/reference.
     */
    expect(lagna.textContent).toBe("Lagna08°09' Taurus1Kṛttikā4");
  });
});

describe('the daśā', () => {
  it('offers the three daśā systems, Viṁśottarī first, with their lords', () => {
    renderPanel(sidereal);
    expect(screen.getByRole('heading', { name: 'Daśā' })).toBeInTheDocument();
    const system = screen.getByLabelText('Daśā system') as HTMLSelectElement;
    expect(system.value).toBe('vimshottari');
    expect(within(system).getAllByRole('option').map((o) => o.textContent)).toEqual(['Viṁśottarī (120)', 'Aṣṭottarī (108)', 'Yoginī (36)']);
    expect(screen.getAllByText('Śukra').length).toBeGreaterThan(0);
  });

  it('states the year length, because programs differ on it', () => {
    renderPanel(sidereal);
    // Printed horoscopes count a daśā year as 365.25 days.
    expect((screen.getByLabelText('Daśā year length') as HTMLSelectElement).value).toBe('julian');
  });

  it('shows the balance at birth, not the elapsed part', () => {
    renderPanel(sidereal);
    const balance = screen.getByText(/Balance at birth/);
    // Whatever the figure, it cannot exceed the first lord's full term.
    const years = Number(/(\d+) y \d+ m \d+ d/.exec(balance.textContent ?? '')?.[1]);
    expect(years).toBeGreaterThanOrEqual(0);
    expect(years).toBeLessThanOrEqual(20);
  });
});

describe('the pañcāṅga', () => {
  it('shows all five limbs once sunrise has been resolved', async () => {
    renderPanel(sidereal);
    // The vāra waits for the provider; the other four do not.
    const panchang = within(screen.getByRole('heading', { name: 'Pañcāṅga' }).closest('section')!);
    expect(panchang.getByText('Tithi')).toBeInTheDocument();
    expect(panchang.getByText('Yoga')).toBeInTheDocument();
    expect(panchang.getByText('Karaṇa')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText(/Somavāra|Ravivāra|Maṅgalavāra|Budhavāra|Guruvāra|Śukravāra|Śanivāra/))
        .toBeInTheDocument();
    });
    // 15 January 1990 was a Monday.
    expect(screen.getByText('Somavāra')).toBeInTheDocument();
  });
});

describe('what the panel declares about itself', () => {
  it('names the ayanāṁśa and the node variety in use', () => {
    renderPanel(sidereal);
    expect(screen.getByText(/Lahiri/)).toBeInTheDocument();
    expect(screen.getByText(/Mean nodes/)).toBeInTheDocument();
  });

  it('says that Jyotiṣa results are not comparable across conventions', () => {
    renderPanel(sidereal);
    expect(screen.getByText(/not comparable across them/i)).toBeInTheDocument();
  });
});

describe('translation', () => {
  it('translates the workspace into Hindi, nakṣatra names included', () => {
    renderPanel(sidereal, 'hi');
    const table = screen.getAllByRole('table')[0]!;
    const sun = within(table).getAllByRole('row')
      .find((r) => within(r).queryByText(/^सूर्य$/));
    // The same line as the English assertion above: same numbers, same
    // nakṣatra, in Devanāgarī.
    // Bhāva 9 here too — the same tropical-lagna correction.
    expect(sun?.textContent).toBe("सूर्य01°13' मकर9उत्तराषाढा2");
  });

  it('leaves no English chrome in the Gujarati panel', () => {
    renderPanel(sidereal, 'gu');
    expect(screen.queryByText('Placements')).not.toBeInTheDocument();
    expect(screen.queryByText('Chart style')).not.toBeInTheDocument();
  });
});
