# IMPLEMENTATION_ROADMAP

Small, testable milestones. Each module follows the same loop: state scope →
identify dependencies and likely failure modes → implement → test → fix → only
then continue. Nothing is marked done until its tests pass.

Status: `[x]` done · `[~]` in progress · `[ ]` not started

---

## M0 — Foundation  `[x]`

- [x] Audit: greenfield confirmed; `D:\Github\Astro` empty, no existing astrology code
- [x] **Ephemeris spike** — proved bindings work, measured precision, found the silent-fallback hazard
- [x] npm workspaces monorepo, TS strict config, Vitest
- [x] `scripts/fetch-ephe.mjs` (idempotent, official Astrodienst source)
- [x] `PROJECT_ARCHITECTURE.md`, `IMPLEMENTATION_ROADMAP.md`, `docs/ASTRONOMY_NOTES.md`
- [x] `src/math/angles.ts` + `src/math/roots.ts` — **35 tests passing**

---

## M1 — Verified engine + natal chart  `[~]`

The foundation everything else depends on. No UI work begins until the
reference suite is green.

- [x] 1. `math/` — angle normalisation, Brent root finder, bracket scanning
- [x] 2. `time/` — Julian Day (verified against 13 published Meeus values), civil→UTC
      via Luxon/TZDB, historical DST/LMT, nonexistent and ambiguous wall times
- [x] 3. `ephemeris/` — provider interface + WASM adapter, **surfacing the ephemeris
      actually used**, polar house fallback, sidereal modes
- [x] 4. `zodiac/` + `houses/` — ayanamsha and house-system config tables
- [x] 5. `chart/` — natal assembly: planets, speed, latitude, declination, retrograde,
      angles, house placement, distributions, precision warnings
- [x] 6. `aspects/` — configurable profiles; applying/separating from **relative speed**
- [~] 7. **Reference regression suite** — independent-oracle cross-check DONE
      (12 bodies, 24 house cases, 4 ayanamshas). Golden birth-chart fixtures pending.
- [x] 8. Chart input form (RHF + Zod) → location search → chart, plus the
      `apps/web` Vite application wiring it together and a 69,641-town GeoNames
      database served locally
- [x] 9. **SVG chart wheel** — vector, deterministic, print-sharp, collision-aware
      labels with leader lines, themeable (light/dark/print), houses omitted when
      the birth time is unknown, `role="img"` + accessible name
- [x] 10. Planet, house and aspect tables; compact/detailed densities; degree
      formatting that truncates so display rounding can never shift a sign

**M1 is complete.** `npm run dev -w @astro/web` casts a chart end to end, and
the production build was verified serving its own WASM payload.

**Current state: 289 tests passing** (203 engine + 21 locations + 65 UI),
typecheck clean (`tsc --noEmit` runs as part of `npm test` in each package,
because vitest strips types without checking them).

**Known gaps, deliberately left:**
- No DOM-level test for `LocationSearch` keyboard navigation — needs jsdom,
  which is not yet configured. Verified manually in the browser instead.
- Glyphs are Unicode; an embedded subset font is wanted before PDF export.
- `apps/web` has no test suite of its own yet.

**Exit criteria:** `npm test` green including the reference suite; a known chart
renders with wheel geometry matching the computed tables.

---

## M2 — Settings & i18n  `[x]`

- [x] `@astro/i18n` — typed catalogue where the key set is derived from English,
      so a missing or invented key in another locale is a **compile error**
- [x] English, Hindi, Gujarati. Astrological vocabulary is established
      terminology (मेष/વૃષભ, वक्री/વક્રી, राहु/કેતુ); UI chrome is marked
      `reviewed: false` and labelled as a draft in the picker
- [x] ICU-style plurals via `Intl.PluralRules`, locale number formatting via
      `Intl.NumberFormat` (Indian lakh/crore grouping verified)
- [x] **Engine emits warning/error CODES, not prose** — the calculation layer is
      now language-neutral, and tests assert on codes instead of sentences
- [x] Settings panel: language, degree precision, glyph style, chart theme,
      orb profile; persisted to localStorage behind try/catch
