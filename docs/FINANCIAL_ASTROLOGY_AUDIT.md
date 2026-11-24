# Financial astrology: audit and implementation (0.42.0)

This audit covers the research brief for aspect events, Venus combustion,
instruments and their charts, the daily Sarvatobhadra vedha and historical
event studies. It records what existed, the gaps that were verified, what was
built and the test that proves each item. It ends with what is still blocked
and the evidence needed to unblock it.

## The platform, as found

The brief was written for a C#/.NET MAUI app with SQLite. This repository is
not that app, and no such app exists on this machine. It is a TypeScript
monorepo:

- **UI:** React 19 + Vite, shipped on the web (Vercel) and on Android (Capacitor).
- **Calculation:** one Swiss Ephemeris binding, `swisseph-wasm` (SE 2.10.03).
- **Storage:** browser storage for settings and studies, and Neon Postgres for
  accounts and charts.

Every requirement was therefore implemented in this stack, reusing its
services rather than adding a parallel one:

- the ephemeris provider and the crossing/root finders;
- the CSV parser and the `/api/prices` proxy;
- the search Web Worker;
- the i18n catalogues (en/hi/gu).

"SQLite persistence" maps to versioned study records in local storage, holding
configuration and dataset fingerprints but never prices. Server-side study
storage is on the roadmap below.

The workflow traced for the audit, before any change, was **Research →
import CSV → signal study → backtest**. Its path is
`ResearchPanel` → `runStudy` / `runBacktest` (packages/research). Its
ephemeris calls go through `SwissEphWasmProvider` and its data through
`parseMarketCsv`.

The baseline before this work was 1,238 tests passing with typecheck clean.
After it, 1,307 tests pass with typecheck clean.

## Gap matrix

Status columns: **Before** → **After**. The statuses are Working, Partial,
Missing, and Blocked (missing evidence).

