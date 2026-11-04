# Astronomy Notes — formulas, assumptions, and measured tolerances

This document records what the engine assumes, and the **measured** evidence for
those assumptions. Every number below was produced by a script on this machine,
not quoted from memory. Re-run the spikes in `scratch/` to reproduce.

Machine of record: Windows 11, Node v24.12.0, `sweph` 2.10.03, `swisseph-wasm` 0.1.0.
Measured 2026-08-24.

---

## 1. Which ephemeris the engine uses

**Decision: `swisseph-wasm` is the single source of truth in every environment** —
browser, Capacitor/Android, Node, and the test suite.

This is a deliberate change from the original plan, which proposed a WASM
provider for the browser and a native `sweph` provider for Node/CI. Three
measurements drove the change:

| Measurement | Result |
|---|---|
| WASM vs native throughput | **1.01×** — 79,449 vs 80,171 `calc_ut` calls/sec |
| Swiss Ephemeris version | **identical** (2.10.03 both) |
| WASM bundled data | `swisseph.data`, 2.1 MB Emscripten-preloaded FS containing the `.se1` files |

Because WASM costs nothing in speed and ships its own data, a second provider
would buy no performance while costing determinism. **One implementation means
the web app, the Android app, the PDF reports and the tests all produce
bit-identical numbers**, which is what spec rule 54 requires.

`sweph` (native) is retained in `devDependencies` **only as an independent
oracle** for the reference suite. Cross-checking against a separately-built
implementation is stronger verification than testing the same binding twice.

### Divergence between the two builds

Both are Swiss Ephemeris 2.10.03 but ship different ephemeris data vintages, so
they do not agree exactly. Measured over **1800–2400 CE, ~5,900 samples per body**
(every 37.1 days), ecliptic longitude:

| Body | mean (″) | max (″) | oracle tolerance |
|---|---:|---:|---:|
| Sun | 0.0060 | 0.0227 | ±0.1″ |
| Moon | 0.0661 | 0.3151 | ±0.5″ |
| Mercury | 0.0069 | 0.0453 | ±0.1″ |
| Venus | 0.0060 | 0.0261 | ±0.1″ |
| Mars | 0.0098 | 0.1193 | ±0.5″ |
| Jupiter | 0.0219 | 0.0694 | ±0.1″ |
| Saturn | 0.0025 | 0.0098 | ±0.1″ |
| Uranus | 0.1541 | 0.4484 | ±0.5″ |
| Neptune | 0.3810 | 1.0202 | ±2″ |
| Pluto | 0.4549 | 1.6656 | ±2″ |
| True Node | 0.0249 | 0.1405 | ±0.5″ |
| Chiron | 0.3050 | 2.1141 | ±5″ |

Divergence is largest for slow, distant bodies and grows toward the edges of the
file range — the signature of a different base JPL development ephemeris.

**Astrological significance: none.** The worst case is 2.1″ ≈ 0.0006°, while
aspect orbs are measured in whole degrees. It matters only as a test tolerance.

Houses and ayanamsha agree far more closely:

- Placidus cusps, ASC and MC: **identical to all printed digits** (Mumbai, 1947-08-15).
- Lahiri ayanamsha: agreement to **1.1e-9 arcsec**.

---

## 2. Ephemeris coverage and the silent-fallback hazard

The bundled `.se1` set covers **1800-01-01 to 2400-12-31 CE**. Verified by probe:
1799 fails, 1800–2400 succeed, 2401 fails.

**Swiss Ephemeris does not fail loudly outside that range. It silently
substitutes the lower-precision Moshier ephemeris and still returns a
plausible number.** Measured at 1799-01-01 requesting `SEFLG_SWIEPH`:

```
returned flag = 260  ->  SWIEPH bit CLEAR, MOSEPH bit SET
error         = "SwissEph file 'sepl_12.se1' not found ... using Moshier eph.;"
longitude     = 281.181022     <-- still returned, looks perfectly normal
```

Compare 2000-01-01, which succeeds: `returned flag = 258` (SWIEPH bit set), empty error.

**Engine requirement.** The ephemeris provider MUST compare the *requested*
flags against the *returned* flags and report which ephemeris actually produced
each result. A caller must never be able to receive Moshier-precision data
believing it is Swiss. The UI labels it; it is never silently substituted.

Moshier's own accuracy is ~1″ and it covers 3000 BCE – 3000 CE with no data
files, so it remains a legitimate *labelled* fallback for out-of-range research
dates — just never an unannounced one.

---

## 3. Angle conventions

- All longitudes are normalised to `[0, 360)` by `norm360`.
- Signed separations use `(-180, 180]` via `norm180`.
- **Inline `% 360` is banned.** It returns negative values for negative inputs;
  `norm360(-1)` must be `359`, which bare `%` gets wrong.
