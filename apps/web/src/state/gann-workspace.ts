/**
 * Saved templates and annotations for Gann Lab.
 *
 * Both kept in this browser, for the reason the alerts are: a template is a
 * set of working preferences and an annotation is a private note about
 * someone's own trading, and neither is something to ship to a database
 * unasked.
 *
 * Both are validated on load rather than trusted. A stored entry written by
 * an older version, or edited by hand, would otherwise reach the figures and
 * fail where the cause is much harder to see than here.
 */
import { create } from 'zustand';
import type { FanDirection, SpiralDirection } from '@astro/gann';

/** Everything the workspace needs to reproduce a drawing. */
export interface GannTemplateSettings {
  readonly layout: 'square' | 'circle' | 'polygon';
  readonly originValue: number;
  readonly increment: number;
  readonly rings: number;
  readonly direction: SpiralDirection;
  readonly divisions: number;
  readonly sides: number;
  readonly priceUnits: number;
  readonly timeUnits: number;
  readonly fanDirection: FanDirection;
  readonly anchorIndex: number | null;
  readonly showGrid: boolean;
  readonly pricePerCell: number;
  readonly barsPerCell: number;
  readonly gridSize: number;
}

export interface GannTemplate {
  readonly id: string;
  readonly name: string;
  readonly savedIso: string;
  readonly settings: GannTemplateSettings;
}

/**
 * A note pinned to a place on a drawing.
 *
 * `chart` notes are pinned to a bar and a price, which is where the reader
 * put them; `square` notes to a value, which is what the spiral is made of.
 * Pinning both to pixels would move every note the first time the figure was
 * resized.
 */
export type GannAnnotation =
  | {
      readonly id: string;
      readonly kind: 'chart';
      readonly text: string;
      readonly barIndex: number;
      readonly price: number;
      readonly createdIso: string;
    }
  | {
      readonly id: string;
      readonly kind: 'square';
      readonly text: string;
      readonly value: number;
      readonly createdIso: string;
    };

const TEMPLATE_KEY = 'astro.gann.templates';
const ANNOTATION_KEY = 'astro.gann.annotations';

function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function read<T>(key: string, valid: (entry: unknown) => entry is T): readonly T[] {
  try {
    const raw = globalThis.localStorage?.getItem(key);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(valid) : [];
  } catch {
    return [];
  }
}

function write(key: string, value: unknown): void {
  try {
    globalThis.localStorage?.setItem(key, JSON.stringify(value));
  } catch {
    /* the entry simply will not survive a reload */
  }
}

function isTemplate(entry: unknown): entry is GannTemplate {
  if (typeof entry !== 'object' || entry === null) return false;
  const t = entry as Partial<GannTemplate>;
  return typeof t.id === 'string'
    && typeof t.name === 'string'
    && typeof t.settings === 'object' && t.settings !== null
    // The one field a drawing cannot be rebuilt without.
    && typeof (t.settings as Partial<GannTemplateSettings>).originValue === 'number';
}

function isAnnotation(entry: unknown): entry is GannAnnotation {
  if (typeof entry !== 'object' || entry === null) return false;
  const a = entry as Partial<GannAnnotation>;
  if (typeof a.id !== 'string' || typeof a.text !== 'string') return false;
  if (a.kind === 'chart') {
    return typeof a.barIndex === 'number' && Number.isFinite(a.barIndex)
      && typeof a.price === 'number' && Number.isFinite(a.price);
  }
  if (a.kind === 'square') {
    return typeof a.value === 'number' && Number.isFinite(a.value);
  }
  return false;
}

/**
 * Omit that distributes over a union.
 *
 * A plain `Omit<GannAnnotation, 'id' | 'createdIso'>` collapses the union to
 * the keys the two members share, so `value` and `barIndex` both disappear
 * and the caller can pass neither. Distributing keeps each member whole.
 */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

export type NewAnnotation = DistributiveOmit<GannAnnotation, 'id' | 'createdIso'>;

interface WorkspaceState {
  readonly templates: readonly GannTemplate[];
  readonly annotations: readonly GannAnnotation[];
  saveTemplate: (name: string, settings: GannTemplateSettings) => void;
  deleteTemplate: (id: string) => void;
  addAnnotation: (annotation: NewAnnotation) => void;
  deleteAnnotation: (id: string) => void;
}

export const useGannWorkspace = create<WorkspaceState>((set, get) => ({
  templates: read(TEMPLATE_KEY, isTemplate),
  annotations: read(ANNOTATION_KEY, isAnnotation),

  saveTemplate(name, settings) {
    const trimmed = name.trim();
    if (!trimmed) return;
    // Saving under an existing name replaces it: two templates called
    // "working" would be indistinguishable in the list.
    const without = get().templates.filter((t) => t.name !== trimmed);
    const next = [
      ...without,
      { id: newId(), name: trimmed, savedIso: new Date().toISOString(), settings },
    ];
    set({ templates: next });
    write(TEMPLATE_KEY, next);
  },

  deleteTemplate(id) {
    const next = get().templates.filter((t) => t.id !== id);
    set({ templates: next });
    write(TEMPLATE_KEY, next);
  },

  addAnnotation(annotation) {
    if (!annotation.text.trim()) return;
    const next = [
      ...get().annotations,
      { ...annotation, id: newId(), createdIso: new Date().toISOString() } as GannAnnotation,
    ];
    set({ annotations: next });
    write(ANNOTATION_KEY, next);
  },

  deleteAnnotation(id) {
    const next = get().annotations.filter((a) => a.id !== id);
    set({ annotations: next });
    write(ANNOTATION_KEY, next);
  },
}));
