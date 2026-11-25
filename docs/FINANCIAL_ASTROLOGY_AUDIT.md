# Financial astrology: audit and implementation (0.42.0, updated 0.43.0)

This audit covers the research brief for aspect events, Venus combustion,
instruments and their charts, the daily Sarvatobhadra vedha and historical
event studies. It records what existed, the gaps that were verified, what was
built and the test that proves each item. It ends with what is still blocked
and the evidence needed to unblock it.

**0.43.0** worked through the blocked list. The Sarvatobhadra motion rule,
the Reliance listing date, the NSE/BSE holidays for 2011–2025, the COMEX
holiday rules and the Swiss Ephemeris return flag are now sourced and in the
code. Two corrections came out of that work: the front vedha line, and a
time-zone fault in the scratch converter used for the COMEX examples. See
"0.43.0: what was resolved" below. Rows changed by 0.43 are marked †.

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
| 2† | Fallback made visible | `sourceForJd`, `BodyPosition.source` | Moshier outside 1800–2400 is labelled per position | Wrapper discards SE's returned flag, so the fallback was inferred from the range (and the range was a day too generous: the files start 1800-01-02) | Provider calls `swe_calc_ut` itself and reads the returned flag; `sourceBasis: 'returned-flag'` | `engine/test/integration/version.test.ts` (1800-01-01 00:00 is Moshier by flag) | Partial → Working |
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
| 19† | Reliance incorporation vs listing | — | — | Listing date found in the company's Annual Report 1976-77 | Records `reliance-incorporation` (1973-05-08) and `reliance-listing` (1978-01-23), both date-only, side by side | combustion tests "holds Reliance incorporation and listing…" | Missing → Working |
| 20 | Date-only records: time-sensitive outputs uncertain/unavailable; visible noon convention | — | — | Missing | `deriveChartFacts`: no ascendant, noon Moon labelled `noon-convention`, `certainForDay` checked 00:00–24:00 | combustion tests "date-only record" | Missing → Working |
| 21 | NIFTY 22 Apr 1996 10:00 Mumbai, provisional, Moon/nakṣatra/ascendant from settings, apart from name targets | — | — | Missing | Record `nifty50-launch-provisional`; facts change with ayanāṁśa; name letters are a separate, user-entered target with its own provenance | combustion tests "changes with the ayanāṁśa" | Missing → Working |
| 22† | SBC vedha, Method A vs Method B | `SARVATOBHADRA`, `sbcCellOf` (display only) | "Vedha is described, not computed" | Missing | `sbcVedha.ts`: lines (front, behind, ahead), Method B (all three), Method A from a tradition's table; the front line pierces only its end nakṣatra (0.43 correction) | `vedic/test/sbcVedha.test.ts` (24), including Sastri's three lists cell by cell | Missing → Working |
| 23† | Versioned tradition with reference; Abhijit; orientation verified | — | — | 0.42: no reference. 0.43: Horaratna in Sastri's Phaladeepika (1950), pp. 311–315 | `SBC_HORARATNA_V1` (status *sourced*): retrograde → right, swift → left, mean → front; Sun and Moon left, Rāhu and Ketu right. `SBC_ALL_THREE_V1` (luminaries and nodes all three). Which diagonal is "left" is a stated convention (`sidesBasis`). `SBC_GEOMETRY_V1` kept, marked superseded | sbcVedha tests "Method A under the Horaratna" | Missing → Working; sides by stated convention |
| 24 | Daily rows; targets; "no hit" ≠ "not evaluated"; why methods disagree | — | — | Missing | `vedhaForDay`, `evaluateVedha` (outcome hit/no-hit/not-evaluated with reason codes), `disagreement`, concurrent counts; VedhaTab with detail rows | sbcVedha tests; browser run | Missing → Working |
| 25† | Study 8 Oct–20 Nov 2026 at 10:00 Asia/Kolkata, holidays/weekends, prices only on valid sessions, NIFTY/gold/silver direction | `NSE_CALENDAR` (new), `dailyRows` (new) | — | Missing | One row per calendar day (44), each instrument on its own calendar, irregular bars flagged; NSE/BSE holidays 2011–2026 and COMEX rules 2011–2027 (0.43), disputed dates read as unknown | `research/test/daily.test.ts`, `eventstudy.test.ts` calendar tests; real data | Missing → Working |
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
2. **Tradition:** *Sarvatobhadra, Horaratna (Sastri 1950)* 1.0.0, status
   *sourced*. The screen shows its reference and the stated convention for
   which diagonal is "left". Also offered:
   - *luminaries and nodes cast all three* 1.0.0;
   - the superseded 1.0.0 geometry, kept so studies saved with it reopen;
   - the labelled *Method A test fixture*.
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
- **Vedha, NIFTY 50 (rerun for 0.43).** Settings: the same NIFTY file, plus
  COMEX `GC=F` and `SI=F` from the same source, 44 days at 10:00 IST,
  sidereal Lahiri, mean node.
  - **Targets** from the provisional NIFTY chart: Moon in Mṛgaśirā, Moon
    rāśi Vṛṣabha, ascendant Mithuna, tithi group Pūrṇā.
  - **Valid sessions:**
    - NIFTY: 30 (Dussehra on 20 October and Diwali Balipratipada on
      10 November are holidays);
    - gold and silver: 32 each, with no irregular bars.
  - **Malefic hits by session**, as up / down counts. The reproduction
    script is `vedha_compare.mts`; the numbers below are its output.

    | Tradition, target | Method A: hit | Method A: no hit | Method B: hit | Method B: no hit |
    |---|---|---|---|---|
    | Horaratna, Moon nakṣatra | 0 / 0 | 19 / 11 | 4 / 7 | 15 / 4 |
    | Horaratna, Moon rāśi | 4 / 2 | 15 / 9 | 10 / 8 | 9 / 3 |
    | Horaratna, ascendant | 8 / 0 | 11 / 11 | 16 / 6 | 3 / 5 |
    | Horaratna, tithi group | 0 / 0 | 19 / 11 | 0 / 0 | 19 / 11 |
    | Horaratna, any target | 11 / 2 | 8 / 9 | 18 / 11 | 1 / 0 |
    | All three, Moon nakṣatra | 3 / 6 | 16 / 5 | 4 / 7 | 15 / 4 |

  - **Method A is evaluated on every session.** The only "not evaluated"
    rows are Mercury and Venus at their stations (8 graha-days, 32 evaluations
    over the four targets), which the
    Horaratna does not cover.
  - **Correction to 0.42.** The 0.42 report said the tithi group was "hit"
    every day. That was an artifact of letting the front line pierce every
    cell it crosses: Saturn's front line ran through the centre. Under
    Sastri's lists the front line reaches only its end nakṣatra, and the
    tithi group is never hit in this window.
  - **Correction to 0.42: COMEX "Sunday bars".** The 0.42 report described
    Sunday-dated bars and missing Fridays in Yahoo's COMEX data. That was a
    fault in the scratch converter used for these examples, not in the data
    or the app:
    - the converter dated Yahoo's timestamps with the current fixed UTC
      offset (EST), so in daylight-saving months every 00:00 EDT bar fell on
      the previous day;
    - dated in America/New_York, the series has no weekend bars.

    The app's own CSV import was never affected. The converter now uses the
    IANA zone.

