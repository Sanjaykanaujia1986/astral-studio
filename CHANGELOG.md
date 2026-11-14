# Changelog

Newest first.

## 0.25.0 — 2026-11-14
- NEW: **Hindi and Gujarati are complete.** Every page now reads in the chosen script, with no English or IAST left where a translation belongs:
  - Graha and rāśi names, short labels in the Vedic chart (सू चं मं… / સૂ ચં મં…), nakṣatras, yoga names, saham names and formulas, avakahaḍā and ghātaka values, tārā and bindu names, daśā systems and levels, sāḍe-sātī phases and pāyas, kūṭa names and the yoni animals are shown in Devanagari or Gujarati.
  - Sanskrit terms are transliterated from IAST by a new `iastToScript` (modern spelling: मंगल, not मङ्गल).
  - Yoga reasons are now data (`YogaResult.detail`) as well as text, so they read as full sentences in each language; the English text is unchanged and a test holds it to the engine's own sentence.
  - The chart wheel's title and angle labels, the Square of Nine captions, motion per day, cycle units, research signal names, the provider name, the GeoNames credit, the tagline and the dashboard's saved-chart error are translated.
  - Times in Hindi and Gujarati use the 24-hour clock, because the locale's am/pm markers are Latin.
- Kept as written on purpose: D-numbers for vargas (D9), the A − B + C saham notation, place names, the exact UTC timestamp, and proper names such as the GNU AGPL and Swiss Ephemeris.

## 0.24.1 — 2026-11-14
- CHANGE: tests use synthetic birth data only. The sidereal-houses test no longer carries a real person's chart; the rules that chart proved (sidereal cusps = tropical − ayanāṁśa, and Krishnamurti and Lahiri applied independently across a sign boundary) are tested on synthetic moments.

## 0.24.0 — 2026-11-14
- NEW: **Horoscope tables**, one at a time from a picker:
  - planetary friendship (permanent, temporary and five-fold)
  - dignity and combustion
  - ṣoḍaśavarga across all sixteen vargas
  - viṁśopaka bala in four schemes, with Parāśara's or the printed saptavarga weights
  - 41 Tājika sahams
  - bhāva, horā and ghaṭī lagnas
  - Jaimini rāśi dṛṣṭi and ārūḍha padas
  - avakahaḍā and ghātaka
  - favourable points with gems and other traditional correspondences, labelled as correspondences, not advice
  - the Tārā and Sudarśana cakras
  - the chalit (bhāva) chart on Śrīpati sandhis
- NEW: **Sāyana pages** — tropical positions with motion, latitude and declination; Placidus cusps; aspect grids between planets and from planets to cusps, using the reports' whole-degree orbs.
- NEW: **Daily transits**:
  - the daily power chart for any month (natal bindus of each transiting planet, total, ±28, running daśā)
  - the Moon's daily tārā between nakṣatra and sign changes
  - the year's gochar with houses, bindus and daśā
- NEW: **KP event analysis** for 17 matters (vehicle, travel, education, marriage, children, health, finance, property and more): each cusp's sub-lord → star-lord chain and its kārakas, against the matter's favourable and unfavourable houses.
- Checked against two printed reports:
  - Daily power chart: 1,439 of 1,440 numbers.
  - Moon tārā: all 90 rows, to the minute.
  - Sahams: 40 of 41 (the reports print Jalapatha as 0°).
  - KP event chains: 69 of 74. The other five contradict that report's own KP table.
  - Conventions are in VEDIC_CONVENTIONS §12.
- FIX: the exported `sunrise()` helper called the ephemeris without naming the Sun and threw; it now asks for the Sun's rise.

## 0.23.1 — 2026-11-14
- FIX: the smoke test searches every code-split chunk for its release markers, not only the entry chunk, so the Gann lab, dashboard and licence markers stop failing on a good deploy.
- FIX: the Vedic panel tests describe the new daśā section (system picker, 365.25-day year, Y-M-D balance) and look for the pañcāṅga's yoga inside its own section.

## 0.23.0 — 2026-11-14
- NEW: **Varṣaphal** — the annual chart for any year of life (the moment the sidereal Sun returns to its natal longitude), its lagna, Muntha sign and house, the mudda daśā, and the decade of returns around it. Return dates agree with two printed reports for 199 of 200 years.
- NEW: **Mudda daśā** in the printed horoscopes' whole-day convention (64% of 1,920 printed dates exact, the rest within two days because the reports place the return up to half an hour early) or proportional to the solar year.
- NEW: **Sāyana progressions** — one day per year of life; all 2,000 printed positions agree.

## 0.22.0 — 2026-11-14
- NEW: **Krishnamurti Paddhati** — KP ayanāṁśa with Placidus cusps; sign, star, sub and sub-sub lords of every cusp and planet; houses occupied and owned; significators; ruling planets at birth; the four-step theory. All 22 lord rows agree with two printed reports.
- NEW: **Aṣṭakavarga** — bindus of the seven planets and the lagna, the sarvāṣṭakavarga and rekhās, trikoṇa and ekādhipatya reductions, rāśi/graha/śodhya piṇḍas, and each planet's contributor table. The sarvāṣṭakavarga matches both reports sign for sign.
- NEW: **Ṣaḍbala and bhāva bala** — every component in virūpas, rūpas against the required minimum, rank, iṣṭa/kaṣṭa phala, and bhāva bala on Śrīpati madhyas. Fourteen components agree with the reports to 0.01 virūpa; horā, māsa, nathonnata and ceṣṭā follow the classical rule where the reports' values cannot be reproduced (VEDIC_CONVENTIONS §10).

