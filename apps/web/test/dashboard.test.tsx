/**
 * The dashboard.
 *
 * A landing screen is where fabrication is most tempting and hardest to spot:
 * a plausible "upcoming events" list looks exactly like a real one. So the
 * assertions here are mostly about what the page does when it has nothing —
 * each pane must say why it is empty rather than fill itself.
 *
 * The distinction that matters most is between "no saved charts" and "the
 * database could not be reached". Showing the first when the second is true
 * tells the reader their charts are gone.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { I18nProvider } from '@astro/i18n';
import {
  SwissEphWasmProvider, calculateNatalChart, type BirthData, type NatalChart,
} from '@astro/engine';
import { DashboardPanel } from '../src/components/DashboardPanel.js';
import { useChartStore } from '../src/state/chart.js';
import { useAlerts } from '../src/state/alerts.js';

let provider: SwissEphWasmProvider;
let chart: NatalChart;

const listCharts = vi.fn();
const getChartSettings = vi.fn(() => Promise.resolve({}));

vi.mock('../src/lib/engine.js', () => ({
  getProvider: () => Promise.resolve(provider),
  getLocations: () => new Promise(() => {}),
}));

vi.mock('../src/lib/cloud.js', () => ({
  CloudError: class CloudError extends Error {
    code: string;
    constructor(code: string) { super(code); this.code = code; }
  },
  listCharts: () => listCharts(),
  getChartSettings: () => getChartSettings(),
  getOwnerKey: () => 'a'.repeat(64),
  setOwnerKey: () => true,
  saveChart: () => Promise.reject(new Error('not used')),
  deleteChart: () => Promise.resolve(),
}));

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
  chart = calculateNatalChart(provider, MUMBAI, {});
}, 60_000);

afterAll(() => provider.close());

beforeEach(() => {
  // Alerts persist to localStorage; without this the saved one leaks into
  // the tests that assert an empty list.
  localStorage.clear();
  useAlerts.setState({ alerts: [] });
  listCharts.mockReset();
  listCharts.mockResolvedValue([]);
  useChartStore.setState({ chart: null, busy: false, errorCode: null });
});

afterEach(cleanup);

function renderPanel(locale: 'en' | 'hi' | 'gu' = 'en') {
  return render(
    <I18nProvider initialLocale={locale}>
      <MemoryRouter><DashboardPanel /></MemoryRouter>
    </I18nProvider>,
  );
}

describe("today's sky", () => {
  it('computes real positions for now, from the bundled ephemeris', async () => {
    renderPanel();
    await waitFor(() => {
      expect(screen.getByText(/Positions for/)).toBeInTheDocument();
    });

    // Every body in the default set, with a real position rather than a dash.
    const table = screen.getAllByRole('table')[0]!;
    const sun = within(table).getByRole('row', { name: /Sun/ });
    expect(sun.textContent).toMatch(/\d+°\d\d'/);
  });

  it('names the Moon phase and the bodies that are retrograde', async () => {
    renderPanel();
    await waitFor(() => expect(screen.getByText('Moon phase')).toBeInTheDocument());
    expect(screen.getByText('Retrograde')).toBeInTheDocument();
    // Either a list of bodies or an explicit "None" — never blank.
    const retrograde = screen.getByText('Retrograde').parentElement!;
    expect(retrograde.textContent!.replace('Retrograde', '').trim().length)
      .toBeGreaterThan(0);
  });

  it('says it works offline, because it does', async () => {
    renderPanel();
    await waitFor(() => {
      expect(screen.getByText(/works with no network/i)).toBeInTheDocument();
    });
  });
});

describe('upcoming transits', () => {
  it('asks for a chart instead of choosing one', () => {
    renderPanel();
    expect(screen.getByText(/searches transits to a chart/i)).toBeInTheDocument();
  });

  it('states its own scope, including that saved charts are not scanned', () => {
    renderPanel();
    // The brief forbids implying a feature exists. Background scanning does
    // not, and the pane that would most naturally imply it says so.
    expect(screen.getByText(/Saved charts are NOT scanned/)).toBeInTheDocument();
  });

  it('lists real hits once a chart is open', async () => {
    useChartStore.setState({ chart });
    renderPanel();
    await waitFor(
      () => {
        expect(screen.queryByText(/Searching…/)).not.toBeInTheDocument();
      },
      { timeout: 30_000 },
    );
    // Either genuine hits or an explicit "none in the window" — not silence.
    const tables = screen.queryAllByRole('table');
    const saysNone = screen.queryByText(/No exact aspects/) !== null;
    expect(tables.length > 1 || saysNone).toBe(true);

    if (tables.length > 1) {
      /*
       * REGRESSION GUARD. An aspect to the descendant is the same aspect to
       * the ascendant read from the other end, so including both angles made
       * every angular hit appear twice and spent half of a twelve-row
       * dashboard restating itself. Spotted in the browser, not here.
       */
      const text = tables[1]!.textContent ?? '';
      expect(text).not.toContain('DSC');
      expect(text).not.toContain('IC');
    }
  }, 40_000);
});

