# Testing Strategy

Astronomical results look plausible even when they are wrong. A chart wheel
renders just as convincingly from bad numbers as from good ones. So the tests,
not the UI, are what establish that this software works.

**Rule: a module is not done until its tests pass. Compiling is not evidence.**

---

## Layers

### 1. Unit tests — the maths  `[35 passing]`

Pure functions, no ephemeris. Fast, exhaustive on edge cases.

Covered so far (`test/unit/`):

- **Angle normalisation** — negative wrap (`norm360(-1) === 359`, which bare
  `% 360` gets wrong), multiple turns, negative-zero collapse, non-finite
  rejection, the `(-180, 180]` boundary.
- **The 180° degenerate case** — at an exact opposition the sign of the delta
  carries no direction, so applying/separating must use relative speed. Pinned
  by test so a later refactor cannot quietly reintroduce the assumption.
- **Root finding** — linear, non-linear, steep, root-on-endpoint,
  root-adjacent-to-endpoint, tolerance, and *refusal to guess* when the
  interval does not bracket a root.
- **The scan-step trap** — two roots inside one step cancel and are both missed.
  Pinned as an explicit test rather than left as folklore.
- **Retrograde multiple passes** — three crossings of the same aspect are all
  found, not just the first.

### 2. Oracle cross-check — the astronomy

The shipped engine (`swisseph-wasm`) is compared against an **independently
built** implementation (`sweph`, native, devDependency only). Two separate
builds agreeing is real evidence; testing one binding twice is not.

Per-body tolerances are **measured, not guessed** — see
`ASTRONOMY_NOTES.md` §1 for the table and its derivation (~5,900 samples per
body over 1800–2400). Range: ±0.1″ for Sun/Mercury/Venus/Jupiter/Saturn to ±5″
for Chiron.

### 3. Reference regression — golden charts

A fixed set of birth data with expected planetary longitudes, houses and
aspects, committed as fixtures. Each records **expected value, tolerance, and
source**. No value is invented; fixtures are generated from authoritative
Swiss Ephemeris output and cross-checked against the oracle.

**Fixtures are a contract.** A change that moves them requires an explicit
documented justification in the commit, never a silent fixture update.

### 4. Integration — the full path

`birth data → timezone resolution → Julian Day → ephemeris → chart → aspects`,
asserted end to end. Catches the wiring faults that unit tests cannot: a
correct chart built from a correctly-computed but *wrongly converted* time.

### 5. Property tests

Invariants that must hold for all inputs: separations symmetric, house cusps
monotonic around the circle, sign indices always 0–11, every longitude in
`[0, 360)`.

---

## Cases that must always be covered

Drawn from the failure modes actually found during the M0 spike:

| Case | Why |
|---|---|
| 0°/360° boundary crossing | Bare `%` returns negatives |
| Exact 180° opposition | Delta sign carries no direction |
| Retrograde planets | Applying/separating inverts |
| Stationary planets | Relative speed → 0; must report *stationary*, not guess |
| Multiple retrograde passes | Three hits, not one |
| Out-of-range dates | **Silent Moshier downgrade** — must be detected and labelled |
| High latitudes | Placidus/Koch undefined near the poles |
| Historical dates | Pre-DST and pre-standardisation LMT offsets |
| Unknown birth time | Houses and angles must be suppressed, not faked |

---

## What is deliberately not tested by snapshot

Chart wheel **geometry** is asserted numerically (cusp angles, planet
placement) rather than by image snapshot. Image snapshots break on font and
renderer changes while saying nothing about correctness.

---

## Running

```bash
npm test                 # whole engine suite
npm run test:watch       # during development
npm run typecheck        # strict + noUncheckedIndexedAccess
npm run fetch:ephe       # oracle data files (idempotent, required for the oracle tests)
```

---

## Internationalisation

Three layers, because a translation can fail at each independently:

1. **Completeness** is a compile error. Every locale is typed as `Catalog`,
   derived from the English object, so a missing or invented key fails
   `tsc` — "did we translate everything?" stops being a review question.
2. **Placeholder integrity** is asserted at runtime: a locale that drops a
   `{placeholder}` produces a sentence with a hole in it and no error anywhere,
   so each catalogue's placeholders are compared against English key by key.
3. **Wiring** is asserted by rendering. A catalogue can be complete and correct
   while a component still prints hard-coded English, because nothing connects
   them until that component calls `t`. `test/i18n-rendering.test.tsx` renders
   the real tables through a provider and looks for the translated text.

The engine emits warning and error **codes**, never prose, so tests assert on
`birthTimeUnknown` rather than on an English sentence — which also means copy
edits cannot break the engine suite.
