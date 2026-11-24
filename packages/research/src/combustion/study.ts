/**
 * Turning combustion episodes and samples into event-study observations.
 *
 * Two explicit modes, never mixed in one table:
 *
 * - **Episode study**: one observation per episode, at one chosen event —
 *   entry, the exact conjunction (the first pass when Venus makes more than
 *   one) or exit — at its refined instant.
 * - **Daily-state study**: every session whose close falls inside a band is
 *   an observation, sampled AT that session's close. Sessions and distinct
 *   episodes are both reported, because a long episode contributes many
 *   sessions and they are not independent.
 */
import { resolveCivilTime, julianDay, type EphemerisProvider } from '@astro/engine';
import { minutesOf, type ExchangeCalendar } from '../market/calendar.js';
import type { StudyObservation, SweepCandidate } from '../eventstudy/engine.js';
import {
  bandFor, sampleCombustion, windowOrb,
  type CombustionEpisode, type CombustionProfile, type CombustionSample,
} from './venus.js';

const msOf = (jd: number): number => (jd - 2440587.5) * 86_400_000;

/** The UT Julian Day of each session's close, on the instrument's calendar. */
export function sessionCloseJds(dates: readonly string[], calendar: ExchangeCalendar): number[] {
  const m = minutesOf(calendar.closeLocal);
  return dates.map((date) => {
    const [y, mo, d] = date.split('-').map(Number);
    return resolveCivilTime({ year: y!, month: mo!, day: d! }, { hour: Math.floor(m / 60), minute: m % 60, second: 0 }, calendar.timeZone, { onNonexistent: 'shift-forward' }).jdUT;
  });
}

/** A fixed local sampling time (say 10:00 Asia/Kolkata) on each calendar day from `from` to `to`, inclusive. */
export function dailySampleJds(from: string, to: string, localTime: string, timeZone: string): { date: string; jd: number }[] {
  const out: { date: string; jd: number }[] = [];
  const m = minutesOf(localTime);
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= Date.parse(`${to}T00:00:00Z`); t += 86_400_000) {
    const date = new Date(t).toISOString().slice(0, 10);
    const [y, mo, d] = date.split('-').map(Number);
    out.push({ date, jd: resolveCivilTime({ year: y!, month: mo!, day: d! }, { hour: Math.floor(m / 60), minute: m % 60, second: 0 }, timeZone, { onNonexistent: 'shift-forward' }).jdUT });
  }
  return out;
}

export type EpisodeEventChoice = 'entry' | 'exact' | 'exit';

/** One observation per episode at the chosen event; episodes without that event (cut by the range, or never exact) are left out. */
export function episodeObservations(episodes: readonly CombustionEpisode[], choice: EpisodeEventChoice): StudyObservation[] {
  const out: StudyObservation[] = [];
  for (const e of episodes) {
    const jd = choice === 'entry' ? e.entryJd : choice === 'exit' ? e.exitJd : (e.exactJds[0] ?? null);
    if (jd === null) continue;
    out.push({
      id: `${e.id}:${choice}`, episodeId: e.id, instantMs: msOf(jd),
      keys: { event: choice, conjunction: e.conjunction ?? 'none' },
    });
  }
  return out;
}

/** Daily-state observations: each sampled session inside a band, keyed by band and phase. */
export function dailyStateObservations(dates: readonly string[], samples: readonly CombustionSample[]): StudyObservation[] {
  const out: StudyObservation[] = [];
  samples.forEach((s, i) => {
    if (s.episodeId === null || s.band.upTo === null) return;
    out.push({
      id: `${dates[i]}:${s.band.id}`, episodeId: s.episodeId, instantMs: msOf(s.jd),
      keys: { band: s.band.id, phase: s.state.phase },
    });
  });
  return out;
}

/** The orbs a sweep tries: from `from` to `to` in `step`, never past the window's own orb. */
export function sweepOrbs(profile: CombustionProfile, from = 0.5, to = 8, step = 0.5): number[] {
  const limit = windowOrb(profile.preset);
  const out: number[] = [];
  for (let x = from; x <= Math.min(to, limit) + 1e-9; x += step) out.push(Math.round(x * 1000) / 1000);
  return out;
}

/** For each orb, the sessions whose sampled separation is within it: the sweep's candidates. */
export function sweepCandidates(dates: readonly string[], samples: readonly CombustionSample[], orbs: readonly number[]): SweepCandidate[] {
  return orbs.map((value) => ({
    value,
    observations: samples.flatMap((s, i) => (s.episodeId !== null && s.state.separation <= value
      ? [{ id: `${dates[i]}:${value}`, episodeId: s.episodeId, instantMs: msOf(s.jd), keys: {} }]
      : [])),
  }));
}

/** Convenience: sample every session close of a series. */
export function sampleSessions(
  provider: EphemerisProvider, dates: readonly string[], calendar: ExchangeCalendar,
  episodes: readonly CombustionEpisode[], profile: CombustionProfile,
): CombustionSample[] {
  return sampleCombustion(provider, sessionCloseJds(dates, calendar), episodes, profile);
}

/** UT Julian Day at 00:00 UTC of an ISO date: range bounds for an episode search. */
export function jdOfDate(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return julianDay({ year: y!, month: m!, day: d! }, 0);
}
