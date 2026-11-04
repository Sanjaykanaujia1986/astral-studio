/**
 * Stages runtime assets into public/ before dev and build.
 *
 * Two things cannot be bundled as normal modules:
 *
 * 1. The Swiss Ephemeris WASM payload. `swisseph-wasm` hardcodes its
 *    locateFile as `new URL('../wasm/' + path, import.meta.url)`, with no
 *    override. In a production build the importing chunk lands in /assets/,
 *    so that resolves to /wasm/<file> at the site root — which is exactly
 *    where copying into public/wasm puts them.
 *
 * 2. The 3.2 MB city database, which is fetched on demand rather than bundled
 *    so it never blocks first paint.
 */
import { mkdir, copyFile, stat } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..', '..');
const PUBLIC = join(HERE, '..', 'public');

const jobs = [
  { from: join(ROOT, 'node_modules', 'swisseph-wasm', 'wasm', 'swisseph.wasm'), to: join(PUBLIC, 'wasm', 'swisseph.wasm') },
  { from: join(ROOT, 'node_modules', 'swisseph-wasm', 'wasm', 'swisseph.data'), to: join(PUBLIC, 'wasm', 'swisseph.data') },
  { from: join(ROOT, 'packages', 'locations', 'data', 'cities.json'), to: join(PUBLIC, 'data', 'cities.json') },
];

for (const { from, to } of jobs) {
  try {
    await stat(from);
  } catch {
    if (from.endsWith('cities.json')) {
      console.error(
        `\nMISSING: ${from}\n` +
        `Run: npm run build:data -w packages/locations\n`,
      );
      process.exit(1);
    }
    throw new Error(`missing required asset: ${from}`);
  }
  await mkdir(dirname(to), { recursive: true });
  await copyFile(from, to);
  const { size } = await stat(to);
  console.log(`staged ${to.replace(PUBLIC, 'public')}  ${(size / 1048576).toFixed(2)} MB`);
}
