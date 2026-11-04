/**
 * Multiple-comparison control.
 *
 * This module is the single most important thing in the research package, and
 * the reason is arithmetic rather than opinion.
 *
 * Ten bodies, twelve signs, eleven aspects and a handful of window widths
 * generate thousands of candidate signals. Test a thousand of them against a
 * price series in which nothing whatever is happening, and roughly fifty will
 * come back at p < 0.05. Every one of those fifty will look like a discovery.
 * Reporting them without correction is not a subtle statistical error; it is a
 * machine for manufacturing false findings, and it would be the single easiest
 * way for this project to produce confident nonsense.
 *
 * So the study layer counts every test it runs — including the ones that were
 * not interesting — and adjusts. `testsPerformed` travels with every result.
 *
 * Two procedures, because they answer different questions:
 *
 * - **Holm–Bonferroni** controls the family-wise error rate: the probability
 *   of even one false positive anywhere in the family. Strict. Use when a
 *   single false claim would be costly.
 * - **Benjamini–Hochberg** controls the false discovery rate: the expected
 *   share of the claims made that are false. More powerful, and the right
 *   choice for exploratory screening, which is what this is.
 *
 * Both are reported. Neither is optional.
 */

export interface AdjustedPValue {
  /** Index into the input array, so results can be matched back. */
  readonly index: number;
  readonly raw: number;
  /** Adjusted so it can be compared against the original α. */
  readonly adjusted: number;
}

function validate(pValues: readonly number[]): void {
  for (const p of pValues) {
    if (!Number.isFinite(p) || p < 0 || p > 1) {
      throw new RangeError(`p-values must lie in [0,1], received ${p}`);
    }
  }
}

/**
 * Holm–Bonferroni step-down adjustment.
 *
 * Sort ascending; multiply the k-th smallest by (m − k); enforce monotonicity
 * so an adjusted value never falls below one that precedes it; cap at 1.
 */
export function holmBonferroni(pValues: readonly number[]): AdjustedPValue[] {
  validate(pValues);
  const m = pValues.length;
  if (m === 0) return [];

  const order = pValues
    .map((raw, index) => ({ raw, index }))
    .sort((a, b) => a.raw - b.raw);

  const out: AdjustedPValue[] = [];
  let running = 0;
  for (let k = 0; k < m; k++) {
    const entry = order[k]!;
    const scaled = (m - k) * entry.raw;
    // Step-down monotonicity: the sequence of adjusted values cannot decrease.
    running = Math.max(running, scaled);
    out.push({ index: entry.index, raw: entry.raw, adjusted: Math.min(1, running) });
  }

  return out.sort((a, b) => a.index - b.index);
}

/**
 * Benjamini–Hochberg adjustment (q-values), under independence or positive
 * dependence.
 *
 * Step UP from the largest: multiply the k-th smallest of m by m/k, and take
 * the running minimum so the sequence is monotone.
 *
 * A note on the dependence assumption, since it matters here: astrological
 * signals are emphatically NOT independent of one another — "Mercury
 * retrograde" and "Mercury retrograde in Gemini" overlap almost entirely. BH
 * remains valid under positive regression dependence, which overlapping
 * windows of this kind generally satisfy, but a study whose signals are
 * strongly and negatively related would need Benjamini–Yekutieli instead. The
 * study layer raises `SIGNALS_OVERLAP` so this is visible rather than assumed.
 */
export function benjaminiHochberg(pValues: readonly number[]): AdjustedPValue[] {
  validate(pValues);
  const m = pValues.length;
  if (m === 0) return [];

  const order = pValues
    .map((raw, index) => ({ raw, index }))
    .sort((a, b) => a.raw - b.raw);

  const adjusted = new Array<number>(m);
  let running = 1;
  for (let k = m - 1; k >= 0; k--) {
    const scaled = (m / (k + 1)) * order[k]!.raw;
    running = Math.min(running, scaled);
    adjusted[k] = Math.min(1, running);
  }

  return order
    .map((entry, k) => ({ index: entry.index, raw: entry.raw, adjusted: adjusted[k]! }))
    .sort((a, b) => a.index - b.index);
}

/**
 * How many of a family would survive at a given level, before and after
 * correction.
 *
 * Reported side by side deliberately. The gap between the two counts is the
 * clearest possible statement of how much of an apparent finding was an
 * artefact of asking many questions.
 */
export function survivorCounts(
  pValues: readonly number[],
  alpha = 0.05,
): {
  readonly tested: number;
  readonly rawBelowAlpha: number;
  readonly holmBelowAlpha: number;
  readonly fdrBelowAlpha: number;
  /** Tests expected to fall below α by chance alone if nothing is happening. */
  readonly expectedByChance: number;
} {
  const below = (values: readonly AdjustedPValue[]) =>
    values.filter((v) => v.adjusted <= alpha).length;

  return {
    tested: pValues.length,
    rawBelowAlpha: pValues.filter((p) => p <= alpha).length,
    holmBelowAlpha: below(holmBonferroni(pValues)),
    fdrBelowAlpha: below(benjaminiHochberg(pValues)),
    expectedByChance: pValues.length * alpha,
  };
}