## 0.21.0 — 2026-11-14
- NEW: **Aṣṭakūṭa matching** — the eight kūṭas and the 36-point total for a pair (the partner's birth details entered on the Vedic page, cast with this chart's own zodiac and nodes), and the printed horoscope's 36-row table of this Moon against every partner nakṣatra segment.
- NEW: **Maṅgala doṣa** from the lagna, the Moon and Venus.
- NEW: **Yogas** — Gajakesarī, Sunaphā, Anaphā, Durudharā, Kemadruma, Candra-Maṅgala, Vasumatī, Amala, Veśi, Vāsi, Ubhayacarī, Budha-Āditya, the five Mahāpuruṣa yogas, Cāpa, Duryoga, Dehakaṣṭa, Mātṛmūladhana and Kāla-sarpa — each with the placement that makes it hold or fail, and a note when it would hold only by counting Rāhu/Ketu.
- Checked against two printed reports: Varṇa, Tārā, Graha maitrī, Gaṇa and Nāḍī agree on all 72 rows, Yoni on 70. Bhakūṭa follows the classical rule with the lord-friendship cancellation, and Vaśya the classical halves of Dhanu and Makara; the reports differ there (documented in VEDIC_CONVENTIONS §9).

## 0.20.0 — 2026-11-14
- NEW: **Aṣṭottarī and Yoginī daśā**, alongside Viṁśottarī, on one engine — counted from the Moon or from the lagna or any graha, and drilled down five levels (mahā → antar → pratyantar → sūkṣma → prāṇa). The running period is highlighted at every level.
- NEW: **Śani sāḍe-sātī and panautī** (ḍhaiyā) table with each phase, retrograde re-entries, the pāya of every entry, and the dates Saturn passes over the natal Moon; plus **Guru, Śani and Maṅgala ingress tables** with the house from the Moon and from the lagna, by decade.
- CHANGE: daśā defaults now reproduce printed horoscopes — **365.25-day years** (was 365.2425) and the clock started at **00:00 local on the birth date**. Checked against two printed reports: 1,755 of 1,775 Viṁśottarī dates and 1,287 of 1,295 Aṣṭottarī dates agree to the day; the rest are period ends within minutes of midnight. Every one of 16 printed sāḍe-sātī spells agrees. Both conventions remain selectable.
- CHANGE: daśā dates are shown in the birth time zone, as a horoscope prints them, not in UTC — a period ending at 00:00 IST no longer reads as the previous day.
- FIX: `sidereal-houses.test.ts` used a time-zone kind (`fixed`) that does not exist, so the engine typecheck failed.

## 0.19.0 — 2026-11-13
- FIX, and the most serious one this product has had: **a sidereal chart had tropical houses.** The lagna was out by a whole ayanāṁśa — about 24°, most of a rāśi — so it named the wrong sign roughly four times in five, and every whole-sign bhāva and every varga built on it was wrong with it. The Western tropical chart was never affected.
- Cause: `swe_houses` takes no flags and always answers tropical. `#applyZodiac` set the sidereal mode and returned `SEFLG_SIDEREAL`, and the houses call **threw that return value away**. Setting the mode does nothing for a function with nowhere to put it. Now `swe_houses_ex`, which has somewhere to put it.
- `vedic/src/chart.ts` reads `chart.houses?.ascendant` under a comment reading "Lagna (ascendant) in sidereal longitude". It had been receiving a tropical one since the module was written.
- **Found by a scanned Gujarati jātaka**, not by a test: a reader sent a printed chart, every planet agreed with this engine to within 13 arcseconds, and the lagna was out by exactly 23°40'. One number disagreeing in a way that equals a constant is not a rounding difference.
- Why no test caught it: every existing test either used the tropical zodiac, where the bug is invisible, or asserted the Vedic figures against numbers this engine had produced. A test that records what the code does cannot tell you the code is wrong. Three Vedic expectations had the bug baked into them and are corrected here — the fixture's lagna moves Gemini 1°53' → Taurus 8°09', and the Sun's bhāva 8 → 9.
- New `reference/sidereal-houses.test.ts` with two kinds of assertion. An **invariant**: sidereal equals tropical minus the ayanāṁśa for every cusp, at three births including a polar one — true whatever the right answer is. And an **external fixture**: the printed jātaka itself, both editions, to 30 arcseconds. Only the second would catch the engine and the invariant being wrong together. Confirmed by mutation: restoring `swe_houses` fails five of the seven.
- The fixture pins Saturn on the Makara/Kumbha boundary on purpose. The two ayanāṁśas differ by about 6′ and Saturn sat across the line — Kumbha under Krishnamurti, Makara under Chitra Pakṣa. Same point in the sky, different rāśi, different bhāva, different dignity.
- Also asserts the **ARMC is left alone**, because it is right ascension along the equator rather than an ecliptic longitude. Subtracting the ayanāṁśa from everything in `ascmc` is the obvious wrong fix.
- **Engine fingerprint changes `855fec9b` → `0123070b`**, which is what a fingerprint is for. Re-recorded in the self-test, the API, the seed, the panels and the docs. Older CHANGELOG entries keep the old value: they record what was true when they were written.
- Verified end to end: the app loaded with that birth data now prints the same lagna as the printed sheet, to the minute.

## 0.18.0 — 2026-11-12
- **The Vedic chart names its grahas instead of drawing symbols**, in bold: Su, Mo, Ma, Me, Ju, Ve, Sa, Ra, Ke — the form printed in Indian ephemerides.
- Not a preference. **☊ and ☋ are the same horseshoe, one turned over**, and at the size a chart cell affords they are not reliably distinguishable. They are also the one pair that must never be confused, since they are always opposite — reading one for the other reflects half the chart. The outer planets had the same problem for a different reason: ♅ ♆ ♇ are not symbols most readers of an Indian chart have memorised.
- The figure therefore ignores the Glyph style setting, which still governs the Western wheel. The prop is still accepted so a caller setting it everywhere need not special-case this one, and it says in the code that it is ignored and why.
- Labels are `font-weight: 600` and drawn in the body font rather than the glyph stack — these are letters now, and that stack picks fonts for symbol coverage, not for reading two letters at 12px.
- Two-letter names with a retrograde mark are roughly **twice the width** of a single symbol, which is exactly the change that silently pushes a label over a slanted edge. A test now walks all twelve cells at one to nine bodies in both styles and checks the four corners of every label box by point-in-polygon, measured at 1.9 glyph widths. Zero escape. Confirmed by mutation: widening the box to 6 glyph widths fails it.

