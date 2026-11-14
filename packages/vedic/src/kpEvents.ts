/**
 * KP event pages: for a life matter, the cusps that govern it and its kārakas,
 * each read through the sub lord → star lord chain against the matter's
 * favourable and unfavourable houses, as the reference reports lay them out
 * (docs/VEDIC_CONVENTIONS.md §12).
 *
 * This reports which houses each link signifies. It does not turn that into a
 * prediction: KP practice weighs the links together with the daśā and the
 * ruling planets at the time of judgment.
 */
import type { Graha } from './grahas.js';
import type { KpChart } from './kp.js';

export interface KpEventDef {
  readonly id: string;
  /** Kārakas with an optional role (the reports' wording, as an i18n key suffix). */
  readonly karakas: readonly { readonly planet: Graha; readonly role?: string }[];
  /** Cusps to examine. */
  readonly houses: readonly number[];
  readonly favourable: readonly number[];
  readonly unfavourable: readonly number[];
  /** Houses the reports list in brackets, as also favourable / unfavourable in some readings. */
  readonly alsoFavourable?: readonly number[];
  readonly alsoUnfavourable?: readonly number[];
}

export const KP_EVENTS: readonly KpEventDef[] = [
  { id: 'vehicle', karakas: [{ planet: 'venus' }], houses: [4], favourable: [1, 4, 11], unfavourable: [3, 8, 12] },
  { id: 'travel', karakas: [{ planet: 'mercury' }, { planet: 'moon' }], houses: [9, 12, 3], favourable: [3, 9, 12], unfavourable: [8, 11, 2, 4] },
  { id: 'education', karakas: [{ planet: 'mercury', role: 'memory' }, { planet: 'jupiter', role: 'application' }], houses: [4, 9], favourable: [4, 9, 6, 11], unfavourable: [3, 8, 12], alsoFavourable: [10] },
  { id: 'loans', karakas: [], houses: [6], favourable: [2, 6, 10, 11], unfavourable: [5, 9, 12] },
  { id: 'speculation', karakas: [], houses: [2, 5, 11, 12], favourable: [2, 5, 6, 10, 11], unfavourable: [5, 8, 9, 12] },
  { id: 'legal', karakas: [{ planet: 'jupiter', role: 'judge' }, { planet: 'mercury', role: 'lawyer' }], houses: [9, 6], favourable: [6, 9, 11, 3], unfavourable: [5, 8, 12] },
  { id: 'marriage', karakas: [{ planet: 'venus' }, { planet: 'jupiter', role: 'female' }], houses: [7, 11, 2, 8, 5], favourable: [2, 7, 5, 11], unfavourable: [1, 4, 6, 10, 12], alsoFavourable: [8], alsoUnfavourable: [8] },
  { id: 'children', karakas: [{ planet: 'jupiter' }], houses: [5, 11, 2, 8], favourable: [2, 5, 11], unfavourable: [1, 4, 10, 12] },
  { id: 'health', karakas: [{ planet: 'sun' }], houses: [1], favourable: [1, 5, 11], unfavourable: [6, 8, 12] },
  { id: 'disease', karakas: [{ planet: 'saturn' }], houses: [6], favourable: [1, 6, 8, 12], unfavourable: [] },
  { id: 'recovery', karakas: [{ planet: 'jupiter' }], houses: [5, 11], favourable: [1, 5, 11], unfavourable: [6, 8, 12] },
  { id: 'earning', karakas: [{ planet: 'jupiter' }], houses: [2, 11], favourable: [2, 6, 10, 11], unfavourable: [5, 9, 8, 12] },
  { id: 'service', karakas: [{ planet: 'saturn' }], houses: [6, 10], favourable: [2, 6, 10, 11], unfavourable: [5, 9, 8, 12] },
  { id: 'industry', karakas: [{ planet: 'saturn' }, { planet: 'mars' }], houses: [6, 10], favourable: [2, 6, 10, 11], unfavourable: [5, 9, 8, 12] },
  { id: 'business', karakas: [{ planet: 'mercury' }], houses: [2, 7, 11], favourable: [2, 6, 10, 11], unfavourable: [5, 8, 9, 12] },
  { id: 'profession', karakas: [{ planet: 'jupiter' }], houses: [9], favourable: [2, 4, 6, 9, 10, 11], unfavourable: [3, 8, 12] },
  { id: 'property', karakas: [{ planet: 'mars', role: 'building' }, { planet: 'saturn', role: 'land' }], houses: [4], favourable: [1, 4, 11], unfavourable: [3, 12, 8] },
];

export interface KpLink {
  readonly planet: Graha;
  readonly inHouses: readonly number[];
  readonly owns: readonly number[];
}

export interface KpEventRow {
  /** The cusp, or undefined for a kāraka row. */
  readonly cusp?: number;
  /** For a cusp: its sub lord. For a kāraka row: the kāraka itself. */
  readonly lead: KpLink;
  readonly role?: string;
  /** Star lord of `lead`. */
  readonly star: KpLink;
  /** Planets signifying the cusp (cusp rows only). */
  readonly significators?: readonly Graha[];
  /** Houses of the matter's favourable / unfavourable lists the chain touches. */
  readonly favourableHit: readonly number[];
  readonly unfavourableHit: readonly number[];
}

export interface KpEvent { readonly def: KpEventDef; readonly rows: readonly KpEventRow[] }

export function kpEvent(k: KpChart, def: KpEventDef): KpEvent {
  const link = (p: Graha): KpLink => {
    const b = k.bodies.find((x) => x.body === p)!;
    return { planet: p, inHouses: b.inHouses, owns: b.owns };
  };
  const row = (lead: Graha, extra: { cusp?: number; role?: string; significators?: Graha[] }): KpEventRow => {
    const a = link(lead);
    const starLord = k.bodies.find((x) => x.body === lead)!.lords.star;
    const s = link(starLord);
    const touched = new Set([...a.inHouses, ...a.owns, ...s.inHouses, ...s.owns]);
    return {
      ...extra, lead: a, star: s,
      favourableHit: def.favourable.filter((h) => touched.has(h)),
      unfavourableHit: def.unfavourable.filter((h) => touched.has(h)),
    };
  };
  const sigOf = (h: number): Graha[] =>
    (Object.keys(k.significators) as Graha[]).filter((g) => k.significators[g].includes(h));
  return {
    def,
    rows: [
      ...def.houses.map((h) => row(k.cusps[h - 1]!.lords.sub, { cusp: h, significators: sigOf(h) })),
      ...def.karakas.map((c) => row(c.planet, c.role ? { role: c.role } : {})),
    ],
  };
}

export const kpEvents = (k: KpChart): KpEvent[] => KP_EVENTS.map((d) => kpEvent(k, d));
