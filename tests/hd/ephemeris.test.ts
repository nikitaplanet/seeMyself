import { describe, expect, it } from 'vitest';
import { computeChart } from '@/lib/hd/chart';
import { findDesignJd } from '@/lib/hd/designTime';
import type { EphemBody, EphemerisProvider } from '@/lib/hd/ephemeris/provider';
import { swephProvider } from '@/lib/hd/ephemeris/sweph-provider';
import { HDError } from '@/lib/hd/errors';
import { normalize, wrap180 } from '@/lib/hd/mapping';
import { PLANET_ORDER } from '@/lib/hd/constants';
import type { Activation, Planet, Side } from '@/lib/hd/types';

/** mulberry32 — deterministic PRNG so the "random" dates are reproducible. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pad = (n: number) => String(n).padStart(2, '0');
const rand = mulberry32(20261030);
const MIN_MS = Date.UTC(1800, 0, 1);
const MAX_MS = Date.UTC(2150, 11, 31, 23, 59);
const ZONES = ['UTC', 'Asia/Taipei', 'America/New_York', 'Europe/London', 'Australia/Sydney'];

const samples = Array.from({ length: 20 }, () => {
  const d = new Date(MIN_MS + Math.floor(rand() * (MAX_MS - MIN_MS)));
  const zone = ZONES[Math.floor(rand() * ZONES.length)];
  return {
    date: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`,
    // stay clear of DST transition hours (01:00–03:59) so random samples never hit gaps/overlaps
    time: `${pad(4 + Math.floor(rand() * 20))}:${pad(Math.floor(rand() * 60))}`,
    timezone: zone,
  };
});

const get = (acts: Activation[], side: Side, planet: Planet) => {
  const a = acts.find((x) => x.side === side && x.planet === planet);
  if (!a) throw new Error(`missing ${side}.${planet}`);
  return a;
};

describe('sweph provider', () => {
  it('returns normalized longitudes and finite speeds for every body', () => {
    const bodies: EphemBody[] = ['sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto', 'trueNode', 'meanNode'];
    for (const b of bodies) {
      const p = swephProvider.position(2451545, b);
      expect(p.longitude).toBeGreaterThanOrEqual(0);
      expect(p.longitude).toBeLessThan(360);
      expect(Number.isFinite(p.speed)).toBe(true);
    }
    // Sanity: J2000 Sun ≈ 280.46°
    expect(swephProvider.position(2451545, 'sun').longitude).toBeCloseTo(280.37, 0);
  });

  it('throws HDError(EPHEMERIS_ERROR) on a non-finite JD', () => {
    try {
      swephProvider.position(Number.NaN, 'sun');
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(HDError);
      expect((e as HDError).code).toBe('EPHEMERIS_ERROR');
    }
  });
});

describe.each(samples)('invariants for $date $time $timezone', (input) => {
  it('holds §12.1 ephemeris/designTime invariants', () => {
    for (const nodeMode of ['true', 'mean'] as const) {
      const chart = computeChart({ ...input, options: { nodeMode, sensitivityMinutes: [] } }, swephProvider);
      const acts = chart.activations;
      expect(acts).toHaveLength(26);
      for (const side of ['personality', 'design'] as const) {
        const sideActs = acts.filter((a) => a.side === side);
        expect(sideActs).toHaveLength(13);
        expect(sideActs.map((a) => a.planet)).toEqual(PLANET_ORDER);
        expect(get(acts, side, 'earth').longitude).toBeCloseTo(normalize(get(acts, side, 'sun').longitude + 180), 10);
        expect(get(acts, side, 'southNode').longitude).toBeCloseTo(normalize(get(acts, side, 'northNode').longitude + 180), 10);
        for (const a of sideActs) {
          expect(a.longitude).toBeGreaterThanOrEqual(0);
          expect(a.longitude).toBeLessThan(360);
          expect(a.minutesToLineBoundary).toBeGreaterThanOrEqual(0);
        }
      }
      const pSun = get(acts, 'personality', 'sun').longitude;
      const dSun = get(acts, 'design', 'sun').longitude;
      expect(Math.abs(wrap180(dSun - (pSun - 88)))).toBeLessThan(1e-6);
      const diff = chart.jd.personality - chart.jd.design;
      expect(diff).toBeGreaterThan(86);
      expect(diff).toBeLessThan(93);
      expect(chart.sensitivity).toBeUndefined();
    }
  });
});

describe('designTime bisection fallback', () => {
  it('converges via bisection when Newton is fed a useless speed', () => {
    // Wraps sweph but reports speed 0 for the sun → Newton bails immediately.
    const zeroSpeed: EphemerisProvider = {
      name: 'zero-speed',
      position: (jd, body) => ({ ...swephProvider.position(jd, body), speed: 0 }),
    };
    const jdP = 2451545;
    const viaNewton = findDesignJd(swephProvider, jdP);
    const viaBisection = findDesignJd(zeroSpeed, jdP);
    expect(Math.abs(viaNewton - viaBisection)).toBeLessThan(1e-6);
  });

  it('throws DESIGN_TIME_ERROR when no root is bracketed', () => {
    const frozen: EphemerisProvider = { name: 'frozen', position: () => ({ longitude: 100, speed: 1 }) };
    try {
      findDesignJd(frozen, 2451545);
      throw new Error('should have thrown');
    } catch (e) {
      expect((e as HDError).code).toBe('DESIGN_TIME_ERROR');
    }
  });
});
