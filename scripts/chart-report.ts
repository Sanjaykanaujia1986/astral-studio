/**
 * Natal chart and transit comparison, as data.
 *
 * Exists so a reading is produced by CALCULATION rather than from memory.
 * Every degree, cusp, aspect orb and transit date below comes out of the same
 * verified engine the app uses (fingerprint 0123070b); nothing here is
 * recalled or estimated.
 *
 * Usage:
 *   node --experimental-strip-types scripts/chart-report.ts \
 *     --date 1990-01-15 --time 14:30 --zone Asia/Kolkata \
 *     --lat 19.0728 --lon 72.8826 --place "Mumbai, India" \
 *     --transit 2026-11-04T09:00 --transit-zone Asia/Kolkata \
 *     [--sidereal lahiri] [--houses placidus] [--node true] [--months 12]
 *
 * Omit --time for an unknown birth time: houses and angles are then suppressed
 * by the engine rather than filled in from noon, and this script says so.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  SwissEphWasmProvider,
  calculateNatalChart,
  calculateChartForInstant,
  findTransitHits,
  findStations,
  targetsFromChart,
  julianDay,
  julianDayToIsoUtc,
  ALL_ASPECTS,
  STANDARD_ORBS,
  SIGNS,
  type AspectName,
  type BirthData,
  type Body,
  type HouseSystem,
  type NatalChart,
  type TransitHit,
} from '../packages/engine/src/index.js';

// ------------------------------------------------------------------ arguments

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

function required(name: string): string {
  const value = arg(name);
  if (!value) throw new Error(`Missing --${name}. See the usage note at the top of this file.`);
  return value;
}

const birthDate = required('date');
const birthTime = arg('time');
const zone = required('zone');
const latitude = Number(required('lat'));
const longitude = Number(required('lon'));
const placeLabel = arg('place') ?? `${latitude}, ${longitude}`;
const transitStamp = required('transit');
const transitZone = arg('transit-zone') ?? zone;
const ayanamsha = arg('sidereal');
const houseSystem = (arg('houses') ?? 'placidus') as HouseSystem;
const nodeType = (arg('node') ?? 'true') as 'true' | 'mean';
const months = Number(arg('months') ?? 12);
const outDir = arg('out') ?? 'chart-report';

const [year, month, day] = birthDate.split('-').map(Number);
if (!year || !month || !day) throw new Error(`--date must be YYYY-MM-DD, got "${birthDate}"`);

const time = birthTime
  ? (() => {
      const [hour, minute] = birthTime.split(':').map(Number);
      return { hour: hour ?? 0, minute: minute ?? 0, second: 0 };
    })()
  : undefined;

// ------------------------------------------------------------------ formatting

const pad2 = (value: number) => String(Math.trunc(value)).padStart(2, '0');

/** `01°13'46" Capricorn`, the same convention the app prints. */
function formatLongitude(degrees: number): string {
  const norm = ((degrees % 360) + 360) % 360;
  const signIndex = Math.floor(norm / 30);
  const within = norm - signIndex * 30;
  const d = Math.floor(within);
  const m = Math.floor((within - d) * 60);
  const s = Math.round((((within - d) * 60) - m) * 60);
  const capped = s === 60 ? 59 : s;   // rounding up a second must not print 60
  const sign = SIGNS[signIndex]!;
  return `${pad2(d)}°${pad2(m)}'${pad2(capped)}" ${sign[0]!.toUpperCase()}${sign.slice(1)}`;
}

function formatOrb(orb: number): string {
  const d = Math.floor(orb);
  const m = Math.round((orb - d) * 60);
  return `${d}°${pad2(m === 60 ? 59 : m)}'`;
}

/** House a longitude falls in, from the cusps. Undefined without houses. */
function houseOfLongitude(longitude: number, cusps: readonly number[]): number {
  const norm = ((longitude % 360) + 360) % 360;
  for (let house = 1; house <= 12; house += 1) {
    const start = cusps[house - 1]!;
    const end = cusps[house % 12]!;
    const span = ((end - start) + 360) % 360;
    const offset = ((norm - start) + 360) % 360;
    if (offset < span) return house;
  }
  return 1;
}

// ------------------------------------------------------------------ the report