| # | Requirement | Existing file or symbol | Current behaviour (before) | Verified gap | Change made | Acceptance test | Before → After |
|---|---|---|---|---|---|---|---|
| 1 | Swiss Ephemeris binding: units, time scale, flags, errors | `engine/src/ephemeris/swisseph-wasm-provider.ts` | UT Julian Day in, degrees and °/day out, speeds via SEFLG_SPEED, `EphemerisError` on misuse | Library version not recorded anywhere; returned flags hidden by the wrapper | `ephemerisVersion()` on the provider, recorded with every saved study and in exports | `engine/test/integration/version.test.ts` | Partial → Working |
| 2 | Fallback made visible | `sourceForJd`, `BodyPosition.source` | Moshier outside 1800–2400 is labelled per position | Wrapper does not return SE's flags, so the fallback is inferred from the range | Unchanged; documented | existing `ephemeris` tests | Partial → Partial |
| 3 | Settings carried through the workflow: date, local time, zone, UTC, place, zodiac (Lahiri/KP/Raman), node, houses, versions | `resolveCivilTime`, `ZodiacMode`, `NodeType`, `HouseSystem` | Present per chart, not per research run | Research had no calculation record, no rule-set version | `CalcSettingsFields` on every new tab; `CalcRecord` saved with zodiac, node, houses, ephemeris version, rule id and version | `apps/web/test/finastro.test.ts` (save), `research/test/combustion.test.ts` (ayanāṁśa) | Missing → Working |
| 4 | Mean/true node, Ketu opposite Rahu in [0,360) | `NODE_BODIES`, `grahas.ts` | Ketu = Rahu + 180 in charts | No test in an event engine | Vedha engine and aspect windows take the node setting; Ketu normalised | `vedic/test/sbcVedha.test.ts` "keeps Ketu opposite Rahu" | Partial → Working |
| 5 | Full precision; settings in cache keys; switching ayanāṁśa updates results; reopen reproduces | — | No research cache, no saved studies | Missing | `RunCache` keyed by `stableKey` of every setting plus the dataset fingerprint; `saveStudy` / reopen with mismatch warning | `finastro.test.ts` "keys on every setting", "reports data that differs" | Missing → Working |
| 6 | Western aspect events: natal–natal, transit–transit, transit–natal, Sun–Pluto, Rahu, Ketu, majors + 30° + 150° | `findAspects`, `buildAspectarian`, `findTransitHits` | Exact instants only; no entry/exit; no 30°/150° windows | No windows, no orb strength, no natal–natal mode in the Aspectarian | `findAspectWindows`, `aspectStateAt`, `orbStrength`, `allowedOrbFor` (engine); `AspectWindowsPanel` on the Calendar page | `engine/test/integration/windows.test.ts` (14 tests) | Partial → Working |
| 7 | Roles, longitudes, target, separation, actual and allowed orb, phase, exact time | `AspectState`, `AspectWindow` | — | Missing | Every window carries both sides' roles and longitudes, target angle, separation, actual and allowed orb, phase, branch and refined exacts | windows tests; inspected in the browser | Missing → Working |
| 8 | Named orb presets per aspect and per body | `ORB_PROFILES` (standard, tight, wide) with `bodyMultipliers` | Used by charts | Not offered for events | Preset select in Aspect windows; the allowed orb is shown per row | windows tests "orb profile" | Partial → Working |
| 9 | Circular distance, applying/separating, retrograde, stations, both branches, 0/360, repeated passes, near-misses | `aspectError`, `classifyMotion`, `findCrossings` | Exact crossings only | Branches, near-miss windows and pass counts missing | Windows bracket \|e\|−orb with Brent, exacts by `findCrossings`, near misses by golden-section closest approach, `passIndex` per exact | windows tests: Venus loop over 5° (3 windows at 1°, passes [1,2,3] at 11°), near miss at 12°, 0° crossing, both trine branches | Partial → Working |
| 10 | Entry/exact/exit by bracketing and refining; documented tolerances | — | — | Missing | Time tolerance 1e-6 day, angle 1e-4°, in `ASTRONOMY_NOTES.md` | windows tests vs native `sweph` (< 1″) | Missing → Working |
| 11 | Orb strength = 100×clamp(1−actual/allowed,0,1), zero-orb defined | — | — | Missing | `orbStrength`: allowed ≤ 0 gives 100 only when exact (≤ 1e-4°) | windows tests: 1° of 8° = 87.5 | Missing → Working |
| 12 | Brief's numerical cases | — | — | — | 359/1→2; 15/117→102 (18° off trine); 15/135 exact trine; 125.50/245.20 → 119.70, orb 0.30; applying vs separating; 87.5 % | windows tests, all pass | Missing → Working |
| 13 | Venus combustion: geocentric Sun/Venus, longitudes, speeds, separation, motion, phase, timestamp, profile | — | — | Missing | `combustionEpisodes`, `sampleCombustion` (research) | `research/test/combustion.test.ts` (12) | Missing → Working |
| 14 | Editable, versioned preset; band validation | — | — | Missing | `VENUS_COMBUSTION_V1` (1.0.0); `validatePreset` (8 codes); editor in the UI warns when an edit keeps the old version | combustion tests "band rule", boundaries with ε = 1e-9 | Missing → Working |
| 15 | Events entry / applying / exact / separating / exit with one episode id; sampled vs refined labelled | — | — | Missing | Events entry, band-entry, exact, band-exit, exit, each with its `AspectState` (phase applying/separating); `venus-sun-YYYY-MM-DD` id; exports label "refined (root-found)" vs "sampled" | combustion tests "orders entry…", conjunctions within 1 s of native SE | Missing → Working |
| 16 | Navigation Financial Astrology → Venus Combustion → … → export | `ResearchRoute` | Signal study only | Missing | Nav renamed *Financial astrology* (hi *वित्तीय ज्योतिष*, gu *નાણાકીય જ્યોતિષ*); tabs Signal study, Venus combustion, Daily vedha, Instruments and charts; `?tab=` deep link | browser run on real data (below); `shell.test.tsx` | Missing → Working |
| 17 | Instruments: NIFTY 50, SENSEX, RELIANCE, gold, silver, with provenance and futures roll | `ProviderDescription` | Symbol only | Missing | `INSTRUMENTS` with exchange, symbol, currency, price basis, adjustment, volume, calendar, contract/roll | combustion tests "chart records"; UI dataset cards | Missing → Working |
| 18 | Multiple chart records per instrument with source, place, zone, time certainty | — | — | Missing | `CHART_RECORDS` (NIFTY launch provisional, NIFTY base, SENSEX launch, Reliance incorporation), user records validated | combustion tests "refuses a time on a date-only record" | Missing → Working |
| 19 | Reliance incorporation vs listing | — | — | Listing date not verifiable from available sources | Side-by-side card; listing shown as **needed evidence** (`MISSING_RECORDS`), user can add it | UI | Missing → Blocked (missing evidence) |
| 20 | Date-only records: time-sensitive outputs uncertain/unavailable; visible noon convention | — | — | Missing | `deriveChartFacts`: no ascendant, noon Moon labelled `noon-convention`, `certainForDay` checked 00:00–24:00 | combustion tests "date-only record" | Missing → Working |
| 21 | NIFTY 22 Apr 1996 10:00 Mumbai, provisional, Moon/nakṣatra/ascendant from settings, apart from name targets | — | — | Missing | Record `nifty50-launch-provisional`; facts change with ayanāṁśa; name letters are a separate, user-entered target with its own provenance | combustion tests "changes with the ayanāṁśa" | Missing → Working |
| 22 | SBC vedha, Method A vs Method B | `SARVATOBHADRA`, `sbcCellOf` (display only) | "Vedha is described, not computed" | Missing | `sbcVedha.ts`: geometric lines (front, behind, ahead), Method B (all three), Method A from a tradition's table | `vedic/test/sbcVedha.test.ts` (14) | Missing → Working (engine) |
| 23 | Versioned tradition with reference; Abhijit; orientation verified | — | — | Primary reference unavailable | `SBC_GEOMETRY_V1` (geometry verified cell by cell, names and motion rule **unverified**, `methodA: null`); `SBC_METHOD_A_FIXTURE` labelled test fixture | sbcVedha tests "Kṛttikā → Śravaṇa, Bharaṇī, Viśākhā", pairing both ways, Abhijit at (8,2) | Missing → Blocked (missing evidence) for the motion rule and vāma/dakṣiṇa naming |
| 24 | Daily rows; targets; "no hit" ≠ "not evaluated"; why methods disagree | — | — | Missing | `vedhaForDay`, `evaluateVedha` (outcome hit/no-hit/not-evaluated with reason codes), `disagreement`, concurrent counts; VedhaTab with detail rows | sbcVedha tests; browser run | Missing → Working |
| 25 | Study 8 Oct–20 Nov 2026 at 10:00 Asia/Kolkata, holidays/weekends, prices only on valid sessions, NIFTY/gold/silver direction | `NSE_CALENDAR` (new), `dailyRows` (new) | — | Missing | One row per calendar day (44), each instrument on its own calendar, irregular bars flagged | `research/test/daily.test.ts`; browser run on real data | Missing → Working |
| 26 | Historical event studies reusing the CSV/provider; source, adjustment, coverage; missing ≠ holiday | `parseMarketCsv`, `apiProvider` | Single shared series | No per-instrument data, no coverage or fingerprint | `useInstrumentData` per instrument (file, provider or the Signal study series), fingerprint SHA-256; `dayStatus` session/weekend/holiday/missing/unknown | `eventstudy.test.ts` "missing session, not a holiday"; `finastro.test.ts` fingerprint | Partial → Working |
| 27 | Episode study and daily-state study | — | — | Missing | `episodeObservations`, `dailyStateObservations`; sessions and distinct episodes both reported | combustion + eventstudy tests | Missing → Working |
| 28 | Forward returns +1,+3,+5,+10,+20; reference-close mapping; after-close; own calendar; incomplete excluded and counted | `logReturns` (daily) | — | Missing | `referenceSession` (same-session-close / after-close-next-session / non-session-next-session), `forwardReturns` (null past data) | eventstudy tests "after the close", "exchange zone", "incomplete horizons" | Missing → Working |
| 29 | Statistics and unconditional baseline; bearish hit rate | `stats/` (for signals) | — | Missing for events | `returnStats` (n, +/−/0, rates, mean, median, min, max, sd), baseline over the same period | eventstudy tests | Missing → Working |
| 30 | Orb sweep 0.5–8° with chronological split, frozen choice, no leakage, counts, repeatable | — | — | Missing | `sweepParameter` drops training observations whose horizon reaches the split; choice on training only; holdout measured once; config and fingerprint saved | eventstudy tests "drops training observations…", "frozen choice" | Missing → Working |
| 31 | Measurements, rules, outcomes labelled separately on screen and in exports; score traceable to inputs, rule version, weight | — | — | Missing | Layer badges on columns; every export header carries `[input/measurement/rule/outcome]`; Config sheet with rule id and version, ephemeris version, dataset | `finastro.test.ts` exports | Missing → Working |
| 32 | Sector weights only from named configs | — | No sector weights exist | Nothing to gate | No sector weighting added; recorded here so none is introduced without a named config | — | Not applicable |
| 33 | Export CSV/Excel and printable report; Gujarati/English render | — | — | Missing | CSV (UTF-8 BOM), SpreadsheetML workbook (.xls), printable HTML report; Gujarati checked on screen | `finastro.test.ts`; browser (gu) | Missing → Working |
| 34 | Desktop and Android-sized layouts | Tailwind layout | — | — | Fields wrap; tables scroll inside their cards; no page overflow at 375 px | browser check at 375×812 | Missing → Working |
| 35 | Responsive UI with cancellation; partial runs never saved as complete | search worker | Long searches off the main thread; no cancel | Missing | `cancelSearches()` terminates the worker; `saveStudy` refuses any status but `complete` | `finastro.test.ts` "refuses to save…"; browser cancel test | Partial → Working |
| 36 | Independent astronomical reference check | native `sweph` dev dependency | Used for engine tests | — | Conjunction instants (2025-03-23, 2026-01-06, 2026-10-24) bisected with native SE: < 1 s | combustion tests | Working → Working |
| 37 | 10–15 year Venus run | — | — | — | 2011–2026: 18–20 episodes in under 15 s (test); 2011-01-01 → 2026-11-20 in the browser: 20 episodes, 3.8 s with 3,898 sampled closes | combustion test "fifteen years" | Missing → Working |

