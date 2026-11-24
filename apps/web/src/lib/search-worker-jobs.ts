/**
 * The financial-astrology jobs, shared by the search worker and its
 * main-thread fallback. Kept out of search-worker.ts so importing them never
 * installs the worker's message listener on the main thread.
 */
import { findAspectWindows, type SwissEphWasmProvider, type WindowSearchOptions, type AspectWindow } from '@astro/engine';
import {
  combustionEpisodes, sampleCombustion,
  type CombustionProfile, type CombustionEpisode, type CombustionSample,
} from '@astro/research';
import { vedhaForDay, type CalcSettings, type SbcTradition, type ResolvedTarget, type VedhaDay } from '@astro/vedic';

export interface CombustionJob {
  readonly fromJd: number;
  readonly toJd: number;
  readonly profile: CombustionProfile;
  /** Instants to sample (session closes, or a fixed daily time). */
  readonly sampleJds: readonly number[];
}
export interface CombustionJobResult {
  readonly episodes: readonly CombustionEpisode[];
  readonly samples: readonly CombustionSample[];
  readonly ephemerisVersion: string;
}
export interface VedhaJob {
  readonly days: readonly { readonly date: string; readonly jd: number }[];
  readonly settings: CalcSettings;
  readonly tradition: SbcTradition;
  readonly targets: readonly ResolvedTarget[];
}
export interface VedhaJobResult {
  readonly days: readonly VedhaDay[];
  readonly ephemerisVersion: string;
}

export function runCombustionJob(engine: SwissEphWasmProvider, job: CombustionJob): CombustionJobResult {
  const episodes = combustionEpisodes(engine, job.fromJd, job.toJd, job.profile);
  return { episodes, samples: sampleCombustion(engine, job.sampleJds, episodes, job.profile), ephemerisVersion: engine.ephemerisVersion() };
}
export function runWindowsJob(engine: SwissEphWasmProvider, jobs: readonly WindowSearchOptions[]): readonly AspectWindow[] {
  return jobs.flatMap((o) => findAspectWindows(engine, o));
}
export function runVedhaJob(engine: SwissEphWasmProvider, job: VedhaJob): VedhaJobResult {
  return { days: job.days.map((d) => vedhaForDay(engine, d.date, d.jd, job.settings, job.tradition, job.targets)), ephemerisVersion: engine.ephemerisVersion() };
}

