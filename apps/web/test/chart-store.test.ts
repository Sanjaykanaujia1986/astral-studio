/**
 * The active chart survives a reload.
 *
 * ## What is actually stored
 *
 * The birth data, not the chart. These tests exist mainly to hold that line:
 * a stored `NatalChart` would be a snapshot of one engine version's output,
 * and after an ephemeris or house-code change it would keep rendering with
 * complete confidence while being wrong. A reader cannot tell a stale chart
 * from a fresh one, so the only safe thing to keep is the input.
 *
 * So the round-trip assertion is deliberately not "the same object came
 * back" — it is "recasting the stored input gives the same positions".
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import {
  SwissEphWasmProvider, TIGHT_ORBS, type BirthData,
} from '@astro/engine';

let provider: SwissEphWasmProvider;

vi.mock('../src/lib/engine.js', () => ({
  getProvider: () => Promise.resolve(provider),
  getLocations: () => new Promise(() => {}),
}));

const { useChartStore } = await import('../src/state/chart.js');

const STORAGE_KEY = 'astro.chart.input';

const MUMBAI: BirthData = {
  name: 'Test Subject',
  date: { year: 1990, month: 1, day: 15 },
  time: { hour: 14, minute: 30, second: 0 },
  zone: { kind: 'iana', zone: 'Asia/Kolkata' },
  place: { latitude: 18.9667, longitude: 72.8333, label: 'Mumbai, India' },
};

beforeAll(async () => {
  provider = new SwissEphWasmProvider();
  await provider.init();
}, 60_000);

afterAll(() => provider.close());

beforeEach(() => {
  localStorage.clear();
  useChartStore.setState({ chart: null, busy: false, hydrating: false, errorCode: null });
});

describe('persisting the active chart', () => {
  it('stores the birth data, not the chart', async () => {
    await useChartStore.getState().cast(MUMBAI, {}, 'standard');
    const raw = localStorage.getItem(STORAGE_KEY);
    expect(raw).not.toBeNull();

    const stored = JSON.parse(raw!) as Record<string, unknown>;
    expect(stored).toHaveProperty('birth');
    expect(stored).toHaveProperty('orbProfile', 'standard');
    // The giveaway that a chart was stored would be computed output.
    expect(stored).not.toHaveProperty('bodies');
    expect(stored).not.toHaveProperty('aspects');
    expect(stored).not.toHaveProperty('houses');
  });

  it('recasts the same positions after a reload', async () => {
    await useChartStore.getState().cast(MUMBAI, {}, 'standard');
    const before = useChartStore.getState().chart;
    expect(before).not.toBeNull();

    // What a reload looks like: storage survives, memory does not.
    useChartStore.setState({ chart: null, hydrating: true });
    await useChartStore.getState().restore();

    const after = useChartStore.getState().chart;
    expect(after).not.toBeNull();
    expect(useChartStore.getState().hydrating).toBe(false);
    expect(after!.input.name).toBe('Test Subject');
    expect(after!.utcIso).toBe(before!.utcIso);
    const sunBefore = before!.bodies.find((p) => p.position.body === 'sun')!;
    const sunAfter = after!.bodies.find((p) => p.position.body === 'sun')!;
    expect(sunAfter.position.longitude).toBeCloseTo(sunBefore.position.longitude, 9);
  });

  it('keeps the chart settings that were cast with it', async () => {
    await useChartStore.getState().cast(
      // `zodiac` is an object, and that is the point of the assertion below:
      // a nested setting has to survive JSON, not just a flat string.
      MUMBAI, { houseSystem: 'koch', zodiac: { kind: 'sidereal', ayanamsha: 'lahiri' } }, 'tight',
    );
    useChartStore.setState({ chart: null });
    await useChartStore.getState().restore();
    const chart = useChartStore.getState().chart;
    expect(chart).not.toBeNull();
    expect(chart!.settings.houseSystem).toBe('koch');
    expect(chart!.settings.zodiac).toEqual({ kind: 'sidereal', ayanamsha: 'lahiri' });
    expect(chart!.ayanamsha).toBeGreaterThan(0);
    /*
     * The orb profile is an id in storage and a table in the chart, so this
     * is the one setting that cannot round-trip by itself — the id has to be
     * looked up again on the way back. Asserted as the table rather than by
     * counting aspects: an aspect count moves with the aspect LIST too, and a
     * test that conflates the two passes for the wrong reason.
     */
    expect(chart!.settings.orbProfile).toEqual(TIGHT_ORBS);
  });

  it('clearing the chart clears the stored input', async () => {
    await useChartStore.getState().cast(MUMBAI, {}, 'standard');
    useChartStore.getState().clear();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(useChartStore.getState().hydrating).toBe(false);
  });
});

describe('a stored input that cannot be trusted', () => {
  // Each of these reached the engine before the input was validated, and
  // threw somewhere the reader could make no sense of.
  const junk: readonly (readonly [string, string])[] = [
    ['not JSON at all', '{oh no'],
    ['an array', '[]'],
    ['no birth data', '{"orbProfile":"standard"}'],
    ['a date with no year', '{"birth":{"date":{"month":1,"day":15},"zone":{"kind":"utc"},'
      + '"place":{"latitude":0,"longitude":0}},"orbProfile":"standard"}'],
    ['a place with a string latitude', '{"birth":{"date":{"year":1990,"month":1,"day":15},'
      + '"zone":{"kind":"utc"},"place":{"latitude":"18.9","longitude":72.8}},'
      + '"orbProfile":"standard"}'],
    ['an orb profile that was retired', '{"birth":{"date":{"year":1990,"month":1,"day":15},'
      + '"zone":{"kind":"utc"},"place":{"latitude":0,"longitude":0}},"orbProfile":"loose"}'],
  ];

  for (const [name, raw] of junk) {
    it(`ignores ${name}`, async () => {
      localStorage.setItem(STORAGE_KEY, raw);
      useChartStore.setState({ hydrating: true });
      await useChartStore.getState().restore();
      expect(useChartStore.getState().chart).toBeNull();
      // And it stops waiting, or the dashboard would never show the hero.
      expect(useChartStore.getState().hydrating).toBe(false);
      // No error is surfaced: the reader did not ask for this calculation.
      expect(useChartStore.getState().errorCode).toBeNull();
    });
  }

  it('leaves nothing stored when there was nothing to restore', async () => {
    useChartStore.setState({ hydrating: true });
    await useChartStore.getState().restore();
    expect(useChartStore.getState().hydrating).toBe(false);
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});