## 0.17.1 — 2026-11-12
- FIX: **the Vedic chart was a white box on the night sky, with grey labels on it.** Three separate faults, all in the figure, and all invisible to yesterday's audit because that sweep skips `<svg>` — which is exactly where a chart lives.
- The panel never passed the page's palette to `VedicChartFigure`, so it resolved to the light chart theme and painted `#ffffff` whatever the page was doing. The same defect the Western wheel had in 0.13.0, in the one component that did not get the fix. It now follows the page, and the figure draws on `#140c2b` with its grid at 15.96:1.
- FOUND BY MEASURING: the light chart theme's `muted` — the colour a Vedic chart draws its **sign labels** in — was **3.65:1** on its own white surface and **2.61:1** inside the lagna wash. The least readable thing on the figure was the thing that tells you which sign you are looking at. Darkened to `#635c6d`: 6.40 and 4.56. Chosen by searching for the first value clearing both, not by eye.
- The print theme had the same shape of problem in the lagna cell, at 3.88:1. Fixed by lightening the wash rather than darkening the ink, so the lagna mark stays a mark.
- The chart themes now have contrast tests of their own — ink and muted, on the surface and on the lagna wash, for light, dark and print. They had none, which is why a palette shipped at 2.61:1. Confirmed by mutation: putting the old value back fails two of them.
- Checked and NOT changed: the North Indian layout is correct (house 1 at the top centre, signs ascending anticlockwise), and no glyph overflows its cell — measured by point-in-polygon for all twelve cells at one to nine bodies, in both styles. The first two things I suspected were both fine.

## 0.17.0 — 2026-11-12
- **The contrast audit is cleared.** Re-measured in a browser across all eleven pages in both themes: **0 failures on dark, 0 on light.** Before: 14 distinct failing colour pairs on dark, worst at 1.84:1.
- The cause was one thing throughout: ~250 hardcoded Tailwind palette classes (`text-slate-700`, `text-rose-700`, `bg-sky-50`, `border-slate-300`, ...) chosen against the original ivory theme and never re-measured after the redesign. They are replaced by utilities named after a **role** — `as-text`, `as-text-muted`, `as-text-danger`, `as-surface-inset` — which read the tokens, so their contrast is whatever the theme test measures and cannot drift from it.
- The utilities are emitted from the UI package's `themeCss()`, beside the tokens they read, rather than written into the app's stylesheet — the report document needs them too.
- **`.as-paper`**: the report renders the SAME table components as the app, so switching those tables to tokens would have printed the dark theme's near-white ink onto white paper. The light tokens are redeclared on the report subtree. Verified live: with the page dark, the preview's `--as-ink` is `#1a1033` while the page's is `#f3effc`.
- FIX: **the nav rail's own contrast test was measuring the wrong thing.** It checked `accentOnBrand` against the pure `brand` token — 8.35:1 — while the rail that ships is translucent and composited to **3.59:1** over the light canvas. The opacity is now a shared constant (`RAIL_OPACITY`, emitted as `--as-rail-opacity`), the stylesheet reads it, and the test composites with the same number. Raised 0.72 → 0.88, which brings the wordmark to 6.1:1; a test asserts the old value would fail.
- The "Planned" tag in the rail used `ink-muted`, which flips with the page while the rail is dark in both themes — **1.04:1** in light mode. It now draws from `onBrand`.
- The Calendar's density bands were three fixed pale blues; they are now three steps of accent mixed into an opaque surface, so a busy day reads as busy in either theme instead of leaving a near-white cell on the night sky with themed ink on it at 1.06:1.
- The aspectarian coloured its aspect names from `LIGHT_THEME` unconditionally. It now takes the palette the page is showing, like the wheel does.
- Self-contained callouts — the amber disclaimer, the rose failure box — are deliberately untouched. They set a background AND a text colour together, so they were never part of this defect; one heading that the sweep did convert has been put back, with a comment saying why.
- Harness note: the audit ignores `background-image`, so the primary button reported 1.1:1 against the card behind its gradient. Measured against the gradient's own stops it is **5.04–5.73:1**. Recorded because the next person running this will hit the same false positive.

## 0.16.0 — 2026-11-12
- **Chart view controls in Chart Studio**: aspect lines on or off, degree ticks on or off, and the figure at Compact / Standard / Large. The choices persist like the glyph style and the precision.
- They change the **drawing and nothing else**, and the panel says so where the controls are: every aspect is computed whatever the checkbox says, and which ones exist is the orb profile's decision in Settings. The test that matters asserts exactly that — hiding the lines removes lines from the figure and **not one row** from the aspect table. A reader who unticks a box and watches a table shrink has been told by the product that an aspect stopped existing.
- The house system is deliberately NOT a view option. Houses are snapshotted with the chart, so changing them is a recalculation, not a way of looking at the same figure.
- The size cap lives on a wrapper and follows the chosen size. The wheel is `width: 100%; max-width: 100%`, so a fixed cap would have rendered "Large" at exactly the same pixels as "Standard" while the control claimed otherwise — the inline-max-width trap from the report figures, caught this time by measuring the rendered width in a browser (520 / 680 / 870 px) rather than trusting the markup.
- Tests confirmed by mutation: hardcoding `showAspects` to true fails two of them.

