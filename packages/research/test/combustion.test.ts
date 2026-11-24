/**
 * Venus combustion: the band rule at its boundaries, episodes and their
 * events, and the chart-record facts that depend on time certainty.
 *
 * Exact conjunction instants are re-derived independently with the native
 * Swiss Ephemeris build (`sweph`) by bisection on the Sun–Venus longitude
 * difference, and checked against the published dates: inferior conjunction
 * 23 March 2025, superior 6 January 2026, inferior 24 October 2026 (UT).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import native from 'sweph';
import { SwissEphWasmProvider, julianDay, norm180 } from '@astro/engine';
import {
  VENUS_COMBUSTION_V1, validatePreset, bandFor, combustionEpisodes, sampleCombustion,
  type CombustionPreset,
} from '../src/combustion/venus.js';
import { episodeObservations, dailyStateObservations, sweepOrbs, sweepCandidates, dailySampleJds } from '../src/combustion/study.js';
import { deriveChartFacts } from '../src/chartFacts.js';
import { CHART_RECORDS, validateRecord } from '../src/instruments.js';

const EPHE = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'engine', 'ephe');
const HAVE_ORACLE = existsSync(join(EPHE, 'sepl_18.se1'));
const NC = native.constants;

let provider: SwissEphWasmProvider;
beforeAll(async () => {
  if (HAVE_ORACLE) native.set_ephe_path(EPHE);
  provider = new SwissEphWasmProvider();
  await provider.init();
});
afterAll(() => provider.close());

const profile = { zodiac: { kind: 'tropical' } as const, preset: VENUS_COMBUSTION_V1 };

describe('the band rule', () => {
  it('accepts the research preset and refuses gaps, overlaps and a missing open band', () => {
    expect(validatePreset(VENUS_COMBUSTION_V1)).toEqual([]);
    const swap: CombustionPreset = { ...VENUS_COMBUSTION_V1, bands: [VENUS_COMBUSTION_V1.bands[1]!, VENUS_COMBUSTION_V1.bands[0]!, ...VENUS_COMBUSTION_V1.bands.slice(2)] };
    expect(validatePreset(swap).map((p) => p.code)).toContain('BOUND_NOT_INCREASING');
    const closed: CombustionPreset = { ...VENUS_COMBUSTION_V1, bands: VENUS_COMBUSTION_V1.bands.slice(0, 4) };
    expect(validatePreset(closed).map((p) => p.code)).toEqual(['LAST_BAND_NOT_OPEN']);
    const early: CombustionPreset = { ...VENUS_COMBUSTION_V1, bands: [{ id: 'x', upTo: null, score: 0 }, ...VENUS_COMBUSTION_V1.bands] };
    expect(validatePreset(early).map((p) => p.code)).toContain('OPEN_BAND_NOT_LAST');
    expect(validatePreset({ ...VENUS_COMBUSTION_V1, version: ' ' }).map((p) => p.code)).toContain('NO_VERSION');
  });

  it('puts each bound in the lower band and a hair above it in the next', () => {
    const eps = 1e-9;
    const cases: [number, string, number][] = [
      [0, 'very-strong', -90], [1, 'very-strong', -90], [1 + eps, 'strong', -70],
      [3 - eps, 'strong', -70], [3, 'strong', -70], [3 + eps, 'moderate', -40],
      [5, 'moderate', -40], [5 + eps, 'transition', -20],
      [8, 'transition', -20], [8 + eps, 'outside', 0], [179, 'outside', 0],
    ];
    for (const [sep, id, score] of cases) {
      const band = bandFor(sep, VENUS_COMBUSTION_V1);
      expect([sep, band.id, band.score]).toEqual([sep, id, score]);
    }
  });
});

function oracleConjunction(fromJd: number, toJd: number): number {
  const d = (jd: number): number => {
    const sun = native.calc_ut(jd, NC.SE_SUN, NC.SEFLG_SWIEPH).data[0]!;
    const venus = native.calc_ut(jd, NC.SE_VENUS, NC.SEFLG_SWIEPH).data[0]!;
    return norm180(venus - sun);
  };
  let lo = fromJd; let hi = toJd;
  for (let i = 0; i < 60; i += 1) { const mid = (lo + hi) / 2; if (Math.sign(d(mid)) === Math.sign(d(lo))) lo = mid; else hi = mid; }
  return (lo + hi) / 2;
}

describe('combustion episodes', () => {
  const from = julianDay({ year: 2025, month: 1, day: 1 }, 0);
  const to = julianDay({ year: 2026, month: 12, day: 31 }, 0);

  it('finds the three conjunctions of 2025–26 with their kind, matching the native build to a second', () => {
    const episodes = combustionEpisodes(provider, from, to, profile);
    expect(episodes.map((e) => [new Date((e.exactJds[0]! - 2440587.5) * 864e5).toISOString().slice(0, 10), e.conjunction])).toEqual([
      ['2025-03-23', 'inferior'], ['2026-01-06', 'superior'], ['2026-10-24', 'inferior'],
    ]);
    if (HAVE_ORACLE) {
      for (const e of episodes) {
        const ref = oracleConjunction(e.exactJds[0]! - 1, e.exactJds[0]! + 1);
        expect(Math.abs(ref - e.exactJds[0]!) * 86400).toBeLessThan(1);
      }
    }
  });

  it('orders entry, band crossings, exact and exit, all under one episode id', () => {
    const [e] = combustionEpisodes(provider, from, to, profile);
    const kinds = e!.events.map((x) => `${x.kind}${x.band ? `:${x.band}` : ''}`);
    expect(kinds).toEqual([
      'entry:transition', 'band-entry:moderate', 'band-entry:strong', 'band-entry:very-strong',
      'exact',
      'band-exit:very-strong', 'band-exit:strong', 'band-exit:moderate', 'exit:transition',
    ]);
    expect(new Set(e!.events.map((x) => x.episodeId))).toEqual(new Set([e!.id]));
    // Crossings sit on their bounds; applying before exact, separating after.
    const at = (k: string) => e!.events.find((x) => `${x.kind}${x.band ? `:${x.band}` : ''}` === k)!;
    expect(at('entry:transition').state.separation).toBeCloseTo(8, 5);
    expect(at('band-entry:strong').state.separation).toBeCloseTo(3, 5);
    expect(at('band-entry:strong').state.phase).toBe('applying');
    expect(at('band-exit:strong').state.phase).toBe('separating');
  });

  it('labels daily samples with the episode they fall in, and only those as daily-state observations', () => {
    const days = dailySampleJds('2025-03-10', '2025-04-05', '10:00', 'Asia/Kolkata');
    const episodes = combustionEpisodes(provider, from, to, profile);
    const samples = sampleCombustion(provider, days.map((d) => d.jd), episodes, profile);
    const inside = samples.filter((s) => s.episodeId !== null);
    expect(new Set(inside.map((s) => s.episodeId))).toEqual(new Set([episodes[0]!.id]));
    for (const s of samples) expect(s.episodeId === null).toBe(s.state.separation > 8);
    const daily = dailyStateObservations(days.map((d) => d.date), samples);
    expect(daily).toHaveLength(inside.length);
    expect(new Set(daily.map((o) => o.keys.band))).toEqual(new Set(['very-strong', 'strong', 'moderate', 'transition']));
  });

  it('gives each episode one observation per chosen event', () => {
    const episodes = combustionEpisodes(provider, from, to, profile);
    expect(episodeObservations(episodes, 'exact')).toHaveLength(3);
    expect(episodeObservations(episodes, 'entry').every((o) => o.keys.event === 'entry')).toBe(true);
  });

  it('sweeps orbs from 0.5° to 8° and never beyond the window', () => {
    expect(sweepOrbs(profile)).toEqual([0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8]);
    const days = dailySampleJds('2025-03-10', '2025-04-05', '10:00', 'Asia/Kolkata');
    const episodes = combustionEpisodes(provider, from, to, profile);
    const samples = sampleCombustion(provider, days.map((d) => d.jd), episodes, profile);
    const c = sweepCandidates(days.map((d) => d.date), samples, [1, 8]);
    expect(c[0]!.observations.length).toBeLessThan(c[1]!.observations.length);
  });

  it('runs fifteen years in reasonable time and finds every conjunction', () => {
    const t0 = performance.now();
    const episodes = combustionEpisodes(provider, julianDay({ year: 2011, month: 1, day: 1 }, 0), julianDay({ year: 2026, month: 1, day: 1 }, 0), profile);
    const ms = performance.now() - t0;
    // Two conjunctions every 583.9 days: 18 or 19 in fifteen years.
    expect(episodes.length).toBeGreaterThanOrEqual(18);
    expect(episodes.length).toBeLessThanOrEqual(20);
    expect(ms).toBeLessThan(15_000);
    const kinds = episodes.filter((e) => e.conjunction !== null).map((e) => e.conjunction);
    for (let i = 1; i < kinds.length; i += 1) expect(kinds[i]).not.toBe(kinds[i - 1]);
  }, 30_000);
});

describe('chart records', () => {
  const settings = { zodiac: { kind: 'sidereal', ayanamsha: 'lahiri' } as const, nodeType: 'mean' as const, houseSystem: 'wholeSign' as const };
  it('derives the Moon and ascendant of the provisional NIFTY launch and keeps it provisional', () => {
    const rec = CHART_RECORDS.find((r) => r.id === 'nifty50-launch-provisional')!;
    const f = deriveChartFacts(provider, rec, settings);
    expect(f.moon.status).toBe('provisional');
    expect(f.ascendant?.status).toBe('provisional');
    expect(f.ascendant!.longitude).toBeGreaterThanOrEqual(0);
  });
  it('changes with the ayanamsha', () => {
    const rec = CHART_RECORDS.find((r) => r.id === 'nifty50-launch-provisional')!;
    const lahiri = deriveChartFacts(provider, rec, settings).moon.longitude;
    const raman = deriveChartFacts(provider, rec, { ...settings, zodiac: { kind: 'sidereal', ayanamsha: 'raman' } }).moon.longitude;
    const jd = deriveChartFacts(provider, rec, settings).jd!;
    const expected = provider.ayanamsha(jd, { kind: 'sidereal', ayanamsha: 'lahiri' }) - provider.ayanamsha(jd, { kind: 'sidereal', ayanamsha: 'raman' });
    expect(norm180(raman - lahiri)).toBeCloseTo(expected, 6);
  });
  it('gives a date-only record no ascendant, and a noon Moon labelled as a convention', () => {
    const rec = CHART_RECORDS.find((r) => r.id === 'reliance-incorporation')!;
    const f = deriveChartFacts(provider, rec, settings);
    expect(f.jd).toBeNull();
    expect(f.ascendant).toBeNull();
    expect(f.moon.status).toBe('noon-convention');
    expect(typeof f.moon.certainForDay).toBe('boolean');
  });
  it('refuses a time on a date-only record and a record without a source', () => {
    const rec = CHART_RECORDS.find((r) => r.id === 'reliance-incorporation')!;
    expect(validateRecord({ ...rec, time: '10:00' })).toContain('TIME_WITHOUT_CERTAINTY');
    expect(validateRecord({ ...rec, source: ' ' })).toContain('NO_SOURCE');
    for (const r of CHART_RECORDS) expect(validateRecord(r)).toEqual([]);
  });
});