- [x] Verified in the browser: the full chart, tables and validation messages
      render in Hindi with correct domain vocabulary

**Still to do here:** a fluent speaker should review the Hindi and Gujarati UI
chrome, after which `reviewed` flips to true and the draft label disappears.

## M3 — Transits & Aspectarian  `[x]`

- [x] Transit engine: transiting body → natal body, angle or arbitrary point
- [x] **All retrograde passes found and numbered** ("2 of 3"), not first-match
- [x] Aspectarian (transit-to-transit), sharing the same root-finding core
- [x] Exact times solved with Brent, verified against published equinox,
      solstice and lunation times to within a minute
- [x] Positions sampled once per body onto a shared grid — a year of transits
      is ~3,600 ephemeris calls instead of ~220,000
- [x] Transits panel in the web app, fully translated
- [x] Aspectarian UI with day/week/month/year views, period navigation and
      body/aspect filters
- [x] Month calendar showing exact-aspect density; selecting a day filters the
      list. Week start and weekday names come from the locale
      (Sunday-first for en-US/hi/gu, Monday-first for en-GB/de)

**Verified timings** (2024, against published values):
March equinox 03:06:24 (pub. 03:06) · June solstice 20:51:00 (pub. 20:51) ·
Sept equinox 12:43:40 (pub. 12:44) · Dec solstice 09:20:34 (pub. 09:21) ·
new moons within a minute throughout.

**Performance**: 1 year of transits from Mars outward against 16 natal targets
and 5 aspects, ~90 ms; all bodies, ~840 ms; a full year aspectarian, ~3.5 s.

**Known limitation:** the aspectarian search is synchronous and blocks the main
thread. A month (~200 ms) passes unnoticed; a year including the Moon is
seconds, which is why the Moon defaults off on long views. Moving the search to
a Web Worker is the proper fix and is not yet done.

## M4 — Returns & Progressions  `[x]`

- [x] Returns for any body, solved by root-finding on the actual longitude
      return — **never a birthday approximation**
- [x] Relocated returns: same instant, different houses
- [x] Secondary progressions (day-for-a-year), with a selectable year length
      recorded on the result
- [x] Solar arc directions, typed **separately** from a cast chart because the
      positions are directed, not observed
- [x] `calculateChartForInstant` extracted, so natal, return and progressed
      charts share one implementation and cannot drift
- [x] Returns panel in the web app, fully translated

**Measured, on a 15 Jan 1990 birth:** the 2023-2026 solar returns fall +9.5 h,
+15.1 h, -3.0 h and +2.8 h from midnight on the 15th — one of them on the 14th.
Substituting midnight on the birthday for the 2024 return puts the ascendant
**122 degrees** out: four signs, and every house with it.

## M5 — Synastry & Composite  `[x]`

- [x] Synastry: cross-aspects between every point of two charts, plus house
      overlays computed in BOTH directions
- [x] Cross-aspects carry **no applying/separating** — two fixed moments do not
      converge, so the field is absent rather than filled with a meaningless value
- [x] Midpoint composite, typed as a **construct** rather than a cast chart
- [x] Degenerate composite cusps detected and reported instead of producing
      house placements from a broken wheel
- [x] Impossible elongations flagged (a composite Mercury can sit further from
      the composite Sun than the real sky allows)
- [x] Davison relationship chart — a **real** chart for the midpoint in time and
      space, so its speeds and retrogrades mean what they normally do
- [x] Synastry panel in the web app with four views, fully translated

## M6 — Cycles  `[x]`

- [x] One synodic-cycle engine for every pair — **no per-planet code path**.
      A lunation, a great conjunction and a Mars-Jupiter cycle are the same
      call with different arguments
- [x] Phase is the SIGNED elongation, so the waxing square (90°) and the waning
      square (270°) are distinguished — which the aspect engine cannot do
- [x] Configurable divisions (conjunctions only / quarters / eighths) or
      explicit phase angles
- [x] Retrograde multiples grouped into one event; period measured between
      groups, so a triple conjunction does not halve the apparent cycle
