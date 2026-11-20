/**
 * The application shell.
 *
 * Desktop: a collapsible navy rail on the left, the workspace filling the rest.
 * Mobile: a bottom bar of the five primary workspaces, the rest behind "More".
 * Not the desktop layout squeezed — the brief rules that out explicitly, and a
 * 220px rail on a 375px screen would leave no room for a chart anyway.
 *
 * ## Accessibility, as requirements rather than aspirations
 *
 * - One `<nav>` per surface, each labelled, so a screen reader can tell the
 *   rail from the bottom bar.
 * - `aria-current="page"` on the active item. Not `aria-selected`, which
 *   belongs to tabs and would misdescribe links.
 * - A skip link to the workspace, because the rail is eleven stops deep.
 * - Visible focus from the token palette, measured at 3:1 against both grounds.
 * - Every control reaches 24x24, the WCAG 2.5.8 floor.
 * - Reduced motion honoured by the stylesheet, not by JavaScript.
 */
import { useCallback, useEffect, useState, type JSX, type ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useTranslator } from '@astro/i18n';
import { BRAND } from '../brand.js';
import { primaryFor, workspacesFor, workspaceByPath, type Role, type Workspace } from './workspaces.js';
import { WorkspaceBoundary } from './WorkspaceBoundary.js';
import { useChartStore } from '../state/chart.js';
import { useSeriesStore } from '../state/series.js';

const RAIL_STORAGE = 'astral.rail.collapsed';

function Icon({ path, className }: { path: string; className?: string }): JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className ?? 'h-5 w-5'}
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <path d={path} />
    </svg>
  );
}

/** "Planned" / "Partial" marker. Absent for a finished workspace. */
function StatusTag({ workspace }: { workspace: Workspace }): JSX.Element | null {
  const { t } = useTranslator();
  if (workspace.status === 'ready') return null;
  return (
    <span
      className={`ml-auto shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
        workspace.status === 'planned' ? 'as-tag-planned' : 'as-tag-partial'
      }`}
    >
      {t(`nav.status.${workspace.status}` as 'nav.status.planned')}
    </span>
  );
}

function RailItem({ workspace, collapsed }: { workspace: Workspace; collapsed: boolean }): JSX.Element {
  const { t } = useTranslator();
  const label = t(workspace.labelKey as 'nav.dashboard');
  return (
    <li>
      <NavLink
        to={workspace.path}
        end={workspace.path === '/'}
        className={({ isActive }) => `as-rail-item${isActive ? ' as-rail-item-active' : ''}`}
        // The accessible name must survive collapsing, when the text is gone.
        {...(collapsed ? { 'aria-label': label, title: label } : {})}
      >
        <Icon path={workspace.icon} />
        {!collapsed ? (
          <>
            <span className="truncate">{label}</span>
            <StatusTag workspace={workspace} />
          </>
        ) : null}
      </NavLink>
    </li>
  );
}

export interface AppShellProps {
  readonly children: ReactNode;
  /** Which workspaces to offer. The server enforces access; this only hides what a role cannot use. */
  readonly role?: Role;
  /** The signed-in person, with a way out. Omitted in tests that render the shell alone. */
  readonly account?: { readonly name: string; readonly onSignOut: () => void };
}

