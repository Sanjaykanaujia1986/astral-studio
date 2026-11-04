/**
 * Minimal, typed message formatting.
 *
 * Deliberately not a general i18n framework. The needs here are narrow —
 * interpolation, plural selection, and locale-aware number/date formatting —
 * and all three are covered by platform `Intl`, which already ships correct
 * plural rules for every locale including Gujarati and Hindi. Pulling in a
 * runtime to re-implement that would add weight without adding correctness.
 *
 * Supported syntax:
 *   {name}                                    simple interpolation
 *   {count, plural, one {# thing} other {# things}}   ICU-style plural
 *
 * Inside a plural branch, `#` is replaced by the locale-formatted count.
 */
import { en, type Catalog, type MessageKey } from './locales/en.js';

export type LocaleCode = 'en' | 'gu' | 'hi';

export interface LocaleDefinition {
  readonly code: LocaleCode;
  /** Name of the language IN that language, which is how a picker should read. */
  readonly nativeName: string;
  readonly englishName: string;
  /** BCP-47 tag for Intl. */
  readonly intlTag: string;
  readonly catalog: Catalog;
  /**
   * False when the copy has not yet been checked by a fluent speaker.
   * Surfaced in the language picker rather than hidden, so nobody mistakes a
   * draft translation for a reviewed one.
   */
  readonly reviewed: boolean;
}

export type MessageParams = Readonly<Record<string, string | number>>;

const PLURAL_PATTERN = /\{(\w+)\s*,\s*plural\s*,\s*(.+?)\}\s*$/s;

/**
 * Parse the branches of a plural message: `one {…} other {…}`.
 * Brace-counting rather than a regex, so a branch may itself contain braces.
 */
function parseBranches(source: string): Map<string, string> {
  const branches = new Map<string, string>();
  let index = 0;

  while (index < source.length) {
    while (index < source.length && /\s/.test(source[index]!)) index++;

    let nameEnd = index;
    while (nameEnd < source.length && /[\w=]/.test(source[nameEnd]!)) nameEnd++;
    const name = source.slice(index, nameEnd);
    if (!name) break;

    while (nameEnd < source.length && /\s/.test(source[nameEnd]!)) nameEnd++;
    if (source[nameEnd] !== '{') break;

    let depth = 0;
    let end = nameEnd;
    for (; end < source.length; end++) {
      if (source[end] === '{') depth++;
      else if (source[end] === '}') {
        depth--;
        if (depth === 0) break;
      }
    }
    branches.set(name, source.slice(nameEnd + 1, end));
    index = end + 1;
  }

  return branches;
}

/**
 * Render one message template.
 *
 * A missing parameter leaves its placeholder visibly intact rather than
 * printing "undefined" — a visible `{name}` in the UI is an obvious bug report,
 * whereas "undefined" reads like content.
 */
export function formatMessage(
  template: string,
  params: MessageParams | undefined,
  intlTag: string,
): string {
  let text = template;

  const pluralMatch = PLURAL_PATTERN.exec(text.trim());
  if (pluralMatch) {
    const [, variable, body] = pluralMatch as unknown as [string, string, string];
    const rawCount = params?.[variable];
    const count = typeof rawCount === 'number' ? rawCount : Number(rawCount ?? 0);

    const branches = parseBranches(body);
    // An exact match like `=0` wins over the plural category, per ICU.
    const category = new Intl.PluralRules(intlTag).select(count);
    const chosen = branches.get(`=${count}`) ?? branches.get(category) ?? branches.get('other') ?? '';

    text = chosen.replace(/#/g, new Intl.NumberFormat(intlTag).format(count));
  }

  return text.replace(/\{(\w+)\}/g, (whole, name: string) => {
    const value = params?.[name];
    if (value === undefined) return whole;
    return typeof value === 'number' ? new Intl.NumberFormat(intlTag).format(value) : value;
  });
}

export interface Translator {
  readonly locale: LocaleDefinition;
  /** Translate a key, interpolating parameters. */
  t: (key: MessageKey, params?: MessageParams) => string;
  /** Locale-aware number formatting. */
  n: (value: number, options?: Intl.NumberFormatOptions) => string;
  /** Locale-aware date formatting from an ISO string. */
  d: (iso: string, options?: Intl.DateTimeFormatOptions) => string;
}

export function createTranslator(locale: LocaleDefinition): Translator {
  return {
    locale,
    t(key, params) {
      // English is the fallback for a key somehow absent at runtime. The types
      // make that impossible at build time, but a hand-edited catalogue loaded
      // dynamically should degrade to English rather than to a raw key.
      const template = locale.catalog[key] ?? en[key];
      if (template === undefined) return key;
      return formatMessage(template, params, locale.intlTag);
    },
    n(value, options) {
      return new Intl.NumberFormat(locale.intlTag, options).format(value);
    },
    d(iso, options) {
      const date = new Date(iso);
      if (Number.isNaN(date.getTime())) return iso;
      return new Intl.DateTimeFormat(locale.intlTag, options).format(date);
    },
  };
}
