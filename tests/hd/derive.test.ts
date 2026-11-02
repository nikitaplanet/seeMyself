import { describe, expect, it } from 'vitest';
import { analyzeGates, crossAngleFor, crossNameFor, deriveProfile, isValidProfile } from '@/lib/hd/derive';
import { analyzeGraph, connected } from '@/lib/hd/graph';
import { VALID_PROFILES } from '@/lib/hd/constants';
import type { Authority, HDType } from '@/lib/hd/types';

describe('type/authority truth table — spec §12.1', () => {
  const table: Array<[number[], HDType, Authority]> = [
    [[], 'reflector', 'lunar'],
    [[20, 34], 'manifestingGenerator', 'sacral'],
    [[6, 59], 'generator', 'emotional'],
    [[21, 45], 'manifestor', 'egoManifested'],
    [[25, 51], 'projector', 'egoProjected'],
    [[1, 8], 'projector', 'selfProjected'],
    [[24, 61], 'projector', 'mental'],
    [[18, 58], 'projector', 'splenic'],
    [[6, 59, 12, 22], 'manifestingGenerator', 'emotional'],
  ];
  it.each(table)('gates %j → %s / %s', (gates, type, authority) => {
    const r = analyzeGates(gates);
    expect(r.type).toBe(type);
    expect(r.authority).toBe(authority);
  });

  it('strategy follows type', () => {
    expect(analyzeGates([]).strategy).toBe('等待一個月亮週期（約 28 天）');
    expect(analyzeGates([20, 34]).strategy).toBe('等待回應，行動前告知');
    expect(analyzeGates([1, 8]).strategy).toBe('等待邀請');
  });
});

describe('definition', () => {
  it('no channels → none', () => {
    expect(analyzeGates([1, 2, 3]).definition).toBe('none');
  });
  it('single channel → single', () => {
    expect(analyzeGates([1, 8]).definition).toBe('single');
  });
  it('24-61 + 18-58 → split', () => {
    expect(analyzeGates([24, 61, 18, 58]).definition).toBe('split');
  });
  it('24-61 + 18-58 + 6-59 → tripleSplit', () => {
    expect(analyzeGates([24, 61, 18, 58, 6, 59]).definition).toBe('tripleSplit');
  });
  it('bridging channels join components into one (24-61 + 17-62 + 1-8)', () => {
    // head-ajna (24-61), ajna-throat (17-62), throat-g (1-8): one component
    expect(analyzeGates([24, 61, 17, 62, 1, 8]).definition).toBe('single');
  });
  it('four components → quadrupleSplit', () => {
    // head-ajna 47-64 | g-throat 7-31 | sacral-solarPlexus 6-59 | spleen-root 18-58
    expect(analyzeGates([47, 64, 7, 31, 6, 59, 18, 58]).definition).toBe('quadrupleSplit');
  });
});

describe('graph', () => {
  it('channel formed even when ends come from different sides; centers derived from table', () => {
    const g = analyzeGraph([20, 34]);
    expect(g.channels).toEqual([{ id: '20-34', gates: [20, 34], centers: ['throat', 'sacral'] }]);
    expect(g.definedCenters).toEqual(['throat', 'sacral']);
    expect(connected(g, 'sacral', 'throat')).toBe(true);
    expect(connected(g, 'sacral', 'head')).toBe(false);
  });
  it('hanging gates: active gates outside any formed channel', () => {
    const g = analyzeGraph([1, 8, 2, 41, 41]);
    expect(g.channels.map((c) => c.id)).toEqual(['1-8']);
    expect(g.hangingGates).toEqual([2, 41]);
    expect(g.activeGates).toEqual([1, 2, 8, 41]);
  });
  it('rejects unknown gates', () => {
    expect(() => analyzeGraph([65])).toThrow();
  });
});

describe('profile & cross', () => {
  it('accepts exactly the 12 legal profiles', () => {
    let legal = 0;
    for (let p = 1; p <= 6; p++) {
      for (let d = 1; d <= 6; d++) {
        const ok = VALID_PROFILES.includes(`${p}/${d}`);
        expect(isValidProfile(p, d)).toBe(ok);
        if (ok) {
          legal++;
          expect(deriveProfile(p, d)).toEqual({ personality: p, design: d });
        } else {
          expect(() => deriveProfile(p, d)).toThrow(Error);
        }
      }
    }
    expect(legal).toBe(12);
  });
  it('angle follows profile', () => {
    expect(crossAngleFor({ personality: 4, design: 6 })).toBe('rightAngle');
    expect(crossAngleFor({ personality: 1, design: 3 })).toBe('rightAngle');
    expect(crossAngleFor({ personality: 4, design: 1 })).toBe('juxtaposition');
    expect(crossAngleFor({ personality: 5, design: 1 })).toBe('leftAngle');
    expect(crossAngleFor({ personality: 6, design: 3 })).toBe('leftAngle');
  });
  it('cross name is null while the table is empty', () => {
    expect(crossNameFor('rightAngle', 25)).toBeNull();
  });
});