**Fixtures, in the tests.** These are synthetic:
- the closes 100, 101, 102… on the NSE 2026 calendar (`eventstudy.test.ts`,
  `daily.test.ts`);
- the vedha grahas placed in chosen nakṣatras (`sbcVedha.test.ts`);
- the brief's numerical aspect cases (`windows.test.ts`).

Astronomy in the tests is real (Swiss Ephemeris, checked against native SE).

## 0.43.0: what was resolved

| 0.42 blocked item | Resolution | Evidence used | Test |
|---|---|---|---|
| Sarvatobhadra Method A motion rule | `SBC_HORARATNA_V1`: for Mars to Saturn, retrograde → right, swift → left, mean → front; Rāhu and Ketu always right; Sun and Moon always left. A station is not evaluated, because the text is silent on it | Horaratna, English rendering by V. Subrahmanya Sastri, *Phaladeepika*, 2nd ed. (Bangalore 1950), pp. 312–313; Phaladeepika XXVI.48 | sbcVedha "Method A under the Horaratna" |
| The other reading (the luminaries and nodes cast all three) | `SBC_ALL_THREE_V1`, offered beside it | N. Venkatachalaiah & K. R. Sai Shankar, *Sri Varaha Mihira's Sarvato Bhadra Chakra* (compilation) | same |
| Which cells a line pierces | The front line pierces only its end nakṣatra; the diagonals pierce every cell. This corrects 0.42 | Sastri p. 312: the nine-cell lists for Kṛttikā, Rohiṇī and Mṛgaśirā | sbcVedha "the Horaratna lists", cell by cell |
| Malefic and benefic classes | Saturn, Sun, Rāhu, Ketu and Mars are malefic; Mercury is malefic when it shares a rāśi with a malefic; the waning Moon is malefic | Sastri p. 312 | sbcVedha "classes Mercury by its company…" |
| Reliance listing date | `reliance-listing`, 1978-01-23, date-only, Bombay | Reliance Textile Industries Ltd, *Annual Report 1976-77*, Directors' Report p. 6 (ril.com archive): listed at Bombay and Ahmedabad "with effect from 23rd January, 1978". The Offer for Sale dated 24 Oct 1977 is in the *Annual Report 1977-78* | combustion "holds Reliance incorporation and listing…" |
| NSE/BSE holidays 2011–2025 | 219 weekday holidays loaded. Seven dates where the list and all three series disagree are kept as *disputed* (read as unknown). The Saturday special sessions on 2024-01-20 and 2025-02-01 count as sessions | `exchange_calendars` XBOM list (Apache-2.0; it cites the NSE and BSE pages and Zerodha), cross-checked with the Yahoo NIFTY, SENSEX and RELIANCE.NS series: 212 of 219 dates have no bar in any series, and the other 7 are Muhurat sessions | eventstudy calendar tests |
| COMEX holiday calendar | `comexHolidays(year)`, 2011–2027. Closed: New Year, Good Friday, Christmas. Early halt with no trade date: MLK, Presidents, Memorial, Juneteenth (2022+), July 4, Labor, Thanksgiving. Hurricane Sandy and the 2018 day of mourning are disputed | `pandas_market_calendars` CMEGlobexEnergyAndMetals (MIT), cross-checked with GC=F and SI=F: no bar on 158 of 160 rule days | eventstudy "derives COMEX trade-date holidays…" |
| Futures roll | Not reconstructible: Yahoo serves no expired contracts (GCZ24.CMX and others return "not found"). Roll-free series were added instead: GOLDBEES.NS (2009–) and SILVERBEES.NS (2022–), on the NSE calendar | Yahoo chart API, checked 2026-11-24 | combustion "offers roll-free ETF series…" |
| Swiss Ephemeris return flag | Read from `swe_calc_ut` directly. It showed that the bundled files start on 1800-01-02, so midnight on 1 January 1800 is Moshier, which the range check had called Swiss | swisseph-wasm 0.1.0 exposes the Emscripten module | version.test "reads the ephemeris used…" |