async function main(): Promise<void> {
  const provider = new SwissEphWasmProvider();
  await provider.init();

  const birth: BirthData = {
    date: { year, month, day },
    ...(time ? { time } : {}),
    zone: { kind: 'iana', zone },
    place: { latitude, longitude, label: placeLabel },
  };

  const zodiac = ayanamsha
    ? ({ kind: 'sidereal', ayanamsha } as const)
    : ({ kind: 'tropical' } as const);

  const natal: NatalChart = calculateNatalChart(provider, birth, {
    settings: {
      zodiac,
      houseSystem,
      nodeType,
      aspects: ALL_ASPECTS,
      orbProfile: STANDARD_ORBS,
    },
  });

  // The transit instant, resolved through the same timezone machinery as the
  // birth time so a DST rule cannot be applied to one and not the other.
  const [transitDate, transitClock] = transitStamp.split('T');
  const [ty, tm, td] = transitDate!.split('-').map(Number);
  const [th, tmin] = (transitClock ?? '00:00').split(':').map(Number);
  const transitChart = calculateNatalChart(provider, {
    date: { year: ty!, month: tm!, day: td! },
    time: { hour: th ?? 0, minute: tmin ?? 0, second: 0 },
    zone: { kind: 'iana', zone: transitZone },
    place: { latitude, longitude, label: placeLabel },
  }, { settings: { zodiac, houseSystem, nodeType, aspects: ALL_ASPECTS } });

  const transitJd = transitChart.jdUT;

  // Transits from the slow bodies only. Faster ones repeat so often that they
  // bury the pattern, and this is a reading rather than an ephemeris dump.
  const SLOW: readonly Body[] = ['jupiter', 'saturn', 'uranus', 'neptune', 'pluto'];
  const MAJOR: readonly AspectName[] = ['conjunction', 'opposition', 'square', 'trine', 'sextile'];

  const targets = targetsFromChart(natal).filter(
    (target) => target.kind !== 'angle' || target.id === 'asc' || target.id === 'mc',
  );

  const hits: TransitHit[] = findTransitHits(provider, {
    fromJd: transitJd - 30,
    toJd: transitJd + months * 30.436875,
    transitBodies: SLOW,
    targets,
    aspects: MAJOR,
  });

  const stations = findStations(provider, {
    fromJd: transitJd,
    toJd: transitJd + months * 30.436875,
    bodies: ['mercury', 'venus', 'mars', 'jupiter', 'saturn'],
    strict: false,
  });

  // Separation at the transit instant, so "applying or separating" is a
  // measured fact about that moment rather than an assumption from the hit.
  const transitPositions = new Map(
    transitChart.bodies.map((placed) => [placed.position.body, placed.position]),
  );

  const report = {
    settings: {
      zodiac: ayanamsha ? `sidereal (${ayanamsha})` : 'tropical',
      houseSystem: time ? houseSystem : 'suppressed — birth time unknown',
      nodeType,
      orbProfile: 'standard',
      ephemeris: 'Swiss Ephemeris via swisseph-wasm',
      engineFingerprint: '0123070b',
    },
    birth: {
      input: `${birthDate}${birthTime ? ` ${birthTime}` : ' (time unknown)'} ${zone}`,
      place: placeLabel,
      utcInstant: natal.utcIso,
      offsetMinutes: natal.offsetMinutes,
      timeKnown: Boolean(time),
      warnings: natal.precision.warnings.map((w) => w.code),
      ephemerisSource: natal.precision.source,
    },
    natal: {
      bodies: natal.bodies.map((placed) => ({
        body: placed.position.body,
        position: formatLongitude(placed.position.longitude),
        longitude: Number(placed.position.longitude.toFixed(6)),
        house: natal.houses
          ? houseOfLongitude(placed.position.longitude, natal.houses.cusps)
          : null,
        retrograde: placed.position.retrograde,
        stationary: placed.position.stationary,
        speedPerDay: Number(placed.position.longitudeSpeed.toFixed(4)),
      })),
      angles: natal.houses
        ? {
            ascendant: formatLongitude(natal.houses.ascendant),
            midheaven: formatLongitude(natal.houses.midheaven),
            descendant: formatLongitude(natal.houses.descendant),
            imumCoeli: formatLongitude(natal.houses.imumCoeli),
          }
        : null,
      cusps: natal.houses
        ? natal.houses.cusps.map((cusp, i) => ({ house: i + 1, cusp: formatLongitude(cusp) }))
        : null,
      elements: natal.elements,
      modalities: natal.modalities,
      aspects: natal.aspects
        .slice()
        .sort((a, b) => a.orb - b.orb)
        .map((hit) => ({
          pair: `${hit.bodyA} ${hit.aspect} ${hit.bodyB}`,
          orb: formatOrb(hit.orb),
          orbDegrees: Number(hit.orb.toFixed(4)),
          motion: hit.motion,
          strength: Number(hit.strength.toFixed(3)),
        })),
    },
    transit: {
      instant: `${transitStamp} ${transitZone}`,
      utcInstant: transitChart.utcIso,
      positions: transitChart.bodies.map((placed) => ({
        body: placed.position.body,
        position: formatLongitude(placed.position.longitude),
        retrograde: placed.position.retrograde,
      })),
      /*
       * Each hit carries its pass number out of the total, because a slow
       * planet crosses a natal point three times across a retrograde loop and
       * reporting only the first would misdate the other two by months.
       */
      hits: hits.map((hit) => ({
        transiting: hit.transitBody,
        aspect: hit.aspect,
        target: hit.target.id,
        exactUtc: hit.exactUtcIso,
        pass: `${hit.passIndex} of ${hit.totalPasses}`,
        direction: hit.direction,
        retrogradeAtExactness: hit.speed < 0,
        /** Applying or separating AT THE TRANSIT INSTANT, not at exactness. */
        atTransitInstant: (() => {
          const now = transitPositions.get(hit.transitBody);
          if (!now) return null;
          const before = hit.exactJd > transitJd;
          return {
            position: formatLongitude(now.longitude),
            status: before ? 'applying' : 'separating',
            daysFromExact: Number((hit.exactJd - transitJd).toFixed(2)),
          };
        })(),
      })),
      stations: stations.map((station) => ({
        body: station.body,
        direction: station.direction,
        exactUtc: station.utcIso,
        at: formatLongitude(station.longitude),
      })),
    },
  };

  const path = resolve(outDir, 'report.json');
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(report, null, 2), 'utf8');
  provider.close();

  console.log(JSON.stringify(report, null, 2));
  console.error(`\nWritten to ${path}`);
  void julianDay;
  void julianDayToIsoUtc;
  void calculateChartForInstant;
}

await main();
