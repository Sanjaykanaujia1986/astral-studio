# Android

> Capacitor 8. One codebase, one calculation engine, one set of numbers.

## Build

```bash
npm run build -w apps/web
npx cap sync android --prefix apps/web
cd apps/web/android && ./gradlew assembleDebug
```

`apps/web/android/local.properties` must point at the SDK. Forward slashes, not
backslashes: a properties file treats `\` as an escape, so
`C:\Users\...` silently becomes `C:UsersDELL...` and Gradle fails with
"Invalid file path".

```properties
sdk.dir=C:/Users/<you>/AppData/Local/Android/Sdk
```

Built and verified here with JDK 21 (Android Studio's bundled JBR), compileSdk
36, minSdk 24.

| | |
|---|---:|
| Debug APK | **8.33 MB** |
| Ephemeris data (`swisseph.data`) | 2.05 MB |
| WASM engine | 0.54 MB |
| City database | 3.23 MB |

## Why a local server rather than `file://`

Capacitor serves `dist` from a local server inside the WebView at
`https://localhost`. That is a *secure origin*, which both WebAssembly
instantiation and `fetch` of bundled assets require, and it makes the
root-absolute asset paths (`/wasm/swisseph.wasm`, `/data/cities.json`) work
unchanged between web and Android.

A `file://` wrapper would have needed relative paths and a different fetch
strategy. That divergence is exactly what this project cannot afford: two
loaders eventually load two different things, and the difference shows up as a
wrong chart rather than an error.

## Offline

Nothing reaches the network. Verified by installing a `fetch`/`XHR`/`WebSocket`
interceptor that rejects any non-same-origin request, then running the full
engine self-test from a cold start: **zero external requests attempted**, suite
passed. The only two `fetch` call sites in the entire codebase are
`/data/cities.json` and the self-test's own asset probe.

The `INTERNET` permission is still declared in the manifest, as Capacitor
generates it. Removing it is likely possible — the WebView asset loader does
not need it — and would make "this app cannot phone home" enforceable by the OS
rather than merely true. It is **not** removed here because that change cannot
be verified without a device, and an unverified permission change that breaks
app startup is a worse outcome than an unnecessary permission.

## Proving the numbers match

"It is the same code, so it must give the same numbers" is an assumption. The
Android build runs a different JavaScript engine, a different WASM runtime, and
a WebView whose version is chosen by the device rather than by us.

So the engine fingerprints itself. `runSelfTest()` casts eight reference charts
and hashes every position, cusp, aspect, speed, declination and ayanamsha to a
milliarcsecond, producing eight hex characters.

The suite deliberately targets what is most likely to diverge, not what is most
typical:

| case | why |
|---|---|
| `range-start-1800`, `range-end-2399` | both ends of the Swiss data range |
| `reykjavik-2024-polar` | 64°N, Placidus near its limit |
| `sydney-2000` | southern hemisphere, Koch |
| `quito-1850-equator` | equator, Campanus |
| `mumbai-1990-lahiri` | sidereal — a different path through the ayanamsha call |

**Current fingerprint: `855fec9b`**

Verified identical in:

- **Node** — `packages/engine/test/integration/selftest.test.ts`, which also
  asserts every case ran on Swiss data rather than silently falling back to
  Moshier
- **Browser**, production build — `?selftest`

To check a device, install the APK, open the app, and navigate to the
self-test. It reports the fingerprint, the per-case digests, the bundled asset
sizes, and the environment. A per-case digest identifies *which* case diverged
rather than leaving someone to diff two screenshots.

The panel ships in the production bundle deliberately. It is not a debug
leftover: it is the only way to check that a given phone's WebView agrees with
the numbers CI certified, and no test runner can reach there.

## What is verified, and what is not

**Verified here:**

- APK builds and contains every asset
- The exact production bundle the WebView loads produces fingerprint `855fec9b`
- Zero external network requests from a cold start
- Only one WASM copy ships (see below)

**Not verified here** — no device or emulator was attached:

- The fingerprint *on a physical device's WebView*
- Startup time and memory on real hardware
- Behaviour on an old, un-updated WebView

The self-test exists so that the first of those takes about thirty seconds
whenever a device is available.

## A duplicate that shipped

`swisseph-wasm` locates its payload with
`new URL('../wasm/' + path, import.meta.url)`. Vite sees the pattern, cannot
evaluate the dynamic half, and emits a hashed copy into `/assets/` as a
precaution. At runtime the expression resolves against the built chunk's own
URL and reaches `/wasm/swisseph.wasm` — the copy staged into `public/` — so the
hashed one is never requested.

It was 562 KB, 6.5% of the APK, shipped to every user to be ignored. A
`generateBundle` hook now drops it. Confirmed by reading the production
network log: only `/wasm/*` is fetched.

An incremental Gradle build will keep the stale asset; `./gradlew clean
assembleDebug` is needed to see the reduction.

## Release builds are blocked

Not by anything technical. **The Swiss Ephemeris licence is still undecided**,
and `swisseph-wasm` is GPL-3.0-or-later:

- **AGPL/GPL route** — publish the entire source, including the research
  module. Free.
- **Astrodienst Professional** — CHF 750, permits closed-source distribution,
  but the GPL wrapper must be replaced with a differently-licensed binding.

Either is workable and neither requires rework, because the ephemeris sits
behind a provider interface. But a signed release APK cannot honestly be
produced until it is settled. See `docs/LICENSING.md`.
