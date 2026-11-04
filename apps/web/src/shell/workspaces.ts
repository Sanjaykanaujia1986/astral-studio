/**
 * The eleven workspaces, as data.
 *
 * One list drives the desktop rail, the mobile bottom bar, the routes and the
 * tests. Three separate lists would drift, and the first symptom would be a nav
 * item that routes nowhere.
 *
 * ## `status` is not decoration
 *
 * The brief is explicit that unfinished features stay marked as planned and
 * that screens are not filled with fabricated calculations. So each workspace
 * declares what it actually is:
 *
 *   ready    complete and verified
 *   partial  usable, with named gaps shown in the workspace itself
 *   planned  not built; the nav says so and the route explains what is missing
 *
 * A `planned` workspace renders a short statement of scope and its milestone.
 * It never renders a mock chart, a sample table or a placeholder number.
 */

export type WorkspaceStatus = 'ready' | 'partial' | 'planned';

export interface Workspace {
  readonly id: string;
  readonly path: string;
  /** i18n key for the label. */
  readonly labelKey: string;
  readonly status: WorkspaceStatus;
  /** Shown on the mobile bottom bar, which fits five at most. */
  readonly primary: boolean;
  /** Milestone that delivers or completes it, for `partial` and `planned`. */
  readonly milestone?: 2 | 3 | 4;
  /**
   * 24x24 icon path data. Plain geometry rather than an icon dependency —
   * eleven glyphs are not worth a package, and these inherit `currentColor`
   * so they follow the theme without a second palette.
   */
  readonly icon: string;
}

export const WORKSPACES: readonly Workspace[] = [
  {
    id: 'dashboard',
    path: '/',
    labelKey: 'nav.dashboard',
    status: 'partial',
    primary: true,
    // Today's sky, upcoming transits to the open chart and recent saved
    // charts are built. Alerts are not, and the workspace says so.
    milestone: 2,
    icon: 'M4 13h7V4H4v9Zm9 7h7V9h-7v11ZM4 20h7v-5H4v5ZM13 7h7V4h-7v3Z',
  },
  {
    id: 'chart',
    path: '/chart',
    labelKey: 'nav.chartStudio',
    status: 'ready',
    primary: true,
    icon: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 2a7 7 0 1 1 0 14 7 7 0 0 1 0-14Zm0 2.5L13.6 11l3.9.3-3 2.5 1 3.7L12 15.6 8.5 17.5l1-3.7-3-2.5 3.9-.3L12 7.5Z',
  },
  {
    id: 'relationships',
    path: '/relationships',
    labelKey: 'nav.relationships',
    status: 'ready',
    primary: true,
    icon: 'M9 12a4 4 0 1 1 0-8 4 4 0 0 1 0 8Zm6 0a4 4 0 1 1 0-8 4 4 0 0 1 0 8ZM3 20v-1c0-2.2 2.7-4 6-4s6 1.8 6 4v1H3Zm12.5-5.2c2 .7 3.5 2.1 3.5 4.2v1h2v-1c0-2-1.9-3.6-5.5-4.2Z',
  },
  {
    id: 'events',
    path: '/events',
    labelKey: 'nav.eventExplorer',
    status: 'ready',
    primary: true,
    icon: 'M10 2a8 8 0 1 0 4.9 14.3l5.4 5.4 1.4-1.4-5.4-5.4A8 8 0 0 0 10 2Zm0 2a6 6 0 1 1 0 12 6 6 0 0 1 0-12Z',
  },
  {
    id: 'calendar',
    path: '/calendar',
    labelKey: 'nav.calendar',
    status: 'ready',
    primary: true,
    icon: 'M7 2v2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2V2h-2v2H9V2H7ZM5 10h14v10H5V10Z',
  },
  {
    id: 'vedic',
    path: '/vedic',
    labelKey: 'nav.vedic',
    status: 'ready',
    primary: false,
    // A rāśi chart: the square with its diagonals, as the North Indian figure.
    icon: 'M3 3h18v18H3V3Zm2 2v14h14V5H5Zm1.4 0L12 10.6 17.6 5H6.4ZM5 6.4v11.2L10.6 12 5 6.4Zm14 0L13.4 12 19 17.6V6.4ZM6.4 19h11.2L12 13.4 6.4 19Z',
  },
  {
    id: 'gann',
    path: '/gann',
    labelKey: 'nav.gannLab',
    status: 'partial',
    primary: false,
    // Square of Nine, anchored fans and planetary projections are built and
    // tested; circular and polygon layouts, annotations and saved templates
    // are not, and the workspace lists them rather than leaving a gap.
    milestone: 3,
    icon: 'M3 3h18v18H3V3Zm2 2v14h14V5H5Zm2 2h10v10H7V7Zm2 2v6h6V9H9Z',
  },
  {
    id: 'research',
    path: '/research',
    labelKey: 'nav.research',
    status: 'ready',
    primary: false,
    icon: 'M3 20h18v2H3v-2Zm2-7h3v6H5v-6Zm5-5h3v11h-3V8Zm5-4h3v15h-3V4Z',
  },
  {
    id: 'clients',
    path: '/clients',
    labelKey: 'nav.clients',
    status: 'planned',
    primary: false,
    milestone: 4,
    icon: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0 2c-4 0-7 2-7 4.5V21h14v-2.5C19 16 16 14 12 14Z',
  },
  {
    id: 'reports',
    path: '/reports',
    labelKey: 'nav.reports',
    status: 'ready',
    primary: false,
    icon: 'M6 2h8l4 4v16H6V2Zm7 1.5V7h3.5L13 3.5ZM8 11h8v2H8v-2Zm0 4h8v2H8v-2Z',
  },
  {
    id: 'settings',
    path: '/settings',
    labelKey: 'nav.settings',
    status: 'ready',
    primary: false,
    icon: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm9 4-2.1-.6a7 7 0 0 0-.7-1.7l1.1-1.9-1.6-1.6-1.9 1.1a7 7 0 0 0-1.7-.7L13.5 3h-3l-.6 2.1a7 7 0 0 0-1.7.7L6.3 4.7 4.7 6.3l1.1 1.9a7 7 0 0 0-.7 1.7L3 10.5v3l2.1.6c.2.6.4 1.2.7 1.7l-1.1 1.9 1.6 1.6 1.9-1.1c.5.3 1.1.5 1.7.7l.6 2.1h3l.6-2.1a7 7 0 0 0 1.7-.7l1.9 1.1 1.6-1.6-1.1-1.9c.3-.5.5-1.1.7-1.7L21 13.5v-3Z',
  },
];

/** Bottom-bar items. Five is the most a phone fits without crowding. */
export const PRIMARY_WORKSPACES: readonly Workspace[] = WORKSPACES.filter((w) => w.primary);

export function workspaceByPath(path: string): Workspace | undefined {
  // Longest match first, so `/chart` does not shadow a future `/chart/x`.
  return [...WORKSPACES]
    .sort((a, b) => b.path.length - a.path.length)
    .find((w) => (w.path === '/' ? path === '/' : path.startsWith(w.path)));
}
