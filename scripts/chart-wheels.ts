/**
 * Render a natal wheel and a natal–transit bi-wheel to standalone SVG files.
 *
 * Server-side rendering of the same component the app uses, so what lands in
 * the file is what a reader sees on screen — no second drawing path to drift.
 *
 * Usage mirrors chart-report.ts:
 *   node_modules/.bin/jiti scripts/chart-wheels.ts --date ... --out <dir>
 *
 * Written with `createElement` rather than JSX so it runs under a plain TS
 * loader: a script that needs its own build step is a script that rots.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import * as React from 'react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

/*
 * The loader compiles JSX to the CLASSIC runtime (`React.createElement`),
 * while the components are written for the automatic one and so do not import
 * React themselves. Providing it globally is the one-line bridge; without it
 * every component throws "React is not defined" at render time.
 */
(globalThis as { React?: typeof React }).React = React;
import {
  SwissEphWasmProvider,
  calculateNatalChart,
  ALL_ASPECTS,
  STANDARD_ORBS,
  type BirthData,
  type HouseSystem,
} from '../packages/engine/src/index.js';
import { ChartWheel } from '../packages/ui/src/chart-wheel/ChartWheel.tsx';

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}
function required(name: string): string {
  const value = arg(name);
  if (!value) throw new Error(`Missing --${name}`);
  return value;
}

const [year, month, day] = required('date').split('-').map(Number);
const birthTime = arg('time');
const zone = required('zone');
const latitude = Number(required('lat'));
const longitude = Number(required('lon'));
const placeLabel = arg('place') ?? '';
const transitStamp = required('transit');
const transitZone = arg('transit-zone') ?? zone;
const ayanamsha = arg('sidereal');
const houseSystem = (arg('houses') ?? 'placidus') as HouseSystem;
const nodeType = (arg('node') ?? 'true') as 'true' | 'mean';
const outDir = arg('out') ?? 'chart-report';
const subjectName = arg('name');

const time = birthTime
  ? (() => {
      const [hour, minute] = birthTime.split(':').map(Number);
      return { hour: hour ?? 0, minute: minute ?? 0, second: 0 };
    })()
  : undefined;

/** A standalone .svg file needs its own XML declaration; the component's
 *  markup is a fragment meant for a live DOM. */
function standalone(markup: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n${markup}\n`;
}

async function main(): Promise<void> {
  const provider = new SwissEphWasmProvider();
  await provider.init();

  const zodiac = ayanamsha
    ? ({ kind: 'sidereal', ayanamsha } as const)
    : ({ kind: 'tropical' } as const);
  const settings = {
    zodiac, houseSystem, nodeType, aspects: ALL_ASPECTS, orbProfile: STANDARD_ORBS,
  };

  const birth: BirthData = {
    date: { year: year!, month: month!, day: day! },
    ...(time ? { time } : {}),
    zone: { kind: 'iana', zone },
    place: { latitude, longitude, label: placeLabel },
    ...(subjectName ? { name: subjectName } : {}),
  };
  const natal = calculateNatalChart(provider, birth, { settings });

  const [tDate, tClock] = transitStamp.split('T');
  const [ty, tm, td] = tDate!.split('-').map(Number);
  const [th, tmin] = (tClock ?? '00:00').split(':').map(Number);
  const transit = calculateNatalChart(provider, {
    date: { year: ty!, month: tm!, day: td! },
    time: { hour: th ?? 0, minute: tmin ?? 0, second: 0 },
    zone: { kind: 'iana', zone: transitZone },
    place: { latitude, longitude, label: placeLabel },
  }, { settings });

  mkdirSync(resolve(outDir), { recursive: true });

  writeFileSync(
    resolve(outDir, 'natal-wheel.svg'),
    standalone(renderToStaticMarkup(createElement(ChartWheel, {
      chart: natal,
      size: 900,
      ...(subjectName ? { subjectName } : {}),
    }))),
    'utf8',
  );

  writeFileSync(
    resolve(outDir, 'biwheel.svg'),
    standalone(renderToStaticMarkup(createElement(ChartWheel, {
      chart: natal,
      outerChart: transit,
      outerLabel: transitStamp.replace('T', ' '),
      size: 900,
      ...(subjectName ? { subjectName } : {}),
    }))),
    'utf8',
  );

  provider.close();
  console.error(`Wrote natal-wheel.svg and biwheel.svg to ${resolve(outDir)}`);
}

await main();