## 0.44.0: the Indian-market pass

| Item | Change | Evidence |
|---|---|---|
| Fetch from provider on the live site | Answered `PROVIDER_NOT_CONFIGURED` for every instrument. Now `MARKET_DATA_PROVIDER=yahoo`: daily bars from Yahoo's chart endpoint (`period1=0`, `interval=1d`; `range=max` silently returns monthly bars), dated in the exchange's IANA zone, with an unfinished session dropped | All seven instruments fetched with 0 rows rejected; the api-tests `prices` suite (synthetic JSON) |
| Vendor faults in free series | `screenBars`: a bar more than 40 % from the previous close that is back within 10 % of it inside 10 bars is set aside and listed, never filled | GOLDBEES 2019-12-19/20 at 1/100; RELIANCE.NS 1997-10-27 to 11-04 and 2005-07-28; 0 set aside in NIFTY, SENSEX, GC=F, SI=F, SILVERBEES |
| Disputed NSE dates | 2013-11-14 session, 2013-11-15 holiday (Muharram moved by exchange notice); 2019-02-13 and 2019-03-29 sessions. 2011-10-26, 2012-10-26 and 2012-11-13 remain disputed | Business Standard, 13 Nov 2013; INDstocks daily bars (exchange-sourced, from 2013-03-28) for NIFTY, SENSEX and five stocks |
| Budget weekend sessions | 2015-02-28, 2020-02-01 and 2026-02-01 count as sessions | INDstocks NIFTY volume 0.9–2.1 × median; 376 one-minute bars 09:15–15:30 on 2026-02-01 |
| Days past the data | New day status `outside`, not `missing` | daily.test |
| NSE 2027 holidays | Not yet published by NSE (it usually publishes in December); 2027 weekdays read as unknown and the Vedha tab says why | NSE circular archive, searched 2026-11-25 |

