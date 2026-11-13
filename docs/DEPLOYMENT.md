# Deployment — Vercel

Astro is a fully static site. There is no server, no database and no API: the
engine, the ephemeris and the city database all run in the browser. Vercel is
therefore serving files, and nothing in this deployment can see a birth date.

## Configuration

`vercel.json` at the repo root:

| Setting | Value |
|---|---|
| Install | `npm install` (root — npm workspaces) |
| Build | `npm run build -w apps/web` |
| Output | `apps/web/dist` |
| Framework preset | none (the build is explicit) |

The build runs `prepare:assets` → `tsc --noEmit` → `vite build`, so a type
error fails the deploy rather than shipping.

### The install risk that isn't one

`packages/engine` has a devDependency on `sweph`, a **native** addon used only
as a test-time oracle to cross-check the WASM engine. A native build on
Vercel's image would be a plausible way for the deploy to fail.

It won't: `sweph` ships prebuilt binaries for `linux-x64` (checked in
`node_modules/sweph/prebuilds`), which is Vercel's build architecture, so
`node-gyp-build` picks the prebuild and never invokes the compiler.

### Build output

```
dist/index.html                    2.5 kB
dist/assets/index-*.js           677 kB  (200 kB gzip)
dist/assets/search-worker-*.js    94 kB
dist/assets/index-*.css           24 kB  (5.7 kB gzip)
dist/wasm/swisseph.wasm          562 kB
dist/wasm/swisseph.data          2.1 MB   ephemeris
dist/data/cities.json            3.2 MB   GeoNames
                                 ──────
                                  6.6 MB
```

## Headers

The CSP is delivered as a real HTTP header here, not only as the `<meta>` tag
the Android build relies on. Both are present and consistent; a browser
enforces the intersection.

The header can carry one directive the meta tag cannot:

```
frame-ancestors 'none'
```

`frame-ancestors` is ignored — with a console error — when delivered in a meta
element, which is why it was removed from `index.html`. This is where it
belongs.

