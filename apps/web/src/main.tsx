import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { I18nProvider } from '@astro/i18n';
import { themeCss } from '@astro/ui';
import { AppShell } from './shell/AppShell.js';
import {
  DashboardRoute, ChartStudioRoute, RelationshipsRoute, EventExplorerRoute,
  CalendarRoute, VedicRoute, GannLabRoute, ResearchRoute, ClientsRoute, ReportsRoute,
  SettingsRoute,
} from './shell/routes.js';
import { SelfTestPanel } from './components/SelfTestPanel.js';
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

createRoot(container).render(
  <StrictMode>
    <ThemeStyle />
    <I18nProvider>
      {selfTest ? (
        <SelfTestPanel />
      ) : (
        <BrowserRouter>
          <AppShell>
            <Routes>
              <Route path="/" element={<DashboardRoute />} />
              <Route path="/chart" element={<ChartStudioRoute />} />
              <Route path="/relationships" element={<RelationshipsRoute />} />
              <Route path="/events" element={<EventExplorerRoute />} />
              <Route path="/calendar" element={<CalendarRoute />} />
              <Route path="/vedic" element={<VedicRoute />} />
              <Route path="/gann" element={<GannLabRoute />} />
              <Route path="/research" element={<ResearchRoute />} />
              <Route path="/clients" element={<ClientsRoute />} />
              <Route path="/reports" element={<ReportsRoute />} />
              <Route path="/settings" element={<SettingsRoute />} />
              {/* An unknown path is a typo, not a feature. Send it home
                  rather than rendering a dead end. */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </AppShell>
        </BrowserRouter>
      )}
    </I18nProvider>
  </StrictMode>,
);
