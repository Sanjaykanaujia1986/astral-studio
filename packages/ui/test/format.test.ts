import { describe, it, expect } from 'vitest';
import {
  formatAngle,
  formatHouse,
  formatLongitude,
  formatOffset,
  formatSignedDegrees,
  formatSpeed,
  splitForDisplay,
} from '../src/format.js';

describe('the sign can never be shifted by display rounding', () => {
  it('keeps a body at 29 deg 59.5 min of Aries IN ARIES', () => {
    // 29.9917 deg. Rounding to the nearest arcminute gives 30'00", which reads
    // as 0 Taurus — a different sign, element, ruler and house on the page,
    // while the underlying number never moved. Truncation cannot do that.
    const p = splitForDisplay(29.9917, 'minute');
    expect(p.sign).toBe('aries');
    expect(p.degrees).toBe(29);
    expect(p.minutes).toBe(59);
    expect(formatLongitude(29.9917)).toBe("29°59' Ari");
  });

  it('never displays 30 degrees or 60 minutes, hammering the sign boundaries', () => {
    // Brute-forcing the whole circle at arcsecond resolution is a million
    // iterations for no extra coverage: the failure only ever lives in the last
    // fraction of a degree before a boundary. Probe there directly.
    const offsets = [
      0, 1e-12, 1e-9, 1e-7, 1e-5, 0.0001, 0.001, 0.01,
      1 / 3600, 0.5 / 60, 1 / 60, 0.4999, 0.5, 0.9, 0.99, 0.999, 0.9999,
      0.99999, 0.999999, 0.9999999,
    ];
    for (let signIndex = 0; signIndex < 12; signIndex++) {
      for (const offset of offsets) {
        // Just below the top of this sign, and just above its base.
        for (const lon of [signIndex * 30 + 30 - offset, signIndex * 30 + offset]) {
          for (const precision of ['degree', 'minute', 'second'] as const) {
            const p = splitForDisplay(lon, precision);
            expect(p.degrees, `lon=${lon} ${precision}`).toBeGreaterThanOrEqual(0);
            expect(p.degrees, `lon=${lon} ${precision}`).toBeLessThan(30);
            expect(p.minutes, `lon=${lon} ${precision}`).toBeLessThan(60);
            expect(p.seconds, `lon=${lon} ${precision}`).toBeLessThan(60);
          }
        }
      }
    }
  });

  it('holds across a coarse sweep of the whole circle too', () => {
    for (let lon = 0; lon < 360; lon += 0.017) {
      const p = splitForDisplay(lon, 'second');
      expect(p.degrees).toBeLessThan(30);
      expect(p.minutes).toBeLessThan(60);
      expect(p.seconds).toBeLessThan(60);
    }
  });

  it('recovers arcseconds lost to floating-point representation', () => {
    // 24.9525 is stored as 24.952499999...; a bare floor gives 08".
    expect(splitForDisplay(294.9525, 'second').seconds).toBe(9);
    expect(splitForDisplay(30 + 10.5, 'minute').minutes).toBe(30);
  });

  it('takes the sign from the true longitude, not the rounded one', () => {
    expect(splitForDisplay(29.99999, 'degree').sign).toBe('aries');
    expect(splitForDisplay(30.00001, 'degree').sign).toBe('taurus');
  });
});

describe('formatLongitude', () => {
  it('formats at each precision', () => {
    const lon = 294.9525; // 24.9525 deg Capricorn = 24 deg 57' 09"
    expect(formatLongitude(lon, { precision: 'degree' })).toBe('24° Cap');
    expect(formatLongitude(lon, { precision: 'minute' })).toBe("24°57' Cap");
    expect(formatLongitude(lon, { precision: 'second' })).toBe('24°57\'09" Cap');
  });

  it('pads single digits so columns align', () => {
    expect(formatLongitude(1.05)).toBe("01°03' Ari");
  });

  it('can use glyphs instead of abbreviations', () => {
    expect(formatLongitude(294.9525, { style: 'glyph' })).toContain('♑');
  });

  it('handles exactly 0 degrees of a sign', () => {
    expect(formatLongitude(0)).toBe("00°00' Ari");
    expect(formatLongitude(300)).toBe("00°00' Aqu");
  });

  it('normalises out-of-range input rather than producing nonsense', () => {
    expect(formatLongitude(360)).toBe("00°00' Ari");
    expect(formatLongitude(-1)).toBe("29°00' Pis");
  });
});

