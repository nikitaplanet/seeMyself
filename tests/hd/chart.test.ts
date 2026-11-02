import { describe, expect, it } from 'vitest';
import { computeChart } from '@/lib/hd/chart';
import type { EphemBody, EphemerisProvider } from '@/lib/hd/ephemeris/provider';
import { swephProvider } from '@/lib/hd/ephemeris/sweph-provider';
import { HDError } from '@/lib/hd/errors';
import { normalize } from '@/lib/hd/mapping';
import type { BirthInput } from '@/lib/hd/types';

const TAIPEI: BirthInput = { date: '1990-05-12', time: '14:30', timezone: 'Asia/Taipei' };
const J2000 = 2451545;

/** Deterministic fake: every body moves linearly from a chosen longitude at J2000. */
function linearProvider(table: Record<EphemBody, [number, number]>): EphemerisProvider {
  return {
    name: 'linear-fake',
    position: (jd, body) => {
      const [lon0, speed] = table[body];
      return { longitude: normalize(lon0 + speed * (jd - J2000)), speed };
    },
  };
}

const MOON_SPEED = 13.176;
const FAKE_TABLE: Record<EphemBody, [number, number]> = {
  sun: [100, 1],
  moon: [302.9375 - 0.1, MOON_SPEED], // 0.1° (~10.9 min) before gate 41 line 1→2 boundary
  mercury: [150, 1.2],
  venus: [200, 1.1],
  mars: [250, 0.5],
  jupiter: [10, 0.08],
  saturn: [50, 0.03],
  uranus: [80, 0.01],
  neptune: [120, 0.006],
  pluto: [170, -0.004],
  trueNode: [30, -0.05],
  meanNode: [31, -0.053],
};
const fake = linearProvider(FAKE_TABLE);
const FAKE_INPUT: BirthInput = { date: '2000-01-01', time: '12:00', timezone: 'UTC' };

describe('computeChart (sweph)', () => {
  const chart = computeChart(TAIPEI, swephProvider);

  it('produces a structurally complete result', () => {
    expect(chart.activations).toHaveLength(26);
    expect(chart.utc.personality).toBe('1990-05-12T06:30:00Z');
    expect(chart.utc.design).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    expect(chart.jd.personality - chart.jd.design).toBeGreaterThan(86);
    expect(chart.jd.personality - chart.jd.design).toBeLessThan(93);
    expect(chart.meta).toEqual({ nodeMode: 'true', ephemeris: 'swisseph-moshier', version: '1.0.0' });
    expect(chart.input).toBe(TAIPEI);
    expect(chart.cross.name).toBeNull();
  });

  it('activeGates records the side(s) of every activation', () => {
    for (const a of chart.activations) expect(chart.activeGates[a.gate]).toContain(a.side);
    for (const sides of Object.values(chart.activeGates)) {
      expect(new Set(sides).size).toBe(sides.length);
    }
  });

  it('cross gates are personality sun/earth, design sun/earth', () => {
    const g = (side: string, planet: string) =>
      chart.activations.find((a) => a.side === side && a.planet === planet)?.gate;
    expect(chart.cross.gates).toEqual([g('personality', 'sun'), g('personality', 'earth'), g('design', 'sun'), g('design', 'earth')]);
  });

  it('defaults to 4 sensitivity offsets', () => {
    expect(chart.sensitivity?.offsets).toEqual([-30, -15, 15, 30]);
  });

  it('sensitivityMinutes: [] skips sensitivity', () => {
    expect(computeChart({ ...TAIPEI, options: { sensitivityMinutes: [] } }, swephProvider).sensitivity).toBeUndefined();
  });

  it('nodeMode mean is reported in meta', () => {
    const mean = computeChart({ ...TAIPEI, options: { nodeMode: 'mean', sensitivityMinutes: [] } }, swephProvider);
    expect(mean.meta.nodeMode).toBe('mean');
  });

  it('propagates HDError codes from time.ts', () => {
    try {
      computeChart({ date: '2021-11-07', time: '01:30', timezone: 'America/New_York' }, swephProvider);
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(HDError);
      expect((e as HDError).code).toBe('AMBIGUOUS_LOCAL_TIME');
    }
  });

  it('runs with 4 sensitivity offsets well under 300 ms', () => {
    computeChart(TAIPEI, swephProvider); // warm-up
    const runs = 5;
    const t0 = performance.now();
    for (let i = 0; i < runs; i++) computeChart(TAIPEI, swephProvider);
    const avg = (performance.now() - t0) / runs;
    expect(avg).toBeLessThan(100);
  });
});

describe('sensitivity (deterministic fake provider)', () => {
  const chart = computeChart(FAKE_INPUT, fake);

  it('design is exactly 88 days earlier with a 1°/day sun', () => {
    expect(chart.jd.personality).toBe(J2000);
    expect(chart.jd.personality - chart.jd.design).toBeCloseTo(88, 6);
  });

  it('minutesToLineBoundary uses current speed', () => {
    const moon = chart.activations.find((a) => a.side === 'personality' && a.planet === 'moon');
    expect(moon?.gate).toBe(41);
    expect(moon?.line).toBe(1);
    expect(moon?.minutesToLineBoundary).toBeCloseTo((0.1 / MOON_SPEED) * 1440, 6);
  });

  it('records the personality moon line change only for later offsets', () => {
    const s = chart.sensitivity;
    expect(s).toBeDefined();
    const moonChanges = s?.changes.filter((c) => c.field === 'activations.personality.moon.line') ?? [];
    expect(moonChanges.map((c) => c.offsetMinutes)).toEqual([15, 30]);
    for (const c of moonChanges) {
      expect(c.from).toBe(1);
      expect(c.to).toBe(2);
    }
    expect(s?.stable).toBe(true);
  });

  it('flags instability when the profile flips within the offsets', () => {
    // Sun 0.01° (14.4 min at 1°/day) before the gate 41 line 1→2 boundary → profile 1/4 becomes 2/4.
    const edge = linearProvider({ ...FAKE_TABLE, sun: [302.9375 - 0.01, 1] });
    const c = computeChart(FAKE_INPUT, edge);
    expect(c.profile).toEqual({ personality: 1, design: 4 });
    expect(c.sensitivity?.stable).toBe(false);
    const profileChanges = c.sensitivity?.changes.filter((x) => x.field === 'profile') ?? [];
    expect(profileChanges.map((x) => [x.offsetMinutes, x.from, x.to])).toEqual([
      [15, '1/4', '2/4'],
      [30, '1/4', '2/4'],
    ]);
  });
});
