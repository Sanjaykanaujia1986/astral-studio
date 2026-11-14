/**
 * Hindi and Gujarati Jyotiṣa pages: the reasons and formulas the engine
 * writes in English are rebuilt from data in the reader's language. These
 * tests hold the English rebuild to the engine's own sentence, so the English
 * page cannot drift, and check that every term the engine uses has a key.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { SwissEphWasmProvider, calculateNatalChart, type BirthData } from '@astro/engine';
import { createTranslator, LOCALES, iastToScript, type MessageKey } from '@astro/i18n';
import { yogas, sahams, grahaLongitudes, vedicChart, type GrahaLongitudes } from '@astro/vedic';
import { SAHAM_TERM } from '../src/components/vedic/TablesSection.js';

const BIRTHS: readonly BirthData[] = [
  { date: { year: 1990, month: 1, day: 15 }, time: { hour: 14, minute: 30, second: 0 } },
  { date: { year: 1975, month: 7, day: 3 }, time: { hour: 4, minute: 10, second: 0 } },
  { date: { year: 2004, month: 11, day: 21 }, time: { hour: 22, minute: 45, second: 0 } },
  { date: { year: 1961, month: 3, day: 9 }, time: { hour: 9, minute: 0, second: 0 } },
].map((b) => ({
  name: 'Synthetic', ...b,
  zone: { kind: 'iana', zone: 'Asia/Kolkata' },
  place: { latitude: 23.18, longitude: 75.78, label: 'Ujjain' },
}) as BirthData);

let provider: SwissEphWasmProvider;
let charts: { g: GrahaLongitudes; cusps: readonly number[] }[];

beforeAll(async () => {
  provider = new SwissEphWasmProvider();
  await provider.init();
  charts = BIRTHS.map((b) => {
    const c = calculateNatalChart(provider, b, { settings: { zodiac: { kind: 'sidereal', ayanamsha: 'lahiri' }, nodeType: 'mean' } });
    const cusps = provider.houses(c.jdUT, c.place.latitude, c.place.longitude, 'placidus', { zodiac: c.settings.zodiac }).cusps;
    return { g: grahaLongitudes(vedicChart(c)), cusps };
  });
}, 60_000);
afterAll(() => provider.close());

describe('yoga reasons from data', () => {
  for (const code of ['en', 'hi', 'gu'] as const) {
    it(`renders every reason in ${code}${code === 'en' ? ', identical to the engine text' : ' with no Latin letters'}`, () => {
      const { t } = createTranslator(LOCALES[code]);
      const gn = (x: string): string => t(`jy.graha.${x}` as MessageKey);
      for (const { g } of charts) {
        for (const y of yogas(g)) {
          const d = y.detail;
          const params: Record<string, string | number> = { ...(d.n ?? {}) };
          for (const [k, v] of Object.entries(d.p ?? {})) params[k] = gn(v);
          for (const [k, v] of Object.entries(d.g ?? {})) params[k] = v.length ? v.map(gn).join(', ') : t('vedic.yoga.empty');
          const text = t(`vedic.yoga.why.${d.key}` as MessageKey, params);
          if (code === 'en') expect(text).toBe(y.reason);
          else {
            expect(text).not.toMatch(/[A-Za-z]/);
            expect(iastToScript(y.name, code)).not.toMatch(/[A-Za-z]/);
          }
        }
      }
    });
  }
});

describe('saham formulas', () => {
  it('has a catalogue term for every operand the engine prints', () => {
    for (const { g, cusps } of charts) {
      for (const s of sahams(g, cusps)) {
        const m = /^(.*?) − (.*?) \+ (.*?)( \(\+30\))?$/.exec(s.formula);
        expect(m, s.formula).not.toBeNull();
        for (const term of [m![1]!, m![2]!, m![3]!]) expect(SAHAM_TERM[term], term).toBeDefined();
        expect(iastToScript(s.name, 'hi')).not.toMatch(/[A-Za-z]/);
      }
    }
  });
});