- [x] Cycles panel in the web app, fully translated

**Verified against published dates:** Jupiter-Saturn great conjunctions at
1961-02-19, the 1980-81 **triple** (Dec 31 1980 / Mar 4 1981 / Jul 24 1981),
2000-05-28, 2020-12-21 and 2040-10-31. Lunation quarters for January 2024 to
within a minute. Synodic periods match the analytic values for every pair
tested.

## M7 — Reports  `[x]`

PDF/print, A4 + A3, portrait and landscape, vector chart. Interpretation
content stored as structured data, kept strictly separate from calculation.

**Delivered.** A new package, `@astro/interpretation`, holds all delineation
content. `@astro/engine` does not depend on it and never will, so the
separation is enforced by the dependency graph rather than by discipline —
nothing written there can move a number.

Content is a catalogue of ~60 reviewed factors composed by template
(planet = function, sign = manner, house = field, aspect = relation), which
covers the same ground as ~1,500 authored paragraphs from text a person can
actually read end to end. Every delineation carries a `basis` naming the
measured fact it rests on, so any sentence traces back to the chart. Absent
content is REPORTED, never silently omitted; `catalogueCoverage` catches holes
before a catalogue ships. Only English has a catalogue: `catalogueFor` returns
undefined for Hindi and Gujarati rather than quietly serving English under a
translated heading, and the report says so.

`chartFacts()` produces the validated, versioned, JSON-serialisable payload an
optional AI layer would receive — carrying ephemeris provenance and warnings
with the numbers. Nothing in the package makes a network call, and the
deterministic delineations are produced regardless.

Printing goes through the browser's own pipeline, so the wheel stays vector and
fonts are subset and embedded with no dependency, no server and no network.
`@page` size is emitted for the chosen paper, and the on-screen preview is the
document itself rather than a second rendering path. New engine module
`chart/shape.ts` supplies hemisphere/quadrant emphasis and the Jones patterns.

Verified in a browser at both paper sizes: A4 portrait and A3 landscape each
lay out three sheets exactly, with the interpretation running on as continuous
prose.

## M8 — Financial astrology & research  `[x]`

Market data import (CSV), event tagging, correlation and backtesting. Presented
as **analytical/experimental indicators, never guaranteed predictions**.
Astrological signal, market data and statistical result stay separate layers.

**Delivered** as `@astro/research`, with the three layers enforced by module
boundaries: `market/` knows nothing about astrology, `signals/` nothing about
markets, `stats/` nothing about either, and `study/` only joins two finished,
immutable results. Nothing can tune a signal to fit a series.

Statistics are implemented rather than imported so they can be checked, and are
verified against published tables and closed forms — never against a second
copy of the same algorithm. The p-value comes from a **circular rotation test**,
which preserves both the autocorrelation of the returns and the run structure
of the signal; the parametric t-test is shown only as a cross-check, its
assumptions being false for daily returns in three separate ways.

Multiple-comparison control is not optional. Benjamini–Hochberg and
Holm–Bonferroni are both computed, raw and corrected survivor counts are shown
side by side, and every selected signal is tested and reported including the
dull ones. A regression test screens 1,000 null p-values and asserts ~50 fall
below 0.05 raw and **zero** survive correction.

The **periodicity floor** is the significant methodological finding of this
milestone and is documented at length in `docs/RESEARCH_METHODOLOGY.md`:
rotating a periodic signal by a whole multiple of its period reproduces the
alignment exactly, so p ≥ 1/(period in bars) however strong the effect. A lunar
signal on ten years of daily bars therefore has a floor of ~0.049 and cannot
reach significance at all. The floor is computed per signal, shown beside the
p-value, and warned about once it reaches half of α.

Backtesting charges costs on every position change, shows buy-and-hold
alongside, and applies the one-bar lag in a single place so no caller can
introduce look-ahead. Verified in the browser against a seeded random walk: the
"Saturn retrograde" rule showed a Sharpe of 0.15 against buy-and-hold's −0.03
and a third of the drawdown, while its own q-value was 0.884 — an appealing
backtest of pure noise, which is exactly what the design exists to expose.

