import { describe, it, expect } from 'vitest';
import {
  aspectError,
  classifyMotion,
  findAspects,
  findCrossAspects,
  testAspect,
} from '../../src/aspects/engine.js';
import {
  ASPECT_DEFINITIONS,
  ALL_ASPECTS,
  MAJOR_ASPECTS,
  maxOrbFor,
  STANDARD_ORBS,
  TIGHT_ORBS,
  WIDE_ORBS,
} from '../../src/aspects/definitions.js';
import { findRoots } from '../../src/math/roots.js';
import { norm360 } from '../../src/math/angles.js';
import type { Body, BodyPosition } from '../../src/ephemeris/types.js';

/** Synthetic position, so motion cases can be constructed exactly. */
function pos(body: Body, longitude: number, longitudeSpeed = 0): BodyPosition {
  return {
    body,
    longitude: norm360(longitude),
    latitude: 0,
    distanceAu: 1,
    longitudeSpeed,
    latitudeSpeed: 0,
    distanceSpeed: 0,
    retrograde: longitudeSpeed < 0,
    stationary: false,
    source: 'swiss',
  };
}

/**
 * Independent check: step the bodies forward and back by dt and see which way
 * the orb actually moves. Deliberately a different method from the engine's
 * signed-error rule, so agreement is real corroboration.
 */
function motionByNumericalProbe(
  a: BodyPosition,
  b: BodyPosition,
  angle: number,
  dt = 0.001,
): 'applying' | 'separating' {
  const orbAt = (t: number) =>
    Math.abs(
      aspectError(a.longitude + a.longitudeSpeed * t, b.longitude + b.longitudeSpeed * t, angle),
    );
  return orbAt(dt) < orbAt(-dt) ? 'applying' : 'separating';
}

describe('aspectError is zero at exact and smooth through it', () => {
  it('is zero when the aspect is exact, for every aspect', () => {
    for (const name of ALL_ASPECTS) {
      const angle = ASPECT_DEFINITIONS[name].angle;
      expect(Math.abs(aspectError(100, norm360(100 - angle), angle)), name).toBeLessThan(1e-9);
      expect(Math.abs(aspectError(100, norm360(100 + angle), angle)), name).toBeLessThan(1e-9);
    }
  });

  it('equals the distance from exact', () => {
    // Square, 5 degrees wide
    expect(Math.abs(aspectError(95, 0, 90))).toBeCloseTo(5, 12);
    expect(Math.abs(aspectError(85, 0, 90))).toBeCloseTo(5, 12);
  });

  it('has NO discontinuity across the 0/360 boundary', () => {
    // Walk a square aspect across 0 degrees; the error must move smoothly.
    let previous = aspectError(350, 260, 90);
    for (let lon = 350.1; lon < 370; lon += 0.1) {
      const current = aspectError(norm360(lon), 260, 90);
      expect(Math.abs(current - previous)).toBeLessThan(0.2);
      previous = current;
    }
  });

  it('has NO discontinuity through an exact opposition', () => {
    let previous = aspectError(170, 0, 180);
    for (let lon = 170.5; lon <= 190; lon += 0.5) {
      const current = aspectError(norm360(lon), 0, 180);
      expect(Math.abs(current - previous)).toBeLessThan(1.0);
      previous = current;
    }
  });
});

describe('applying / separating truth table', () => {
  // B fixed at 100; the square is exact when A is at 10 or 190.
  const B = pos('saturn', 100, 0);

  it('direct motion approaching the aspect is APPLYING', () => {
    const hit = testAspect(pos('mars', 5, +1), B, 'square')!;
    expect(hit.motion).toBe('applying');
    expect(hit.orb).toBeCloseTo(5, 9);
  });

  it('direct motion past the aspect is SEPARATING', () => {
    const hit = testAspect(pos('mars', 15, +1), B, 'square')!;
    expect(hit.motion).toBe('separating');
    expect(hit.orb).toBeCloseTo(5, 9);
  });

  it('RETROGRADE motion inverts the direction at the same separation', () => {
    // Same geometry as the separating case, but moving backwards: now applying.
    const hit = testAspect(pos('mars', 15, -1), B, 'square')!;
    expect(hit.motion).toBe('applying');
    expect(hit.orb).toBeCloseTo(5, 9);
  });

  it('retrograde before the aspect is separating', () => {
    const hit = testAspect(pos('mars', 5, -1), B, 'square')!;
    expect(hit.motion).toBe('separating');
  });

  it('a faster-moving B can reverse the direction', () => {
    // A moves +1, B moves +3: relative motion is negative.
    const fast = pos('saturn', 100, +3);
    const hit = testAspect(pos('mars', 5, +1), fast, 'square')!;
    expect(hit.relativeSpeed).toBeCloseTo(-2, 9);
    expect(hit.motion).toBe('separating');
  });

  it('reports STATIONARY rather than guessing when relative speed vanishes', () => {
    const hit = testAspect(pos('mars', 5, 1e-9), pos('saturn', 100, 0), 'square')!;
    expect(hit.motion).toBe('stationary');
  });

  it('two bodies at identical speed are stationary relative to each other', () => {
    const hit = testAspect(pos('mars', 5, 0.5), pos('saturn', 100, 0.5), 'square')!;
    expect(hit.relativeSpeed).toBe(0);
    expect(hit.motion).toBe('stationary');
  });
});