## Contrast audit — 2026-11-12
Not a release. A sweep of all eleven pages in both themes, recorded here because the result is a work list.

- My first harness was wrong: Tailwind v4 emits `oklch()` and it read those three numbers as RGB. Rebuilt to resolve every colour through a canvas pixel, which also fixed the earlier claim that Settings was clean — it is not.
- **Dark theme**, hardcoded Tailwind palette classes left from the ivory theme, on 8 of 11 pages: `text-slate-700` form labels at **1.84:1**, `text-slate-600` at **2.51**, `text-sky-700` at **3.25**, `text-rose-700` at **3.16**, `text-slate-500` at **4.00**.
- **Light theme**: the nav rail is 72% opaque, so the brand wordmark renders at **3.61:1** over the composited rail rather than the 10.44:1 the token test asserts — the test measures the token, and the rail that ships is translucent. The "Planned" badge in the rail is at **1.04:1**.
- **Both themes**: the Calendar grid carries a hardcoded `bg-white`, and its muted day numbers are **1.49:1** against it.
- Clean everywhere: **Vedic, Gann Lab, Clients** — the panels written after the redesign, entirely on tokens. The defect is "styled before the theme existed", not anything systemic.

## 0.15.1 — 2026-11-12
- FIX: **the Language menu was unreadable.** On the dark theme the dropdown opened as a white list with the page's light ink on it, so "English" was legible on the selection highlight and the two draft locales were invisible beside it.
- The dropdown a `<select>` opens is painted by the browser and does not inherit the card it sits on. Its options inherited `color` from the page but had no background of their own, and Chrome treats an author-coloured option as author-styled — so it paints the list on white and puts the ink on the one background it was never measured against. `color-scheme: dark` on the root does not rescue it: naming a colour is what opts the list out of the system rendering in the first place.
- Both are now set together from the tokens, so the popup follows the theme. Measured live rather than eyeballed: **15.09:1** on dark (`ink` on `raised`), **18.01:1** on light, across all five selects on the page. Not scoped to the shell — a select rendered anywhere else had the same problem.
- New stylesheet tests for the three rules that no rendered test can reach, because jsdom has no print mode, no native select popup and no backdrop filter. Each covers something that shipped broken: the option colour pair, the print rules from 0.14.0, and the `-webkit-backdrop-filter` ordering from 0.14.0. Checked by mutation — removing the background from the rule fails two of them — because an assertion that passes on a broken input is worth nothing.
- Checked the rest of the page while there: no other text on Settings falls under 4.5:1 in either theme. The muted labels look dim and measure fine.

## 0.15.0 — 2026-11-09
- **The reload asymmetry is resolved.** Since 0.14.0 a chart survived a refresh and a price series did not, so Gann Lab came back with your chart intact and the same blank "import a CSV" you saw on your first visit — which reads as though the import had failed.
- It is not one answer for both, because they are not the same thing. A chart's INPUT is a few dozen bytes of birth data the reader typed. A series' input **is** the market data, so bringing it back means storing that, and storing someone's market data is a decision they should make in words rather than one inferred from the fact that they used the feature.
- **The descriptor is always kept** — symbol, bar count, date range, source, and the parse choices. Metadata, never prices. After a reload both workspaces name the series that was open and say the prices were not kept, and the import settings come back so re-importing is one click rather than a second guess at the date order.
- **The bars are kept only on request.** A "Keep this series in this browser" checkbox, off by default, with the reasoning stated next to it. Ticking it stores a series already open; unticking it deletes what was stored immediately, because an opt-out that leaves the data behind is not an opt-out.
- Bars are capped at 4 MB before writing — roughly fifty thousand daily bars. `localStorage` throws its quota error on whatever write comes next, so an oversized series would have surfaced as a failure to save an alert. Over the cap the panel says the series was not stored and leaves it loaded.
- Verified in a browser on a real 745-bar series, not only in tests: with the default settings the only key written is the descriptor and no close price appears anywhere in storage; with the box ticked, 89 kB of bars are stored and a hard reload brings the fan back with identical numbers (719 bars, 1×1 at 1,832.25).
- A test asserts the blunt version of the privacy property — that no closing price appears in **any** storage key under the defaults — so a future change to the descriptor's shape cannot quietly start keeping prices.

## 0.14.1 — 2026-11-09
- Both fixes below were found by running Gann Lab against a **real price series** — 745 daily RELIANCE bars — rather than the round numbers the tests use. Neither was visible in synthetic data.
- FIX: **the Square of 144 caption stated something false.** It said "the grid's diagonal is the 1×1 on this scale, which is why the two agree", while the grid started at 0.5 price per cell and the fan at 1 price per bar — so the diagonal was drawn exactly on top of the fan's 1×2. Measured in the browser from the rendered line slopes: ten diagonals, and the duplicate was the 1×2's, not the 1×1's.
- The grid's scale now **follows the fan's** until the reader overrides it, which is what the engine's `diagonalScale` was built to express, and the caption is **computed rather than asserted** — it names both slopes and says plainly when they are different lines.
- The test that covered this asserted the SENTENCE was on the page, and the sentence was hardcoded, so it passed throughout. Replaced with three that assert the geometry.
- FIX: **a price feed's float noise reached the UI.** A real close of 1226.40 arrives from the feed as `1226.4000244140625`, and it was printed verbatim into the projection's arithmetic column — the one column whose job is to be checkable by hand — beside a result shown to two decimals. The derivation is now trimmed to four decimals, which keeps anything a price can genuinely carry, including forex pips. The calculation is untouched.
- Everything else checked out against independently computed ground truth: the anchor picked the true lowest close (bar 25, 2023-10-26, 1113.25), all nine fan lines reproduce exactly, the measured move and its nearest standard ratio reproduce, the time counts are right across a leap February, the eight equinoxes and solstices come from the real ingress search, and the spiral angle of 1,226.4 is 3.599° by hand.