- Negative zero is collapsed to `0` so equality checks behave.

### Degenerate case at exactly 180°

The `(-180, 180]` convention maps −180 onto +180, so `signedDelta(a, b)` and
`signedDelta(b, a)` are **both +180** at an exact opposition — antisymmetry does
not hold there. This is a property of the geometry, not a defect: 180°
clockwise and 180° counter-clockwise are the same point, so no "shorter arc"
exists to take a sign from.

**Consequence:** applying/separating at an exact opposition must be decided by
**relative speed**, never by the sign of the delta. Locked in by
`test/unit/angles.test.ts`.

---

## 4. Exact events are solved, not scanned

Exact aspect times, returns and transit hits are found by bracketing a sign
change (`findBrackets`) and converging with **Brent's method** (`brentRoot`),
default tolerance 1e-9 days (~0.1 ms).

`brentRoot` **throws** when the interval does not bracket a root. A silent
"closest guess" would surface as a plausible but wrong event time in a chart.

### The scan-step trap

`findBrackets` samples at a fixed step. **Two roots inside one step cancel and
are both missed.** Callers must choose the step from the physics of the bodies
involved — for a retrograde planet crossing the same aspect three times, well
under the shortest pass. This failure mode is pinned by a test
(`roots.test.ts`) rather than left as folklore.

---

## 5. Time

- ΔT is delegated to Swiss Ephemeris via `calc_ut`. Never hand-converted.
- Civil time → UTC uses Luxon against the IANA TZDB through the platform ICU,
  giving genuine historical DST and pre-standardisation LMT offsets.
- **The current UTC offset is never assumed to apply to a historical date.**

---

## 6. Open items

- Cross-check a small set of reference charts against an independent
  third-party calculator (not either Swiss build) and record results here.
- Confirm `swisseph-wasm` loads its `.data` asset correctly under Vite and
  inside the Capacitor WebView.
- Licensing: see `docs/LICENSING.md` — unresolved, blocks distribution only.

---

## 7. Chart rendering notes

### Colours are resolved in JavaScript, not by CSS variables

The wheel emits literal colour values. An earlier version used
`var(--astro-ink, #1f2937)` with fallbacks, which looks reasonable and works in
a browser — but `var()` resolves only against a live CSS cascade. A standalone
SVG rasteriser, of the kind used for **PDF export, print output and server-side
thumbnails**, has no cascade: it renders every such value as black. The first
rasterisation of the wheel came out as a solid black square.

Theming is unaffected — a `theme` prop takes a partial `ChartTheme` — but the
emitted SVG is self-contained. Guarded by a test asserting the output contains
no `var(--`.

### Glyph placement is exact, not iterative

Overlapping planet glyphs are spread by cutting the circle at its widest gap and
solving the minimum-separation constraint as isotonic regression
(pool-adjacent-violators), which gives the arrangement with the least total
displacement in linear time.

The first implementation relaxed the constraints repeatedly instead. Spreading
one cluster pushed it into its neighbour, which re-merged them, and the two
states alternated indefinitely — it converged only asymptotically and never
actually reached the requested separation (measured 7.998 against a target of
8). Displaced glyphs draw a leader line back to their true longitude, so the
wheel never misrepresents where a body actually is.

### Orientation

One function, `longitudeToAngle`, fixes the convention: `t = 180 + (lambda -
ascendant)`, with `y` negated to counter SVG's downward axis. That places the
Ascendant due left, MC at top, Descendant right and IC at bottom, with longitude
running counter-clockwise. Everything else derives from it, so there is exactly
one place the convention can be wrong — and it is asserted directly.

---

## 8. Transit search

### An aspect must not match its own opposite

The signed aspect error is zero at the aspect and smooth through it, but it is
**discontinuous half a circle away**, where it jumps between +180 and -180. That
jump is a sign change, so an unguarded bracket scan reads it as a root and
Brent's method converges on it.

The symptom was quiet and convincing. Searching for the Sun **conjunct** 0°
Aries returned both the March equinox (correct) and the September equinox, where
the Sun is 180° away. A list of "new moons" contained the full moons. Every date
was a real astronomical event, just the wrong one, so nothing looked broken —
only checking the reported longitude at each returned time exposed it.

Two guards, both cheap:

- a bracket whose endpoints differ by more than 180° is a wrap, not a crossing,
  and is skipped;
- any root that survives must satisfy |f| < 1e-4 — at a discontinuity Brent
  converges on the jump, where |f| is about 180.

Pinned by `test/integration/transits.test.ts`, which asserts that every reported
hit sits at its own aspect angle.

### Verification

Exact times are checked against independently published events rather than
against this engine's own output:

