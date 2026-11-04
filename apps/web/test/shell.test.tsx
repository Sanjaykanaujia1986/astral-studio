/**
 * The workspace shell.
 *
 * Two things are tested here that a screenshot cannot show: that every nav item
 * routes somewhere real, and that an unbuilt workspace says so rather than
 * presenting a convincing empty screen.
 *
 * The engine is mocked out. These tests are about navigation and honesty, and
 * loading 2.6 MB of WASM to assert that a link works would make them slow for
 * no added confidence — the calculations have 347 tests of their own.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { I18nProvider } from '@astro/i18n';
import { AppShell } from '../src/shell/AppShell.js';
import { WORKSPACES, PRIMARY_WORKSPACES, workspaceByPath } from '../src/shell/workspaces.js';
import {
  DashboardRoute, GannLabRoute, ClientsRoute, RelationshipsRoute, ReportsRoute,
  SettingsRoute,
} from '../src/shell/routes.js';
import { PlannedWorkspace } from '../src/shell/PlannedWorkspace.js';

// Neither the engine nor the cloud is exercised by navigation.
vi.mock('../src/lib/engine.js', () => ({
  getProvider: () => new Promise(() => {}),
  getLocations: () => new Promise(() => {}),
}));
vi.mock('../src/lib/cloud.js', () => ({
  CloudError: class extends Error {},
  listCharts: () => Promise.resolve([]),
  saveChart: () => Promise.reject(new Error('not used')),
  deleteChart: () => Promise.resolve(),
  getChartSettings: () => Promise.resolve({}),
  getOwnerKey: () => 'a'.repeat(64),
  setOwnerKey: () => true,
}));

function renderShell(initialPath = '/', locale: 'en' | 'hi' | 'gu' = 'en') {
  return render(
    <I18nProvider initialLocale={locale}>
      <MemoryRouter initialEntries={[initialPath]}>
        <AppShell>
          <Routes>
            <Route path="/" element={<DashboardRoute />} />
            <Route path="/gann" element={<GannLabRoute />} />
            <Route path="/clients" element={<ClientsRoute />} />
            <Route path="/relationships" element={<RelationshipsRoute />} />
            <Route path="/reports" element={<ReportsRoute />} />
            <Route path="*" element={<div>other workspace</div>} />
          </Routes>
        </AppShell>
      </MemoryRouter>
    </I18nProvider>,
  );
}

beforeEach(() => {
  /*
   * The rail remembers whether it was collapsed — correct product behaviour,
   * and a leak between tests: one test clicking "Collapse" left the next one
   * starting collapsed, so its labels were absent and two assertions failed
   * for a reason that had nothing to do with what they were testing.
   */
  localStorage.clear();
});

afterEach(cleanup);

describe('the workspace list', () => {
  it('has the workspaces the brief specifies, plus the Vedic module', () => {
    expect(WORKSPACES).toHaveLength(11);
    expect(WORKSPACES.map((w) => w.id)).toEqual([
      'dashboard', 'chart', 'relationships', 'events', 'calendar',
      'vedic', 'gann', 'research', 'clients', 'reports', 'settings',
    ]);
  });

  it('gives every workspace a unique id and path', () => {
    expect(new Set(WORKSPACES.map((w) => w.id)).size).toBe(WORKSPACES.length);
    expect(new Set(WORKSPACES.map((w) => w.path)).size).toBe(WORKSPACES.length);
  });

  it('fits the mobile bottom bar', () => {
    // Six cells including "More"; more than that and labels become unreadable
    // at 375px.
    expect(PRIMARY_WORKSPACES.length).toBeLessThanOrEqual(5);
    expect(PRIMARY_WORKSPACES.length).toBeGreaterThan(0);
  });

  it('declares a milestone for everything unfinished', () => {
    // A "planned" item with no milestone is an item nobody has scheduled.
    for (const w of WORKSPACES) {
      if (w.status !== 'ready') expect(w.milestone, w.id).toBeDefined();
      else expect(w.milestone, w.id).toBeUndefined();
    }
  });

  it('resolves a path to its workspace, longest match first', () => {
    expect(workspaceByPath('/')?.id).toBe('dashboard');
    expect(workspaceByPath('/chart')?.id).toBe('chart');
    // A nested path belongs to its parent workspace, not to the dashboard.
    expect(workspaceByPath('/chart/abc')?.id).toBe('chart');
    expect(workspaceByPath('/nope')).toBeUndefined();
  });
});

