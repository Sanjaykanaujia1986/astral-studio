# Astral Studio — implementation checklist

Persistent. Updated at the end of each increment. `[x]` means built **and**
verified by a test or a measurement, not merely written.

Current version **0.10.0** · **998 unit tests** + **55 production smoke checks** ·
engine fingerprint `855fec9b`, verified in Node, in the browser and on the live
deployment.

Run them with `npm test` and `npm run smoke`.

---

## Milestone 1 — foundation

- [x] Product specification and architecture (`docs/ASTRAL_STUDIO_SPEC.md`, ADR-1..4)
- [x] Calculation adapter isolated behind `EphemerisProvider`
- [x] Validation fixtures with documented provenance (`docs/ASTRONOMY_NOTES.md`)
- [x] Chart input → real calculation → wheel + tables
- [x] Save and reopen a chart (Neon, device-key scoped)
- [x] Responsive application shell, eleven workspaces
- [x] Design tokens, light + dark, contrast asserted against WCAG AA
- [x] Configurable branding
- [ ] **Accounts and authentication** — blocked on ADR-3 (see Blocking, below)

## Milestone 2 — events, relationships, reporting

- [x] Transit search to natal positions and fixed degrees
- [x] Aspectarian (day / week / month / year) and calendar
- [x] Synastry, composite, Davison — kept distinct
- [x] Solar and lunar returns by root-finding
- [x] Secondary progressions and solar arc
- [x] Printable reports, A4 + A3, vector wheel
- [x] Long searches off the main thread, with a tested fallback
- [x] Sign ingress search — solves crossings, so retrograde re-entries appear
- [x] Station search (root-finding on speed = 0)
- [x] Declination events: parallels, contra-parallels, zero-crossings, extrema
- [x] Heliocentric and topocentric frames — both refuse rather than fake an answer
- [ ] Separate "exact hit" from "within orb interval" in the result model
- [ ] Cancellable background jobs with progress and resumable results
- [x] Event alerts — evaluated on load; no background job, and the panel says so
- [x] Dashboard workspace — today's sky, upcoming transits, recent saved charts

## Milestone 3 — Gann Lab and research

- [x] CSV OHLCV import with validation and rejected-row reporting
- [x] Reproducible studies: FDR + family-wise correction, rotation test
- [x] Backtest with costs, buy-and-hold benchmark, one-bar lag
- [x] Square of Nine — configurable origin, increment, rings, handedness
- [x] Anchored time/price overlays stating price units per time unit
- [x] Planetary projections and angle measurement, linear or via the square
- [x] Circular and polygon layouts (wheel of N, 3–12-sided spirals)
- [x] Square of 144 — anchor, price per cell and bars per cell all required
- [x] SVG export
- [ ] Annotations and saved templates
- [ ] Market-data provider adapters

## Milestone 4 — professional and mobile

- [x] Android application (Capacitor, offline-verified)
- [x] Vedic module: North/South figures, D1-D12, nakṣatra/pāda, Viṁśottarī, pañcāṅga
- [ ] Client records, notes, consent tracking
- [ ] Revocable expiring sharing links
- [ ] Versioned report templates
- [ ] Subscription entitlements and admin area
- [ ] iOS application (needs macOS and an Apple developer account)
- [ ] Notifications and sync
- [ ] AI assistant over `chartFacts()`

---

## Blocking — needs a decision, not more code

1. ~~**Swiss Ephemeris licence.**~~ **Resolved 4 Nov 2026.** The Professional
   licence is not being bought, so the project is AGPL-3.0-or-later and the
   source is published. `LICENSE` is at the root and the app carries the
   §13 source offer in Settings, pointing at
   <https://github.com/Sanjaykanaujia1986/astral-studio>. Keep the push and
   the deploy together: serving a version whose source is not published puts
   the offer back out of date.

2. **Accounts (ADR-3).** The original brief for this codebase excluded user
   management; this brief requires it. Clients, consent, sharing links and
   entitlements all depend on it. Charts are currently scoped by a hashed
   device key, which is honest but cannot support those features. Choosing a
   provider now is cheaper than migrating saved charts later.

3. ~~**Vercel account.**~~ **Resolved 3 Nov 2026.** v0.4.1 is live at
   `astro-beta-khaki.vercel.app` and verified by the smoke test.

---

## Verified on the live deployment (3 Nov 2026)

`npm run smoke` — 52 checks, all passing:

- all eleven routes serve the app (the SPA rewrite works, so a deep link survives a refresh)
- the live bundle contains the shell, the brand, the mean node, the planned workspaces and the Vedic module
- wasm 0.54 MB, ephemeris 2.05 MB, cities 3.23 MB all downloadable; wasm served as `application/wasm`
- CSP, `frame-ancestors`, nosniff, referrer policy, framing denial
- database: 69,641 cities, 73,414 ephemeris days, schema v1
- diacritic-folded city search finds Zürich with its timezone
- Sun at 359.87° on 2024-03-20, from Swiss rather than Moshier
- **access isolation**: a second owner key sees zero charts and gets 404 fetching the first key's chart by id
- malformed input rejected with 401 / 400 / 422; double-delete is a 404, not a silent success

Walked by hand in the browser as well:

- cast → save → **reload** → reopen reproduces Sun `01°13'46" Capricorn` and Moon
  `22°12'57" Leo` to the digit, with the sidereal and mean-node settings intact
- sidereal Sun equals tropical `24°57'08"` minus the Lahiri ayanamsha `23°43'22"`
- Calendar computes 12 exact aspects for November 2026 with times
- Reports render four A4 pages with the wheel and the node type
- delete removes the row and the list refreshes
- console clean

## Known limitations

- Hindi and Gujarati UI chrome is a working draft (`reviewed: false`);
  astrological vocabulary is established terminology and reliable.
- Interpretation content exists in English only. `catalogueFor` returns
  undefined for other languages rather than serving English under a translated
  heading.
- Engine fingerprint verified in Node and the browser; **not** on physical
  Android hardware — no device has been attached. `?selftest` makes that a
  thirty-second check whenever one is.
- Colour contrast is asserted from the tokens; it has not been checked with a
  real screen reader or a contrast analyser on rendered pixels.
- Android deep linking is unverified (ADR-4).
- Mobile layout verified at 375px on the **live site** (3 Nov 2026): bottom bar
  present, no horizontal scroll. Not yet checked on physical phone hardware.
- Ephemeris data-file version and a formal algorithm version are not recorded
  separately; the engine fingerprint covers output equivalence instead.
