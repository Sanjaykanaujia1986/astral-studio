# Interpretation

> Delineation content and the composer that selects it.
> Package: `@astro/interpretation`.

## The separation, and why it is structural

The brief requires interpretation to be kept separate from calculation. That is
easy to assert in a comment and easy to erode in practice, so here it is
enforced by the dependency graph:

```
@astro/engine  ←  @astro/interpretation  ←  @astro/ui
     (never depends on interpretation)
```

`@astro/engine` has no dependency on this package and will not acquire one.
Nothing anyone writes in a catalogue can therefore move a number. The
dependency runs one way only, and `npm ls` will say so.

Inside the package the same discipline holds: `compose.ts` computes no
astronomy. Every value it uses — longitude, sign, house, orb, distribution,
chart shape — is read off a chart the engine has already produced and
validated.

## Why keyword factors, composed

A fully authored delineation text is roughly **1,500 paragraphs**: ten bodies
across twelve signs and twelve houses, plus every aspect pair. Nobody reviews
1,500 paragraphs, and an unreviewable catalogue is exactly where invented filler
survives undetected.

The catalogue holds about **60 factors** instead, composed by template along the
grammar the tradition itself uses:

| Element | Role | Example phrase |
|---|---|---|
| Planet | **function** | "The drive to become someone in particular" |
| Sign | **manner** | "soberly, by degrees, and with regard for what will last" |
| House | **field** | "in travel, belief, higher study, and the long view" |
| Aspect | **relation** | "grind against one another, forcing an adjustment neither would choose" |

Composed:

> **Sun in Capricorn, ninth house** — The drive to become someone in
> particular, expressed soberly, by degrees, and with regard for what will
> last, at work in travel, belief, higher study, and the long view.

Same coverage, from text one person can read end to end in ten minutes. This is
keyword-level and `provenance` says so on every report. A fuller professional
text drops in through the same interface with no change to the selection logic.

### One thing composition cannot do naïvely

Aspect sentences are built from body **names and keywords**, not from the two
bodies' full phrases. Those phrases are comma-laden noun clauses written to
stand alone; joining two with "and" produces:

> ~~The need for safety, and the rhythm of instinctive response and what is
> valued, and how closeness is offered pull at an awkward angle~~

which is grammatical and unreadable. The shipped form:

> Moon (instinct, safety) and Venus (value, attraction) pull at an awkward
> angle, showing up as a recurring, low-grade strain.

## Traceability

Every `Delineation` carries a `basis` naming the measured facts behind it —
kind, bodies, sign, house, aspect, and the measurement itself (an orb, a count,
an arc). A test asserts that every quoted orb matches the chart's own aspect
list to twelve decimal places. The separation is visible in the data, not just
promised in prose.

## Gaps are reported, never hidden

Two distinct failures, handled differently:

- **An absent FACT** — no houses, because the birth time is unknown. The
  dependent delineations are omitted, and this is *not* a content gap. The
  report states why the section is missing.
- **An absent ENTRY** — the catalogue has no text for a key the chart called
  for. This is recorded in `missing` and printed on the report.

`catalogueCoverage()` checks a catalogue for holes before it ships, so the
failure surfaces in test rather than as a short section a reader has to notice.

## Languages

`catalogueFor(locale)` returns **undefined** for a language with no catalogue.
It does not fall back to English on its own, because the decision to show
someone content in a language they did not ask for belongs to the UI, which can
label it. The report prints an explicit notice saying the calculations are
unaffected, being language-independent.

Only English has a catalogue today. Translating a button is a small, checkable
job; translating delineation is authorship, and a machine rendering into Hindi
or Gujarati would look finished while being unreliable in ways a non-speaker
cannot detect. Adding a language means adding a reviewed catalogue file to the
registry — no other code changes.

## The optional AI layer

`chartFacts(chart)` builds the **only** payload an AI layer is ever handed: a
plain, versioned, JSON-serialisable snapshot of what the engine measured.

Three properties, each load-bearing:

1. **Derived, never authored.** Every field traces to a calculation. A model
   consuming this cannot introduce a position, because it is not being asked
   for one.
2. **Carries its own caveats.** Ephemeris source and chart warnings travel with
   the data, so nothing downstream can present a Moshier-derived chart as
   sub-arcsecond. Aspect motion is `true` / `false` / **`null`** — "separating"
   and "we cannot tell which way it is moving" are different statements, and
   collapsing them is the quiet loss this payload exists to prevent.
3. **Replaces nothing.** The deterministic delineations are produced whether or
   not anything downstream is enabled. An AI layer can only add commentary
   beside them.

No network call is made from this package, and none should be added: an
offline-first application must produce a complete report with no connectivity
at all.

## Conventions declared in the open

Where "emphasis" begins is a convention, not a measurement, so the thresholds
are named constants carrying their reasoning:

| Constant | Value | Even share would be |
|---|---:|---:|
| `ELEMENT_EMPHASIS_SHARE` | 0.375 | 0.25 |
| `MODALITY_EMPHASIS_SHARE` | 0.5 | 0.333 |
| `HEMISPHERE_EMPHASIS_SHARE` | 0.7 | 0.5 |

Both directions of the element balance are reported. A missing element says as
much as a dominant one, and reporting only the dominant one would make every
chart look as though it had a strength and no gap.