## Changed files

**Engine**
- NEW `packages/engine/src/aspects/windows.ts`
- `packages/engine/src/ephemeris/swisseph-wasm-provider.ts` (`ephemerisVersion`)
- `packages/engine/src/ephemeris/provider.ts`
- `packages/engine/src/index.ts`
- NEW `packages/engine/test/integration/windows.test.ts`
- NEW `packages/engine/test/integration/version.test.ts`

**Research**
- NEW `packages/research/src/market/calendar.ts`
- NEW `packages/research/src/market/daily.ts`
- NEW `packages/research/src/eventstudy/engine.ts`
- NEW `packages/research/src/combustion/venus.ts`
- NEW `packages/research/src/combustion/study.ts`
- NEW `packages/research/src/instruments.ts`
- NEW `packages/research/src/chartFacts.ts`
- `packages/research/src/index.ts`
- Tests: NEW `eventstudy.test.ts`, NEW `combustion.test.ts`, NEW `daily.test.ts`

**Vedic**
- NEW `packages/vedic/src/sbcVedha.ts`
- `packages/vedic/src/index.ts`
- NEW `packages/vedic/test/sbcVedha.test.ts`

**App**
- NEW `apps/web/src/components/finastro/` (shared, FinancialAstrologyPanel, VenusCombustionTab, VedhaTab, InstrumentsTab)
- NEW `apps/web/src/components/AspectWindowsPanel.tsx`
- NEW `apps/web/src/lib/exporter.ts`
- NEW `apps/web/src/lib/search-worker-jobs.ts`
- `apps/web/src/lib/search.ts`, `search-worker.ts` (cancel, new jobs)
- NEW `apps/web/src/state/instrumentData.ts`
- NEW `apps/web/src/state/studies.ts`
- `apps/web/src/shell/routes.tsx`
- NEW `apps/web/test/finastro.test.ts`
- `apps/web/test/shell.test.tsx`

