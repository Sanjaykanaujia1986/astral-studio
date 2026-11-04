/**
 * Which languages have interpretation content.
 *
 * This is separate from the UI's language list on purpose, and the difference
 * is not an oversight. Translating a button is a small, checkable job.
 * Translating astrological delineation is authorship — the phrasing carries
 * the meaning, and a machine rendering of it into Hindi or Gujarati would look
 * finished while being unreliable in ways a non-speaker cannot detect.
 *
 * So the catalogue registry reports honestly what exists. `catalogueFor`
 * returns undefined for a language with no content, and the caller is expected
 * to say so to the reader rather than quietly printing English under a Gujarati
 * heading. Adding a language means adding a reviewed catalogue file here; no
 * other code changes.
 */
import { EN_CATALOGUE } from './catalogue/en.js';
import type { Catalogue } from './types.js';

export const CATALOGUES: Readonly<Record<string, Catalogue>> = {
  en: EN_CATALOGUE,
};

/** Language tags that have interpretation content. */
export const INTERPRETATION_LOCALES: readonly string[] = Object.keys(CATALOGUES);

/**
 * The catalogue for a language, or undefined when none exists.
 *
 * Matches on the primary subtag, so `en-GB` and `en-IN` both find `en`. It
 * does NOT fall back to English on its own: the decision to show a reader
 * content in a language they did not ask for belongs to the UI, which can
 * label it.
 */
export function catalogueFor(locale: string): Catalogue | undefined {
  const exact = CATALOGUES[locale];
  if (exact) return exact;
  const primary = locale.split('-')[0];
  return primary ? CATALOGUES[primary] : undefined;
}
