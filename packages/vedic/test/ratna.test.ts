/**
 * Gemstone advice follows the chart's lordships; favourable points follow
 * the angles. Synthetic chart only.
 */
import { describe, it, expect } from 'vitest';
import { ratnaAdvice, ratnaNakshatras, stonesContradict, RATNA } from '../src/ratna.js';
import { kpAspectPoints, FAVOURABLE_ANGLES } from '../src/kp.js';
import { GRAHAS, type Graha, type GrahaLongitudes } from '../src/grahas.js';

const none = Object.fromEntries(GRAHAS.map((g) => [g, false])) as Record<Graha, boolean>;
const meshaLagna = (lagna: number): GrahaLongitudes => ({
  lagna,
  lon: { sun: 130, moon: 50, mars: 280, mercury: 150, jupiter: 95, venus: 185, saturn: 15, rahu: 200, ketu: 20 },
  retrograde: none,
});

describe('ratna advice', () => {
  it('points to the lagna, 5th and 9th lords’ stones and away from functional malefics (Meṣa)', () => {
    const a = new Map(ratnaAdvice(meshaLagna(5)).map((x) => [x.body, x]));
    expect(a.get('mars')!.reasons).toEqual(['lagnaLord']);
    expect(a.get('sun')!.reasons).toEqual(['fifthLord']);
    expect(a.get('jupiter')!.reasons).toEqual(['ninthLord']);
    expect(a.get('mercury')!.avoid).toBe(true); // 3rd and 6th
    expect(a.get('saturn')!.avoid).toBe(true); // 10th and 11th
    expect(a.get('venus')!.avoid).toBe(false); // 2nd and 7th: neutral
    expect(a.get('rahu')!.avoid).toBe(false); // in Tulā: takes Venus, neutral
  });
  it('gives one graha two reasons when it rules two of the houses (Vṛṣabha: Mercury 5th; Saturn 9th; Venus 1st)', () => {
    const a = new Map(ratnaAdvice(meshaLagna(35)).map((x) => [x.body, x]));
    expect(a.get('venus')!.reasons).toEqual(['lagnaLord']);
    expect(a.get('mercury')!.reasons).toEqual(['fifthLord']);
    expect(a.get('saturn')!.reasons).toEqual(['ninthLord']);
    expect(a.get('jupiter')!.avoid).toBe(true); // 8th and 11th
    const leo = new Map(ratnaAdvice(meshaLagna(125)).map((x) => [x.body, x]));
    expect(leo.get('mars')!.reasons).toEqual(['ninthLord']); // Siṁha: Mars owns the 4th and 9th
  });
  it('keeps natural enemies’ stones apart, and the nodes’ from the luminaries’', () => {
    expect(stonesContradict('sun', 'saturn')).toBe(true);
    expect(stonesContradict('sun', 'venus')).toBe(true);
    expect(stonesContradict('mars', 'mercury')).toBe(true); // Mars counts Mercury an enemy
    expect(stonesContradict('jupiter', 'sun')).toBe(false);
    expect(stonesContradict('rahu', 'moon')).toBe(true);
    expect(stonesContradict('ketu', 'jupiter')).toBe(false);
    expect(RATNA.jupiter.stone).toBe('yellowSapphire');
  });
  it('wears a stone on the nakṣatras its graha rules', () => {
    expect(ratnaNakshatras('sun')).toEqual([2, 11, 20]); // Kṛttikā, U. Phalgunī, U. Āṣāḍhā
    expect(ratnaNakshatras('ketu')).toEqual([0, 9, 18]);
  });
});

describe('favourable aspect points', () => {
  it('adds the angles ahead and subtracts them behind, round the circle', () => {
    expect(kpAspectPoints(229, 'separating')).toEqual([247, 259, 265, 283, 289, 301, 337, 349, 355, 13]);
    expect(kpAspectPoints(229, 'applying')).toEqual([211, 199, 193, 175, 169, 157, 121, 109, 103, 85]);
    expect(FAVOURABLE_ANGLES).not.toContain(90);
  });
});