**i18n:** `packages/i18n/src/locales/{en,hi,gu}.ts` (308 keys each).

**Docs:** this file, plus `RESEARCH_METHODOLOGY.md`, `ASTRONOMY_NOTES.md` and
`VEDIC_CONVENTIONS.md` §14.

## Walkthrough 1: Venus combustion on NIFTY

1. **Financial astrology → Venus combustion.** Pick the instrument (NIFTY 50)
   and the range (default 2011-01-01 to 2026-11-20). Pick the zodiac,
   ayanāṁśa, node and houses; they are recorded with the run. The
   Sun–Venus separation does not depend on the ayanāṁśa, but the longitudes
   shown do.
2. **Load the data** on the dataset card: Import CSV (date, close), Fetch from
   provider, or reuse the Signal study's series. The card shows:
   - the source and the column the close was read from;
   - coverage, rows kept and rejected;
   - whether volume exists;
   - the price basis;
   - the dataset fingerprint.
3. **Check the band preset** (*Venus combustion, research preset* 1.0.0). Edit
   bounds or scores if needed; validation blocks gaps, overlaps and a missing
   open band. An edit that keeps the old version is flagged.
4. **Calculate.** This runs in the worker, and *Cancel* terminates it.
   - The episode table lists each id, superior or inferior conjunction, entry,
     refined exact instant(s), exit and the closest separation.
   - Selecting an episode shows every event with both longitudes, speeds,
     separation, phase, band (rule) and score (rule).
