/**
 * Client for the search worker, with a synchronous fallback.
 *
 * The fallback is not defensive padding. Module workers need a modern engine,
 * and on Android the WebView version is chosen by the device, not by us — a
 * phone whose WebView has not been updated in years is a real user, not a
 * hypothetical one. If the worker cannot start, the search still runs; it just
 * blocks, which is worse than a worker and far better than a blank panel.
 *
 * The fallback is exercised by a test, because an untested fallback is a
 * guess about what happens on the machines you cannot see.
 */
import {
  buildAspectarian,
  findTransitHits,
  analyseCycle,
  type AspectarianOptions,
  type AspectEvent,
  type CycleAnalysis,
  type CycleSearchOptions,
  type TransitHit,
  type TransitOptions,
} from '@astro/engine';
import { getProvider } from './engine.js';
import type { WorkerRequest, WorkerResponse } from './search-worker.js';

/** Thrown when the worker reports a failure, preserving the engine's code. */
export class SearchError extends Error {
  readonly code: string | undefined;
  constructor(message: string, code?: string) {
    super(message);
    this.name = 'SearchError';
    this.code = code;
  }
}

interface Pending {
  readonly resolve: (value: unknown) => void;
  readonly reject: (reason: unknown) => void;
}

let worker: Worker | null | undefined;
const pending = new Map<number, Pending>();
let nextId = 1;

/**
 * The worker, created on first use.
 *
 * `null` means creation was tried and failed; the difference from `undefined`
 * matters, because retrying a failed construction on every search would spawn
 * an error per keystroke.
 */
function getWorker(): Worker | null {
  if (worker !== undefined) return worker;
  try {
    worker = new Worker(new URL('./search-worker.js', import.meta.url), { type: 'module' });
    worker.addEventListener('message', (event: MessageEvent<WorkerResponse>) => {
      const response = event.data;
      const entry = pending.get(response.id);
      if (!entry) return;
      pending.delete(response.id);
      if (response.ok) entry.resolve(response.result);
      else entry.reject(new SearchError(response.message, response.code));
    });
    worker.addEventListener('error', (event) => {
      // A worker-level error is not tied to one request, so every outstanding
      // one has to be failed rather than left hanging for ever.
      const failure = new SearchError(event.message || 'search worker failed');
      for (const [, entry] of pending) entry.reject(failure);
      pending.clear();
    });
  } catch (cause) {
    console.warn('search worker unavailable, falling back to the main thread', cause);
    worker = null;
  }
  return worker;
}

function post<T>(request: Omit<WorkerRequest, 'id'>): Promise<T> | undefined {
  const active = getWorker();
  if (!active) return undefined;
  const id = nextId++;
  const promise = new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve: resolve as (value: unknown) => void, reject });
  });
  active.postMessage({ ...request, id } as WorkerRequest);
  return promise;
}

/** True when searches are running off the main thread. Reported in the UI. */
export function isOffloaded(): boolean {
  return getWorker() !== null;
}

export async function searchAspectarian(
  options: AspectarianOptions,
): Promise<readonly AspectEvent[]> {
  return (
    (await post<readonly AspectEvent[]>({ kind: 'aspectarian', options }))
    ?? buildAspectarian(await getProvider(), options)
  );
}

export async function searchTransits(
  options: TransitOptions,
): Promise<readonly TransitHit[]> {
  return (
    (await post<readonly TransitHit[]>({ kind: 'transits', options }))
    ?? findTransitHits(await getProvider(), options)
  );
}

export async function searchCycle(options: CycleSearchOptions): Promise<CycleAnalysis> {
  return (
    (await post<CycleAnalysis>({ kind: 'cycle', options }))
    ?? analyseCycle(await getProvider(), options)
  );
}

/** Test seam: forget the worker so the fallback path can be exercised. */
export function resetSearchWorkerForTesting(force?: 'unavailable'): void {
  worker?.terminate();
  pending.clear();
  worker = force === 'unavailable' ? null : undefined;
}