## 0.14.0 — 2026-11-09
- **The active chart survives a reload.** It lived only in memory, and the welcome hero made that visible: refresh and a reader who had worked on a chart all morning was greeted by "cast your first chart".
- What is stored is the **birth data, not the chart**. A stored `NatalChart` is a snapshot of one engine version's output, and after an ephemeris or house-code change it would keep rendering with full confidence while being wrong — a reader cannot tell a stale chart from a fresh one. Recasting costs 1.6 ms and can only produce a chart this build stands behind.
- The stored input is validated like the alerts and the Gann templates. Six malformed shapes have tests, because each of them used to reach the engine and throw somewhere the reader could make no sense of — on a page they had not asked to calculate anything on.
- A restore that fails is **silent**: the stored input is dropped and no banner appears. The reader did not ask for that calculation, and an error about a chart they cast last week is noise they cannot act on.
- A `hydrating` flag resolved before the first paint, so the hero and every "you need a chart first" empty state wait for the recast instead of flashing the wrong advice. Without it a deep link into a restored chart looked like a dead end.
- **Route-level code splitting** for Vedic, Gann, Research and Reports, each of which drags a whole package in behind it. Measured rather than assumed: the single chunk was 961 kB raw / 280 kB gzipped; the five deferred chunks come to 87 kB raw / 30 kB gzipped. The remaining 877 kB is React plus the engine, and the dashboard genuinely needs the engine — Today's Sky is computed, so there is no honest way to defer it.
- FOUND BY MEASURING, not by reading: the glass cards had **no blur at all**. `CSS.supports('-webkit-backdrop-filter', 'blur(4px)')` is false in current Chrome while the unprefixed property is true, and the minifier had kept only the prefixed declaration of each pair. Reordered so the standard property comes last and wins.
- FIX: printing the night sky. A `@media print` block forces a white ground, hides the starfield, makes the cards opaque, disables the entrance animation and gives the gradient-clipped hero title a solid colour. Introduced with the redesign three days ago.
- FIX: two `<h1>`s on the dashboard — the page scaffold's and the hero's. The hero's is now an `<h2>`; the visual weight was always the class, not the level.
- FIX: touch targets. Inputs, selects and both button classes reach 44 px under `pointer: coarse`, and so does the skip link, which was a 20 px-tall target for the first thing a keyboard user meets.
- CORRECTION to my own audit: I attributed the 1.9 MB ephemeris download to the new hero. The dashboard already loads it unconditionally for Today's Sky, so the hero costs nothing extra.

## 0.13.0 — 2026-11-06
- **Visual redesign to a deep-violet night sky**, replacing navy/ivory/gold. This reverses §4 of the spec, which said "no cosmic backgrounds, particles or glass" — at the product owner's request, recorded here rather than quietly overwritten.
- What did NOT change is that **contrast is computed, not eyeballed**. Every value in the new palette was measured against WCAG before it was written, and the theme test now covers the nav rail as well.
- FOUND BY MEASURING: the brand wordmark used `accent`, which flips with the page — but the rail is a dark ground in BOTH modes, so light mode put a dark violet on a dark rail at **3.68:1**. New `accentOnBrand` token, held to 4.5:1 against `brand` in both themes, with a test.
- FOUND BY LOOKING: the chart theme defaulted to `light` and never followed the page, so the wheel painted a white disc onto the night sky and read as a pasted screenshot. New default `auto` follows the page and re-resolves when the system theme changes; `light`, `dark` and `print` remain explicit, because someone printing wants the print palette whatever their screen is doing.
- The chart `DARK_THEME` moved from blue-grey to the violet ground. Element and aspect hues are unchanged — they carry meaning, and re-tinting them to match a background would make fire and air harder to tell apart.
- **Welcome hero** on the dashboard, shown only while there is no chart. Its wheel is the real `ChartWheel` drawn for this moment from the bundled ephemeris, not an illustration: a reader cannot tell a picture of a chart from a chart, which is exactly why it has to be one.
- Starfield and nebulae are pure CSS gradients — no images and no web fonts, because the app is verified to make zero external requests and the smoke test checks it. Everything that moves sits behind `prefers-reduced-motion`, and the decorative layer is `pointer-events: none` behind the shell.
- The gradient-clipped hero title falls back to a solid colour under `forced-colors`, where background images are discarded and it would otherwise vanish entirely.

## 0.12.0 — 2026-11-05
- **Market-data adapters**, the last Gann Lab gap. The workspace is now **ready** and its "not built" list is gone rather than left empty.
- A provider interface in `packages/research` that carries no provider, no endpoint and no credentials: the research code must not depend on where prices came from. A provider has to declare its own name and **whether fetching sends the symbol off the machine**.
- `/api/prices` proxies the request server-side, so the CSP stays `connect-src 'self'` and "the client makes no external requests" — a property the smoke test checks — remains true. The browser talks to this origin; this origin talks to the provider.
- The upstream is configuration, not a default: `MARKET_DATA_PROVIDER` and `MARKET_DATA_KEY`. With neither set the endpoint answers PROVIDER_NOT_CONFIGURED and the panel says so. Fetching sends a symbol to a third party, and which third party is the deployment's decision.
- Adapters for Alpha Vantage and Tiingo. Both answer a bad key or a rate limit with HTTP 200 and a non-CSV body, so the response shape is checked rather than assumed — otherwise a configuration problem renders as an empty chart.
- **Stooq is deliberately absent.** It was the obvious keyless candidate and, as of November 2026, answers non-browser clients with a JavaScript proof-of-work challenge instead of data. Getting around that is circumventing bot detection; the adapter would be permanently broken, and is better absent than present and failing. Found by calling it, not by assuming.
- A fetched series is parsed by the SAME parser as an imported file, so the two cannot drift apart on a decimal comma or a date order, and the store records which provider actually answered rather than which adapter asked.