5. **Historical study.** Choose an *Episode study* (at entry, exact or exit) or
   a *Daily-state study* (every session close inside a band).
   - The statistics table shows all observations and each group (conjunction
     kind, or band), with the unconditional baseline below.
   - Counts state the observations, the distinct episodes, the ones past the
     data and the merged same-day duplicates.
6. **Orb sweep.** Set the holdout start, horizon, objective and minimum
   training n. The table shows every orb tried with its training counts; the
   choice is frozen, then measured once on the holdout.
7. **Export:**
   - CSV per table: Episodes, Events, Samples, Observations, Statistics, Orb
     sweep, Config;
   - one Excel workbook with all sheets;
   - a printable report.

   **Save study** works only after a complete run; *Reopen* restores every
   setting and warns if the loaded data's fingerprint differs.

## Walkthrough 2: daily NIFTY vedha comparison

1. **Financial astrology → Daily vedha.** The range defaults to 2026-10-08 →
   2026-11-20 at 10:00 Asia/Kolkata, with sidereal Lahiri and the mean node.
2. **Tradition:** *Sarvatobhadra, geometric lines* 1.0.0, which is
   unverified, so Method A is not evaluated. The *Method A test fixture* is
   offered for demonstration and is labelled as such everywhere.
3. **Chart record:** NIFTY 50 index launch, 1996-04-22 10:00, provisional. The
   targets are:
   - natal Moon nakṣatra: Mṛgaśira;
   - natal Moon rāśi: Vṛṣabha;
   - ascendant, kept as a separate target: Mithuna;
   - natal tithi group: Pūrṇā.

   All are labelled *provisional* with the record id. Name letters are
   optional, user-entered and labelled *name-based*.
