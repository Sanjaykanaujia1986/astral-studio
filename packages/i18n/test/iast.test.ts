import { describe, it, expect } from 'vitest';
import { iastToScript } from '../src/iast.js';

describe('IAST to Devanagari and Gujarati', () => {
  it('writes common Jyotiṣa terms the way Hindi spells them', () => {
    const cases: [string, string][] = [
      ['Maṅgala', 'मंगल'], ['Candra', 'चंद्र'], ['Śukra', 'शुक्र'], ['Kṣatriya', 'क्षत्रिय'],
      ['Jyeṣṭhā', 'ज्येष्ठा'], ['Kumbha', 'कुंभ'], ['Haṁsa', 'हंस'], ['Vaiśya', 'वैश्य'],
      ['Gajakesarī', 'गजकेसरी'], ['Ati-maitra', 'अति-मैत्र'], ['Puṇya', 'पुण्य'], ['Ādi', 'आदि'],
    ];
    for (const [iast, deva] of cases) expect(iastToScript(iast, 'hi')).toBe(deva);
  });
  it('mirrors Devanagari into the Gujarati block', () => {
    expect(iastToScript('Maṅgala', 'gu')).toBe('મંગલ');
    expect(iastToScript('Kṣatriya', 'gu')).toBe('ક્ષત્રિય');
    expect(iastToScript('Śukra', 'gu')).toBe('શુક્ર');
  });
  it('leaves English as IAST and keeps digits and punctuation', () => {
    expect(iastToScript('Maṅgala', 'en')).toBe('Maṅgala');
    expect(iastToScript('Pada 3, (12)', 'hi')).toBe('पद 3, (12)');
  });
});
