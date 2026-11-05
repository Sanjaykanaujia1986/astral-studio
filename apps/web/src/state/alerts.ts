/**
 * Alerts the reader has set on specific events.
 *
 * ## What this is, and what it is not
 *
 * An alert here is a **saved question**, re-asked every time the dashboard
 * opens: "is Saturn within 1° of my natal Sun in the next ninety days?" The
 * answer is computed from the ephemeris at that moment.
 *
 * Nothing runs while the app is closed. Nothing is pushed, emailed or
 * notified. Calling these "alerts" and leaving that unsaid would be the
 * misrepresentation the brief warns about, so the panel states it where the
 * alerts are listed, not in a footnote.
 *
 * They live in this browser, like the display settings and for the same
 * reason: an alert is a per-device convenience, and quietly shipping someone's
 * list of what they are watching to a database is not something they asked
 * for.
 */
import { create } from 'zustand';
import type { AspectName, Body } from '@astro/engine';

/** What an alert watches. A natal body, an angle, or a fixed ecliptic degree. */
export type AlertTarget =
  | { readonly kind: 'natalBody'; readonly body: Body }
  | { readonly kind: 'angle'; readonly id: 'asc' | 'mc' }
  | { readonly kind: 'degree'; readonly longitude: number };

export interface Alert {
  readonly id: string;
  readonly transitBody: Body;
  readonly aspect: AspectName;
  readonly target: AlertTarget;
  /** How close counts, in degrees. */
  readonly orb: number;
  readonly enabled: boolean;
  readonly createdIso: string;
}

const STORAGE_KEY = 'astro.alerts';

function load(): readonly Alert[] {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    /*
     * Checked rather than trusted. A hand-edited or older entry that is
     * missing `transitBody` would otherwise reach the transit search and
     * throw there, where the cause is much harder to see.
     */
    return parsed.filter((entry): entry is Alert => {
      if (typeof entry !== 'object' || entry === null) return false;
      const a = entry as Partial<Alert>;
      return typeof a.id === 'string'
        && typeof a.transitBody === 'string'
        && typeof a.aspect === 'string'
        && typeof a.orb === 'number'
        && Number.isFinite(a.orb)
        && typeof a.target === 'object' && a.target !== null;
    });
  } catch {
    return [];
  }
}

function persist(alerts: readonly Alert[]): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(alerts));
  } catch {
    /* the list simply will not survive a reload */
  }
}

function newId(): string {
  // Not security-sensitive: this only has to be unique within one browser's
  // list, so a timestamp plus a short random tail is enough.
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

interface AlertsState {
  readonly alerts: readonly Alert[];
  add: (alert: Omit<Alert, 'id' | 'createdIso' | 'enabled'>) => void;
  remove: (id: string) => void;
  toggle: (id: string) => void;
  clear: () => void;
}

export const useAlerts = create<AlertsState>((set, get) => ({
  alerts: load(),

  add(alert) {
    const next = [
      ...get().alerts,
      { ...alert, id: newId(), enabled: true, createdIso: new Date().toISOString() },
    ];
    set({ alerts: next });
    persist(next);
  },

  remove(id) {
    const next = get().alerts.filter((alert) => alert.id !== id);
    set({ alerts: next });
    persist(next);
  },

  toggle(id) {
    const next = get().alerts.map(
      (alert) => (alert.id === id ? { ...alert, enabled: !alert.enabled } : alert),
    );
    set({ alerts: next });
    persist(next);
  },

  clear() {
    set({ alerts: [] });
    persist([]);
  },
}));

/** Target id as the transit search names it, for matching a hit to an alert. */
export function targetId(target: AlertTarget): string {
  if (target.kind === 'natalBody') return target.body;
  if (target.kind === 'angle') return target.id;
  return `degree:${target.longitude}`;
}

export function describeTarget(target: AlertTarget): string {
  if (target.kind === 'degree') return `${target.longitude}°`;
  return targetId(target);
}
