import { describe, it, expect } from 'vitest';
import { createTranslator, formatMessage } from '../src/core.js';
import { en, type MessageKey } from '../src/locales/en.js';
import { hi } from '../src/locales/hi.js';
import { gu } from '../src/locales/gu.js';
import { LOCALES, LOCALE_LIST, resolveLocale } from '../src/locales.js';

const KEYS = Object.keys(en) as MessageKey[];

describe('catalogue completeness', () => {
  // The Catalog type already makes a missing key a compile error. These assert
  // it at runtime too, which catches a catalogue loaded dynamically or edited
  // by a translator outside the type system.
  it.each([['hi', hi], ['gu', gu]] as const)('%s has every key and no extras', (_name, catalog) => {
    expect(Object.keys(catalog).sort()).toEqual(KEYS.sort());
  });

  it.each([['hi', hi], ['gu', gu]] as const)('%s has no empty strings', (_name, catalog) => {
    for (const key of KEYS) {
      expect(catalog[key].trim(), key).not.toBe('');
    }
  });

  it.each([['hi', hi], ['gu', gu]] as const)(
    '%s preserves every interpolation placeholder',
    (_name, catalog) => {
      // A dropped {placeholder} silently loses data from the message — the user
      // sees a sentence with a hole in it and no error anywhere.
      for (const key of KEYS) {
        const expected = [...en[key].matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
        const actual = [...catalog[key].matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
        expect(actual, `${key}: placeholders must match English`).toEqual(expected);
      }
    },
  );

  it('translations are not just copied English', () => {
    // Proper nouns and transliterations legitimately stay close, so this checks
    // the bulk rather than demanding every entry differ.
    for (const [name, catalog] of [['hi', hi], ['gu', gu]] as const) {
      const identical = KEYS.filter((k) => catalog[k] === en[k]);
      expect(identical.length / KEYS.length, `${name} untranslated share`).toBeLessThan(0.05);
    }
  });
});

describe('interpolation', () => {
  const t = createTranslator(LOCALES.en).t;

  it('substitutes named parameters', () => {
    expect(
      formatMessage('House “{requested}” at {latitude}°', { requested: 'Placidus', latitude: 69.65 }, 'en'),
    ).toBe('House “Placidus” at 69.65°');
  });

  it('leaves an unknown placeholder visible rather than printing undefined', () => {
    // A visible {name} is an obvious bug report; "undefined" reads like content.
    expect(formatMessage('Hello {name}', {}, 'en')).toBe('Hello {name}');
  });

  it('formats numbers for the locale', () => {
    expect(formatMessage('{n}', { n: 1234567 }, 'en')).toBe('1,234,567');
    // Indian digit grouping differs (lakh/crore): 12,34,567
    expect(formatMessage('{n}', { n: 1234567 }, 'hi-IN')).toBe('12,34,567');
  });

  it('renders the real warning message with parameters', () => {
    const message = t('warning.lowPrecisionEphemeris', { from: 1800, to: 2399 });
    expect(message).toContain('1,800');
    expect(message).toContain('2,399');
  });
});

describe('plurals', () => {
  it('selects the right English branch', () => {
    const t = createTranslator(LOCALES.en).t;
    expect(t('count.aspects', { count: 1 })).toBe('1 aspect');
    expect(t('count.aspects', { count: 0 })).toBe('0 aspects');
    expect(t('count.aspects', { count: 31 })).toBe('31 aspects');
  });

  it('applies each locale’s own plural rules', () => {
    // Hindi treats 0 as "one" where English treats it as "other"; delegating to
    // Intl.PluralRules is exactly why that comes out right without special cases.
    for (const code of ['en', 'hi', 'gu'] as const) {
      const t = createTranslator(LOCALES[code]).t;
      for (const count of [0, 1, 2, 31]) {
        const rendered = t('count.aspects', { count });
        expect(rendered, `${code} @ ${count}`).not.toContain('{');
        expect(rendered, `${code} @ ${count}`).not.toContain('#');
        expect(rendered.length, `${code} @ ${count}`).toBeGreaterThan(0);
      }
    }
  });

  it('substitutes # with the locale-formatted count', () => {
    expect(formatMessage('{count, plural, one {# item} other {# items}}', { count: 1000 }, 'en'))
      .toBe('1,000 items');
  });
});

describe('locale registry', () => {
  it('marks which translations have been reviewed by a fluent speaker', () => {
    // Draft and reviewed copy look identical on screen, so the distinction has
    // to be data the UI can surface.
    expect(LOCALES.en.reviewed).toBe(true);
    expect(LOCALES.hi.reviewed).toBe(false);
    expect(LOCALES.gu.reviewed).toBe(false);
  });

  it('names each language in its own script', () => {
    expect(LOCALES.hi.nativeName).toBe('हिन्दी');
    expect(LOCALES.gu.nativeName).toBe('ગુજરાતી');
  });

  it('negotiates a regional tag down to a supported locale', () => {
    expect(resolveLocale('hi-IN')).toBe('hi');
    expect(resolveLocale('gu')).toBe('gu');
    expect(resolveLocale('en-GB')).toBe('en');
    expect(resolveLocale('fr-FR')).toBeUndefined();
  });

  it('exposes every locale in the list', () => {
    expect(LOCALE_LIST).toHaveLength(3);
  });
});

describe('domain vocabulary is translated, not transliterated', () => {
  it('uses the established rashi names', () => {
    const h = createTranslator(LOCALES.hi).t;
    const g = createTranslator(LOCALES.gu).t;
    expect(h('sign.aries')).toBe('मेष');
    expect(h('sign.capricorn')).toBe('मकर');
    expect(g('sign.aries')).toBe('મેષ');
    expect(g('sign.capricorn')).toBe('મકર');
  });

  it('uses the established graha names, including Rahu/Ketu for the nodes', () => {
    const h = createTranslator(LOCALES.hi).t;
    expect(h('body.sun')).toBe('सूर्य');
    expect(h('body.saturn')).toBe('शनि');
    expect(h('body.trueNode')).toBe('राहु');
    expect(h('body.southNode')).toBe('केतु');
  });

  it('uses margi/vakri for direct and retrograde', () => {
    const h = createTranslator(LOCALES.hi).t;
    const g = createTranslator(LOCALES.gu).t;
    expect(h('motion.direct')).toBe('मार्गी');
    expect(h('motion.retrograde')).toBe('वक्री');
    expect(g('motion.direct')).toBe('માર્ગી');
    expect(g('motion.retrograde')).toBe('વક્રી');
  });
});

describe('every engine code has a message', () => {
  // These lists mirror ChartWarningCode and EngineErrorCode in @astro/engine.
  // If the engine gains a code with no catalogue entry, the UI would render a
  // raw identifier at the user; this keeps the two in step.
  const WARNING_CODES = [
    'birthTimeUnknown', 'timeAmbiguous', 'timeNonexistent',
    'lowPrecisionEphemeris', 'houseSystemFallback',
  ];
  const ERROR_CODES = [
    'timeDoesNotExist', 'unknownTimeZone', 'implausibleOffset',
    'dateOutOfRange', 'houseSystemUndefined', 'invalidCoordinates',
  ];

  it.each(WARNING_CODES)('warning.%s exists in every locale', (code) => {
    for (const locale of LOCALE_LIST) {
      expect(locale.catalog[`warning.${code}` as MessageKey], locale.code).toBeTruthy();
    }
  });

  it.each(ERROR_CODES)('error.%s exists in every locale', (code) => {
    for (const locale of LOCALE_LIST) {
      expect(locale.catalog[`error.${code}` as MessageKey], locale.code).toBeTruthy();
    }
  });
});