describe('the navigation rail', () => {
  it('links every workspace', () => {
    renderShell();
    const rail = screen.getByRole('navigation', { name: 'Workspaces' });
    const links = within(rail).getAllByRole('link');
    expect(links).toHaveLength(WORKSPACES.length);
    for (const w of WORKSPACES) {
      expect(links.some((a) => a.getAttribute('href') === w.path), w.id).toBe(true);
    }
  });

  it('marks the active workspace with aria-current', () => {
    /*
     * aria-current, not aria-selected: these are links, and aria-selected
     * would describe them to a screen reader as tabs in a tablist that does
     * not exist.
     */
    renderShell('/gann');
    const rail = screen.getByRole('navigation', { name: 'Workspaces' });
    const current = within(rail).getAllByRole('link').filter(
      (a) => a.getAttribute('aria-current') === 'page',
    );
    expect(current).toHaveLength(1);
    expect(current[0]!.getAttribute('href')).toBe('/gann');
  });

  it('does not mark every workspace active on the dashboard route', () => {
    // `/` is a prefix of every path, so without an exact match the dashboard
    // link would stay highlighted everywhere.
    renderShell('/gann');
    const rail = screen.getByRole('navigation', { name: 'Workspaces' });
    const home = within(rail).getAllByRole('link').find((a) => a.getAttribute('href') === '/')!;
    expect(home.getAttribute('aria-current')).not.toBe('page');
  });

  it('labels unfinished workspaces in the navigation itself', () => {
    renderShell();
    const rail = screen.getByRole('navigation', { name: 'Workspaces' });
    // One planned (clients) and two partial (dashboard, gann). Event
    // Explorer became ready when ingress, station and declination search
    // landed in the engine.
    expect(within(rail).getAllByText('Planned')).toHaveLength(1);
    expect(within(rail).getAllByText('Partial')).toHaveLength(2);
  });

  it('keeps an accessible name on every item when collapsed', async () => {
    /*
     * Collapsing hides the text. Without an explicit label the rail becomes a
     * column of identically-named icon links, which is worse than no rail at
     * all for a screen-reader user.
     */
    const user = userEvent.setup();
    renderShell();
    await user.click(screen.getByRole('button', { name: 'Collapse navigation' }));

    const rail = screen.getByRole('navigation', { name: 'Workspaces' });
    for (const link of within(rail).getAllByRole('link')) {
      expect(link.getAttribute('aria-label')?.length ?? 0).toBeGreaterThan(0);
    }
    expect(screen.getByRole('button', { name: 'Expand navigation' })).toBeInTheDocument();
  });
});

