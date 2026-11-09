/**
 * The eleven workspace routes.
 *
 * Each one composes panels that already exist and are already tested; this file
 * is arrangement, not new calculation. Workspaces that are genuinely not built
 * render `PlannedWorkspace`, which states scope and milestone rather than
 * showing a mock.
 */
import { Suspense, lazy, type JSX, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { GEONAMES_ATTRIBUTION } from '@astro/locations';
import { useTranslator } from '@astro/i18n';
import {
  ChartWheel, PlanetTable, HouseTable, AspectTable, formatOffset,
} from '@astro/ui';
import { BirthForm } from '../components/BirthForm.js';
import { SettingsPanel } from '../components/SettingsPanel.js';
import { TransitsPanel } from '../components/TransitsPanel.js';
import { AspectarianPanel } from '../components/AspectarianPanel.js';
import { ReturnsPanel } from '../components/ReturnsPanel.js';
import { SynastryPanel } from '../components/SynastryPanel.js';
import { CyclesPanel } from '../components/CyclesPanel.js';
import { SkyEventsPanel } from '../components/SkyEventsPanel.js';
import { DashboardPanel } from '../components/DashboardPanel.js';
import { SavedChartsPanel } from '../components/SavedChartsPanel.js';
/*
 * Split at the route.
 *
 * Each of these drags a whole package in behind it — Vedic pulls
 * @astro/vedic, Gann pulls @astro/gann, Research pulls the statistics and
 * backtest code, Reports pulls the print document. Bundled together they put
 * all of it in front of someone who only wanted a natal chart: the single
 * chunk measured 961 kB raw, 280 kB over the wire.
 *
 * Named exports rather than default, so each import is mapped rather than
 * the components being rewritten to suit the loader.
 */
const VedicPanel = lazy(() =>
  import('../components/VedicPanel.js').then((m) => ({ default: m.VedicPanel })));
const GannPanel = lazy(() =>
  import('../components/GannPanel.js').then((m) => ({ default: m.GannPanel })));
const ResearchPanel = lazy(() =>
  import('../components/ResearchPanel.js').then((m) => ({ default: m.ResearchPanel })));
const ReportPanel = lazy(() =>
  import('../components/ReportPanel.js').then((m) => ({ default: m.ReportPanel })));

import { useChartStore } from '../state/chart.js';
import { useSettings } from '../lib/settings.js';
import { useChartTheme } from '../lib/chart-theme.js';
import { WORKSPACES } from './workspaces.js';
import { PlannedWorkspace } from './PlannedWorkspace.js';
import { BRAND } from '../brand.js';

const byId = (id: string) => WORKSPACES.find((w) => w.id === id)!;

/**
 * Fallback for a split route.
 *
 * Reserves height rather than collapsing to nothing: a zero-height
 * placeholder lets the page jump when the chunk lands, which is the layout
 * shift Core Web Vitals measures.
 */
function PanelFallback(): JSX.Element {
  const { t } = useTranslator();
  return (
    <section className="as-card" style={{ minHeight: '12rem' }} aria-busy="true">
      <p className="as-body" style={{ color: 'var(--as-ink-muted)' }}>
        {t('app.loadingWorkspace')}
      </p>
    </section>
  );
}

/** Page scaffold: heading, optional lede, content. */
function Page({
  titleKey, ledeKey, children, narrow = false,
}: {
  titleKey: string; ledeKey?: string; children: ReactNode; narrow?: boolean;
}): JSX.Element {
  const { t } = useTranslator();
  return (
    <div className={`as-page${narrow ? ' as-page-narrow' : ''}`}>
      <header className="as-page-head no-print">
        <h1 className="as-h1">{t(titleKey as 'nav.chartStudio')}</h1>
        {ledeKey ? <p className="as-lede">{t(ledeKey as 'nav.chartStudio')}</p> : null}
      </header>
      {children}
    </div>
  );
}

/**
 * Guard for workspaces that need a chart.
 *
 * An honest empty state: it says what is missing and links to where the chart
 * is made. It does not invent one so the screen looks populated.
 */
function RequireChart({ children }: { children: (chart: NonNullable<ReturnType<typeof useChartStore.getState>['chart']>) => ReactNode }): JSX.Element {
  const chart = useChartStore((s) => s.chart);
  const hydrating = useChartStore((s) => s.hydrating);
  const { t } = useTranslator();
  /*
   * A stored chart is still being recast. Telling the reader to go and cast
   * one, a moment before their own chart appears, sends them away from the
   * page they deep-linked to.
   */
  if (!chart && hydrating) return <PanelFallback />;
  if (!chart) {
    return (
      <section className="as-card">
        <p className="as-body">{t('workspace.needsChart')}</p>
        <Link to="/chart" className="as-button-secondary">{t('nav.chartStudio')}</Link>
      </section>
    );
  }
  return <>{children(chart)}</>;
}

/** Warnings and the precision summary — shown wherever a chart is displayed. */
function ChartSummary(): JSX.Element | null {
  const chart = useChartStore((s) => s.chart);
  const { t, n } = useTranslator();
  if (!chart) return null;
  return (
    <>
      {chart.precision.warnings.length > 0 ? (
        <section className="as-card" style={{ borderColor: 'var(--as-warning)' }}>
          <h2 className="as-h2">{t('warning.heading')}</h2>
          <ul className="as-list">
            {chart.precision.warnings.map((w) => (
              <li key={w.code}>{t(`warning.${w.code}`, w.params)}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="as-card">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
          {([
            ['summary.birthplace', chart.input.place.label ?? '—'],
            ['summary.utcInstant', chart.utcIso.replace('.000', '')],
            ['summary.offsetUsed', formatOffset(chart.offsetMinutes)],
            ['report.houseSystem', t(`houseSystem.${chart.houses?.system ?? 'placidus'}` as 'houseSystem.placidus')],
            ['summary.nodeType', t(`nodeType.${chart.settings.nodeType}` as 'nodeType.true')],
            ['summary.ephemeris', chart.precision.source === 'swiss'
              ? t('summary.ephemeris.swiss') : t('summary.ephemeris.moshier')],
          ] as const).map(([key, value]) => (
            <div key={key}>
              <dt className="text-xs uppercase tracking-wide" style={{ color: 'var(--as-ink-muted)' }}>
                {t(key)}
              </dt>
              <dd className="tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
        <p className="as-fineprint mt-3">{n(chart.aspects.length)} · {t('table.caption.aspects')}</p>
      </section>
    </>
  );
}

// ---------------------------------------------------------------- workspaces

export function DashboardRoute(): JSX.Element {
  return (
    <Page titleKey="nav.dashboard" ledeKey="dashboard.lede">
      <DashboardPanel />
    </Page>
  );
}

export function ChartStudioRoute(): JSX.Element {
  const { t } = useTranslator();
  const settings = useSettings();
  const chartTheme = useChartTheme();
  const { chart, busy, errorCode, cast } = useChartStore();

  return (
    <Page titleKey="nav.chartStudio" ledeKey="chartStudio.lede">
      <div className="grid gap-5 lg:grid-cols-[22rem_1fr]">
        <div className="no-print flex flex-col gap-5">
          <section className="as-card">
            <h2 className="as-h2">{t('form.section.birthData')}</h2>
            <BirthForm
              onSubmit={(birth, chartSettings) =>
                void cast(birth, chartSettings, settings.orbProfile)}
              busy={busy}
            />
          </section>
          <section className="as-card">
            <h2 className="as-h2">{t('cloud.title')}</h2>
            <SavedChartsPanel
              chart={chart}
              onOpen={(birth, saved) => void cast(birth, saved, settings.orbProfile)}
            />
          </section>
        </div>

        <div className="flex min-w-0 flex-col gap-5">
          {errorCode ? (
            <section className="as-card" role="alert" style={{ borderColor: 'var(--as-danger)' }}>
              <h2 className="as-h2">{t('error.heading')}</h2>
              <p className="as-body">{t(`error.${errorCode}` as 'error.unknown')}</p>
            </section>
          ) : null}

          {!chart && !errorCode ? (
            <section className="as-card"><p className="as-body">{t('app.emptyState')}</p></section>
          ) : null}

          {chart ? (
            <>
              <ChartSummary />
              <section className="as-card">
                <ChartWheel
                  chart={chart}
                  {...(chart.input.name ? { subjectName: chart.input.name } : {})}
                  size={900}
                  theme={chartTheme}
                  glyphStyle={settings.glyphStyle}
                  className="mx-auto max-w-[680px]"
                />
              </section>
              <section className="as-card">
                <h2 className="as-h2">{t('table.caption.planets')}</h2>
                <PlanetTable chart={chart} precision={settings.precision} />
              </section>
              <section className="as-card">
                <h2 className="as-h2">{t('table.caption.houses')}</h2>
                <HouseTable chart={chart} precision={settings.precision} />
              </section>
              <section className="as-card">
                <h2 className="as-h2">{t('table.caption.aspects')}</h2>
                <AspectTable chart={chart} />
              </section>
              <section className="as-card">
                <h2 className="as-h2">{t('tab.returns')}</h2>
                <ReturnsPanel chart={chart} />
              </section>
            </>
          ) : null}
        </div>
      </div>
    </Page>
  );
}

export function RelationshipsRoute(): JSX.Element {
  return (
    <Page titleKey="nav.relationships" ledeKey="relationships.lede">
      <RequireChart>{(chart) => (
        <section className="as-card"><SynastryPanel chart={chart} /></section>
      )}</RequireChart>
    </Page>
  );
}

export function EventExplorerRoute(): JSX.Element {
  const { t } = useTranslator();
  return (
    <Page titleKey="nav.eventExplorer" ledeKey="eventExplorer.lede">
      <section className="as-card">
        <h2 className="as-h2">{t('skyEvents.heading')}</h2>
        <p className="as-body mb-3">{t('skyEvents.lede')}</p>
        <SkyEventsPanel />
      </section>

      <RequireChart>{(chart) => (
        <section className="as-card">
          <h2 className="as-h2">{t('tab.transits')}</h2>
          <TransitsPanel chart={chart} />
        </section>
      )}</RequireChart>

      <section className="as-card">
        <h2 className="as-h2">{t('cycles.title')}</h2>
        <CyclesPanel />
      </section>
    </Page>
  );
}

export function CalendarRoute(): JSX.Element {
  return (
    <Page titleKey="nav.calendar" ledeKey="calendar.lede">
      <section className="as-card"><AspectarianPanel /></section>
    </Page>
  );
}

export function VedicRoute(): JSX.Element {
  return (
    <Page titleKey="nav.vedic" ledeKey="vedic.lede">
      <Suspense fallback={<PanelFallback />}>
        <RequireChart>{(chart) => <VedicPanel chart={chart} />}</RequireChart>
      </Suspense>
    </Page>
  );
}

export function GannLabRoute(): JSX.Element {
  return (
    <Page titleKey="nav.gannLab" ledeKey="gann.lede">
      <Suspense fallback={<PanelFallback />}>
        <GannPanel />
      </Suspense>
    </Page>
  );
}

export function ResearchRoute(): JSX.Element {
  return (
    <Page titleKey="nav.research" ledeKey="research.lede">
      <Suspense fallback={<PanelFallback />}>
        <ResearchPanel />
      </Suspense>
    </Page>
  );
}

export function ClientsRoute(): JSX.Element {
  return (
    <PlannedWorkspace
      workspace={byId('clients')}
      scopeKeys={[
        'clients.scope.records', 'clients.scope.consent',
        'clients.scope.sharing', 'clients.scope.templates', 'clients.scope.auth',
      ]}
    />
  );
}

export function ReportsRoute(): JSX.Element {
  return (
    <Page titleKey="nav.reports" ledeKey="reports.lede">
      <Suspense fallback={<PanelFallback />}>
        <RequireChart>{(chart) => <ReportPanel chart={chart} />}</RequireChart>
      </Suspense>
    </Page>
  );
}

export function SettingsRoute(): JSX.Element {
  const { t } = useTranslator();
  return (
    <Page titleKey="nav.settings" narrow>
      <section className="as-card">
        <h2 className="as-h2">{t('settings.title')}</h2>
        <SettingsPanel />
      </section>
      <section className="as-card">
        <h2 className="as-h2">{t('settings.about')}</h2>
        <p className="as-body">{BRAND.name} · {BRAND.tagline}</p>
        <p className="as-fineprint mt-2">
          {t('app.attribution', { geonames: GEONAMES_ATTRIBUTION })}
        </p>
        <p className="as-fineprint mt-2">{t('settings.selfTestHint')}</p>
      </section>

      {/*
        AGPL §13. A public deployment must offer its source to every visitor
        from the running program, not only from a README, so the offer lives
        in the app. When the URL is missing the app says so rather than
        showing a dead "source available" claim.
      */}
      <section className="as-card">
        <h2 className="as-h2">{t('licence.heading')}</h2>
        <p className="as-body">{t('licence.body')}</p>
        {BRAND.sourceUrl ? (
          <p className="mt-2">
            <a className="as-button-secondary" href={BRAND.sourceUrl} rel="noreferrer">
              {t('licence.sourceLink')}
            </a>
          </p>
        ) : (
          <p className="as-body mt-2" role="alert" style={{ color: 'var(--as-warning)' }}>
            {t('licence.sourceMissing')}
          </p>
        )}
        <p className="as-fineprint mt-2">{t('licence.warranty')}</p>
      </section>
    </Page>
  );
}
