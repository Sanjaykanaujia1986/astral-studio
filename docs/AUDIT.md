# Audit — M10

> Accuracy, performance, security, accessibility, UI/UX.
> Run 2026-08-27 against the production build.

Everything below was measured, not assumed. Where something could not be
verified in this environment it says so rather than being reported as passing.

---

## Accuracy

| Check | Result |
|---|---|
| Full suite | **663 tests passing** across 7 packages |
| Engine fingerprint, Node | `855fec9b` |
| Engine fingerprint, browser (production build) | `855fec9b` |
| Every self-test case on Swiss data | yes — asserted, not observed |
| Typecheck, all packages | clean |

The fingerprint covers eight charts spanning 1800–2399, both zodiacs, six house
systems, polar and equatorial latitudes, hashing every position, cusp, aspect,
speed and declination to a milliarcsecond. It is asserted against a committed
constant, so engine output cannot change silently.

Independent verification recorded across earlier milestones remains in
`docs/ASTRONOMY_NOTES.md`: 13 published Meeus Julian Days, the 2024 equinoxes,
solstices and lunations, Jupiter–Saturn great conjunctions including the
1980–81 triple, and retrograde frequencies (Mercury 19.2%, Venus 7.0%, Mars
9.7%, Jupiter 29.9%, Saturn 38.3%).

---

## Performance

Measured on this machine with the engine warm.

| Operation | Time |
|---|---:|
| Natal chart, all aspects | **1.6 ms** |
| Engine self-test (8 charts) | 34 ms |
| Returns, 10 solar | 204 ms |
| Aspectarian, 1 month | 490 ms |
| Cycle, Jupiter–Saturn, 200 years | 849 ms |
| Transits, 1 year vs natal | **4174 ms** |
| Aspectarian, 1 year | **4894 ms** |

### The finding, and the fix

A natal chart at 1.6 ms is imperceptible. Five seconds is not a slow render —
it is a frozen tab: no scrolling, no cancel, no repaint, and on a phone the
system may offer to kill the page. Yielding to paint a spinner first does not
help, because the stall *is* the problem.

The long searches now run in a **Web Worker** (`apps/web/src/lib/search-worker.ts`).
The engine is unchanged; it simply has its own provider instance in that
thread.

Two things worth stating plainly:

- **Cost.** A second provider means a second WASM instance and a second copy of
  the ephemeris, ~2.6 MB. The worker is created lazily on the first long
  search, so a reader who only casts charts never pays it.
- **Fallback.** Module workers need a modern engine, and on Android the WebView
  version is chosen by the device. If the worker cannot start, the search still
  runs on the main thread — blocking, which is worse than a worker and far
  better than an empty panel. The fallback is covered by tests, because an
  untested fallback is a guess about the machines you cannot see.

Frame-level confirmation that the main thread stays responsive **could not be
measured here**: the browser pane runs hidden, so `requestAnimationFrame` never
fires and `setTimeout` is throttled to ~1 s. What was confirmed is structural —
the worker chunk is fetched, results arrive through it, and both paths are
tested.

### Bundle

| | Before | After |
|---|---:|---:|
| Debug APK | 8.57 MB | **8.33 MB** |

562 KB of duplicate WASM removed — see `docs/ANDROID.md`.

---

## Security

| Check | Result |
|---|---|
| `npm audit --omit=dev` | **0 vulnerabilities** |
| `eval` / `new Function` / `document.write` | none |
| `dangerouslySetInnerHTML` / `innerHTML =` | none |
| Network call sites in the whole codebase | **2**, both same-origin relative paths |
| `WebSocket` / `XHR` / `sendBeacon` | none |
| Hard-coded external URLs | none |
| External requests during a full session | **zero**, measured with an interceptor |

### Content Security Policy

Added, and deliberately strict — it states what the app already does, enforced
so it stays true:

```
default-src 'self'; script-src 'self' 'wasm-unsafe-eval';
style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:;
connect-src 'self'; worker-src 'self' blob:;
object-src 'none'; base-uri 'none'; form-action 'none';
```

`connect-src 'self'` is the load-bearing directive: it makes exfiltration
impossible rather than merely absent. Birth data is personal and this app has
no server to send it to.

`wasm-unsafe-eval` permits WebAssembly compilation only — not `eval()`.
`'unsafe-inline'` for styles is required because the chart wheel and report set
literal colours and page dimensions inline, a deliberate choice so the SVG
survives a print renderer that has no cascade.