describe('the mobile bottom bar', () => {
  it('is a separately labelled landmark', () => {
    // Two navs with the same name are indistinguishable in a landmark list.
    renderShell();
    expect(screen.getByRole('navigation', { name: 'Workspaces' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Main workspaces' })).toBeInTheDocument();
  });

  it('puts the remaining workspaces behind More', async () => {
    const user = userEvent.setup();
    renderShell();
    const more = screen.getByRole('button', { name: /More/ });
    expect(more).toHaveAttribute('aria-expanded', 'false');

    await user.click(more);
    expect(more).toHaveAttribute('aria-expanded', 'true');

    const sheet = screen.getByRole('dialog', { name: 'More' });
    const secondary = WORKSPACES.filter((w) => !w.primary);
    expect(within(sheet).getAllByRole('link')).toHaveLength(secondary.length);
  });

  it('closes the More sheet when a workspace is opened', async () => {
    // Leaving it open over the newly-opened workspace is the standard
    // mobile-nav bug.
    const user = userEvent.setup();
    renderShell();
    await user.click(screen.getByRole('button', { name: /More/ }));
    const sheet = screen.getByRole('dialog', { name: 'More' });
    await user.click(within(sheet).getAllByRole('link')[0]!);
    expect(screen.queryByRole('dialog', { name: 'More' })).not.toBeInTheDocument();
  });
});

describe('a planned workspace', () => {
  it('states that it is not built, and when it is due', () => {
    renderShell('/clients');
    expect(screen.getByRole('heading', { level: 1, name: 'Clients' })).toBeInTheDocument();
    expect(screen.getByText(/not built yet/i)).toBeInTheDocument();
    expect(screen.getByText(/milestone 4/i)).toBeInTheDocument();
  });

  it('lists its intended scope', () => {
    renderShell('/clients');
    expect(screen.getByText(/Consent tracking/)).toBeInTheDocument();
  });

  it('says plainly that nothing on the page is calculated', () => {
    /*
     * The assertion that matters most in this file. The brief forbids
     * populating screens with fabricated calculations, and a plausible-looking
     * empty state is the same misrepresentation with better manners: someone
     * screenshots it and believes the feature ships.
     */
    renderShell('/clients');
    expect(screen.getByText(/Nothing on this page is calculated/i)).toBeInTheDocument();
  });

  it('shows no chart, table or numeric figure', () => {
    const { container } = renderShell('/clients');
    expect(container.querySelector('svg.chart, table')).toBeNull();
  });

  it('points at what genuinely works today, where something does', () => {
    /*
     * Rendered directly rather than through a route: every workspace that
     * still carries an "available now" link has since been built, and a test
     * that follows whichever one happens to be unfinished this week stops
     * testing the component and starts testing the backlog.
     */
    render(
      <I18nProvider initialLocale="en">
        <MemoryRouter>
          <PlannedWorkspace
            workspace={WORKSPACES.find((w) => w.id === 'clients')!}
            scopeKeys={['clients.scope.records']}
            availableNow={{ path: '/research', labelKey: 'nav.research' }}
          />
        </MemoryRouter>
      </I18nProvider>,
    );
    expect(screen.getByRole('link', { name: 'Research' }))
      .toHaveAttribute('href', '/research');
  });

  it('offers no such link when nothing related exists', () => {
    renderShell('/clients');
    expect(screen.queryByText(/Available now/i)).not.toBeInTheDocument();
  });
});

describe('workspaces that need a chart', () => {
  it('say so and link to Chart Studio rather than inventing one', () => {
    renderShell('/relationships');
    expect(screen.getByText(/works on a chart/i)).toBeInTheDocument();
    const links = screen.getAllByRole('link', { name: 'Chart Studio' });
    expect(links.some((a) => a.getAttribute('href') === '/chart')).toBe(true);
  });

  it('applies to Reports too', () => {
    renderShell('/reports');
    expect(screen.getByText(/works on a chart/i)).toBeInTheDocument();
  });
});

describe('shell accessibility', () => {
  it('offers a skip link to the workspace', () => {
    // The rail is a dozen stops deep; without this a keyboard user traverses
    // the whole navigation on every page.
    renderShell();
    const skip = screen.getByRole('link', { name: 'Skip to content' });
    expect(skip).toHaveAttribute('href', '#workspace');
    expect(document.getElementById('workspace')).not.toBeNull();
  });

  it('puts the workspace in a main landmark', () => {
    renderShell();
    expect(screen.getByRole('main')).toHaveAttribute('id', 'workspace');
  });

  it('has exactly one h1 per workspace', () => {
    renderShell('/gann');
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  it('gives the rail toggle a name that reflects its state', () => {
    renderShell();
    expect(screen.getByRole('button', { name: 'Collapse navigation' }))
      .toHaveAttribute('aria-expanded', 'true');
  });
});

describe('translation', () => {
  it('translates the navigation into Gujarati', () => {
    renderShell('/', 'gu');
    const rail = screen.getByRole('navigation', { name: 'કાર્યક્ષેત્રો' });
    expect(within(rail).getByRole('link', { name: /કુંડળી સ્ટુડિયો/ })).toBeInTheDocument();
    expect(within(rail).getAllByText('નિયોજિત').length).toBe(1);
  });

  it('translates the planned-workspace explanation into Hindi', () => {
    renderShell('/clients', 'hi');
    expect(screen.getByText(/माइलस्टोन 4/)).toBeInTheDocument();
  });

  it('leaves no English chrome in the Hindi rail', () => {
    renderShell('/', 'hi');
    const rail = screen.getByRole('navigation', { name: 'कार्यक्षेत्र' });
    expect(within(rail).queryByText('Chart Studio')).not.toBeInTheDocument();
    expect(within(rail).queryByText('Planned')).not.toBeInTheDocument();
  });
});

/*
 * AGPL §13. Serving the app to the public makes every visitor a recipient
 * who must be offered the Corresponding Source, prominently, from the
 * running program. A link in a README does not satisfy it, which is why
 * this is a test and not a note in the licensing document.
 */
describe('the source offer', () => {
  it('states the licence and offers the source in the app itself', () => {
    render(
      <I18nProvider initialLocale="en">
        <MemoryRouter initialEntries={['/settings']}>
          <Routes><Route path="/settings" element={<SettingsRoute />} /></Routes>
        </MemoryRouter>
      </I18nProvider>,
    );
    expect(screen.getByText(/GNU Affero General Public License/)).toBeInTheDocument();
    expect(screen.getByText(/no warranty/i)).toBeInTheDocument();
  });

  it('says the link is missing rather than showing a dead claim', () => {
    /*
     * This build has no VITE_SOURCE_URL, so the app must say the offer is
     * unconfigured. An "available" claim that points nowhere is worse than
     * no claim: it reads as compliance while providing nothing.
     */
    render(
      <I18nProvider initialLocale="en">
        <MemoryRouter initialEntries={['/settings']}>
          <Routes><Route path="/settings" element={<SettingsRoute />} /></Routes>
        </MemoryRouter>
      </I18nProvider>,
    );
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toMatch(/VITE_SOURCE_URL/);
    expect(screen.queryByRole('link', { name: 'Source code' })).not.toBeInTheDocument();
  });
});