describe('applying / separating cross-checked numerically', () => {
  it('agrees with a numerical probe over a wide sweep of configurations', () => {
    const angles = MAJOR_ASPECTS.map((a) => ASPECT_DEFINITIONS[a].angle);
    let checked = 0;

    for (const angle of angles) {
      for (let lonA = 0; lonA < 360; lonA += 17) {
        for (const speedA of [-1.3, -0.02, 0.5, 2.7]) {
          for (const speedB of [-0.7, 0.03, 1.1]) {
            if (Math.abs(speedA - speedB) < 1e-4) continue;
            const a = pos('mars', lonA, speedA);
            const b = pos('saturn', 100, speedB);

            const analytic = classifyMotion(
              a.longitude, a.longitudeSpeed, b.longitude, b.longitudeSpeed, angle,
            );
            if (analytic === 'stationary') continue;

            // Skip configurations sitting essentially on exact, where the
            // probe straddles the minimum and either answer is defensible.
            if (Math.abs(aspectError(a.longitude, b.longitude, angle)) < 0.01) continue;

            expect(
              analytic,
              `angle=${angle} lonA=${lonA} vA=${speedA} vB=${speedB}`,
            ).toBe(motionByNumericalProbe(a, b, angle));
            checked++;
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(1000);
  });
});

describe('the 0/360 boundary', () => {
  it('detects an exact square straddling 0 degrees', () => {
    // 355 + 90 = 445 = 85
    const hit = testAspect(pos('mars', 355), pos('saturn', 85), 'square')!;
    expect(hit).not.toBeNull();
    expect(hit.orb).toBeLessThan(1e-9);
    expect(hit.exact).toBe(true);
  });

  it('detects a conjunction straddling 0 degrees', () => {
    const hit = testAspect(pos('mars', 359), pos('venus', 1), 'conjunction')!;
    expect(hit.orb).toBeCloseTo(2, 9);
    expect(hit.separation).toBeCloseTo(2, 9);
  });

  it('gets direction right across the boundary', () => {
    // Mars at 359 moving +1 toward Venus at 1: closing.
    const hit = testAspect(pos('mars', 359, +1), pos('venus', 1, 0), 'conjunction')!;
    expect(hit.motion).toBe('applying');
  });
});

describe('the exact opposition — where delta sign carries no direction', () => {
  it('is detected symmetrically from either side', () => {
    const before = testAspect(pos('mars', 175), pos('saturn', 355), 'opposition')!;
    const after = testAspect(pos('mars', 185), pos('saturn', 5), 'opposition')!;
    expect(before.orb).toBeCloseTo(0, 9);
    expect(after.orb).toBeCloseTo(0, 9);
  });

  it('uses relative speed, not delta sign, to decide direction', () => {
    // Mars 5 degrees short of opposing Saturn, closing.
    const applying = testAspect(pos('mars', 175, +1), pos('saturn', 0, 0), 'opposition')!;
    expect(applying.orb).toBeCloseTo(5, 9);
    expect(applying.motion).toBe('applying');

    // Same 5-degree orb on the far side, still moving forward: separating.
    const separating = testAspect(pos('mars', 185, +1), pos('saturn', 0, 0), 'opposition')!;
    expect(separating.orb).toBeCloseTo(5, 9);
    expect(separating.motion).toBe('separating');
  });
});

describe('orb profiles are configuration', () => {
  it('a wider profile admits aspects a tighter one rejects', () => {
    const a = pos('mars', 96);
    const b = pos('saturn', 0);
    expect(testAspect(a, b, 'square', { orbProfile: TIGHT_ORBS })).toBeNull();
    expect(testAspect(a, b, 'square', { orbProfile: STANDARD_ORBS })).not.toBeNull();
    expect(testAspect(a, b, 'square', { orbProfile: WIDE_ORBS })).not.toBeNull();
  });

  it('widens orbs for the luminaries', () => {
    expect(maxOrbFor(STANDARD_ORBS, 'conjunction', 'sun', 'pluto')).toBeCloseTo(10, 9);
    expect(maxOrbFor(STANDARD_ORBS, 'conjunction', 'mars', 'pluto')).toBeCloseTo(8, 9);
  });

  it('an aspect absent from a profile is excluded entirely', () => {
    const profile = { id: 'majors', label: 'Majors', byAspect: { conjunction: 8 } } as const;
    expect(testAspect(pos('mars', 90), pos('saturn', 0), 'square', { orbProfile: profile })).toBeNull();
  });

  it('strength falls from 1 at exact to 0 at the orb limit', () => {
    const exact = testAspect(pos('mars', 90), pos('saturn', 0), 'square')!;
    const edge = testAspect(pos('mars', 97), pos('saturn', 0), 'square')!;
    expect(exact.strength).toBeCloseTo(1, 9);
    expect(edge.strength).toBeCloseTo(0, 6);
  });
});

describe('findAspects', () => {
  const chart = [
    pos('sun', 10, 1),
    pos('moon', 100, 13),
    pos('mars', 190, 0.5),
    pos('saturn', 250, -0.05),
  ];

  it('finds each pair at most once', () => {
    const hits = findAspects(chart);
    const keys = hits.map((h) => [h.bodyA, h.bodyB].sort().join('-'));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('returns hits sorted tightest first', () => {
    const hits = findAspects(chart, { aspects: ALL_ASPECTS });
    for (let i = 1; i < hits.length; i++) {
      expect(hits[i]!.orb).toBeGreaterThanOrEqual(hits[i - 1]!.orb);
    }
  });

  it('finds the sun-mars opposition and sun-moon square', () => {
    const hits = findAspects(chart);
    const names = hits.map((h) => `${h.bodyA}-${h.aspect}-${h.bodyB}`);
    expect(names).toContain('sun-opposition-mars');
    expect(names).toContain('sun-square-moon');
  });

  it('minor aspects appear only when requested', () => {
    const bodies = [pos('sun', 0), pos('mars', 150)]; // quincunx
    expect(findAspects(bodies)).toHaveLength(0);
    expect(findAspects(bodies, { aspects: ALL_ASPECTS })).toHaveLength(1);
  });

  it('returns nothing for an empty or single-body chart', () => {
    expect(findAspects([])).toEqual([]);
    expect(findAspects([pos('sun', 0)])).toEqual([]);
  });
});

describe('definitionally-linked pairs are excluded', () => {
  it('does not report the node axis as an aspect', () => {
    // The south node IS the north node + 180, so this "opposition" is a
    // restatement of the definition: always exact, always stationary, and it
    // would appear in every chart ever produced.
    const bodies = [pos('trueNode', 100, -0.05), pos('southNode', 280, -0.05)];
    expect(findAspects(bodies)).toHaveLength(0);
  });

  it('still reports genuine aspects TO each node', () => {
    const bodies = [
      pos('trueNode', 100, -0.05),
      pos('southNode', 280, -0.05),
      pos('sun', 10, 1),
    ];
    const hits = findAspects(bodies);
    const pairs = hits.map((h) => [h.bodyA, h.bodyB].sort().join('-'));
    expect(pairs).toContain('sun-trueNode');
    expect(pairs).toContain('southNode-sun');
    expect(pairs).not.toContain('southNode-trueNode');
  });

  it('can be overridden by passing an empty exclusion list', () => {
    const bodies = [pos('trueNode', 100, -0.05), pos('southNode', 280, -0.05)];
    expect(findAspects(bodies, { excludePairs: [] })).toHaveLength(1);
  });
});

describe('findCrossAspects (synastry)', () => {
  it('compares every cross pair and no same-chart pair', () => {
    const chartA = [pos('sun', 0), pos('moon', 90)];
    const chartB = [pos('sun', 180), pos('mars', 270)];
    const hits = findCrossAspects(chartA, chartB);
    // A.sun opposes B.sun and squares B.mars; A.moon squares B.sun and opposes B.mars
    expect(hits).toHaveLength(4);
    // A.sun square A.moon must NOT appear
    expect(hits.every((h) => !(h.bodyA === 'sun' && h.bodyB === 'moon'))).toBe(true);
  });
});

describe('multiple exact hits from retrograde motion', () => {
  it('root-finding on aspectError recovers all three passes', () => {
    // Transiting body loops back and forth across a natal point, as an outer
    // planet does around its retrograde station. A first-match search would
    // report only one of the three exact hits.
    const natal = 100;
    const transitLongitude = (t: number) => 85 + 20 * Math.sin(t / 20);
    const error = (t: number) => aspectError(transitLongitude(t), natal, 0);

    // Crossings solve 85 + 20 sin(t/20) = 100 -> t ~ 16.96, 45.87, 142.6
    const roots = findRoots(error, 0, 160, 0.5);
    expect(roots.length).toBe(3);
    expect(roots[0]).toBeCloseTo(16.96, 1);
    expect(roots[1]).toBeCloseTo(45.87, 1);
    expect(roots[2]).toBeCloseTo(142.60, 1);
    for (const t of roots) {
      expect(Math.abs(aspectError(transitLongitude(t), natal, 0))).toBeLessThan(1e-6);
    }
  });
});
