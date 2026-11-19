/**
 * The facts the readings are composed from. Synthetic chart only.
 */
import { describe, it, expect } from 'vitest';
import { grahaPhala, houseClass, signElement, signModality, dashaPairing } from '../src/phala.js';
import { GRAHAS, type Graha, type GrahaLongitudes } from '../src/grahas.js';

const none = Object.fromEntries(GRAHAS.map((g) => [g, false])) as Record<Graha, boolean>;
/** Lagna Meṣa; Sun Siṁha (5th, mūlatrikoṇa), Mars Makara (10th, exalted), Saturn Meṣa (1st, debilitated), Rāhu Tulā (7th). */
const G: GrahaLongitudes = {
  lagna: 5,
  lon: { sun: 130, moon: 50, mars: 280, mercury: 150, jupiter: 95, venus: 185, saturn: 15, rahu: 200, ketu: 20 },
  retrograde: { ...none, saturn: true },
};

describe('phala facts', () => {
  const p = new Map(grahaPhala(G).map((x) => [x.body, x]));
  it('places each graha with its house class, lordships and dignity', () => {
    expect(p.get('sun')).toMatchObject({ house: 5, cls: 'trikona', owns: [5], dignity: 'moolatrikona', natural: 'malefic', functional: 'benefic' });
    expect(p.get('mars')).toMatchObject({ house: 10, cls: 'kendra', owns: [1, 8], dignity: 'exalted', functional: 'benefic' });
    expect(p.get('saturn')).toMatchObject({ house: 1, dignity: 'debilitated', retrograde: true, functional: 'malefic', owns: [10, 11] });
    expect(p.get('moon')).toMatchObject({ house: 2, cls: 'dhana', natural: 'benefic' });
  });
  it('gives the nodes their dispositor instead of lordships', () => {
    expect(p.get('rahu')).toMatchObject({ house: 7, owns: [], retrograde: false, dispositor: { body: 'venus', house: 7 } });
    expect(p.get('ketu')!.dispositor).toEqual({ body: 'mars', house: 10 });
  });
  it('classes houses and signs', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(houseClass)).toEqual([
      'kendra', 'dhana', 'upacaya', 'kendra', 'trikona', 'upacaya', 'kendra', 'dusthana', 'trikona', 'kendra', 'upacaya', 'dusthana',
    ]);
    expect([0, 1, 2, 3, 4].map(signElement)).toEqual(['fire', 'earth', 'air', 'water', 'fire']);
    expect([0, 1, 2, 3].map(signModality)).toEqual(['movable', 'fixed', 'dual', 'movable']);
  });
  it('reads an antardaśā lord by its place from the mahādaśā lord', () => {
    expect(dashaPairing(G, 'sun', 'mercury')).toEqual({ from: 2, kind: 'mixed' });
    expect(dashaPairing(G, 'sun', 'saturn')).toEqual({ from: 9, kind: 'good' });
    expect(dashaPairing(G, 'mars', 'jupiter')).toEqual({ from: 7, kind: 'good' });
    expect(dashaPairing(G, 'jupiter', 'mars')).toEqual({ from: 7, kind: 'good' });
    expect(dashaPairing(G, 'moon', 'jupiter')).toEqual({ from: 3, kind: 'mixed' });
    expect(dashaPairing(G, 'venus', 'moon')).toEqual({ from: 8, kind: 'hard' });
  });
});