## M9 — Android  `[x]`

Capacitor build. Verify the WASM engine and its data load offline in the
WebView and produce numbers identical to web.

**Delivered.** Capacitor 8, debug APK **8.33 MB**, everything bundled: the WASM
engine, the 2.05 MB ephemeris payload and the 3.23 MB city database. Capacitor
serves `dist` from a local server at `https://localhost`, a secure origin, so
the root-absolute asset paths work unchanged between web and Android — no
second loader that could drift.

"Identical numbers" is made checkable rather than asserted. `runSelfTest()`
casts eight reference charts chosen for where environments diverge (both ends
of the Swiss range, 64°N Placidus, southern hemisphere, equator, sidereal) and
hashes every position, cusp, aspect, speed and declination to a milliarcsecond.
**Fingerprint `0123070b`, identical in Node and in the production browser
build**, asserted against a committed constant so engine output cannot change
silently. `?selftest` ships in production so the same check runs on a device in
thirty seconds — the only way to reach a phone's WebView, where no test runner
can.

Offline verified by intercepting `fetch`/`XHR`/`WebSocket` and rejecting any
non-same-origin request, then running the suite cold: **zero external requests
attempted**, suite passed.

Found and removed a 562 KB duplicate WASM payload that Vite emitted and nothing
loaded — 6.5% of the APK, shipped to be ignored.

**Not verified:** the fingerprint on physical hardware. No device or emulator
was attached; `docs/ANDROID.md` states exactly what was and was not checked.

## M10 — Audits & production  `[x]`

Calculation accuracy, UI/UX, performance, security, accessibility. Production
builds for web and Android. Full report in `docs/AUDIT.md`.

**663 tests passing** across 7 packages; typecheck clean; console clean.

**Performance.** Measured, and it found the defect carried since M2: a natal
chart takes 1.6 ms, but a year of aspectarian takes **4894 ms** and a year of
transits **4174 ms** — a frozen tab, not a slow render. Both now run in a Web
Worker, created lazily so a reader who only casts charts never pays the second
WASM instance, with a tested main-thread fallback for devices whose WebView
predates module workers.

**Security.** Zero dependency vulnerabilities; no `eval`, `new Function`,
`innerHTML` or `dangerouslySetInnerHTML` anywhere; exactly two network call
sites in the whole codebase, both same-origin relative paths; zero external
requests measured during a full session. Added a strict CSP whose
`connect-src 'self'` makes exfiltration impossible rather than merely absent —
birth data is personal and there is no server to send it to.

**Accessibility.** Two real defects found and fixed: the results region had no
headings at all, and the tab bar was ten buttons with `aria-current` rather than
the ARIA tabs pattern. Now a proper tablist with roving tabindex and
arrow/Home/End navigation, verified in the browser. Two tap targets were below
the WCAG 2.5.8 24×24 px minimum — including the checkbox that decides whether
the chart has houses.

**Test coverage.** The web app had no suite; it now has one, closing both gaps
carried since M2 — the search client including its fallback, and LocationSearch
keyboard navigation with an explicit guard on the Enter-submits-the-form
regression.

---

## Cross-cutting, from the start

- No hard-coded user-facing strings (i18n from M2)
- No fake data in production paths; fixtures clearly separated
- No "coming soon" placeholders — unimplemented features are documented as such
- Configuration (orbs, ayanamshas, house systems, precision) never buried in logic

## Blocking item

**Swiss Ephemeris licensing** (`docs/LICENSING.md`) — AGPL-3.0 or CHF 750
Professional. Zero rework either way, but it **blocks distribution**.

**Now the only thing standing between this and a release.** Every milestone is
complete and a debug APK builds and passes its self-test, but a signed release
APK cannot honestly be produced until this is settled:

- **GPL/AGPL route** — free, and requires publishing the entire source
  including the research module.
- **Astrodienst Professional** — CHF 750, permits closed-source distribution,
  and requires replacing the GPL `swisseph-wasm` wrapper with a
  differently-licensed binding. The provider interface means that is a swap,
  not a rewrite.
