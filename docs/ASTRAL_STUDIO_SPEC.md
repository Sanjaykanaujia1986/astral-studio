# Astral Studio — specification and architecture

Working name. Branding is configurable (`apps/web/src/brand.ts`); nothing in the
codebase hardcodes the product name.

> **Status: in development.** Some workspaces are complete and verified, some
> are partial, several are not built. The table below says which is which, and
> the navigation labels unbuilt workspaces **Planned** rather than showing an
> empty screen. Nothing here is production-ready.

---

## 1. What already exists

This brief landed on a project that is **not greenfield**. `D:\Github\Astro`
already holds a working, tested astrology platform at v0.3.0 — 686 passing
tests, a deployed web app, and an Android APK. The brief's §15 says to inspect
before changing, so this section records what the audit found rather than
restating the brief.

| Brief requirement | State | Where |
|---|---|---|
| Ephemeris behind an isolated adapter | **Done** | `packages/engine/src/ephemeris/provider.ts` — `EphemerisProvider` interface, Swiss Ephemeris via `swisseph-wasm` |
| Natal charts | **Done** | `chart/natal.ts`, verified against published values |
| Transit overlays | **Done** | `transits/engine.ts` |
| Synastry | **Done** | `synastry/engine.ts` |
| Composite (documented midpoint convention) | **Done** | `composite/engine.ts` — composite and Davison kept distinct and separately typed |
| Solar/lunar returns | **Done** | `returns/engine.ts` — root-finding, not birthday approximation |
| Secondary progressions, solar arc | **Done** | `progressions/engine.ts` |
| Interactive vector chart wheel | **Done** | `packages/ui/src/chart-wheel/` — SVG, collision-aware glyph placement (isotonic regression) |
| Position tables, aspect lists | **Done** | `packages/ui/src/tables/` |
| Configurable objects/aspects/orbs | **Done** | `aspects/definitions.ts` — orb profiles as data |
| Applying/separating with explicit semantics | **Done** | computed from relative motion, never static longitude difference; `stationary` reported rather than guessed |
| Exact aspects between moving bodies | **Done** | `buildAspectarian` |
| Transits to natal and fixed degrees | **Done** | `findTransitHits`, `findCrossings` |
| Retrograde repeat hits, wraparound, tangency | **Done** | `aspects/crossing.ts` — `isWrap`/`isGenuineRoot` |
| Long searches off the main thread | **Done** | `apps/web/src/lib/search-worker.ts`, with a tested main-thread fallback |
| Printable reports (A4/A3) | **Done** | `packages/ui/src/report/` |
| Interpretation separate from calculation | **Done** | `packages/interpretation` — engine does not depend on it, enforced by the dependency graph |
| Structured facts for an AI layer | **Done** | `chartFacts()` — versioned, serialisable, carries provenance and warnings |
| CSV market import, reproducible studies | **Done** | `packages/research` — FDR + family-wise correction, rotation test, look-ahead-free backtest |
| Timezone/DST edge cases, unknown birth time | **Done** | `time/timezone.ts`; houses suppressed, not noon-substituted |
| Polar house fallback made explicit | **Done** | typed error + labelled fallback, never silent |
| Mean/true node option | **Done (v0.3.0)** | `NodeType`, with mean Ketu derived from mean Rahu |
| Postgres + background jobs | **Partial** | Neon + Vercel functions: `/api/health`, `/api/charts`, `/api/cities`, `/api/ephemeris`. No job queue yet |
| i18n | **Done** | en / hi / gu; hi+gu chrome marked `reviewed: false` |
| Android app | **Done** | Capacitor 8, APK 8.33 MB, offline-verified |
| **Accounts and authentication** | **Not built** | see ADR-3 |
| **Workspace IA (10 areas)** | **This increment** | `apps/web/src/shell/` |
| **Astral Studio design system** | **This increment** | `packages/ui/src/theme/` |
| **Event Explorer workspace** | **Done (v0.8.0)** | `packages/engine/src/events` — ingress, station, declination; plus heliocentric and topocentric frames |
| **Gann Lab** | **Partial (v0.6.0)** | `packages/gann` — Square of Nine, anchored fans, projections; no circular or polygon layouts |
| **Clients, consent, sharing, templates** | **Not built** | Milestone 4 |
| **Vedic module** | **Done (v0.5.0)** | `packages/vedic` — nakṣatras, vargas, Viṁśottarī, pañcāṅga; `/vedic` |
| **Native iOS** | **Not built** | Android only |
| **AI assistant** | **Not built** | payload exists, no assistant |

### Engine gaps the audit found

Searched for, and genuinely absent:

- **Sign ingresses** — no search. Cheap to add: `findCrossings` against sign
  boundaries.
- **Stations** — `stationary` exists as a *flag on a position*, but there is no
  station *event finder* (root-finding on speed = 0).
- **Declination events** — declination is computed (`includeEquatorial`), but
  there is no search for parallels, contra-parallels, zero-crossings or extrema.
- **Heliocentric / topocentric** — not supported; only geocentric.

---

## 2. Architecture decisions

### ADR-1: Keep the calculation engine in TypeScript, running on the client

The brief (§12) suggests a **Python calculation service**. Recommending against
it, and proceeding with the existing design.

Reasons, in order of weight:

1. **It would create a second astronomy implementation.** The existing engine is
   verified against published values and fingerprinted: `runSelfTest()` hashes
   eight reference charts to a milliarcsecond and asserts `855fec9b` in Node,
   in the browser and on-device. A Python service means two implementations to
   keep in numerical agreement — the failure mode the brief's own §13
   ("cross-checks beyond merely calling the same implementation twice") exists
   to catch, now permanent instead of a test.