export function AppShell({ children, role = 'admin', account }: AppShellProps): JSX.Element {
  const { t, locale } = useTranslator();
  const visible = workspacesFor(role);
  const primary = primaryFor(role);

  /*
   * Bring back the chart the reader last cast.
   *
   * Here rather than in the dashboard: every workspace that needs a chart
   * sends you to Chart Studio when there isn't one, so a restore that only
   * ran on the dashboard would make a deep link into a restored chart look
   * like a dead end. Idempotent, so StrictMode's double-invoke is harmless.
   */
  useEffect(() => {
    // A customer's chart is their own registered one, cast by the sign-in gate,
    // never whatever this device showed last.
    if (role === 'admin') void useChartStore.getState().restore();
    // The series only comes back if the reader asked for it to; the call is
    // what reads that choice and settles the hydrating flag either way.
    useSeriesStore.getState().restore();
  }, [role]);
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return globalThis.localStorage?.getItem(RAIL_STORAGE) === '1';
    } catch {
      return false;
    }
  });
  const [moreOpen, setMoreOpen] = useState(false);

  const active = workspaceByPath(location.pathname);

  const toggleRail = useCallback(() => {
    setCollapsed((previous) => {
      const next = !previous;
      try {
        globalThis.localStorage?.setItem(RAIL_STORAGE, next ? '1' : '0');
      } catch {
        /* a preference is not worth failing over */
      }
      return next;
    });
  }, []);

  // Close the "More" sheet on navigation; leaving it open over the new
  // workspace is the classic mobile-nav bug.
  useEffect(() => setMoreOpen(false), [location.pathname]);

  // Keep the document title in step, which is also what a screen reader
  // announces on route change.
  useEffect(() => {
    const label = active ? t(active.labelKey as 'nav.dashboard') : '';
    document.title = label ? `${label} · ${BRAND.name}` : BRAND.name;
  }, [active, t]);

  const secondary = visible.filter((w) => !w.primary);

  return (
    <>
      {/*
        The sky. A sibling of the shell rather than a child, so it is not
        inside the grid and cannot affect layout; fixed, behind, and
        pointer-events: none. `aria-hidden` because it is decoration and a
        screen reader announcing "image" here would be noise.
      */}
      <div className="as-sky" aria-hidden="true">
        <div className="as-nebula as-nebula-a" />
        <div className="as-nebula as-nebula-b" />
      </div>

      <div className="as-shell" lang={locale.intlTag}>
      <a href="#workspace" className="as-skip">
        {t('nav.skipToContent')}
      </a>

      {/* ---------------- desktop rail ---------------- */}
      <nav
        aria-label={t('nav.primary')}
        className={`as-rail no-print${collapsed ? ' as-rail-collapsed' : ''}`}
      >
        <div className="as-rail-head">
          {!collapsed ? (
            <span className="as-brand" title={BRAND.taglineFromEnv ? BRAND.tagline : t('brand.tagline')}>
              {BRAND.name}
            </span>
          ) : null}
          <button
            type="button"
            onClick={toggleRail}
            aria-expanded={!collapsed}
            aria-label={t(collapsed ? 'nav.expandRail' : 'nav.collapseRail')}
            className="as-rail-toggle"
          >
            <Icon
              path={
                collapsed
                  ? 'M9 6l6 6-6 6V6Z'
                  : 'M15 6l-6 6 6 6V6Z'
              }
            />
          </button>
        </div>

        <ul className="as-rail-list">
          {visible.map((workspace) => (
            <RailItem key={workspace.id} workspace={workspace} collapsed={collapsed} />
          ))}
        </ul>

        {account ? (
          <div className="as-rail-account">
            {!collapsed ? <span className="as-rail-account-name" title={account.name}>{account.name}</span> : null}
            <button type="button" onClick={account.onSignOut} className="as-rail-signout"
              aria-label={t('account.signOut')} title={t('account.signOut')}>
              <Icon path="M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h5v-2H5V5h5V3Zm5.6 4.6L14.2 9l2 2H8v2h8.2l-2 2 1.4 1.4L20 12l-4.4-4.4Z" />
              {!collapsed ? <span>{t('account.signOut')}</span> : null}
            </button>
          </div>
        ) : null}
      </nav>

      {/* ---------------- workspace ---------------- */}
      <main id="workspace" className="as-workspace" tabIndex={-1}>
        {/*
          Scoped to the workspace, not the whole app: the navigation must
          survive a failing panel so the reader can leave. Keyed on the path so
          navigating away from a broken workspace clears the error.
        */}
        <WorkspaceBoundary resetKey={location.pathname}>{children}</WorkspaceBoundary>
      </main>

      {/* ---------------- mobile bottom bar ---------------- */}
      <nav aria-label={t('nav.primaryMobile')} className="as-bottom no-print">
        {primary.map((workspace) => (
          <NavLink
            key={workspace.id}
            to={workspace.path}
            end={workspace.path === '/'}
            className={({ isActive }) => `as-bottom-item${isActive ? ' as-bottom-item-active' : ''}`}
          >
            <Icon path={workspace.icon} />
            <span className="as-bottom-label">{t(workspace.labelKey as 'nav.dashboard')}</span>
          </NavLink>
        ))}
        <button
          type="button"
          onClick={() => setMoreOpen((v) => !v)}
          aria-expanded={moreOpen}
          className={`as-bottom-item${moreOpen ? ' as-bottom-item-active' : ''}`}
        >
          <Icon path="M6 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm6 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm6 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z" />
          <span className="as-bottom-label">{t('nav.more')}</span>
        </button>
      </nav>

      {moreOpen ? (
        <div className="as-sheet no-print" role="dialog" aria-label={t('nav.more')}>
          <ul>
            {secondary.map((workspace) => (
              <li key={workspace.id}>
                <NavLink to={workspace.path} className="as-sheet-item">
                  <Icon path={workspace.icon} />
                  <span>{t(workspace.labelKey as 'nav.dashboard')}</span>
                  <StatusTag workspace={workspace} />
                </NavLink>
              </li>
            ))}
            {account ? (
              <li>
                <button type="button" onClick={account.onSignOut} className="as-sheet-item w-full">
                  <Icon path="M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h5v-2H5V5h5V3Zm5.6 4.6L14.2 9l2 2H8v2h8.2l-2 2 1.4 1.4L20 12l-4.4-4.4Z" />
                  <span>{t('account.signOutAs', { name: account.name })}</span>
                </button>
              </li>
            ) : null}
          </ul>
        </div>
      ) : null}
      </div>
    </>
  );
}
