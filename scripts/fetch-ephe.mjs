/**
 * Fetches the Swiss Ephemeris data files used by the NATIVE oracle in the
 * reference test-suite. The shipped application does NOT need these — the WASM
 * engine bundles its own data (see docs/ASTRONOMY_NOTES.md).
 *
 * Source: official Astrodienst repository, https://github.com/aloistr/swisseph
 * These files are Swiss Ephemeris data and carry its licence; see docs/LICENSING.md.
 */
import { mkdir, writeFile, stat } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DEST = join(ROOT, 'packages', 'engine', 'ephe');
const BASE = 'https://raw.githubusercontent.com/aloistr/swisseph/master/ephe';

/** 1800-2400 CE coverage: planets, moon, and the asteroid file that carries Chiron. */
const FILES = [
  { name: 'sepl_18.se1', approxKB: 473 },
  { name: 'semo_18.se1', approxKB: 1274 },
  { name: 'seas_18.se1', approxKB: 218 },
];

await mkdir(DEST, { recursive: true });

for (const { name, approxKB } of FILES) {
  const target = join(DEST, name);
  try {
    const s = await stat(target);
    if (s.size > 0) {
      console.log(`skip  ${name} (already present, ${(s.size / 1024).toFixed(0)} KB)`);
      continue;
    }
  } catch {
    /* not present — fall through and download */
  }
  process.stdout.write(`fetch ${name} (~${approxKB} KB) ... `);
  const res = await fetch(`${BASE}/${name}`);
  if (!res.ok) throw new Error(`failed to fetch ${name}: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(target, buf);
  console.log(`ok (${(buf.length / 1024).toFixed(0)} KB)`);
}
console.log(`\nEphemeris files ready in ${DEST}`);