## 0.45.0: findings from a full test of the page

The test covered every tab and control, each instrument and tradition, the exports, saved studies, Hindi and Gujarati, and phone width. It used a local admin account and synthetic records. Seven defects were found and fixed:

| Defect | Effect before | Fix | Evidence |
|---|---|---|---|
| Events before the first bar were measured from the first bar | SILVERBEES (listed 2022) showed 20 "complete" Venus episodes from 2011, with median = max at +20 | `referenceSession` returns null before the first bar, across a `missing` session, or across more than two `unknown` weekdays; counted as outside the data | eventstudy.test; SILVERBEES 6 episodes and 14 outside; NIFTY 20 and 0 |
| Holdout leaked into the main columns | In-sample p-values and FDR/Holm read the held-back tail | `runStudy` measures on the training part only and reports `split` dates | study.test; ^NSEI Mercury Rx: 912 → 637 training bars at 30 % |
| CSV slash dates defaulted to MM/DD | 02/11/2026 imported as 11 Feb | `detectDayFirst`: the file's own dates decide; undecidable files are refused | market.test |
| CSV decimal comma defaulted off | `100,5` read as 1005 | `detectDecimalComma`, the same principle | market.test |
| `/api/prices` open to anyone, cached publicly | Anonymous proxy to the provider | `requireAdmin`, `cache-control: private` | api-tests `prices` (401 / 403 / 200) |
| Truncated Yahoo histories passed silently | RELIANCE.BO: 8 bars, first trade 1995-07-10 | `firstTrade` from Yahoo meta; notice when it precedes the first bar by more than 30 days | market.test `truncatedHistory`; live RELIANCE.BO, INFY.BO |
| Venus blank date; Vedha menus at 375 px | Raw engine error; 612 px page | Range check with message; `max-w-full` menus | Browser check |

Checked and working: access (customers and signed-out visitors cannot reach the page), all seven fetches (0 rows rejected), record validation, all 20 Vedha tradition and record pairs, the 400-day cap and the 2027 notice, Cancel, CSV, Excel and print exports (valid XML, no formula-like cells), saving and reopening a study with its dataset warning, a remembered series across a reload, Hindi and Gujarati with no raw keys, and no console errors.

## Blocked items still open, their effect, and the evidence needed

