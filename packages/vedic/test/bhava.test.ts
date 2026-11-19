/**
 * Bhāva facts and the Sarvatobhadra cakra against their rules. Synthetic charts only.
 */
import { describe, it, expect } from 'vitest';
import { bhavaFacts, aspectedSigns, nakshatra28, sbcCellOf, functionalNature, SARVATOBHADRA, ABHIJIT_INDEX } from '../src/bhava.js';
import { ashtakavarga } from '../src/ashtakavarga.js';
import { GRAHAS, type Graha, type GrahaLongitudes } from '../src/grahas.js';

const none = Object.fromEntries(GRAHAS.map((g) => [g, false])) as Record<Graha, boolean>;
/** Lagna Meṣa; Mars (1st lord) exalted in Makara (10th); Saturn in Meṣa (debilitated, 1st); Jupiter in Karka (4th). */
const G: GrahaLongitudes = {
  lagna: 5,
  lon: { sun: 130, moon: 50, mars: 280, mercury: 150, jupiter: 95, venus: 185, saturn: 15, rahu: 200, ketu: 20 },
  retrograde: none,
};

describe('Parāśari aspects', () => {
  it('gives every graha the 7th and Mars, Jupiter and Saturn their specials', () => {
    expect(aspectedSigns(G, 'sun')).toEqual([10]); // Siṁha → Kumbha
    expect(aspectedSigns(G, 'mars')).toEqual([0, 3, 4]); // Makara → 4th Meṣa, 7th Karka, 8th Siṁha
    expect(aspectedSigns(G, 'jupiter')).toEqual([7, 9, 11]);
    expect(aspectedSigns(G, 'saturn')).toEqual([2, 6, 9]);
  });
});

describe('bhāva facts', () => {
  const f = bhavaFacts(G);
  it('finds each house’s lord, occupants, aspects and bindus', () => {
    expect(f).toHaveLength(12);
    const h1 = f[0]!;
    expect(h1.lord).toBe('mars');
    expect(h1.lordHouse).toBe(10);
    expect(h1.occupants).toEqual(['saturn', 'ketu']);
    expect(h1.aspectedBy).toContain('mars');
    expect(h1.aspectedBy).toContain('venus'); // Tulā → Meṣa
    expect(h1.sav).toBe(ashtakavarga(G).sarva[0]);
  });
  it('sorts the factors by the classical rules', () => {
    const h1 = f[0]!;
    const kinds = (xs: readonly { kind: string }[]) => xs.map((x) => x.kind);
    expect(kinds(h1.support)).toContain('lordKendra');
    expect(kinds(h1.support)).toContain('lordDignified'); // Mars exalted
    expect(kinds(h1.care)).toContain('malefic'); // Saturn and Ketu in the 1st, not an upacaya
    // 4th house (Karka): Jupiter in it is a benefic occupant.
    expect(f[3]!.support.find((x) => x.kind === 'benefic')).toEqual({ kind: 'benefic', bodies: ['jupiter'] });
    // 5th (Siṁha) holds the Sun: a malefic outside the upacayas.
    expect(kinds(f[4]!.care)).toContain('malefic');
    // 6th (Kanyā) holds Mercury… and its lord Mercury sits in its own 6th: a dusthāna.
    expect(kinds(f[5]!.care)).toContain('lordDusthana');
    expect(bhavaFacts({ lon: G.lon, retrograde: none })).toEqual([]);
  });
});

describe('Sarvatobhadra', () => {
  it('puts all 28 nakṣatras once round the edge, clockwise from Kṛttikā', () => {
    const seen = SARVATOBHADRA.flat().filter((c) => c.kind === 'nakshatra').map((c) => (c as { index: number }).index);
    expect(new Set(seen).size).toBe(28);
    expect(sbcCellOf(2)).toEqual([0, 1]); // Kṛttikā, top left
    expect(sbcCellOf(9)).toEqual([1, 8]); // Maghā, right column top
    expect(sbcCellOf(ABHIJIT_INDEX)).toEqual([8, 2]);
    expect(sbcCellOf(1)).toEqual([1, 0]); // Bharaṇī, left column top
  });
  it('places the twelve signs and five tithi groups once each', () => {
    const signs = SARVATOBHADRA.flat().filter((c) => c.kind === 'sign').map((c) => (c as { index: number }).index);
    expect([...signs].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(SARVATOBHADRA[4]![4]).toMatchObject({ kind: 'tithi', group: 'Pūrṇā' });
    expect(SARVATOBHADRA.flat().filter((c) => c.kind === 'tithi')).toHaveLength(5);
  });
  it('counts Abhijit between Uttarāṣāḍhā and Śravaṇa', () => {
    expect(nakshatra28(270)).toBe(20); // Uttarāṣāḍhā
    expect(nakshatra28(278)).toBe(ABHIJIT_INDEX);
    expect(nakshatra28(285)).toBe(22); // Śravaṇa
    expect(nakshatra28(359)).toBe(27); // Revatī
    expect(nakshatra28(10)).toBe(0);
  });
});

describe('functional nature (Laghu Pārāśarī)', () => {
  const at = (lagna: number) => functionalNature(lagna, G);
  it('reads Meṣa: trikoṇa and lagna lords benefic, 3/6/11 lords malefic, kendra and 2/12 lords neutral', () => {
    expect(at(0)).toEqual({
      sun: 'benefic', moon: 'neutral', mars: 'benefic', mercury: 'malefic', jupiter: 'benefic',
      venus: 'neutral', saturn: 'malefic',
      rahu: 'neutral', // in Tulā: takes Venus
      ketu: 'benefic', // in Meṣa: takes Mars
    });
  });
  it('makes the kendra-and-trikoṇa lord a benefic (Saturn for Vṛṣabha, Mars for Karka)', () => {
    expect(at(1).saturn).toBe('benefic');
    expect(at(3).mars).toBe('benefic');
    expect(at(1).jupiter).toBe('malefic'); // 8th and 11th
  });
  it('lets a trikoṇa outweigh a 6th (Jupiter for Karka) and spares the luminaries the 8th', () => {
    expect(at(3).jupiter).toBe('benefic');
    expect(at(8).moon).toBe('neutral'); // Dhanu: Moon owns only the 8th
    expect(at(2).saturn).toBe('benefic'); // Mithuna: 8th and 9th
  });
});