Also set: `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, a
`Permissions-Policy` denying every sensor and payment API (the app uses none),
`Cross-Origin-Opener-Policy`, `Cross-Origin-Resource-Policy` and
`X-Frame-Options: DENY`.

`connect-src 'self'` remains the load-bearing directive: it makes exfiltration
impossible rather than merely absent.

### Caching

| Path | Policy | Why |
|---|---|---|
| `/assets/*` | `max-age=31536000, immutable` | content-hashed filenames |
| `/wasm/*`, `/data/*` | `max-age=86400, stale-while-revalidate=604800` | fixed filenames |
| `/index.html` | `max-age=0, must-revalidate` | entry point |

The WASM and data files cannot be content-hashed: `swisseph-wasm` hardcodes
`new URL('../wasm/' + path, import.meta.url)`, so the filename is fixed. A day
of freshness with a week of stale-while-revalidate means a returning visitor
pays nothing for 5.8 MB while an updated ephemeris still propagates within a
day.

## Deploying

The CLI is currently authenticated as `sanjaykkumar1986-1759`. Astro is going
to a **separate account**, so that has to change first — and I do not perform
logins, so this step is yours:

```bash
npx vercel login
```

That opens a browser. Nothing is typed into a terminal and no credential passes
through this session.

**It replaces the stored CLI token**, so the previous account is logged out
until you log back in. If switching back and forth becomes tedious, the
per-project alternative avoids touching the global login entirely — create a
token in the new account's dashboard and set it for this repo only:

```bash
$env:VERCEL_TOKEN = "<token from the new account>"   # PowerShell, this shell only
npx vercel deploy --token $env:VERCEL_TOKEN
```

That is the Vercel analogue of using a per-repo git identity rather than the
global one.

### First deploy — preview, unlisted

```bash
npx vercel link --yes
npx vercel deploy
```

`vercel deploy` without `--prod` produces a **preview** deployment on an
unlisted URL. That is the intended first step while licensing is unsettled.

To restrict it further than "unlisted", turn on Deployment Protection in the
Vercel dashboard (Project → Settings → Deployment Protection → Vercel
Authentication), which requires a Vercel login to view. Availability of
protection on production deployments depends on plan; preview protection is the
one to rely on.

### Promoting to production

```bash
npx vercel deploy --prod
```

**Do not run this until the licensing question below is settled.**

## Licensing — read before going public

`swisseph-wasm` is **GPL-3.0-or-later**, and the built bundle ships that GPL
code to every browser that loads the page. Serving the site conveys the program
to its users, which triggers GPL obligations: the corresponding source of the
whole work must be offered to them under GPL-3.0.

That is not a hypothetical for a static site — the GPL WASM *is* the payload.

| Route | Cost | Obligation |
|---|---|---|
| **GPL-3.0** | free | Publish the entire Astro source, research module included, and offer it to every visitor |
| **Astrodienst Professional** | CHF 750 | Closed source permitted, **and** the GPL `swisseph-wasm` wrapper must be replaced with a differently-licensed binding |

The provider interface (`EphemerisProvider`) means the second is a swap, not a
rewrite — but it is still a swap that has to happen before a closed-source
release.

**An unlisted preview shared with nobody is not distribution to third parties.**
Sharing the URL is. Treat the preview as private until you have decided.

Before a public production deploy, whichever route:

- [ ] Add a `LICENSE` file stating the chosen terms
- [ ] Under GPL: publish the source and link to it from the app footer
- [ ] Under Professional: replace `swisseph-wasm`, purchase, retain the licence
- [ ] Keep the existing attributions visible — Swiss Ephemeris, and GeoNames
      (CC BY 4.0 *requires* the attribution already rendered in the footer)

## Verifying a deployment

Open `https://<deployment-url>/?selftest` and press **Run self-test**.

It must report:

```
PASS — fingerprint 0123070b
```

with all eight cases on `swiss` and the three bundled assets present at 0.54 MB,
2.05 MB and 3.23 MB. Anything else means the deployment differs from what the
test suite certified — the per-case digests say which case.

Then check the headers actually landed:

```bash
curl -sI https://<deployment-url>/ | grep -i "content-security-policy\|x-frame\|referrer"
curl -sI https://<deployment-url>/wasm/swisseph.wasm | grep -i "content-type\|cache-control"
```

`swisseph.wasm` must come back as `application/wasm`; the wrong MIME type makes
`WebAssembly.instantiateStreaming` fail, and a loader that silently falls back
to `arrayBuffer` would hide it.

## Database — Neon (added 0.2.0)

Neon project `astro` (`summer-river-28213138`, aws-ap-southeast-1), org
`Sanjay`. `DATABASE_URL` (pooled) is set in Vercel for production, preview and
development, and locally in `.env.db` (gitignored, excluded from upload). The
connection string was piped from `neonctl` into both without being printed.

Re-run migrations and data load (idempotent):

    npx vite-node db/seed.ts                 # schema + cities + ephemeris
    npx vite-node db/seed.ts --only=cities

Loaded data — nothing invented:

| table | rows | source |
|---|---:|---|
| `cities` | 69,641 | GeoNames cities5000, CC BY 4.0 (same file the app bundles) |
| `ephemeris_daily` | 73,414 | 1900-01-01..2100-12-31 at 00:00 UT, computed by `@astro/engine`; the seed refuses to run unless the engine reproduces fingerprint `0123070b` |
| `charts` | 0 | visitors' saved charts |

API (Vercel functions, `api/`): `GET /api/health`, `GET|POST|DELETE /api/charts`
(requires `x-astro-owner`), `GET /api/cities?q=`, `GET /api/ephemeris?date=` or
`?from=&to=` (max 366 days).

Verified live: health counts, diacritic-folded city search, ephemeris row, and a
save → list → reopen → delete round trip; a second device key sees 0 charts and
gets 404 fetching the first key's chart by id.

**Privacy.** There are no accounts. Saved charts are scoped to a random 256-bit
device key; the server stores only its SHA-256. This is not authentication —
anyone with the key reads those charts, and clearing browser storage loses
access unless the key was copied. The app states this beside the Save button.
