/**
 * Long searches, off the main thread.
 *
 * ## Why
 *
 * Measured on this machine, with the engine warm:
 *
 * | operation                  | time    |
 * |----------------------------|--------:|
 * | natal chart                |  1.6 ms |
 * | aspectarian, one month     |  490 ms |
 * | aspectarian, one year      | 4894 ms |
 * | transits, one year         | 4174 ms |
 *
 * A natal chart is imperceptible and belongs on the main thread. Five seconds
 * is not a slow render — it is a frozen tab: no scrolling, no cancel button, no
 * repaint, and on a phone the system may offer to kill the page. Yielding to
 * paint a spinner before the stall does not help, because the stall is the
 * problem.
 *
 * So the searches that take seconds run here. The engine is the same pure
 * TypeScript, unchanged; it simply has its own provider instance in this
 * thread.
 *
 * ## The cost, stated
 *
 * A second provider means a second WASM instance and a second copy of the
 * ephemeris — roughly 2.6 MB. The worker is therefore created lazily, on the
 * first long search, so a reader who only ever casts charts never pays it.
 */
import {
  SwissEphWasmProvider,
  buildAspectarian,
  findTransitHits,
  analyseCycle,
  type AspectarianOptions,
  type CycleAnalysis,
  type CycleSearchOptions,
  type AspectEvent,
  type TransitHit,
  type TransitOptions,
} from '@astro/engine';

export type WorkerRequest =
  | { readonly id: number; readonly kind: 'aspectarian'; readonly options: AspectarianOptions }
  | { readonly id: number; readonly kind: 'transits'; readonly options: TransitOptions }
  | { readonly id: number; readonly kind: 'cycle'; readonly options: CycleSearchOptions };

export type WorkerResponse =
  | { readonly id: number; readonly ok: true; readonly result: unknown }
  | {
      readonly id: number;
      readonly ok: false;
      readonly message: string;
      /** Engine error code when there is one, so the UI can translate it. */
      readonly code?: string;
    };

export type AspectarianResult = readonly AspectEvent[];
export type TransitsResult = readonly TransitHit[];
export type CycleResult = CycleAnalysis;

let providerPromise: Promise<SwissEphWasmProvider> | undefined;

function provider(): Promise<SwissEphWasmProvider> {
  providerPromise ??= (async () => {
    const instance = new SwissEphWasmProvider();
    await instance.init();
    return instance;
  })();
  return providerPromise;
}

self.addEventListener('message', (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  void (async () => {
    try {
      const engine = await provider();
      let result: unknown;
      switch (request.kind) {
        case 'aspectarian':
          result = buildAspectarian(engine, request.options);
          break;
        case 'transits':
          result = findTransitHits(engine, request.options);
          break;
        case 'cycle':
          result = analyseCycle(engine, request.options);
          break;
      }
      const response: WorkerResponse = { id: request.id, ok: true, result };
      self.postMessage(response);
    } catch (cause) {
      /*
       * An Error does not survive structured clone with its class or its
       * `code` intact, so the parts the UI needs are extracted here. Losing the
       * code would mean every engine error — an unsupported date, a degenerate
       * house system — reaching the reader as "something went wrong".
       */
      const error = cause as { message?: string; code?: string };
      const response: WorkerResponse = {
        id: request.id,
        ok: false,
        message: error?.message ?? String(cause),
        ...(error?.code ? { code: error.code } : {}),
      };
      self.postMessage(response);
    }
  })();
});