| Item | Effect now | Evidence needed |
|---|---|---|
| Which diagonal is vāma (left) | Settled by a stated convention, shown on screen and in exports. A graha stands on the edge facing into the cakra with East at the top, so from Kṛttikā "left" is Viśākhā (towards later nakṣatras); swift motion, which moves a graha forward, gives the left vedha | A text or commentary that names the left and right vedha of one nakṣatra (Narapati-jaya-caryā, Mānasāgarī, or a commentary on Horaratna) |
| Numerical speed for "swift" vs "mean", and stations | Swift means faster than the mean daily motion (convention); a station (below 10 % of the mean) is "not evaluated" | The speed table in Venkatachalaiah & Sai Shankar, which is illegible in the scan, or another source with numbers |
| NIFTY launch time | 10:00 is a research convention, labelled provisional. NSE Indices, Wikipedia and the press were searched; the only 1996 trading-hours table found was a forum post its author says ChatGPT wrote | An NSE or IISL circular or press release from April 1996 |
| Disputed NSE dates (3, before 2013) and COMEX dates (3) | Read as *unknown*, with the disagreement stated. 0.44 settled four NSE dates | The NSE circular for 2011 and 2012 (Diwali Lakshmi Pujan sessions, 26 Oct 2012); CME's notice for 29–30 Oct 2012 and 5 Dec 2018 |
| NSE 2027 holiday list | 2027 weekdays read as unknown | NSE's 2027 circular, expected in December 2026 |
| COMEX roll dates | GC=F/SI=F roll jumps remain in those series; GOLDBEES/SILVERBEES avoid them | A vendor's back-adjusted continuous series with its documented rule, or individual contract histories |
| Android device check | Layout verified at 375×812 in the browser. No device is connected and no emulator image is installed on this machine | A phone with USB debugging, or permission to download an emulator system image (about 1 GB) |

## Sources consulted

- NIFTY 50 base date and launch: [NSE Indices: NIFTY 50](https://www.niftyindices.com/indices/equity/broad-based-indices/NIFTY--50)
  and [Wikipedia: NIFTY 50](https://en.wikipedia.org/wiki/NIFTY_50). The base
  date is 3 November 1995 (base value 1000); the launch was 22 April 1996.
- Reliance:
  - incorporation as Mynylon Limited, 8 May 1973: [RIL history](https://www.ril.com/about/history);
  - listing and offer for sale: the company's own annual reports,
    [1976-77](https://www.ril.com/sites/default/files/2023-01/1976-1977.pdf)
    and [1977-78](https://www.ril.com/sites/default/files/2023-01/1977-1978.pdf).
- Sarvatobhadra:
  - production rule: V. Subrahmanya Sastri, [Phaladeepika, 2nd ed. 1950](https://archive.org/details/Phaladeepika2ndEd.1950ByVSubrahmanyaSastri),
    ch. XXVI and the Horaratna rendering on pp. 311–315;
  - the other reading: [Sri Varaha Mihira's Sarvato Bhadra Chakra](https://archive.org/stream/astrology-book-collection/Naksatras_stars_special%20Chakras_Sarvatobhadra/Sarvatobhadra/Jyotish_Sarvatho%20bhadra%20chakra_djvu.txt);
  - the fixture: [Wikipedia: Sarvatobhadra chakra](https://en.wikipedia.org/wiki/Sarvatobhadra_chakra)
    (secondary).
- Holidays:
  - [exchange_calendars XBOM](https://github.com/gerrymanoim/exchange_calendars/blob/master/exchange_calendars/exchange_calendar_xbom.py);
  - [pandas_market_calendars CME energy and metals](https://github.com/rsheftel/pandas_market_calendars/blob/master/pandas_market_calendars/calendars/cme_globex_energy_and_metals.py).

## Roadmap (not in 0.44)

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
  - the NSE/BSE 2027 holiday list, once NSE publishes it;
  - a back-adjusted futures option;
  - a licensed or exchange-sourced feed in place of Yahoo, if a study needs
    one (INDstocks matches Yahoo's index closes exactly but adjusts single
    stocks differently).
- **Statistics:**
  - a block bootstrap and multiple-testing correction across the orb sweep;
  - the same rotation test the signal study uses, for episode studies.
