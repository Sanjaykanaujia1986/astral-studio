/**
 * Saved financial-astrology studies and the calculation record they carry.
 *
 * A saved study is its CONFIGURATION, not its numbers: the instrument, range,
 * every calculation setting (zodiac and ayanāṁśa, node, house system), the
 * rule set and its version, the ephemeris version that ran it and the
 * fingerprint of each dataset read. Reopening it puts every setting back and
 * re-runs; if the loaded data's fingerprint differs, the screen says so
 * rather than presenting different numbers under the old name.
 *
 * Only a run that finished is saved. A cancelled or failed run has no
 * "complete" status to save, and `saveStudy` refuses anything else.
 */
import type { HouseSystem, NodeType, ZodiacMode } from '@astro/engine';

const KEY = 'astro.fa.studies';
const MAX = 50;

export interface CalcRecord {
  readonly zodiac: ZodiacMode;
  readonly nodeType: NodeType;
  readonly houseSystem: HouseSystem;
  /** As the loaded library reports it, e.g. "2.10.03". */
  readonly ephemerisVersion: string;
  /** The rule or preset that judged the measurements: id and version. */
  readonly ruleSet: { readonly id: string; readonly version: string };
}

export interface DatasetRef {
  readonly instrumentId: string;
  readonly fingerprint: string;
  readonly sourceLabel: string;
  readonly firstDate: string;
  readonly lastDate: string;
  readonly rows: number;
}

export type StudyKind = 'venus-combustion' | 'daily-vedha';
export type RunStatus = 'idle' | 'running' | 'complete' | 'cancelled' | 'failed';

export interface SavedStudy {
  readonly id: string;
  readonly kind: StudyKind;
  readonly name: string;
  readonly savedAt: string;
  readonly status: 'complete';
  /** The screen's own form state, enough to reproduce the run. */
  readonly config: Readonly<Record<string, unknown>>;
  readonly calc: CalcRecord;
  readonly datasets: readonly DatasetRef[];
  /** A few headline counts, for the list; never used as results. */
  readonly summary: Readonly<Record<string, string | number>>;
}

/** Stable JSON: keys sorted at every level, so equal settings give equal keys. */
export function stableKey(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableKey).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>).filter(([, v]) => v !== undefined).sort(([a], [b]) => (a < b ? -1 : 1));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableKey(v)}`).join(',')}}`;
}

/**
 * A cache of finished runs keyed by EVERY setting that changes the result —
 * zodiac, ayanāṁśa, node type, rule version, range, dataset fingerprint — so a
 * switch of ayanāṁśa or node never returns a stale answer.
 */
export class RunCache<T> {
  readonly #map = new Map<string, T>();
  constructor(readonly limit = 8) {}
  get(settings: unknown): T | undefined { return this.#map.get(stableKey(settings)); }
  set(settings: unknown, value: T): void {
    const k = stableKey(settings);
    this.#map.delete(k);
    this.#map.set(k, value);
    while (this.#map.size > this.limit) this.#map.delete(this.#map.keys().next().value!);
  }
  get size(): number { return this.#map.size; }
}

export function listStudies(): SavedStudy[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? (parsed as SavedStudy[]).filter((s) => s && s.status === 'complete') : [];
  } catch { return []; }
}

export class StudyNotCompleteError extends Error {
  constructor(status: RunStatus) { super(`only a complete run can be saved (this one is ${status})`); this.name = 'StudyNotCompleteError'; }
}

export function saveStudy(study: Omit<SavedStudy, 'id' | 'savedAt' | 'status'>, runStatus: RunStatus): SavedStudy {
  if (runStatus !== 'complete') throw new StudyNotCompleteError(runStatus);
  const saved: SavedStudy = { ...study, id: `${study.kind}-${Date.now().toString(36)}`, savedAt: new Date().toISOString(), status: 'complete' };
  const all = [saved, ...listStudies()].slice(0, MAX);
  localStorage.setItem(KEY, JSON.stringify(all));
  return saved;
}

export function removeStudy(id: string): void {
  try { localStorage.setItem(KEY, JSON.stringify(listStudies().filter((s) => s.id !== id))); } catch { /* nothing to remove */ }
}

/** Which datasets a saved study read that are not loaded now, or loaded with different data. */
export function datasetMismatches(study: SavedStudy, loaded: Readonly<Record<string, { fingerprint: string } | undefined>>): { instrumentId: string; problem: 'NOT_LOADED' | 'DIFFERENT_DATA' }[] {
  return study.datasets.flatMap((d): { instrumentId: string; problem: 'NOT_LOADED' | 'DIFFERENT_DATA' }[] => {
    const now = loaded[d.instrumentId];
    if (!now) return [{ instrumentId: d.instrumentId, problem: 'NOT_LOADED' as const }];
    return now.fingerprint === d.fingerprint ? [] : [{ instrumentId: d.instrumentId, problem: 'DIFFERENT_DATA' as const }];
  });
}
