# Changelog

Newest first.

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
