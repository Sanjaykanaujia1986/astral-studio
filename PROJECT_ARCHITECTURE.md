# PROJECT_ARCHITECTURE

Professional astrology calculation and research platform — web + Android.

**Governing priority:** accuracy → reliability → testability → maintainability →
performance → UI polish. Calculation correctness is the product.

---

## 1. Technology stack

| Layer | Choice | Why |
|---|---|---|
| Language | TypeScript 7, `strict` + `noUncheckedIndexedAccess` | Off-by-one on a cusp array is a real hazard here — the compiler should catch it |
| Web | React 19 + Vite | Matches FieldPlan and InventoryPro |
| Styling | Tailwind v4 + shadcn/ui (Radix) | Matches both existing projects |
| State | Zustand (UI), React Hook Form + Zod (forms) | Matches FieldPlan |
| Ephemeris | `swisseph-wasm` (Swiss Ephemeris 2.10.03) | One implementation everywhere; measured at parity with native — see `docs/ASTRONOMY_NOTES.md` |
| Time | Luxon (IANA TZDB via ICU) | Real historical DST and LMT, not a hand-rolled offset table |
| Storage | Dexie / IndexedDB, local-first | Spec excludes all user accounts; offline-first required |
| Android | Capacitor 8 | One codebase, one engine — as InventoryPro |
| Tests | Vitest | Matches InventoryPro |
| Monorepo | npm workspaces | Built into npm 11; no extra tooling |

**Rejected:** native Kotlin (forces a second ephemeris port — two calculation
codebases to keep in agreement, which the brief forbids); Supabase-primary
(breaks offline-first, and needs anonymous policies with no auth present).

---

## 2. Folder structure

```
packages/engine/      @astro/engine — PURE TypeScript, zero React/DOM imports
  src/math/           angles, root finding          [IMPLEMENTED]
  src/time/           tz resolution, Julian Day
  src/ephemeris/      provider interface + WASM adapter
  src/zodiac/         tropical/sidereal, ayanamsha table
  src/houses/         house-system config map
  src/chart/          natal chart assembly
  src/aspects/        aspect defs, orb profiles, applying/separating
  src/transits/ cycles/ returns/ synastry/ composite/ progressions/
  ephe/               .se1 files for the native ORACLE only (gitignored)
  test/unit|integration|reference/
  src/chart/shape.ts  hemisphere/quadrant emphasis, Jones patterns
packages/interpretation/  delineation CONTENT + composer; engine never imports it
  src/catalogue/      per-language factor catalogues (English only so far)
  src/facts.ts        the validated payload an optional AI layer receives
packages/research/    financial astrology: market data, signals, statistics
  src/market/         CSV import + returns. Knows nothing about astrology.
  src/signals/        the sky as a boolean over time. Knows nothing about markets.
  src/stats/          distributions, tests, multiple-comparison control
  src/study/          joins two finished results; emits warning CODES
  src/backtest/       costs, buy-and-hold benchmark, one-bar lag
packages/gann/        Gann geometry; no function fits a parameter to data
  src/square.ts       the spiral grid, built from coordinates outward
  src/angle.ts        spiral angle <-> value: a DIFFERENT system from the grid
  src/fan.ts          anchored fans; the price-per-time scale is required
  src/projection.ts   longitude -> price, linear or via the square
packages/vedic/       Jyotiṣa on top of the engine; computes no astronomy itself
  src/nakshatra.ts    27 nakṣatras and pādas, in integer arcminutes
  src/varga.ts        divisionals, each with its OWN mapping rule
  src/vimshottari.ts  daśā periods; year length explicit and selectable
  src/panchang.ts     five limbs; vāra from real sunrise, undefined if none
packages/locations/   GeoNames build script + search API
packages/ui/          shared React components incl. the SVG chart wheel
  src/report/         paper geometry + the printable report document
  src/vedic/          North and South Indian figures (layout is pure geometry)
apps/web/             Vite app
  src/lib/search-worker.ts  long searches, off the main thread
  src/lib/search.ts         worker client + tested main-thread fallback
  src/components/SelfTestPanel.tsx  ?selftest — build fingerprint, ships in prod
  android/            Capacitor 8 project (generated; build outputs gitignored)
  test/               jsdom suite
docs/
scripts/fetch-ephe.mjs
```

