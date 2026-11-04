# Reports and printing

> `packages/ui/src/report/` — page geometry and the printable document.

## Why the browser's print pipeline, and not a PDF library

The chart wheel is vector. A bundled JavaScript PDF writer would mean one of
two things:

- **rasterise the wheel** — throwing away the precision the engine works hard
  for, so a chart that is accurate to a fraction of an arcsecond prints as a
  bitmap that goes soft the moment anyone zooms; or
- **reimplement text shaping and font embedding** — badly, and with a font
  binary shipped for glyph coverage.

The browser's print pipeline already does both correctly. It keeps the SVG as
vector, subsets and embeds whatever font actually rendered the glyphs, needs no
dependency, no network and no server, and works identically inside the
Capacitor WebView. "Save as PDF" in the print dialogue is therefore the export
path.

**The trade-off, stated plainly:** the application cannot write a PDF file on
its own, and the reader picks the destination. That is acceptable. Silently
downgrading a vector chart to a bitmap would not be.

### Glyphs

The report inherits the application's glyph setting. Astrological glyphs
(U+2609 and neighbours) are covered by system fonts on every mainstream desktop
— Segoe UI Symbol on Windows, for instance — and the browser embeds a subset of
the font that actually rendered them, so a PDF produced this way is
self-contained. Where coverage is doubtful, `Settings → glyph style →
abbreviations` uses plain letters instead, and the report offers that hint. An
embedded subset font would remove the caveat entirely and remains open.

## Page geometry

`paper.ts` is pure arithmetic, no DOM, so the layout maths is testable without
rendering anything.

- ISO 216 sizes in millimetres; landscape **swaps the dimensions** rather than
  rotating the content, because `@page { size: 297mm 210mm }` is what the
  browser needs. Giving it portrait numbers and rotating with a transform
  previews correctly and prints wrong.
- Default margin **15mm**, which clears the unprintable edge of essentially
  every consumer printer (typically 5–10mm) with room to spare.
- A margin that would leave no printable area throws rather than producing a
  page of nothing.

`@page { size }` is the load-bearing rule. Without it the browser lays out for
whatever paper it defaults to and every page break lands in the wrong place.

### The square-wheel trap

The wheel is square, so fitting it to the page **width** overflows the foot of a
landscape sheet, and fitting it to the **height** wastes a portrait one. It has
to be fitted to whichever edge binds:

```
wheelSizeMm(spec, reserved) = min(contentWidth, contentHeight − reserved)
```

This was a real bug, and an instructive one: sized to width, the A3 landscape
cover page grew to 1.6 sheets and the wheel ran off the bottom. **Nothing in
the markup looked wrong.** It only appeared when the rendered page was measured
in a browser, which is why there is now a regression test asserting both papers
bind at the same 177mm.

## The preview is the document

There is one React tree, not a preview and a separate print renderer that have
to be kept in agreement. The DOM you see on screen is the DOM the printer
receives; only the stylesheet changes between `@media screen` and
`@media print`. On screen the pages are cards with a border, a shadow and
padding standing in for the margin; on paper the `@page` margin provides that
inset, so the padding comes off or the content is inset twice.

The tables are the **same components the application uses on screen**. A report
that formatted its own degrees would eventually format them differently from
the tab the reader was just looking at, and a number that changes when you print
it discredits every other number on the page. A test extracts every
degree-minute value from the on-screen `PlanetTable` and asserts each one
appears in the report.

Report density is tightened to 10px (~7.5pt) tables, applied on screen as well
as on paper so the preview is the document rather than a roomier approximation.
At the screen density, twenty-four rows of positions and cusps ran past the foot
of an A4 page and stranded a two-line remainder on a second sheet.

## Page breaks

Explicit `.report-page` elements rather than automatic flow, so the wheel always
gets a page of its own and the tables always start at the top of one. Table
rows and headings are protected (`break-inside: avoid`, `break-after: avoid`),
and `thead` repeats on a table that spills.

A section longer than its page — a chart with sixty aspects, or the
interpretation — is allowed to overflow onto further sheets. Its footer then
prints at the end of the overflow rather than on every sheet, because running
footers need `@page` margin boxes and browsers do not implement them.

## Verified

Measured in a browser at both paper sizes with a real chart:

| Paper | Cover | Positions | Aspects | Interpretation |
|---|---|---|---|---|
| A4 portrait | 1 sheet | 1 sheet | 1 sheet | 2.2 sheets |
| A3 landscape | 1 sheet | 1 sheet | 1 sheet | 2.0 sheets |

No page overflows its box except the interpretation, which is continuous prose
and legitimately runs on. Console clean; no CSS custom properties anywhere in
the output, which is the standing guard against the bug that once made the
wheel print solid black.