## 0.11.0 — 2026-11-05
- **Annotations**: notes pinned to a bar and a price, or to a value on the spiral — in DATA coordinates, not pixels, so resizing the figure moves the drawing and leaves the note on its point. Drawn on the figure and listed beside it.
- **Saved templates**: every setting of a construction — origin, increment, rings, winding, the fan's scale and anchor, the grid — stored and restored, so a drawing is rebuilt exactly rather than approximately. Saving under an existing name replaces it; two templates called "working" would be indistinguishable.
- **Time counts**, which an earlier version deferred on purpose. They are a calendar, so they are here as dates, with the standing rule unchanged: nothing is called a turn, a pivot or a level, and no count is chosen by how well it fits the series. A count in **bars** and a count in **calendar days** are different questions, so the unit travels with every row.
- Equinoxes and solstices come from the engine's ingress search — a solstice is the Sun entering Capricorn — rather than being computed a second time in the Gann package, so the product has one definition of each.
- Notes and templates are validated on load, like the alerts: an entry from an older version cannot reach the figures and fail where the cause is hard to see.
- FIX: `Omit` does not distribute over a union, so `Omit<GannAnnotation, 'id'>` collapsed to the two members' shared keys and the caller could pass neither `value` nor `barIndex`. Replaced with a distributive form.
- FIX in a test, not the code: the source-offer test asserted `VITE_SOURCE_URL` was unset, so it began failing the moment the source was actually published — the one time the feature was working properly. It now asserts the invariant: exactly one of a resolving link or an "unconfigured" notice, never both and never neither.
- Gann Lab's remaining gap is **market-data provider adapters** alone.

## 0.10.0 — 2026-11-05
- **Alerts**, closing the Dashboard's last gap: the workspace is now **ready**. An alert is a saved question — "Saturn square my natal Mercury within 1°?" — re-asked from the ephemeris each time the page loads.
- It says, above the list rather than in a footnote, that **nothing runs while the app is closed and nothing is sent to you**. There is no background job and no notification path in this build, and an "alert" that silently only fires when you look would stop a reader checking. Asserted by test.
- Alerts live in this browser, like the display settings: a list of what someone is watching is not something to ship to a database unasked. Stored entries are validated on load, so a hand-edited or older one cannot reach the transit search and throw there.
- Matching runs through the transit search, so a retrograde loop yields its real three passes rather than one.
- **Square of 144**, with the three inputs it cannot default — anchor, price per cell, bars per cell — and its conventions written first. Only the harmonic fractions are drawn; 144 uniform lines would be a grey block saying nothing the scale has not said. Its diagonal is DERIVED from the fan's 1×1 on the same scale, so the two constructions cannot drift into two different correct answers.
- **SVG export** for both Gann figures, with the settings written into the file's title so a drawing that leaves the page can still say what produced it. Three lines rather than a rasteriser, because the figures already resolve their colours in JavaScript.
- Gann Lab's "not built" list shrinks accordingly: annotations, saved templates and market-data adapters remain.

## 0.9.1 — 2026-11-04
- **Bi-wheel**: `ChartWheel` takes an optional `outerChart`, drawing a second chart in an outer ring — transits, a return, a partner. Both rings are oriented on the INNER chart's ascendant; a ring turned to its own would look right and make every cross-aspect wrong by the angle between them, so a test asserts it.
- A drawn divider separates the two rings, because a bi-wheel whose rings blend invites reading a transit position as a natal one. Outer glyphs are tinted and the ring carries its own label, so a screenshot says what it is.
- `scripts/chart-report.ts` and `scripts/chart-wheels.ts`: a reading produced by calculation rather than from memory. Natal table, aspects by orb, transit hits with pass numbers and applying/separating measured at the transit instant, stations, and both wheels as standalone SVG. Run with `node_modules/.bin/jiti`.

## 0.9.0 — 2026-11-04
- **Gann circular and polygon layouts**, with their conventions written first (`docs/GANN_CONVENTIONS.md` §6).
- The **wheel**: values round a circle of N divisions, where the angle is **linear in the value** — so values N apart share a degree forever. That is the construction's whole point, and the opposite of the Square of Nine, where a full turn adds a growing amount because its angle is linear in √v. The workspace says so where the reader is looking, and a test asserts the two are different functions.
- The **polygon spiral**, 3 to 12 sides. Ring r holds S×r cells, giving the centred hexagonal numbers 1, 7, 19, 37, 61 for six sides — asserted, since that is the hexagon chart's defining property. Corners are taken from position, like the square's crosses, so they survive any origin and increment.
- A radial figure for both, kept in its own file so no single component decides which geometry it is drawing.
- Square of 144 stays unbuilt and is still listed as such: it is a price–time grid rather than a spiral, and needs an anchoring convention and a value per cell, neither of which has a default.
- Layout strings in all three locales (i18n guard: 32/32).