4. **Load** NIFTY, gold and silver on their dataset cards, then **Calculate**.
5. **Read the result.**
   - There is one row per calendar day. It gives Method A's hits (or *not
     evaluated*), Method B's hits, and each instrument's close and direction,
     or its day type: weekend, holiday (named), missing session, or unknown
     where there is no holiday list.
   - Selecting a date lists every hit with its local time, body, source
     nakṣatra, motion, target, line and traditional name, rule,
     classification, concurrent hits and why A and B differ.
6. **Comparison.** For valid NIFTY sessions only, choose the target. The table
   counts sessions with and without a malefic hit, by direction. The panel
   says it is a count, not a test.

## Reproducible examples

**Real data, not committed.** These used the Yahoo Finance chart API, daily,
2011-01-03 → 2026-11-23, read on 2026-11-24. Market data is not redistributed
with the app; to reproduce, export the same series and check the fingerprint.

- **Venus, NIFTY 50.** Settings: `^NSEI`, 3,898 rows, 0 rejected, fingerprint
  `e54f66813b9144d2`, range 2011-01-01 → 2026-11-20, sidereal Lahiri, mean
  node, preset 1.0.0, SE 2.10.03.
  - **Episodes:** 20, found in 3.8 s.
  - **Episode study at the exact conjunction:** 20 observations from 20
    episodes.

    | Horizon | n | Mean | Bearish hit rate | Baseline mean | Baseline bearish hit rate |
    |---|---|---|---|---|---|
    | +5 | 20 | 0.000 % | 45 % | 0.233 % | 43.4 % (n = 3,725) |
    | +20 | 19 | 1.654 % | 31.6 % | — | — |

    At +20, one horizon was incomplete and excluded.
  - **Daily-state study:** 482 session observations from 20 episodes.
  - **Orb sweep** (+5, split 2021-01-01, highest bearish hit rate, minimum
    n 10):

    | | Orb | n | Episodes | Bearish hit rate |
    |---|---|---|---|---|
    | Training | 0.5° (chosen) | 12 | 6 | 66.7 % |
    | Frozen holdout | 0.5° | 13 | 4 | 38.5 % |

    The training "edge" did not survive. This is the behaviour the split
    exists to expose.
- **Vedha, NIFTY 50.** Settings: the same NIFTY file, plus COMEX `GC=F` and
  `SI=F` from the same source, 44 days at 10:00 IST, geometric tradition
  1.0.0.
  - **Valid NIFTY sessions:** 30 (Dussehra on 20 October and Diwali
    Balipratipada on 10 November are holidays).
  - **Target, natal Moon nakṣatra:**

    | | Sessions with a malefic hit | Sessions without |
    |---|---|---|
    | Method B | 4 up / 7 down | 15 up / 4 down |
    | Method A, fixture only | 3 up / 6 down | 16 up / 5 down |
    | Method A, production | not evaluated on all 30 | |

  - **Target, tithi group:** Saturn sits on the Pūrṇā line through the
    whole window, so every session is "hit". With *any* target, every session
    has a malefic Method B hit. Neither discriminates.
  - **Data-quality finding:** Yahoo's COMEX daily bars include **Sunday-dated
    bars** (the Globex evening open) and miss some Fridays. The screen flags
    the Sunday bars as irregular (*) and keeps them out of the comparison.
    With no COMEX holiday list, a weekday without a bar is *unknown*, not
    *missing*.

**Fixtures, in the tests.** These are synthetic:
- the closes 100, 101, 102… on the NSE 2026 calendar (`eventstudy.test.ts`,
  `daily.test.ts`);
