/**
 * A zodiacal position as the tables print it: degrees and minutes within the
 * sign, the sign's glyph in its element colour, then the sign's name.
 *
 * The glyph is decorative (the name beside it carries the meaning), so it is
 * hidden from assistive technology; without a `label` the glyph is the only
 * marker and is given the sign as its accessible name instead.
 */
import type { JSX } from 'react';
import { useTranslator } from '@astro/i18n';
import { formatLongitude, splitForDisplay, type DegreePrecision } from '../format.js';
import { SignGlyph } from '../glyphs/Glyph.js';

export interface SignPositionProps {
  readonly longitude: number;
  readonly precision?: DegreePrecision;
  /** Translated sign name. Omit for a compact glyph-only form. */
  readonly label?: string;
  readonly className?: string;
}

export function SignPosition({ longitude, precision = 'minute', label, className }: SignPositionProps): JSX.Element {
  // The same split the text uses (truncated, clamped inside the sign), so the
  // glyph can never disagree with the degrees printed beside it.
  const { t } = useTranslator();
  const degrees = formatLongitude(longitude, { precision, signLabel: '' }).trimEnd();
  const { sign } = splitForDisplay(longitude, precision);
  return (
    <span className={['inline-flex items-center gap-1.5 tabular-nums', className].filter(Boolean).join(' ')}>
      <span>{degrees}</span>
      {/* A real space, so copied text and screen readers get "01°13' Capricorn"; flex ignores it visually. */}
      {' '}
      <SignGlyph sign={sign} tinted {...(label ? {} : { title: t(`sign.${sign}`) })} />
      {label ? <span>{label}</span> : null}
    </span>
  );
}
