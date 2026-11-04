/**
 * Client for the Neon-backed API.
 *
 * Calculation never depends on this module: charts are cast locally and the app
 * works offline. The cloud only stores chart INPUTS a visitor chooses to save.
 *
 * ## Owner key
 *
 * There are no accounts. Each device generates a random 256-bit key on first
 * save and keeps it in localStorage; the server stores only its SHA-256 and
 * lists only charts saved under it. Clearing browser storage therefore loses
 * access to those charts — the panel says so, and offers the key for copying so
 * it can be restored on another device.
 */
import type { BirthData, ChartSettings } from '@astro/engine';

const OWNER_KEY_STORAGE = 'astro.ownerKey';

/**
 * API origin. Empty for the web app (same origin, no CORS). The Android build
 * sets VITE_API_BASE because its WebView origin is https://localhost.
 */
const API_BASE: string = (import.meta.env.VITE_API_BASE as string | undefined) ?? '';

export class CloudError extends Error {
  constructor(readonly code: string, readonly status: number) {
    super(code);
  }
}

function randomKey(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function getOwnerKey(): string {
  try {
    const existing = localStorage.getItem(OWNER_KEY_STORAGE);
    if (existing && /^[0-9a-f]{64}$/.test(existing)) return existing;
    const key = randomKey();
    localStorage.setItem(OWNER_KEY_STORAGE, key);
    return key;
  } catch {
    // Storage blocked: a per-session key still lets saving work this session.
    return (globalThis as { __astroSessionKey?: string }).__astroSessionKey ??= randomKey();
  }
}

/** Replace the device key, e.g. to restore charts saved on another device. */
export function setOwnerKey(key: string): boolean {
  const normalised = key.trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(normalised)) return false;
  try {
    localStorage.setItem(OWNER_KEY_STORAGE, normalised);
    return true;
  } catch {
    return false;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: {
        'content-type': 'application/json',
        'x-astro-owner': getOwnerKey(),
        ...init.headers,
      },
    });
  } catch {
    throw new CloudError('OFFLINE', 0);
  }
  /*
   * A 200 does not mean the body is ours.
   *
   * The dev server has no /api, so it answers every API path with index.html
   * and status 200. `response.json()` then throws, the catch substitutes `{}`,
   * `response.ok` is true, and the caller receives an object with none of the
   * fields it expects — which crashed the saved-charts panel on `undefined.length`
   * and, with no error boundary, blanked the whole workspace.
   *
   * The same shape arrives in production from any proxy or captive portal that
   * returns an HTML error page with a 200. So the body is parsed strictly and a
   * non-JSON response is an error, not an empty success.
   */
  let body: ({ error?: string } & T) | null = null;
  try {
    body = (await response.json()) as { error?: string } & T;
  } catch {
    body = null;
  }
  if (!response.ok) throw new CloudError(body?.error ?? 'INTERNAL', response.status);
  if (body === null || typeof body !== 'object') throw new CloudError('MALFORMED_RESPONSE', response.status);
  return body;
}

export interface SavedChartSummary {
  readonly id: string;
  readonly name: string;
  readonly birth: BirthData;
  readonly summary: { sun?: string; moon?: string; ascendant?: string };
  readonly engine_fingerprint: string | null;
  readonly created_at: string;
}

export async function listCharts(): Promise<readonly SavedChartSummary[]> {
  const { charts } = await request<{ charts: SavedChartSummary[] }>('/api/charts');
  // Checked rather than trusted: returning `undefined` here is what reached
  // the panel as `undefined.length`.
  if (!Array.isArray(charts)) throw new CloudError('MALFORMED_RESPONSE', 200);
  return charts;
}

export async function saveChart(input: {
  name: string;
  birth: BirthData;
  settings: Partial<ChartSettings>;
  summary: SavedChartSummary['summary'];
  engineFingerprint?: string;
}): Promise<SavedChartSummary> {
  return (
    await request<{ chart: SavedChartSummary }>('/api/charts', {
      method: 'POST',
      body: JSON.stringify(input),
    })
  ).chart;
}

export async function deleteChart(id: string): Promise<void> {
  await request(`/api/charts?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function getChartSettings(id: string): Promise<Partial<ChartSettings>> {
  const { chart } = await request<{ chart: { settings: Partial<ChartSettings> } }>(
    `/api/charts?id=${encodeURIComponent(id)}`,
  );
  return chart.settings ?? {};
}