describe('saved charts', () => {
  it('distinguishes "none saved" from "the database is unreachable"', async () => {
    /*
     * The assertion this file exists for. Both states are empty lists on the
     * screen, and conflating them tells someone whose database is down that
     * their charts are gone.
     */
    renderPanel();
    await waitFor(() => {
      expect(screen.getByText(/No saved charts yet/i)).toBeInTheDocument();
    });
    expect(screen.queryByText(/could not be reached/i)).not.toBeInTheDocument();

    cleanup();
    listCharts.mockRejectedValue(Object.assign(new Error('OFFLINE'), { code: 'OFFLINE' }));
    renderPanel();
    await waitFor(() => {
      expect(screen.getByText(/could not be reached/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/not lost/i)).toBeInTheDocument();
    expect(screen.queryByText(/No saved charts yet/i)).not.toBeInTheDocument();
  });

  it('lists the most recent saved charts with their summaries', async () => {
    listCharts.mockResolvedValue([
      {
        id: 'abc', name: 'Ada', birth: MUMBAI,
        summary: { sun: '01°13\' Capricorn', moon: '22°12\' Leo' },
        engine_fingerprint: '855fec9b', created_at: '2026-10-01T00:00:00Z',
      },
    ]);
    renderPanel();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Ada' })).toBeInTheDocument();
    });
    expect(screen.getByText(/01°13' Capricorn · 22°12' Leo/)).toBeInTheDocument();
  });

  it('says that opening one recasts it from its stored birth details', async () => {
    // Which is why an engine fix reaches a saved chart instead of leaving
    // stale numbers behind: inputs are stored, results are not.
    renderPanel();
    await waitFor(() => {
      expect(screen.getByText(/casts it again from its stored birth details/i))
        .toBeInTheDocument();
    });
  });
});

describe('alerts', () => {
  it('says plainly that nothing runs while the app is closed', () => {
    /*
     * The assertion that keeps the word "alert" honest. There is no
     * background job and no notification path: an alert here is a saved
     * question re-asked on load. A reader who believes something is watching
     * on their behalf will stop checking.
     */
    renderPanel();
    expect(screen.getByText(/Nothing runs while the app is closed/i)).toBeInTheDocument();
    expect(screen.getByText(/no background job and no notification path/i))
      .toBeInTheDocument();
  });

  it('starts with none, and says where they are kept', () => {
    renderPanel();
    expect(screen.getByText(/No alerts set/i)).toBeInTheDocument();
    expect(screen.getByText(/kept in this browser only/i)).toBeInTheDocument();
  });

  it('asks for a chart rather than checking against nothing', () => {
    renderPanel();
    expect(screen.getByText(/Alerts are relative to a chart/i)).toBeInTheDocument();
  });

  it('saves an alert and checks it against the real ephemeris', async () => {
    const user = userEvent.setup();
    useChartStore.setState({ chart });
    renderPanel();

    await user.click(screen.getByRole('button', { name: 'Add alert' }));
    // Default: Saturn conjunction natal Sun within 1°.
    expect(screen.getByText(/Saturn Conjunction natal Sun, within 1°/i)).toBeInTheDocument();

    await waitFor(
      () => { expect(screen.queryByText(/Checking…/)).not.toBeInTheDocument(); },
      { timeout: 30_000 },
    );
    // Either real matches or an explicit "none in this window" — never silence.
    const matched = screen.queryByText(/upcoming/) !== null;
    const none = screen.queryByText(/None of your alerts match/) !== null;
    expect(matched || none).toBe(true);
  }, 40_000);
});

describe('translation', () => {
  it('leaves no English chrome in the Hindi dashboard', () => {
    renderPanel('hi');
    expect(screen.queryByText("Today’s sky")).not.toBeInTheDocument();
    expect(screen.queryByText('Alerts')).not.toBeInTheDocument();
  });
});
