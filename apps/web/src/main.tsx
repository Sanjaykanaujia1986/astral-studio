import { StrictMode, useEffect, type JSX, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { I18nProvider, useTranslator } from '@astro/i18n';
import { themeCss } from '@astro/ui';
import { AppShell } from './shell/AppShell.js';
import {
  DashboardRoute, ChartStudioRoute, RelationshipsRoute, EventExplorerRoute,
  CalendarRoute, VedicRoute, GannLabRoute, ResearchRoute, ClientsRoute, ReportsRoute,
  SettingsRoute, ProfileRoute,
} from './shell/routes.js';
import { AuthScreen } from './components/AuthScreen.js';
import { useSession } from './state/session.js';
import { useChartStore } from './state/chart.js';
import { workspacesFor } from './shell/workspaces.js';
import { SelfTestPanel } from './components/SelfTestPanel.js';
import './fonts.css';
import './index.css';
import './shell/shell.css';
import './shell/cosmic.css';

const container = document.getElementById('root');
if (!container) throw new Error('#root not found in index.html');

/*
 * `?selftest` bypasses the shell entirely.
 *
 * It must stay reachable on a device with no navigation and no router state —
 * its whole purpose is to run where nothing else can be trusted yet. Wrapping
 * it in the shell would make the diagnostic depend on the thing being
 * diagnosed.
 */
const selfTest = new URLSearchParams(globalThis.location.search).has('selftest');

/**
 * Design tokens, injected once.
 *
 * Generated from the TypeScript tokens rather than duplicated into a
 * stylesheet, so the palette the contrast test measures is the palette that
 * ships.
 */
function ThemeStyle() {
  return <style>{themeCss()}</style>;
}

/**
 * Everything is behind sign-in.
 *
 * Until the server has answered, a quiet placeholder; signed out, the sign-in
 * and registration screen; signed in, the app with the workspaces the person's
 * role allows. A customer's chart is cast here from their registered details,
 * so no workspace ever shows them anyone else's.
 */
function SignInGate({ children }: { readonly children: (role: 'admin' | 'customer') => ReactNode }): JSX.Element {
  const { t } = useTranslator();
  const { status, user, load, signOut } = useSession();
  useEffect(() => { void load(); }, [load]);

  const customerBirth = user?.role === 'customer' ? user.birth : null;
  useEffect(() => {
    if (!user || user.role !== 'customer' || !customerBirth) return;
    useChartStore.setState({ hydrating: true });
    void useChartStore.getState().cast(customerBirth, user.settings, 'standard')
      .finally(() => useChartStore.setState({ hydrating: false }));
    // Recast only when the person or their details change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, customerBirth]);

  if (status === 'loading') {
    return <div className="grid min-h-dvh place-items-center"><p className="as-body as-text-muted">{t('account.checking')}</p></div>;
  }
  if (status === 'unavailable') {
    return (
      <main className="mx-auto grid min-h-dvh max-w-md place-items-center px-4">
        <section className="as-card">
          <h1 className="as-h2">{t('account.unavailable.title')}</h1>
          <p className="as-body mb-3">{t('account.unavailable.body')}</p>
          <button type="button" className="as-button-primary min-h-[44px]" onClick={() => void load()}>{t('account.retry')}</button>
        </section>
      </main>
    );
  }
  if (status === 'signedOut' || !user) return <AuthScreen />;
  return (
    <AppShell role={user.role} account={{ name: user.name, onSignOut: () => void signOut() }}>
      {children(user.role)}
    </AppShell>
  );
}

const ROUTES: Readonly<Record<string, () => JSX.Element>> = {
  dashboard: DashboardRoute, chart: ChartStudioRoute, relationships: RelationshipsRoute, events: EventExplorerRoute,
  calendar: CalendarRoute, vedic: VedicRoute, gann: GannLabRoute, research: ResearchRoute, clients: ClientsRoute,
  reports: ReportsRoute, profile: ProfileRoute, settings: SettingsRoute,
};

createRoot(container).render(
  <StrictMode>
    <ThemeStyle />
    <I18nProvider>
      {selfTest ? (
        <SelfTestPanel />
      ) : (
        <BrowserRouter>
          <SignInGate>
            {(role) => (
              <Routes>
                {workspacesFor(role).map((w) => {
                  const Route_ = ROUTES[w.id]!;
                  return <Route key={w.id} path={w.path} element={<Route_ />} />;
                })}
                {/* An unknown path, or one this role cannot use, goes home. */}
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            )}
          </SignInGate>
        </BrowserRouter>
      )}
    </I18nProvider>
  </StrictMode>,
);