- the vedha grahas placed in chosen nakṣatras (`sbcVedha.test.ts`);
- the brief's numerical aspect cases (`windows.test.ts`).

Astronomy in the tests is real (Swiss Ephemeris, checked against native SE).

## Blocked items, their effect, and the evidence needed

| Item | Effect now | Evidence needed |
|---|---|---|
| Sarvatobhadra Method A motion rule (which line for direct, fast, retrograde, stationary; exceptions for the luminaries and nodes) | Method A is "not evaluated" in production; only the labelled fixture runs it | A critical edition of Narapati Jayacharya's *Narapati-jaya-caryā Svarodaya* (Sarvatobhadra chapter) or *Mānasāgarī* with verse numbers, giving the motion → direction table and at least one worked example |
| Vāma/dakṣiṇa naming of the diagonals | Diagonals are reported as "behind"/"ahead" (geometric) without traditional names | The same source: a worked example naming the left and right vedha from one nakṣatra (for example Kṛttikā) |
| Treatment of a graha standing on the target itself, and of the Moon in Method A | Not counted; the Moon is "not evaluated" in the fixture | The same source |
| Reliance listing / first-trade date (1977–78) | The comparison shows incorporation only; listing "needed" | A BSE listing record or the 1977 prospectus |
| NIFTY launch time | 10:00 is a research convention, labelled provisional | An NSE circular or press release with the launch time |
| COMEX holiday calendar and the continuous-contract roll rule | Gold and silver weekdays without bars are "unknown"; roll jumps stay in the series | CME's holiday calendar for the years studied, and the data vendor's roll methodology (or a back-adjusted series with its rule) |
| NSE holiday lists before 2026 | Weekdays without bars before 2026 are "unknown", not "missing" | NSE's yearly holiday circulars for 2011–2025 (transcribe into `NSE_CALENDAR`) |
| Swiss Ephemeris return flags | The Moshier fallback is inferred from the range, not read from SE | A binding that returns `iflag` (or a patch to swisseph-wasm) |
| Android device check | Layout verified at 375×812 in the browser; not run on a device in this session | A Capacitor build on a phone (`docs/ANDROID.md`) |

## Sources consulted

- NIFTY 50 base date and launch: [NSE Indices: NIFTY 50](https://www.niftyindices.com/indices/equity/broad-based-indices/NIFTY--50)
  and [Wikipedia: NIFTY 50](https://en.wikipedia.org/wiki/NIFTY_50). The base
  date is 3 November 1995 (base value 1000); the launch was 22 April 1996.
- Reliance incorporation (8 May 1973, as Mynylon Limited) and the 1977 issue:
  [RIL history](https://www.ril.com/about/history) and secondary press. No
  primary listing record was found.
- Sarvatobhadra, as a secondary source only:
  [Wikipedia: Sarvatobhadra chakra](https://en.wikipedia.org/wiki/Sarvatobhadra_chakra),
  which cites Phaladeepika ch. XXVI. It gave the fixture, not the production
  rule.

## Roadmap (not in 0.42)

- **Cycles:**
  - planetary synodic-cycle studies on the same event engine;
  - return charts of an instrument chart.
- **Progressions and directions** of instrument charts (secondary progressions,
  solar arc) as event sources.
- **Synastry between instruments** (for example index vs constituent) and
  composites.
- **Interpretation:** written readings stay out of the research layer;
  any interpretation text must be labelled tradition and never phrased as a
  forecast.
- **Cloud sync of saved studies** to the Neon account, with the configuration
  and fingerprints only (never prices).
- **Data:**
  - NSE/BSE holiday lists for 2011–2025;
  - a CME holiday calendar;
  - a back-adjusted futures option.
- **Statistics:**
  - a block bootstrap and multiple-testing correction across the orb sweep;
  - the same rotation test the signal study uses, for episode studies.