| Event (2024) | Published | Computed |
|---|---|---|
| March equinox | 03:06 UTC | 03:06:24 |
| June solstice | 20:51 UTC | 20:51:00 |
| September equinox | 12:44 UTC | 12:43:40 |
| December solstice | 09:21 UTC | 09:20:34 |
| New moon, 11 Jan | 11:57 UTC | 11:57:25 |

The native oracle is then queried at each computed instant; residuals are under
0.01 arcsecond.

### Native oracle state is process-wide

`sweph` is a native addon, and Swiss Ephemeris holds its ephemeris path and
sidereal mode as C-level globals. Those are shared across worker threads, so
concurrent test files can reach into one another's configuration — which
surfaced once as a flaky WASM-vs-native speed comparison that passed in
isolation and on every repeat.

The engine package therefore runs its tests in the `forks` pool, one process per
file. The WASM engine itself is properly isolated: two provider instances keep
separate sidereal state, and closing one does not disturb the other.

---

## 9. Returns and progressions

### A solar return is an instant, not a birthday

The tropical year is 365.2422 days, so the Sun reaches its natal longitude at a
different clock time each year, and often on a different calendar date.

Measured on a 15 January 1990 birth, the returns for 2023-2026 fall +9.5 h,
+15.1 h, **-3.0 h** and +2.8 h from midnight on the 15th — the 2025 return
happens on the 14th.

The consequence is not subtle. Substituting midnight on the birthday for the
2024 return puts the ascendant **122 degrees** out — four signs, and with it
every house cusp and every house placement in the chart. Planetary positions
barely move in fifteen hours; the ascendant moves a full circle in twenty-four.
The exact instant is solved with Brent's method, never assumed.

The search is strictly AFTER its start date. Searching from the natal moment
itself would otherwise return the birth instant as the first "return" — the body
is at its natal longitude then by definition — which is true and useless.

### Relocation

A return chart is cast for wherever the person is, which need not be the
birthplace. The planetary positions are identical either way, since they depend
only on the instant; the houses and angles are not. `place` is therefore a
required argument rather than a defaulted one.

### Secondary progressions

The classical day-for-a-year: the progressed chart is the real sky at
`natalJd + elapsed / yearLength`, cast for the natal place. Nothing is invented —
it is an ordinary chart for an ordinary moment, reached by a different route.

The default key is the tropical year (365.2422 d); the Julian year (365.25 d) is
an alternative. Measured, the two differ by about 0.002 days of progressed time
over a century of age — roughly three minutes, moving the progressed Moon by
under two arcminutes. Small, but the key actually used is recorded on the result,
because a reader comparing output against another program needs to know.

### Solar arc is typed separately

Solar arc positions are natal placements advanced by a single arc, not bodies
observed anywhere. They have no speed, no latitude and no retrograde state, so
they are NOT an `InstantChart`: giving them that type would invite code to ask
for properties that do not exist for them.

Primary directions are not implemented. They need a different time key entirely
(diurnal rotation rather than orbital motion).

---

## 10. Synastry, composite and Davison

### Cross-aspects have no applying or separating

Both charts are fixed moments. "Applying" describes a closing orb, which needs
motion; two birth instants do not move relative to one another. The natal speeds
are in the data and multiplying them would produce a number — it would simply
not mean anything, because it would describe two bodies converging in two
different years.

`SynastryAspect` therefore has no motion field at all. Omitting it states that
the concept does not apply; a value like "stationary" would obscure that.

### Three different objects, three different types

| Technique | What it is | Type |
|---|---|---|
| Synastry | comparison of two charts | aspects + overlays |
| Midpoint composite | positions averaged pairwise | **construct**, not a chart |
| Davison | chart for the midpoint in time and space | ordinary `InstantChart` |

A composite is not a picture of any sky. Its longitudes are real numbers with no
speed, latitude or retrograde state, so it is typed separately for the same
reason solar arc positions are: giving it a chart type invites code to ask for
properties that do not exist.

A Davison chart *is* a real chart for a real moment, so it comes back as a
normal `InstantChart` and behaves like one.

### A composite need not be internally consistent

Mercury is never more than about 28° from the Sun in the real sky, and Venus
never more than about 48°. A composite Mercury can exceed that, because it
averages two Mercurys in different places. This is a property of the technique,
not a defect, and `impossibleElongations` reports it rather than hiding it.

Verified on a real Davison chart: Mercury sat 24.75° from the Sun — inside the
physical limit, as a genuine sky must be.

### Composite cusps can fail to form a wheel

Midpointing twelve cusps pairwise is not guaranteed to produce a valid house
division; when the two ascendants are far apart the results can arrive out of
order or overlap. The cusps are validated (each span positive, the twelve
summing to exactly one turn) and house placement is suppressed with
`cuspsDegenerate: true` rather than derived from a broken wheel.

### Davison midpoint in space

