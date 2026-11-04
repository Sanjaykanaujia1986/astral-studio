/**
 * The search client: worker path and fallback.
 *
 * The fallback exists because on Android the WebView version is chosen by the
 * device rather than by us, and a phone whose WebView predates module workers
 * is a real user. An untested fallback is a guess about what happens on the
 * machines you cannot see, so both paths are exercised here.
 *
 * A fake Worker stands in for the real one. Running the actual worker under
 * jsdom would test jsdom's worker shim rather than this module's logic, and the
 * engine inside it is already covered by its own suite.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/** Records what was posted and lets a test answer it. */
class FakeWorker implements Partial<Worker> {
  static instances: FakeWorker[] = [];
  static failConstruction = false;

  readonly posted: unknown[] = [];
  #listeners = new Map<string, ((event: unknown) => void)[]>();
  terminated = false;

  constructor() {
    if (FakeWorker.failConstruction) throw new Error('Worker is not defined');
    FakeWorker.instances.push(this);
  }

  addEventListener(type: string, listener: (event: unknown) => void): void {
    const list = this.#listeners.get(type) ?? [];
    list.push(listener);
    this.#listeners.set(type, list);
  }

  postMessage(message: unknown): void {
    this.posted.push(message);
  }

  terminate(): void {
    this.terminated = true;
  }

  /** Deliver a response as the real worker would. */
  respond(data: unknown): void {
    for (const listener of this.#listeners.get('message') ?? []) listener({ data });
  }

  /** Raise a worker-level error, which belongs to no single request. */
  fail(message: string): void {
    for (const listener of this.#listeners.get('error') ?? []) listener({ message });
  }
}

async function loadClient() {
  // Fresh module per test: the client caches its worker in module scope, which
  // is correct behaviour and would otherwise leak between cases.
  vi.resetModules();
  return import('../src/lib/search.js');
}

const OPTIONS = {
  fromJd: 2_460_000,
  toJd: 2_460_001,
  bodies: ['sun', 'moon'],
  aspects: ['conjunction'],
} as never;

beforeEach(() => {
  FakeWorker.instances = [];
  FakeWorker.failConstruction = false;
  vi.stubGlobal('Worker', FakeWorker);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('when a worker is available', () => {
  it('posts the request and resolves with the worker result', async () => {
    const { searchAspectarian } = await loadClient();
    const promise = searchAspectarian(OPTIONS);

    // Constructed lazily, on the first search rather than at import.
    expect(FakeWorker.instances).toHaveLength(1);
    const worker = FakeWorker.instances[0]!;
    const request = worker.posted[0] as { id: number; kind: string };
    expect(request.kind).toBe('aspectarian');

    worker.respond({ id: request.id, ok: true, result: ['event'] });
    await expect(promise).resolves.toEqual(['event']);
  });

  it('creates only one worker however many searches run', async () => {
    const { searchAspectarian, searchTransits } = await loadClient();
    void searchAspectarian(OPTIONS);
    void searchTransits(OPTIONS);
    void searchAspectarian(OPTIONS);
    expect(FakeWorker.instances).toHaveLength(1);
    expect(FakeWorker.instances[0]!.posted).toHaveLength(3);
  });

  it('matches responses to requests by id, not by arrival order', async () => {
    /*
     * Two searches in flight is the normal case — a reader changes the range
     * while the first is still running. Resolving by arrival order would hand
     * the second search's results to the first, which looks like a
     * calculation bug rather than a plumbing one.
     */
    const { searchAspectarian } = await loadClient();
    const first = searchAspectarian(OPTIONS);
    const second = searchAspectarian(OPTIONS);
    const worker = FakeWorker.instances[0]!;
    const [a, b] = worker.posted as { id: number }[];

    // Answer them out of order.
    worker.respond({ id: b!.id, ok: true, result: ['second'] });
    worker.respond({ id: a!.id, ok: true, result: ['first'] });

    await expect(first).resolves.toEqual(['first']);
    await expect(second).resolves.toEqual(['second']);
  });

  it('rejects with the engine error code preserved', async () => {
    // An Error does not survive structured clone, so the code is carried
    // separately. Losing it would turn every engine error into "something went
    // wrong" for the reader.
    const { searchAspectarian, SearchError } = await loadClient();
    const promise = searchAspectarian(OPTIONS);
    const worker = FakeWorker.instances[0]!;
    const { id } = worker.posted[0] as { id: number };

    worker.respond({ id, ok: false, message: 'out of range', code: 'dateOutOfRange' });

    await expect(promise).rejects.toBeInstanceOf(SearchError);
    await expect(promise).rejects.toMatchObject({ code: 'dateOutOfRange' });
  });

  it('fails every outstanding request when the worker itself dies', async () => {
    // A worker-level error belongs to no single request, so leaving the others
    // pending would hang the UI on a spinner for ever.
    const { searchAspectarian } = await loadClient();
    const first = searchAspectarian(OPTIONS);
    const second = searchAspectarian(OPTIONS);
    FakeWorker.instances[0]!.fail('worker exploded');

    await expect(first).rejects.toThrow(/worker exploded/);
    await expect(second).rejects.toThrow(/worker exploded/);
  });

  it('ignores a response whose id it does not recognise', async () => {
    const { searchAspectarian } = await loadClient();
    const promise = searchAspectarian(OPTIONS);
    const worker = FakeWorker.instances[0]!;
    // A stale response from a terminated run must not throw or resolve
    // anything.
    expect(() => worker.respond({ id: 9999, ok: true, result: [] })).not.toThrow();
    const { id } = worker.posted[0] as { id: number };
    worker.respond({ id, ok: true, result: ['ok'] });
    await expect(promise).resolves.toEqual(['ok']);
  });

  it('reports that work is offloaded', async () => {
    const { isOffloaded } = await loadClient();
    expect(isOffloaded()).toBe(true);
  });
});

describe('when a worker cannot be created', () => {
  it('falls back to the main thread rather than failing', async () => {
    /*
     * The path a device with an old WebView takes. Blocking is worse than a
     * worker and far better than an empty panel with an error in the console.
     */
    FakeWorker.failConstruction = true;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { searchAspectarian } = await loadClient();
    vi.doMock('@astro/engine', async (importOriginal) => ({
      ...(await importOriginal<Record<string, unknown>>()),
      buildAspectarian: () => ['fallback-event'],
    }));

    // The client resolves through the engine directly; the engine is real, so
    // this asserts the fallback runs rather than what it returns.
    await expect(searchAspectarian(OPTIONS)).resolves.toBeDefined();
    expect(warn).toHaveBeenCalled();
  });

  it('reports that work is not offloaded', async () => {
    FakeWorker.failConstruction = true;
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { isOffloaded } = await loadClient();
    expect(isOffloaded()).toBe(false);
  });

  it('does not retry construction on every search', async () => {
    // Retrying would spawn an exception per keystroke on the affected device.
    FakeWorker.failConstruction = true;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { isOffloaded } = await loadClient();
    isOffloaded();
    isOffloaded();
    isOffloaded();
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
