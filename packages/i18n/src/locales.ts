/**
 * The locale registry.
 *
 * `reviewed` is part of the public data rather than a code comment: a draft
 * translation and a checked one look identical on screen, so the distinction
 * has to travel with the locale and be shown in the picker.
 */
import type { LocaleCode, LocaleDefinition } from './core.js';
import { en } from './locales/en.js';
import { hi } from './locales/hi.js';
import { gu } from './locales/gu.js';

export const LOCALES: Readonly<Record<LocaleCode, LocaleDefinition>> = {
  en: {
    code: 'en',
    nativeName: 'English',
    englishName: 'English',
    intlTag: 'en',
    catalog: en,
    reviewed: true,
  },
  hi: {
    code: 'hi',
    nativeName: 'हिन्दी',
    englishName: 'Hindi',
    intlTag: 'hi-IN',
    catalog: hi,
    // Astrological vocabulary is established terminology; the UI chrome is a
    // draft awaiting a fluent speaker.
    reviewed: false,
  },
  gu: {
    code: 'gu',
    nativeName: 'ગુજરાતી',
    englishName: 'Gujarati',
    intlTag: 'gu-IN',
    catalog: gu,
    reviewed: false,
  },
};

export const DEFAULT_LOCALE: LocaleCode = 'en';

export const LOCALE_LIST: readonly LocaleDefinition[] = Object.values(LOCALES);

/**
 * Map a BCP-47 tag onto a supported locale, e.g. `hi-IN` -> `hi`.
 * Returns undefined when nothing matches, so the caller decides the fallback.
 */
export function resolveLocale(tag: string): LocaleCode | undefined {
  const base = tag.toLowerCase().split('-')[0];
  if (base && base in LOCALES) return base as LocaleCode;
  return undefined;
}
