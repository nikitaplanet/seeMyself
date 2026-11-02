import { describe, expect, it } from 'vitest';
import { mapLongitude, minutesToLineBoundary, normalize, wrap180 } from '@/lib/hd/mapping';

describe('mapLongitude — spec §6.3 vectors', () => {
  it('302.0 → 41.1.1.1.1', () => {
    expect(mapLongitude(302.0)).toEqual({ gate: 41, line: 1, color: 1, tone: 1, base: 1 });
  });
  it('301.999 → 60.6.6.6.5', () => {
    expect(mapLongitude(301.999)).toEqual({ gate: 60, line: 6, color: 6, tone: 6, base: 5 });
  });
  it('307.625 → gate 19 line 1', () => {
    expect(mapLongitude(307.625)).toMatchObject({ gate: 19, line: 1 });
  });
  it('0.0 → gate 25 line 2', () => {
    expect(mapLongitude(0)).toMatchObject({ gate: 25, line: 2 });
  });
  it('359.9999999 → gate 25 line 2 (same as just before 0)', () => {
    expect(mapLongitude(359.9999999)).toMatchObject({ gate: 25, line: 2 });
  });
  it('-58.0 ≡ 302.0', () => {
    expect(mapLongitude(-58.0)).toEqual(mapLongitude(302.0));
  });
  it('662.0 ≡ 302.0', () => {
    expect(mapLongitude(662.0)).toEqual(mapLongitude(302.0));
  });
});

describe('normalize / wrap180', () => {
  it('normalize maps into [0, 360)', () => {
    for (const x of [-720, -360, -1e-15, 0, 359.999, 360, 721.5]) {
      const n = normalize(x);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(360);
    }
    expect(normalize(-58)).toBeCloseTo(302, 12);
  });
  it('wrap180 maps into (-180, 180]', () => {
    expect(wrap180(180)).toBe(180);
    expect(wrap180(-180)).toBe(180);
    expect(wrap180(190)).toBeCloseTo(-170, 12);
    expect(wrap180(-190)).toBeCloseTo(170, 12);
    expect(wrap180(0)).toBe(0);
  });
});

describe('minutesToLineBoundary — spec §8.2', () => {
  it('direct motion measures to the next line boundary', () => {
    // 302.5° is 0.5° into gate 41 line 1 (line width 0.9375°): 0.4375° left at 1°/day.
    expect(minutesToLineBoundary(302.5, 1)).toBeCloseTo(0.4375 * 1440, 6);
  });
  it('retrograde motion measures to the lower line boundary', () => {
    expect(minutesToLineBoundary(302.5, -0.5)).toBeCloseTo((0.5 / 0.5) * 1440, 6);
  });
  it('is finite for zero speed', () => {
    expect(Number.isFinite(minutesToLineBoundary(302.5, 0))).toBe(true);
  });
});