Latitude is the arithmetic mean; longitude is the SHORTER-arc midpoint, so a
pair straddling the antimeridian averages to the near side rather than being
flung to the opposite face of the Earth (170°E and 170°W midpoint to 180°, not
0°). This is the conventional construction; a great-circle midpoint would differ
slightly for widely separated places.

---

## 11. Synodic cycles

### Phase is not an aspect

A cycle measures the SIGNED elongation `lonA - lonB` over the full circle, which
separates the waxing square at 90° from the waning square at 270°. The aspect
engine calls both "a square" and cannot tell them apart, because an aspect is an
unsigned separation. A cycle has to know which side of the opposition it is on,
so it carries its own measure.

`bodyA` should be the faster body so the phase advances rather than retreats;
`orderBySpeed` does that for callers who would rather not think about it.

### Retrograde multiples are one event, not several

When the faster body retrogrades near conjunction the pair can conjoin three
times within months. Jupiter and Saturn did exactly that across 1980-81:
**31 December 1980, 4 March 1981 and 24 July 1981**.

Those are one conjunction, not three cycles. Counting them separately would
halve the apparent period. Crossings closer together than a quarter of the
expected period are therefore clustered, the period is measured between
clusters, and pass numbering is per cluster.

That last point was a real defect found by looking at the rendered table rather
than the tests: an earlier version numbered every crossing across the whole
search range, so four great conjunctions twenty years apart displayed as
"1 of 4" … "4 of 4" — claiming a retrograde multiple that did not exist. Pinned
now by a regression test asserting isolated conjunctions report `totalPasses: 1`
while the 1980-81 group reports 3.

### Verification

| Pair | Expected | Analytic |
|---|---:|---:|
| Moon-Sun | 29.53 d | 29.53 |
| Jupiter-Saturn | 7253.4 d | 7253.45 |
| Sun-Mars | 779.9 d | 779.94 |
| Venus-Sun | 583.9 d | 583.92 |

Great conjunctions found at 1961-02-19, 1980-81 (triple), 2000-05-28,
2020-12-21, 2040-10-31 — all matching published dates. January 2024 lunation
quarters within a minute of published times. Every reported crossing is
re-checked against the ephemeris at the returned instant.

---

## 12. Chart shape and emphasis

`chart/shape.ts` reports where the bodies sit: hemisphere and quadrant
emphasis, and the classical Jones planetary pattern. It is calculation — a
deterministic function of longitudes and cusps — and it says only WHERE the
bodies are, never what that is taken to mean. The interpretation layer consumes
these results; it does not produce them.

### Measurement versus convention

The distinction matters more here than anywhere else in the engine. A house
cusp is a measurement: get it wrong and it is wrong. A Jones pattern is a
CONVENTION, and published thresholds disagree at the margins. So the ruleset is
stated in the open as named constants rather than buried in a chain of
conditionals, and every boundary is tested:

| Constant | Value | Meaning |
|---|---:|---|
| `BUNDLE_ARC` | 120° | everything inside a trine |
| `BOWL_ARC` | 180° | everything inside a hemisphere |
| `LOCOMOTIVE_ARC` | 240° | everything inside two thirds of the circle |
| `SHAPE_GAP_THRESHOLD` | 60° | a gap wide enough to read as a division |

Decision order, which is itself part of the convention:

1. Occupied arc ≤ 120° → **bundle**. Tested first because a tight group can
   also show a wide internal gap, and the tightness is the more telling fact.
2. Exactly two gaps ≥ 60° → the circle is cut into two groups. One group of a
   single body → **bucket** (that body is the handle); otherwise **seesaw**.
3. Occupied arc ≤ 180° → **bowl**; ≤ 240° → **locomotive**.
4. No gap ≥ 60° → **splash**. Anything else → **splay**.

Shapes are judged on the ten bodies Sun–Pluto only. Nodes are excluded because
they are the intersection of two planes rather than bodies, and being exactly
opposite one another they would plant a spurious pair at either end of every
gap. Chiron and Lilith are excluded because the patterns predate them and
including them silently reclassifies charts the textbooks agree on.

The classification is invariant under rotation of the whole chart, which is
asserted directly — it is a property of the spacing, not of where Aries falls.

### Hemispheres, named by observation

`HemisphereEmphasis` reports `aboveHorizon` / `belowHorizon` / `eastern` /
`western`. The compass words are avoided deliberately: the literature uses
"northern hemisphere" for both halves depending on the author, so a field named
that way would be ambiguous no matter which convention was chosen. Houses 1–6
lie below the horizon; houses 10–12 and 1–3 lie on the ascendant side.

Both hemispheres and quadrants need houses, so both return `undefined` for a
chart cast without a known birth time rather than inventing an ascendant to
measure from. Unlike `chartShape`, they count every body the chart holds —
emphasis is about weight of tenancy, so an included node counts.
