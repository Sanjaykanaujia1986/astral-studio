/**
 * IAST → Devanagari / Gujarati, for the Sanskrit terms a Jyotiṣa page shows
 * as data (saham, yoga, tārā, varṇa, month and karaṇa names and the like).
 *
 * The English interface prints these in IAST; a Hindi or Gujarati reader
 * should see them in their own script. The terms are Sanskrit, so the mapping
 * is mechanical: the Gujarati block mirrors Devanagari at an offset of 0x180.
 *
 * Modern spelling, not Sanskrit orthography, for a nasal before a stop:
 * "Maṅgala" becomes मंगल rather than मङ्गल, as Hindi and Gujarati write it.
 */

const VOWELS: Readonly<Record<string, readonly [string, string]>> = {
  // independent, matra
  a: ['अ', ''], 'ā': ['आ', 'ा'], i: ['इ', 'ि'], 'ī': ['ई', 'ी'], u: ['उ', 'ु'], 'ū': ['ऊ', 'ू'],
  'ṛ': ['ऋ', 'ृ'], 'ṝ': ['ॠ', 'ॄ'], e: ['ए', 'े'], ai: ['ऐ', 'ै'], o: ['ओ', 'ो'], au: ['औ', 'ौ'],
};
const CONSONANTS: Readonly<Record<string, string>> = {
  k: 'क', kh: 'ख', g: 'ग', gh: 'घ', 'ṅ': 'ङ',
  c: 'च', ch: 'छ', j: 'ज', jh: 'झ', 'ñ': 'ञ',
  'ṭ': 'ट', 'ṭh': 'ठ', 'ḍ': 'ड', 'ḍh': 'ढ', 'ṇ': 'ण',
  t: 'त', th: 'थ', d: 'द', dh: 'ध', n: 'न',
  p: 'प', ph: 'फ', b: 'ब', bh: 'भ', m: 'म',
  y: 'य', r: 'र', l: 'ल', 'ḷ': 'ळ', v: 'व', w: 'व',
  'ś': 'श', 'ṣ': 'ष', s: 'स', h: 'ह',
};
const NASAL = new Set(['ṅ', 'ñ', 'ṇ', 'n', 'm']);
/** Consonants before which a nasal is written as anusvāra. */
const STOPS = new Set(['k', 'kh', 'g', 'gh', 'c', 'ch', 'j', 'jh', 'ṭ', 'ṭh', 'ḍ', 'ḍh', 't', 'th', 'd', 'dh', 'p', 'ph', 'b', 'bh']);
const VIRAMA = '्';

function tokens(word: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < word.length;) {
    const two = word.slice(i, i + 2);
    if (two.length === 2 && (CONSONANTS[two] !== undefined || VOWELS[two] !== undefined)) { out.push(two); i += 2; continue; }
    out.push(word[i]!); i += 1;
  }
  return out;
}

function toDevanagari(text: string): string {
  // NFC so that ā and ṣ are single code points whatever the source produced.
  const tk = tokens(text.normalize('NFC').toLowerCase());
  let out = '';
  for (let i = 0; i < tk.length; i += 1) {
    const x = tk[i]!;
    const next = tk[i + 1];
    if (CONSONANTS[x] !== undefined) {
      if (NASAL.has(x) && next !== undefined && STOPS.has(next)) { out += 'ं'; continue; }
      out += CONSONANTS[x];
      if (next !== undefined && VOWELS[next] !== undefined) { out += VOWELS[next]![1]; i += 1; }
      else if (next !== undefined && CONSONANTS[next] !== undefined) out += VIRAMA;
      // A consonant ending a word keeps its inherent vowel: Sanskrit stems
      // shown in IAST (Rāhu, Vāsi) end in a vowel, and loan words such as
      // "Jalapatha" read naturally without a virāma.
      continue;
    }
    if (VOWELS[x] !== undefined) { out += VOWELS[x]![0]; continue; }
    if (x === 'ṁ' || x === 'ṃ') { out += 'ं'; continue; }
    if (x === 'ḥ') { out += 'ः'; continue; }
    out += x;
  }
  return out;
}

const shiftToGujarati = (s: string): string =>
  [...s].map((ch) => {
    const c = ch.codePointAt(0)!;
    return c >= 0x0900 && c <= 0x097f ? String.fromCodePoint(c + 0x180) : ch;
  }).join('');

/** Write an IAST term in the script of `locale` ('hi' Devanagari, 'gu' Gujarati); English keeps IAST. */
export function iastToScript(text: string, locale: string): string {
  if (locale === 'hi') return toDevanagari(text);
  if (locale === 'gu') return shiftToGujarati(toDevanagari(text));
  return text;
}