describe('formatAngle', () => {
  it('formats an orb without a sign name', () => {
    expect(formatAngle(2.2333, 'minute')).toBe("2°13'");
    expect(formatAngle(0.13, 'minute')).toBe("0°07'");
  });

  it('keeps the negative sign on its own', () => {
    expect(formatAngle(-3.5, 'minute')).toBe("-3°30'");
  });
});

describe('formatSignedDegrees', () => {
  it('always shows a sign, because the hemisphere is the point', () => {
    expect(formatSignedDegrees(-21.14)).toBe('-21.14°');
    expect(formatSignedDegrees(23.32)).toBe('+23.32°');
  });

  it('omits the sign when the value rounds to zero', () => {
    // The Sun's ecliptic latitude is about -1e-4 degrees. Rendering that as
    // "-0.00°" reads as a defect rather than as the near-zero it is.
    expect(formatSignedDegrees(0)).toBe('0.00°');
    expect(formatSignedDegrees(-0.0001)).toBe('0.00°');
    expect(formatSignedDegrees(0.0001)).toBe('0.00°');
    // But a value that IS visible at this precision keeps its sign.
    expect(formatSignedDegrees(-0.005)).toBe('-0.01°');
  });
});

describe('formatSpeed', () => {
  it('shows direction explicitly', () => {
    expect(formatSpeed(1.0182)).toBe('+1.0182°/day');
    expect(formatSpeed(-0.7403)).toBe('-0.7403°/day');
  });

  it('stays purely numeric, leaving "stationary" to the caller', () => {
    // Returning an English word here would bake a untranslatable string into a
    // formatting utility. BodyPosition.stationary already carries the flag.
    expect(formatSpeed(1e-9)).toBe('+0.0000°/day');
    expect(formatSpeed(0)).toBe('+0.0000°/day');
  });
});

describe('formatLongitude sign labels', () => {
  it('accepts a translated sign name', () => {
    expect(formatLongitude(294.9525, { signLabel: 'મકર' })).toBe("24°57' મકર");
    expect(formatLongitude(294.9525, { signLabel: 'मकर' })).toBe("24°57' मकर");
  });

  it('falls back to the English abbreviation when none is supplied', () => {
    expect(formatLongitude(294.9525)).toBe("24°57' Cap");
  });
});

describe('formatOffset', () => {
  it('formats whole and half-hour offsets', () => {
    expect(formatOffset(330)).toBe('+05:30');
    expect(formatOffset(-300)).toBe('-05:00');
    expect(formatOffset(0)).toBe('+00:00');
  });

  it('handles the historical fractional offsets that actually occur', () => {
    // Kolkata LMT in 1900 was +05:21:10.
    expect(formatOffset(321.1667)).toBe('+05:21');
    // London LMT was -00:01:15.
    expect(formatOffset(-1.25)).toBe('-00:01');
  });
});

describe('formatHouse', () => {
  it('uses correct English ordinals', () => {
    expect(formatHouse(1)).toBe('1st');
    expect(formatHouse(2)).toBe('2nd');
    expect(formatHouse(3)).toBe('3rd');
    expect(formatHouse(4)).toBe('4th');
    expect(formatHouse(11)).toBe('11th'); // not 11st
    expect(formatHouse(12)).toBe('12th'); // not 12nd
  });
});
