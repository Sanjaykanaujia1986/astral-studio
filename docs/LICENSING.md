# Licensing

## Decision, 4 November 2026: the free route

The Astrodienst Professional licence (CHF 750) is **not** being bought. The
project takes the copyleft route instead, which costs nothing.

This is a decision about money, not about whether an obligation exists. Swiss
Ephemeris is dual-licensed; declining the paid option selects the other one.
What that costs instead is **source disclosure**, and the terms are below so
nobody has to rediscover them later.

## What the project is licensed under

**AGPL-3.0-or-later.** The full text is in `LICENSE` at the repository root.

Two upstream terms force it, and the stricter one wins:

| Component | Licence | Why it reaches the whole work |
|---|---|---|
| Swiss Ephemeris (Astrodienst) | AGPL-3.0, or Professional for a fee | The engine the product is built on |
| `swisseph-wasm` (the WASM wrapper) | GPL-3.0-or-later | A separate author, not affiliated with Astrodienst |

GPL-3.0 code may be combined into an AGPL-3.0 work, so AGPL-3.0-or-later
satisfies both. It is the stronger of the two, because of §13.

## §13 is the clause that matters here

The AGPL's network clause is triggered by **serving** the app, not only by
shipping a binary. `astro-beta-khaki.vercel.app` is a public deployment, so
every visitor is a recipient and must be offered the Corresponding Source —
prominently, from the running program itself.

A link in a README is not sufficient. The app carries the offer in
Settings → About, rendered from `BRAND.sourceUrl`.

**Resolved 5 November 2026.** The source is published at
<https://github.com/Sanjaykanaujia1986/astral-studio> and `VITE_SOURCE_URL`
points the in-app offer at it, set both locally (`apps/web/.env.local`, which
is where Vite reads from — not the monorepo root) and in the Vercel project's
production environment.

What remains is a habit rather than a task: **the published source must stay
current**. AGPL §13 obliges offering the Corresponding Source of the version
being served, so a deploy that is not also pushed leaves the offer pointing at
older code.

## What this covers

Everything in this repository, the financial research module included. That
is the trade: the engine is free to use and the work built on it is published.

Practical consequences, stated plainly rather than discovered later:

- **The code cannot later be sold closed-source as it stands.** Anyone who
  receives it under AGPL keeps those rights for that version. A closed-source
  future would need the Professional licence *and* the `swisseph-wasm` wrapper
  replaced with an in-house Emscripten build of the Swiss Ephemeris sources.
  The `EphemerisProvider` interface exists partly to keep that substitution
  cheap, and it stays.
- **Client birth data is not affected.** Source disclosure is about code. The
  database holds nobody's chart in the repository.
- **Android carries the same obligation**, since an APK is a conveyance.

## Other components

| Component | Licence | Obligation | Status |
|---|---|---|---|
| GeoNames city data | CC BY 4.0 | Attribution in the app and docs | Rendered in the footer |
| IANA TZDB (via ICU) | public domain | none | — |
| Market data | n/a | none — CSV the user supplies | No provider is integrated |

Sources: <https://www.astro.com/swisseph/swephprice_e.htm>,
<https://www.astro.com/swisseph/swisseph.htm>