2. **It would break offline calculation.** The brief (§11) forbids claiming
   offline support unless implemented and validated. It *is* implemented and
   validated: zero external requests measured from a cold start, with the WASM
   engine and ephemeris bundled. A server-side engine removes that.
3. **No performance case.** A natal chart takes 1.6 ms on the client.

**What is adopted from §12:** PostgreSQL (Neon), background workers for long
searches (currently a Web Worker; a server queue when searches outgrow the
client), object storage for exports, shared schemas, and the modular
separation of astronomy / rules / geometry / statistics / interpretation /
presentation — which the package boundaries already enforce.

**Settings isolation** (§12): the engine is pure and takes settings per call;
there is no mutable global. The one exception is Swiss Ephemeris's C-level
sidereal mode, which is process-wide — handled by `#applyZodiac` setting it per
call, and the test suite runs the engine package on `pool: 'forks'` because the
*native oracle* shares those globals across threads.

### ADR-2: React Native is deferred; Capacitor continues

§12 suggests React Native/Expo. The Android app already exists via Capacitor
and shares **100%** of the UI, not a subset — the same React tree, the same
engine, the same verified numbers. A React Native rewrite would share domain
types and API contracts but reimplement every screen, and could not run the
WASM engine the same way.

Honest accounting per §11: Capacitor produces a **real installable app**, not a
PWA. iOS is not built — that needs macOS and an Apple developer account.

### ADR-3: Accounts — a reversal that needs a decision

The original brief for this codebase **explicitly excluded** user management,
login and registration. This brief **requires** them (§10: secure
authentication, client records, sharing links, entitlements).

Current state: charts are scoped by a random 256-bit **device key**, hashed
server-side. That is honest about what it is — the UI says it is not
authentication — but it cannot support client records, consent tracking,
revocable sharing or entitlements.

This is listed as a **blocking question**, not assumed, because it determines
the data model, needs third-party credentials, and migrating saved charts later
is harder than choosing now.

### ADR-4: Routing

`react-router-dom` v7 with `BrowserRouter`, plus a Vercel rewrite so deep links
resolve. Inside Capacitor the app always starts at `/` and nothing retypes a
URL, so browser history works there without an asset-loader fallback. Android
deep-linking is **unverified** — no device attached.

---

## 3. Information architecture

Eleven workspaces — the ten the brief lists (§1), plus Vedic. Each is a route;
the shell is responsive.

| Workspace | Route | State |
|---|---|---|
| Dashboard | `/` | Working — today's sky, transits to the open chart, recent saved charts, alerts |
| Chart Studio | `/chart` | Working — chart, tables, aspects, inspector |
| Relationships | `/relationships` | Working — synastry, composite, Davison |
| Event Explorer | `/events` | Working — transits, aspectarian, ingresses, stations, declination events |
| Calendar | `/calendar` | Working — aspectarian calendar |
| Vedic | `/vedic` | Working — rāśi and divisional figures, nakṣatras, daśā, pañcāṅga |
| Gann Lab | `/gann` | Working — all layouts, fans, projections, Square of 144, counts, notes, templates, export, market-data adapters |
| Research | `/research` | Working — CSV import, studies, backtest |
| Clients | `/clients` | **Planned** (needs ADR-3) |
| Reports | `/reports` | Working — A4/A3 print, interpretation |
| Settings | `/settings` | Working |

Returns and Cycles sit inside Chart Studio and Event Explorer respectively
rather than claiming top-level slots the brief did not list.

**Progressive disclosure:** defaults are useful without configuration; the
inspector exposes detail on demand. Calculation settings (zodiac, house system,
node type, ayanamsha) are snapshotted per chart; display settings (precision,
glyph style, theme) are per device.

---

## 4. Design system

`packages/ui/src/theme/tokens.ts`. Deep navy, warm ivory, muted gold.

- Light and dark, both with tokens defined explicitly rather than derived, so a
  print or rasteriser path with no cascade still resolves them — the same rule
  the chart wheel already follows.
- Contrast is asserted by test against WCAG AA (4.5:1 body, 3:1 large text and
  UI boundaries), computed from the tokens rather than eyeballed.
- Minimal motion, with `prefers-reduced-motion` honoured.
- No cosmic backgrounds, particles or glass.

---

## 5. Reproducibility

Every chart records: original local date and time; birth-time certainty;
coordinates and label; IANA zone and resolved offset; UTC instant and calendar
convention; zodiac, ayanamsha, house system, node type; and the engine
fingerprint.

Chart **inputs** are stored, never results — so an engine fix corrects every
saved chart instead of leaving stale numbers in the database.

**Not yet recorded:** ephemeris data-file version and a formal algorithm
version. The engine fingerprint covers output equivalence, which is stronger in
practice but not the same claim.

---

## 6. Licensing — unresolved and blocking

`swisseph-wasm` is **GPL-3.0-or-later**. The built bundle ships that code to
every visitor, which conveys the program and triggers GPL obligations: the
corresponding source of the whole work must be offered under GPL-3.0.

The app is **already deployed publicly** at `astro-beta-khaki.vercel.app`.

| Route | Cost | Obligation |
|---|---|---|
| GPL-3.0 | free | Publish all source, research module included |
| Astrodienst Professional | CHF 750 | Closed source permitted; the GPL wrapper must be replaced |

Other terms in use: **GeoNames** cities (CC BY 4.0 — attribution rendered in
the footer, as required), **Neon** and **Vercel** platform terms. No market-data
provider is integrated; CSV import is user-supplied.

See `docs/LICENSING.md`.
