import { describe, expect, it } from 'vitest';
import {
  CENTER_GATES,
  CENTER_NAMES_ZH,
  CENTER_ORDER,
  CHANNELS,
  GATE_CENTER,
  GATE_ORDER,
  PLANET_NAMES_ZH,
  PLANET_ORDER,
  PLANET_SYMBOLS,
  PROFILE_ANGLE,
  VALID_PROFILES,
} from '@/lib/hd/constants';
import { CROSS_NAMES } from '@/lib/hd/crossNames';
import { ALL_CHANNELS } from '@/lib/hd/graph';

const ONE_TO_64 = Array.from({ length: 64 }, (_, i) => i + 1);

describe('M1 constant self-checks', () => {
  it('GATE_ORDER is a permutation of 1..64', () => {
    expect(GATE_ORDER).toHaveLength(64);
    expect([...GATE_ORDER].sort((a, b) => a - b)).toEqual(ONE_TO_64);
  });

  it('GATE_ORDER starts with 41 at 302° and ends with 60', () => {
    expect(GATE_ORDER[0]).toBe(41);
    expect(GATE_ORDER[63]).toBe(60);
  });

  it('every gate belongs to exactly one center (64 total)', () => {
    const all = CENTER_ORDER.flatMap((c) => [...CENTER_GATES[c]]);
    expect(all).toHaveLength(64);
    expect([...all].sort((a, b) => a - b)).toEqual(ONE_TO_64);
    for (const g of ONE_TO_64) {
      const owners = CENTER_ORDER.filter((c) => CENTER_GATES[c].includes(g));
      expect(owners, `gate ${g}`).toHaveLength(1);
      expect(GATE_CENTER[g]).toBe(owners[0]);
    }
  });

  it('center sizes match appendix B (3+6+11+8+4+9+7+7+9)', () => {
    expect(CENTER_ORDER.map((c) => CENTER_GATES[c].length)).toEqual([3, 6, 11, 8, 4, 9, 7, 7, 9]);
  });

  it('36 unique channels, each spanning two different centers, small gate first', () => {
    expect(CHANNELS).toHaveLength(36);
    const ids = new Set(CHANNELS.map(([a, b]) => `${a}-${b}`));
    expect(ids.size).toBe(36);
    for (const [a, b] of CHANNELS) {
      expect(a).toBeLessThan(b);
      expect(GATE_CENTER[a]).not.toBe(GATE_CENTER[b]);
    }
    expect(ALL_CHANNELS).toHaveLength(36);
    for (const ch of ALL_CHANNELS) expect(ch.centers[0]).not.toBe(ch.centers[1]);
  });

  it('labels cover every center/planet; planet order has 13 entries', () => {
    expect(Object.keys(CENTER_NAMES_ZH).sort()).toEqual([...CENTER_ORDER].sort());
    expect(PLANET_ORDER).toHaveLength(13);
    expect(new Set(PLANET_ORDER).size).toBe(13);
    for (const p of PLANET_ORDER) {
      expect(PLANET_SYMBOLS[p]).toBeTruthy();
      expect(PLANET_NAMES_ZH[p]).toBeTruthy();
    }
  });

  it('12 legal profiles, each mapped to a cross angle', () => {
    expect(VALID_PROFILES).toHaveLength(12);
    expect(Object.keys(PROFILE_ANGLE).sort()).toEqual([...VALID_PROFILES].sort());
  });

  it('cross name table ships empty (names must be filled by a human)', () => {
    expect(Object.keys(CROSS_NAMES)).toHaveLength(0);
  });
});