**`frame-ancestors` was removed** after the browser reported it: the directive
is only honoured in an HTTP header and is ignored, with a console error, in a
meta element. A web deployment should send it as a response header.

### Data handling

No accounts, no login, no server, no telemetry. Birth data and imported market
data live only in the browser; the CSV import reads the file locally and
uploads nothing.

---

## Accessibility

Two real defects found and fixed.

### 1. The results region had no headings

A screen-reader user navigating by heading found "Astro" and "Birth data" and
then nothing — no way to reach the chart, the summary or the tables. Visually
hidden `<h2>`s now label the summary and the wheel. Hidden rather than shown
because the regions are self-evident to a sighted reader and a visible heading
there would be noise.

### 2. The tab bar was not a tab bar

Ten `<button>`s carrying `aria-current`. That says "this is the page you are
on"; it does not tell assistive technology that these controls swap a panel, so
a screen-reader user got ten unexplained buttons.

Replaced with the ARIA tabs pattern and its keyboard contract:

| Property | Verified |
|---|---|
| `role="tablist"` with a label | "Chart details" |
| Exactly one tab `aria-selected` | yes |
| Exactly one tab in the tab order (roving tabindex) | yes |
| `←` / `→` move between tabs | yes |
| `Home` / `End` jump to first / last | yes |
| Panel `aria-labelledby` the active tab | `tab-planets` |

Roving tabindex is what makes <kbd>Tab</kbd> step *past* the bar into the panel
rather than through ten stops on the way.

### Automated sweep — clean

Form controls without an accessible name, buttons without discernible text,
skipped heading levels, `<svg>` without a name, tables without a caption,
positive `tabindex`, missing `lang`: **all zero**.

### Tap targets

| Control | Before | After |
|---|---:|---:|
| "Birth time is known" checkbox | 13×13 px | 24×24 px |
| "Change" birthplace button | 24 h, narrow | ≥24×24 px |

An unstyled checkbox renders at 13 px, below the 24×24 CSS px minimum of WCAG
2.5.8. That one gates whether the chart has houses at all.

**Not audited here:** colour contrast ratios, and testing with a real screen
reader. Both need tools not available in this environment.

---

## UI / UX — responsive

| Viewport | Horizontal page scroll | Undersized tap targets |
|---|---|---|
| 375×812 (mobile) | none | 0 |
| 768×1024 (tablet) | none | 0 |
| desktop | none | 0 |

Wide content — data tables, the tab bar — scrolls inside its own
`overflow-x-auto` container while the page body does not, which is the intended
pattern rather than an overflow bug.

Console clean throughout.

---

## Test coverage added in this milestone

The web app had **no test suite**. It now has one (jsdom + Testing Library),
closing the two gaps carried since M2:

- **Search client** (10 tests) — worker path, request/response correlation by
  id, engine error codes surviving structured clone, worker-level failure
  rejecting every outstanding request, and the main-thread fallback.
- **LocationSearch keyboard navigation** (8 tests) — arrow keys, Enter to
  select, Escape to dismiss, the combobox ARIA relationship, and specifically
  that **Enter does not submit the surrounding form**, which is a bug that
  reached the running app once and is guarded by a single `preventDefault`.

Vitest runs the web suite on the `threads` pool: the default forked pool times
out starting a worker on this Windows setup. (The engine package needs `forks`
for the opposite reason — its native oracle keeps C-level globals.)

---

## Open items

| Item | Status |
|---|---|
| **Swiss Ephemeris licence** | **Undecided — blocks distribution.** GPL route is free but requires publishing all source; Professional is CHF 750 and needs the GPL wrapper replaced. No rework either way. |
| Fingerprint on a physical device | Not run — no device attached. `?selftest` makes it a 30-second check. |
| `INTERNET` permission | Still declared. Probably removable; not removed because it cannot be verified without a device. |
| Colour contrast ratios | Not measured — needs tooling. |
| Screen-reader testing | Not done — needs a real screen reader. |
| Hindi / Gujarati UI chrome | `reviewed: false`; awaiting a fluent speaker. Astrological vocabulary is established terminology and is reliable. |
| Hindi / Gujarati interpretation text | Not written. `catalogueFor` returns undefined rather than serving English under a translated heading. |