## 0.8.0 — 2026-11-04
- **Sky events**: the four engine gaps Event Explorer has been declaring since 0.4.0 are closed, and the workspace is now **ready** rather than partial.
- **Sign ingresses** (`findIngresses`). Solved, not detected: a crossing that happens and reverses between two grid samples is still found, so a retrograde re-entry is its own event. Verified against Mercury's triple crossing of the Pisces boundary in early 2020 and the Sun's twelve ingresses in 2024 — Aries at the equinox, 20 March 03:06 UTC.
- **Stations** (`findStations`). Root-finding on speed, not a scan for small values. Mercury's December 2023 retrograde comes back as two events in the right order, with |speed| < 1e-6 at each. A body that never stations — the Sun, the Moon, a mean node — raises rather than returning an empty list, because silence reads as "none in this window".
- **Declination events** (`findDeclinationEvents`): parallels, contra-parallels, equator crossings, and maxima/minima solved on the RATE of change rather than picked as the largest sample. The Sun's extremes land on the solstices at 23.44°, its crossings on the equinoxes.
- **Reference frames**: `frame: 'geocentric' | 'heliocentric' | 'topocentric'` on every calculation. Heliocentric REFUSES the Sun, Moon and nodes, which have no position from the Sun; topocentric refuses a missing observer rather than silently returning geocentric, which for the Moon differs by about a degree.
- New Event Explorer panel driving all three searches, with the Moon excluded from ingresses (it would contribute 160 rows a year).
- New `.as-button-primary`: the design system had only a secondary button, so panels were reaching for raw slate-900, a colour outside the palette that ignores the theme and its contrast assertions.
- Sky-event strings in all three locales (i18n guard: 32/32).

## 0.7.3 — 2026-11-04
- FIX: grahas in a crowded rāśi left their cell. The figure stacked them straight down from the cell's anchor, and because the North Indian cells are triangles, a stellium of five drew its last two glyphs across the chart's own lines. The block now wraps into columns, shrinks, and is centred on the anchor instead of hung below it.
- Glyph placement moved into `layout.ts` as `bodySlots()`, so "every glyph lands inside its own cell" is a test — point-in-polygon for 1 to 7 bodies in all twelve cells of both layouts — rather than something noticed in a screenshot.
- FIX: every SVG figure ignored the width its caller asked for. An inline `maxWidth: 100%` beat the caller's `max-w-[...]` class, so the Vedic chart rendered at 644px where 460 was requested. The `size` prop is now a real maximum, and the chart is 400px.
- Same override corrected in the Square of Nine and Gann fan figures.

## 0.7.2 — 2026-11-04
- FIX, spotted on the live page: the licence notice said the source "is published". It is not yet — `VITE_SOURCE_URL` is unset — so the app was making a claim the warning directly beneath it contradicted. It now says the work carries those terms, which is true in both states.

## 0.7.1 — 2026-11-04
- **Licence settled: AGPL-3.0-or-later.** The Astrodienst Professional licence (CHF 750) is not being bought, which selects the copyleft route rather than removing the obligation. `LICENSE` added at the root; `package.json` declares it.
- The app now carries its own source offer in Settings → About. AGPL §13 is triggered by SERVING the app, so every visitor to the public deployment is a recipient and the offer has to come from the running program, not from a README.
- When `VITE_SOURCE_URL` is unset the app says the link is missing instead of showing an "available" claim that points nowhere — asserted by test, because a dead offer reads as compliance while providing nothing.
- `docs/LICENSING.md` rewritten: the decision and its date, why AGPL rather than GPL (the wrapper is GPL-3.0-or-later, Swiss Ephemeris is AGPL-3.0, and the stricter one governs), and the plain consequence that the code cannot later be sold closed-source as it stands.

## 0.7.0 — 2026-11-04
- Dashboard workspace at `/`, status **partial**. Three panes that are genuinely computed and one that says plainly it is not built.
- **Today's sky**: positions for this instant from the device clock, Moon phase, Moon sign, and which bodies are retrograde. No houses — the sky is placeless, and quietly using 0°N 0°E would produce an ascendant that looks real and belongs to nobody. Works with no network.
- **Next 90 days** for the open chart: Mars to Pluto, to natal bodies plus the Ascendant and Midheaven, with retrograde passes numbered. It says, where it would otherwise be implied, that saved charts are NOT scanned — that needs background jobs, which do not exist.
- **Saved charts**: the five most recent, each reopened by recasting from its stored birth details. It distinguishes "none saved" from "the database could not be reached"; showing the first when the second is true tells someone their charts are gone.
- **Alerts**: not built, and labelled so. Nothing is watching for an event.
- The dashboard composes `PlanetTable` and `TransitTable` rather than growing a second copy of each.
- Moon phase is named the way people name it — "Waning crescent", not the cycle-eighth term "Waning semi-square", which is right for Saturn and Neptune and wrong in register for the Moon. A one-to-one rename, not a second calculation.
- FIX found in the browser: including both the Ascendant and the Descendant as targets made every angular hit appear twice — a sextile to the ASC is a trine to the DSC — and spent half of a twelve-row dashboard restating itself. Opposite angles are filtered, with a regression guard.
- One instant is read for the whole screen, so the sky and the transit window cannot disagree while the ephemeris loads.
- Dashboard and lunar-phase strings in all three locales (i18n guard: 32/32).

## 0.6.0 — 2026-11-04
- Gann Lab (`@astro/gann`, 38 tests): Square of Nine with configurable origin, increment, ring count and handedness; spiral angle ↔ value; anchored fans; move measurement against the standard ratios; planetary projections, linear or via the square.
- `/gann` workspace, status **partial**: the square, the fan over an imported price series, the projection table, and an explicit list of the four things not built (circular and polygon layouts, annotations and templates, market-data adapters, time counts).
- The fan REFUSES to draw without a scale. "1×1" names no line until the reader says what one bar is worth in price, so there is no default and a zero scale produces a stated refusal rather than a flat fan that looks deliberate.
- Time is counted in **bars, not calendar days**, so weekends and holidays cannot move a line.
- The square method requires the turn to be chosen. A "jump to the nearest turn" button exists for navigating a large square and says, where it sits, that choosing the turn nearest the current price is fitting after the fact.
- `docs/GANN_CONVENTIONS.md`, written before the code, including what the module does not do and why no construction is called a level, a target or a signal.
- The imported price series moved to a shared store, so Research and Gann Lab work on one file instead of importing it twice and drifting.
- FIX in the conventions document, found by its own test: the even squares do NOT sit on the down-left diagonal. That arm carries (2r)²+1, and 4 sits due south of centre on the cardinal cross. "Even squares are opposite odd squares" is true of the spiral angle and false of the grid — the exact conflation this module is organised to prevent.
- The square DROPS a projected value that falls outside it, and says how many it dropped, instead of clamping it to the nearest edge cell — clamping put every planet on one cell, which reads as a cluster of bodies at a single price. Found by looking at the rendered page, not by a test.
- A cell shows at most three labels and a count, which is all that is legible.
- Plot geometry is tested as arithmetic: resizing the box moves pixels and leaves every line passing through the same prices.
- New `.as-h3` for subheadings inside a card, where `.as-h2` already names the card.
- Gann strings in all three locales (i18n guard: 32/32).

