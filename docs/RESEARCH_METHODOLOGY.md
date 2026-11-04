# Research methodology

> `packages/research` — financial astrology as analytical, experimental
> instrumentation.

## What this is, and what it is not

It measures whether a chart configuration and a price series happened to line
up historically, and says how much that is worth. It does **not** predict
prices, recommend trades, or demonstrate a mechanism. Historical alignment is
not evidence of causation and does not persist reliably.

That distinction is not a legal formality bolted on at the end. This kind of
tool is trivially easy to over-read, so the disclosure is not dismissible, the
warnings travel with the data, and the corrections are not optional.

## Three layers, kept apart

```
market/    prices.  Knows nothing about astrology.
signals/   the sky. Knows nothing about markets.
stats/     arithmetic. Knows nothing about either.
study/     joins two finished results and measures the overlap.
```

The separation prevents the most tempting error in the field: adjusting a
signal definition until it fits a particular price series. By the time a study
sees them, both sides are already immutable.

**No market data ships with this project.** Everything operates on files the
user supplies, read in the browser and never uploaded.

## The multiple-comparisons problem

Ten bodies, twelve signs, eleven aspects and a few window widths generate
thousands of candidate signals. Test a thousand against a series in which
nothing is happening and about **fifty** come back at p < 0.05. Every one looks
like a discovery.

This is not a subtle statistical nicety; it is a machine for manufacturing
false findings, and it is the single easiest way for a project like this to
produce confident nonsense. So:

- Every signal selected is tested and reported, **including the dull ones**.
  Dropping one after seeing its result would silently reduce the test count and
  inflate every correction that follows.
- **Benjamini–Hochberg** (false discovery rate) and **Holm–Bonferroni**
  (family-wise error rate) are both computed and both shown.
- The raw and corrected survivor counts appear **side by side**. The gap
  between them is the clearest statement of how much of an apparent finding was
  the cost of having asked many questions.
- The signal menu is a fixed, enumerable list rather than a free-form builder,
  because a correction is only honest when the number of tests is knowable.

A regression test screens 1,000 null p-values and asserts that ~50 fall below
0.05 raw and **zero** survive either correction.

## Why the rotation test, and not a permutation test

Three assumptions of the parametric t-test are false for daily returns, and
each inflates significance:

| Assumption | Reality |
|---|---|
| Normal | fat-tailed |
| Independent | volatility clusters |
| Signal days scattered at random | retrograde signals run in long unbroken blocks |

The **circular rotation test** leaves both series exactly as they are and
slides the signal along the returns by a random offset, wrapping at the ends.
That preserves the autocorrelation of the returns *and* the run-length
structure of the signal, and destroys only the alignment between them — which
is precisely the null worth testing: *is this signal's phase relative to the
market anything other than arbitrary?*

A permutation test shuffling days individually would destroy the clustering
along with the alignment and report far more significance than the data
supports. That is the standard trap in calendar-effect research.

The t-test is still computed and shown, labelled as a cross-check only.

Two further details:

- **p is never zero.** The observed arrangement counts as one of its own null
  draws, so with N rotations the strongest claim available is 1/(N+1). A test
  that can print p = 0 is making a statement no finite sample supports.
- **The seed is part of the result.** A p-value that changed on every run could
  not be checked by anyone, and "run it again until it looks better" is not a
  method.

## The periodicity floor

**The most important caveat here, and the least obvious.**

Rotating a perfectly periodic signal by a whole multiple of its period puts the
mask back exactly where it started. That rotation reproduces the observed
statistic precisely and counts as "at least as extreme". With k cycles in n
observations, roughly k of the n offsets are such no-ops, so

```
p  ≥  k / n  =  1 / (period in bars)
```

**regardless of how strong the effect is.**

Every astrological signal is periodic, so this bites constantly:

| Signal | Period | Bars/cycle (daily) | Floor |
|---|---|---:|---:|
| Full moon window | 29.53 d | ~20 | **~0.049** |
| Mercury retrograde | ~116 d | ~80 | ~0.012 |
| Mars retrograde | ~780 d | ~538 | ~0.002 |

A lunar signal on ten years of daily bars has a floor sitting right on the
conventional 0.05 threshold. **Such a study is incapable of returning a
significant result under this test, whatever the data does.**

The honest response is to say so, not to swap in a test whose assumptions are
violated in a way that happens to produce smaller numbers. The study layer
therefore:

- computes `rotationFloor` for every signal,
- displays it in the column beside the p-value, because the two only mean
  something together, and
- raises `ROTATION_FLOOR_LIMITS_POWER` once the floor reaches **half** of α —
  not only when it exceeds α. A floor of 0.047 against a threshold of 0.05 is
  technically usable and practically not, and reporting "not significant" from
  a test with almost no room to be anything else misleads as badly as a false
  positive.

