# Gann Lab — conventions

> Written **before** the implementation, as the brief requires (§15). Every
> method is stated here with its mathematical convention and its ambiguity,
> because "Gann" names a loose family of constructions whose published versions
> disagree, and a tool that hides which variant it chose cannot be checked
> against anything.

---

## 0. What this module claims, and what it does not

It claims to compute **geometry exactly** and to say which convention it used.

It does not claim that any of it predicts a price. No construction here is
labelled a signal, a forecast, a target or a level of support or resistance.
Where a number is a projection of a planetary longitude onto a price axis, the
conversion factor is an input the user chose, not a discovered constant.

If you want to ask whether a Gann construction has historically lined up with a
price series, that is `packages/research`, which will attach a p-value, a
multiple-comparison correction and a rotation-test floor to the answer. This
module deliberately does not produce the statistic itself, so that a drawing
cannot quietly become a claim.

---

## 1. Square of Nine — the grid

A spiral of values on a square lattice. The centre cell holds the **origin
value** (default 1) and the spiral advances by the **increment** (default 1)
from cell to cell.

**Direction: clockwise, starting to the right.** From the centre the walk moves
right one cell, then down, left, up, right, and so on. This reproduces the
layout in which the odd squares 1, 9, 25, 49 … run up and to the right of
centre and the even squares 4, 16, 36 … run down and to the left:

```
21 22 23 24 25
20  7  8  9 10
19  6  1  2 11
18  5  4  3 12
17 16 15 14 13
```

Published squares differ on both the starting direction and the handedness.
Anticlockwise variants and "start upward" variants exist and are mirror images;
they put the same values on the cross but reflect everything between. The
direction is a setting, recorded with the layout, and shown in the UI.

**Ring** *r* is the square of side `2r + 1` centred on the origin cell. Ring *r*
holds the values from `(2r − 1)² + 1` to `(2r + 1)²` in units of the increment,
offset by the origin.

### The two crosses

- **Cardinal cross** — the cells due north, south, east and west of the centre.
- **Diagonal (ordinal) cross** — the two full diagonals. The odd squares
  `(2r + 1)²` lie on the up-right arm. The down-left arm carries `(2r)² + 1`,
  so the **even squares sit one cell off it**, not on it.

That last point is worth stating because the familiar claim "the even squares
are opposite the odd squares" is true of the *spiral angle* (§2) and false of
the *grid*. On the grid, 4 sits due south of centre, on the cardinal cross; by
spiral angle it is exactly 180° from 1. Both facts are asserted in the test
suite, against the published layout.

Both are **geometric** properties of a cell's position. They are computed from
coordinates, not from a formula on the value, so they stay correct under any
origin and increment.

---

## 2. Square of Nine — the angle of a value

This is a **separate** convention from §1 and the two are not interchangeable.

The spiral angle of a value is defined so that **one full revolution adds 2 to
the square root**:

```
θ(v) = 180° × (√v − √v₀)   measured clockwise, modulo 360°
```

with `v₀` the origin value. Consequently all odd squares sit at θ = 0° and all
even squares at θ = 180° when `v₀ = 1`.

The inverse, for a given angle and a given number of complete turns *n*:

```
v(θ, n) = (√v₀ + (θ/180° + 2n))²
```

**Where this disagrees with the grid.** θ(v) is a smooth function; the grid is a
square. They agree exactly nowhere except in the limit: the geometric angle of
the cell holding *v* converges to θ(v) as *v* grows, but on the inner rings they
differ by tens of degrees — value 3 sits at grid angle 315° and spiral angle
131.8°. The module exposes both, names them differently (`spiralAngle` versus
the cell's `x, y`), and the test suite asserts both the divergence on ring 1 and
the convergence by ring 50. Software that reads an angle off the printed grid
and then feeds it to the √ formula is mixing two systems.

Which one is "right" depends on which published method is being followed, and
this module does not adjudicate. It refuses to pick silently.

---

## 3. Gann angles (fans)

A Gann angle is a straight line through an anchor with a slope expressed as a
ratio of **price units to time units**. It is meaningless without a stated
scale, so the scale is a required input, never a default:

```
scale = { priceUnits: number, timeUnits: number }   // e.g. 0.5 USD per 1 day
```

A **1×1** line advances one *scale unit* of price per one *scale unit* of time.
The standard fan is 1×8, 1×4, 1×3, 1×2, **1×1**, 2×1, 3×1, 4×1, 8×1, where
`a×b` means *a* price units per *b* time units.

**Time is measured in bars, not calendar days.** A series with gaps — weekends,
holidays, a suspended listing — would otherwise make the same line land in two
different places depending on whether the gaps were counted. The bar index is
unambiguous and is what a chart actually draws. The anchor records the bar
index *and* its date, so the choice is visible and a different convention can be
computed later without re-anchoring by hand.

**Direction** is part of the fan: a fan from a low rises, a fan from a high
falls. Both arms can be drawn from one anchor; neither is assumed.

---

## 4. Angle measurement between two points

Given two anchors and a scale, the module reports:

- the price change, the bar count, and the **ratio** `Δprice / Δbars` in scale
  units;
- the nearest standard fan ratio, and the error against it.

It reports the arctangent in degrees **only** alongside the scale that produced
it, because a degree value on a price chart is an artefact of the axes: change
the scale and the same two points subtend a different angle. A bare "this move
ran at 45°" is not a fact about the market.

---

## 5. Planetary projections

Converting a planetary longitude to a price requires a stated mapping. Two are
implemented; neither is a default.

**Linear.** `price = basePrice + (longitude − baseLongitude) × unitsPerDegree`.
Three inputs, all the user's: an anchor price, the longitude at that anchor, and
how many price units one degree is worth.

**Via the square.** The longitude is treated as a spiral angle (§2) and the
value at that angle on a chosen turn is read off: `price = v(longitude, n)`.
This is the construction usually meant by "planets on the Square of Nine". The
turn number *n* must be given, because every turn yields a different price for
the same longitude and choosing the one nearest the current price after the
fact is curve-fitting.

Longitudes come from `@astro/engine`, so they carry the same verified ephemeris,
the same zodiac setting and the same fingerprint as every other number in the
product. Whether the longitude is tropical or sidereal is the chart's setting
and is displayed with the projection, because the two differ by about 24° and
therefore by a large number of price units.

---

## 6. What this module does not do

Stated plainly so that an empty space is not mistaken for an oversight:

- **No circular or polygon layouts** (hexagon, Wheel of 24, Square of 144).
  Each needs its own convention written down first; the Square of Nine's rules
  do not generalise to them without choices this document has not made.
- **No annotations, saved templates or export.** The workspace draws from the
  current series and the current settings and keeps nothing.
- **No market-data provider.** Prices come from a CSV the user supplies, parsed
  by `packages/research`, which reports every rejected row.
- **No "natural" time cycles** — anniversary dates, 90-day counts, seasonal
  pivots. They are arithmetic on dates and would be easy to add; they are also
  the constructions most often presented as predictions, and they are not here
  until the research module can measure one.
- **No levels of support or resistance.** The module draws lines and prints
  values. It does not name any of them a level.

---

## 7. Settings recorded with every construction

A drawing that cannot be reproduced is not evidence of anything. Every Square
of Nine carries its origin value, increment, direction and rotation; every fan
carries its anchor bar index, anchor date, anchor price, scale and direction;
every projection carries its mapping, its factor, the body, the zodiac and the
ayanāṁśa in force. These appear in the UI, not only in the code.