## 0.5.0 — 2026-11-03
- Vedic module (`@astro/vedic`, 47 tests): whole-sign houses from the lagna, 27 nakṣatras and pādas in integer arcminutes, six vargas each with its own mapping rule, Viṁśottarī daśā, and the pañcāṅga reckoned from real sunrise.
- Vedic workspace at `/vedic`: North and South Indian figures, divisional selector D1-D12, placement table, pañcāṅga, daśā table with a selectable year length. Eleventh workspace in the rail.
- It REFUSES a tropical chart rather than converting silently: a tropical chart read as Vedic puts every graha about 24° out and looks entirely normal. Asserted in `apps/web/test/vedic.test.tsx`.
- Engine: `riseTransit()` on the provider (Swiss `swe_rise_trans`, upper limb with refraction). Returns undefined where the Sun does not rise, so the vāra is marked undefined above the polar circles instead of being taken from midnight.
- Daśā year length is explicit and selectable (Gregorian 365.2425 default, Julian, tropical, sāvana); the panel states it, because two programs using different lengths disagree by about a day over a 120-year cycle.
- `docs/VEDIC_CONVENTIONS.md`, written before the code: ayanāṁśa, node variety, per-varga rules, daśā year, sunrise definition, and an explicit list of what the module does not do.
- Smoke test covers the new route and asserts a Vedic marker in the deployed bundle: 52 checks.
- Vedic strings in all three locales, nakṣatra, tithi, yoga, karaṇa and weekday names included (i18n guard: 32/32).
- FIX: English called mean Ketu "Mean Ketu" while its three sibling labels read "Rahu (mean node)" / "Rahu (true node)" / "Ketu (true node)"; it is now "Ketu (mean node)".
- Vedic placements use the same sexagesimal formatter, precision setting and padding as the Western planet table (`01°13' Capricorn`, not `1.23°`), and the lagna now shows its degree, which decides the chart's nakṣatra and pāda.
- FIX: the divisional-chart selector overflowed the card at 375px, because a select sizes itself to its widest option and the options carry their significations.
- FIX: the daśā table borrowed `transit.column.date` ("Exact (UTC)") for a period's span and reused "Period" for the year-length selector. Both now have their own labels.

## 0.4.1 — 2026-11-03
- Production smoke test (`npm run smoke`): 50 checks against the live deployment — routes, build identity, bundled assets, security headers, database counts, city search, ephemeris values, and saved-chart access isolation. Creates and deletes its own data under a throwaway key.
- Static page title is now the brand ("Astral Studio"), not "Astro — Natal Chart".
- New engine test: sidereal longitude = tropical − ayanamsha for every body, plus a guard that a sidereal call does not leak into a following tropical one.

## 0.4.0 — 2026-11-03
- Astral Studio workspace shell: ten workspaces, collapsible navy rail on desktop, bottom bar plus More sheet on mobile, react-router-dom routing, skip link, roving focus, WCAG 2.5.8 tap targets.
- Design tokens (deep navy / warm ivory / muted gold), light + dark, contrast computed and asserted against WCAG AA. Two border tokens were failing 1.4.11 at 2.1-2.5:1 and were corrected.
- Unbuilt workspaces (Dashboard, Gann Lab, Clients) state scope and milestone instead of showing mocks; Event Explorer names its own engine gaps.
- Configurable branding (apps/web/src/brand.ts); no component hardcodes the product name.
- FIX: the cloud client accepted any 200 as valid JSON, so a non-JSON body yielded `undefined` and crashed the saved-charts panel, blanking the workspace. Responses are now validated and a per-workspace error boundary contains a failing panel.
- Removed App.tsx, superseded by the shell routes.

## 0.3.0 — 2026-11-02
- Mean/true lunar node option (Rahu/Ketu), selected per chart and snapshotted with it. Default stays true node; engine fingerprint unchanged at 855fec9b.
- New body `meanSouthNode`: mean Ketu is now derived from MEAN Rahu. Previously the only south node came from the true node, so a mean-node chart would have shown a Ketu up to 1.5 deg from every classical table.
- Node axes excluded from aspect lists for both axes and across them (definitional oppositions).
- Node type shown in the chart summary and the printed report.
- Glyph abbreviations distinguish the axes (NN/SN vs mNN/mSN) for monochrome print.

## 0.2.0 — 2026-09-15
- Neon Postgres backend: saved charts (owner-key scoped), GeoNames cities (69,641 rows), daily ephemeris 1900-2100 (73,414 rows, engine fingerprint 855fec9b).
- Vercel functions: /api/health, /api/charts, /api/cities, /api/ephemeris.
- Saved charts panel in the app (save, reopen, delete, device key export/restore).

## 0.1.0 — 2026-09-09
- First deployment to Vercel (static app, engine self-test PASS 855fec9b).