**The rule that matters most:** `packages/engine` imports nothing from React,
the DOM, or the data layer. It is a pure function of (birth data + settings) →
(chart). That is what makes it testable in Node, reusable unchanged on Android,
and fast enough for batch financial research later.

**The third rule:** the engine can fingerprint itself. `runSelfTest()` hashes
eight reference charts to a milliarcsecond, and the same eight characters must
appear in Node, in the browser and in the WebView on a phone. "It is the same
code, so it must give the same numbers" is an assumption, and this project does
not make assumptions about numerical output. See `docs/ANDROID.md`.

**The second rule:** `packages/engine` does not depend on
`packages/interpretation`, and never will. The dependency runs one way only, so
nothing written in a delineation catalogue can move a number. Separating
calculation from interpretation is enforced by the dependency graph rather than
by discipline — see `docs/INTERPRETATION.md`.

---

## 3. Ephemeris architecture

A single narrow provider interface, so the ephemeris is swappable without
touching chart logic:

```ts
interface EphemerisProvider {
  init(): Promise<void>;
  calcUT(jdUT: number, body: Body, flags: number): BodyPosition;
  houses(jdUT: number, lat: number, lon: number, system: HouseSystem): HouseCusps;
  getAyanamsa(jdUT: number, mode: AyanamsaMode): number;
  close(): void;
}
```

`BodyPosition` carries **which ephemeris actually produced it**. Swiss Ephemeris
silently downgrades to Moshier outside its data range and still returns a
plausible number (measured — see `docs/ASTRONOMY_NOTES.md` §2), so the provider
compares requested against returned flags and surfaces the difference. Callers
can never receive degraded data believing it is full precision.

Coverage of the bundled data: **1800–2400 CE** at sub-arcsecond precision.
Outside it, Moshier (~1″) is used and **labelled in the UI**.

---

## 4. Configuration, not code branches

Ayanamshas and house systems are **data tables** mapping to Swiss Ephemeris
constants (`SE_SIDM_*`, house letter codes). Adding Lahiri, Raman, KP,
Yukteswar, Fagan/Bradley, True Chitrapaksha or a custom offset — or any of the
nine house systems — touches a table, never the chart engine.

Aspect definitions and orb profiles are likewise data, so minor aspects and
per-planet orbs are configuration.

Placidus and Koch are undefined near the poles. The engine returns an explicit
typed error and the UI offers a fallback system; it never emits silent garbage.

---

## 5. Data model (IndexedDB via Dexie)

Chart **inputs** are stored; chart **results** are derived and cached, never
treated as the source of truth — so a settings change or an engine fix
recomputes cleanly instead of leaving stale numbers in the database.

```
persons     id, name, birthDate, birthTime, timeKnown, locationId, tzId, notes, tags
locations   id, city, admin1, country, lat, lon, tzId, altNames      (GeoNames, CC BY 4.0)
charts      id, personId, type, settingsSnapshot, createdAt
settings    singleton: zodiac, ayanamsa, houseSystem, aspectProfile, orbProfile, locale
aspectProfiles / orbProfiles    user-editable, seeded with defaults
events      id, name, date, time, locationId, category, tags, notes  (research DB)
calcCache   key(chartInput + engineVersion + settings) -> result
```

`settingsSnapshot` records the settings each chart was built with, so a saved
chart stays reproducible after global settings change. `calcCache` is keyed on
engine version and invalidated on bump.

Backup is JSON export/import with a schema-version check and a diff preview —
**import never silently overwrites**.

---

## 6. Testing strategy

See `docs/TESTING_STRATEGY.md`. In short: unit tests for the maths, an
independent-oracle cross-check for the astronomy, golden reference charts with
documented tolerances, and integration tests over the full
birth-data → timezone → chart → aspects path.

---

## 7. Android

Capacitor wraps the built web app. The WASM engine and its bundled data run
inside the WebView, so calculation is fully offline and byte-identical to the
web build. The Android project lives at `apps/web/android/`, matching
InventoryPro's layout.

---

## 8. Known open items

- Swiss Ephemeris licensing — see `docs/LICENSING.md`. Blocks distribution only.
- `swisseph-wasm` asset loading under Vite and inside the Capacitor WebView
  is not yet verified.
- `swisseph-wasm` is at 0.1.0. The provider interface exists partly so it can be
  replaced (or an in-house Emscripten build substituted) without touching
  chart logic.