## Backtesting

A backtest describes what a rule would have done on data already seen, chosen
after seeing it. It is the most persuasive and least reliable artefact in
quantitative finance, and it becomes *more* persuasive as it becomes *less*
reliable: the more variants tried, the better the best one looks and the less
it means.

So the unflattering facts are made hard to avoid:

- **Timing.** A position is taken at the close of the bar on which the signal is
  observed and earns the **next** bar's return. Using the same bar's return is
  look-ahead, and it is the single most common way a backtest comes out looking
  wonderful and is worthless. Two tests assert the lag in both directions.
- **Costs are not optional.** Charged on every position change, defaulting to
  10bp round-trip — generous for a liquid index, optimistic for anything else.
- **Buy-and-hold is always shown alongside.** A rule long 80% of the time in a
  rising market has not necessarily done anything.
- **Turnover and exposure are reported.** A strategy trading daily makes a far
  stronger claim than one trading twice a year.
- **The risk-free rate is fixed at zero and is not configurable**, because a
  configurable one invites quoting a Sharpe against whichever rate flatters it.

### A worked demonstration

Run against a **seeded random walk** — a series containing nothing whatever —
"Saturn retrograde" produced:

| | Strategy | Buy and hold |
|---|---:|---:|
| Annualised return | 0.86% | −0.28% |
| Volatility | 5.74% | 9.20% |
| Max drawdown | 11.72% | 32.13% |
| Sharpe | 0.15 | −0.03 |

Higher return, lower volatility, a third of the drawdown. It looks like a
strategy. The study's own q-value for that signal was **0.884**.

This is the whole argument for the package's design in one table: the backtest
is appealing and the statistics say it is nothing, so both are shown together.

## Other warnings

| Code | Raised when |
|---|---|
| `SMALL_ACTIVE_SAMPLE` | fewer than 30 active bars |
| `IMBALANCED_SAMPLE` | signal active on under 2% or over 98% of the sample |
| `MULTIPLE_TESTS` | more than one signal tested; states how many are expected by chance |
| `IN_SAMPLE_ONLY` | no holdout was reserved |
| `SERIES_HAS_GAPS` | gaps longer than a long weekend |
| `SHORT_SERIES` | fewer than 250 bars |
| `SIGNALS_OVERLAP` | two signals share over 80% of their active days |

Warnings are **codes with raw numeric parameters**, never prose, so the layer
stays language-neutral and the message catalogue owns the wording — the same
rule the calculation engine follows. No rounding happens in the engine: an
early version rounded "3 tests × α = 0.15" for display and printed **0.2**.

## Data handling

- Rows that cannot be used are **collected and counted**, never dropped
  silently. A reader told that 340 of 5,000 rows were unusable can judge the
  result; one shown a clean chart built from the surviving 4,660 cannot.
- Gaps are **never** interpolated or forward-filled. A gap is a fact about the
  data.
- A non-positive close is rejected: every return measure here is logarithmic.
- Slash dates are **not** guessed. `03/04/2024` is a different day on either
  side of the Atlantic, and guessing would shift events by up to eleven days
  with nothing downstream to reveal it. The caller states the convention.
- `barsPerYear` is **measured**, not assumed. Annualising a Sharpe with 252 when
  the file is weekly overstates it by more than a factor of two.

## Sampling convention

Signals are evaluated at **00:00 UT** on each day, applied identically to every
signal. This is a choice, not a truth: the Moon moves ~13° a day, so a lunar
signal sampled at midnight and at noon will disagree about the boundaries.
Since a daily price bar is itself an aggregate over a session in some other
time zone, no sampling instant is correct — what matters is that it is
consistent and stated.

## Verification

Statistical functions are checked against published tables and closed forms,
never against a second copy of the same algorithm:

- `logGamma` against Γ(n) = (n−1)!, Γ(½) = √π, and the recurrence
  Γ(x+1) = x·Γ(x)
- `incompleteBeta` against the binomial closed form for integer parameters and
  the symmetry relation I_x(a,b) = 1 − I_{1−x}(b,a)
- Student's t against eight published two-tailed critical values
- Welch's t-test against a worked example whose p-value was obtained by
  **numerically integrating the t density** — a different method from the
  continued fraction under test
- Benjamini–Hochberg against the worked example in the 1995 paper
- Signal fractions against known retrograde frequencies: Mercury 19.2%, Venus
  7.0%, Mars 9.7%, Jupiter 29.9%, Saturn 38.3%

The t distribution's approach to the normal is asserted as a **rate** rather
than a tolerance, because the residual gap at df = 10⁶ (~3×10⁻⁷) is real
mathematics, not error.
