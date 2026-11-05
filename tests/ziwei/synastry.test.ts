import { describe, expect, it } from 'vitest';
import { computeZiwei } from '@/lib/ziwei/compute';
import {
  analyzeZiweiSynastry,
  bureauElement,
  buildZiweiSynastryAiPrompt,
  elementRelation,
  ziweiSynastryItems,
} from '@/lib/ziwei/synastry';

const PLACE = { name: '臺北市', lat: 25.04, lon: 121.53, countryCode: 'TW' };

describe('五行局 relations', () => {
  it('reads the element of the bureau', () => {
    expect(bureauElement('土五局')).toBe('土');
    expect(bureauElement('水二局')).toBe('水');
    expect(bureauElement('')).toBeNull();
  });
  it('生 / 剋 / 同', () => {
    expect(elementRelation('土', '土')).toBe('same');
    expect(elementRelation('木', '火')).toBe('aGeneratesB');
    expect(elementRelation('火', '木')).toBe('bGeneratesA');
    expect(elementRelation('土', '水')).toBe('aControlsB');
    expect(elementRelation('水', '土')).toBe('bControlsA');
  });
});

describe('analyzeZiweiSynastry — real charts', () => {
  const a = computeZiwei({ date: '1990-05-12', time: '14:30', timezone: 'Asia/Taipei', place: PLACE, gender: 'male' });
  const b = computeZiwei({ date: '1992-11-03', time: '08:15', timezone: 'Asia/Taipei', place: PLACE, gender: 'female' });
  const syn = analyzeZiweiSynastry(a, b);

  it('flies each person’s four 生年四化 stars into the other chart', () => {
    expect(syn.flights).toHaveLength(8);
    for (const f of syn.flights) {
      const dst = f.from === 'a' ? b : a;
      const at = dst.palaces.find((p) =>
        [...p.majorStars, ...p.minorStars].some((s) => s.name === f.star),
      );
      expect(f.palace).toBe(at?.name ?? null);
      expect(f.key).toBe(['命宮', '夫妻', '僕役', '福德'].includes(f.palace ?? ''));
    }
    expect(syn.flights.filter((f) => f.from === 'a').map((f) => f.mutagen)).toEqual(['祿', '權', '科', '忌']);
  });

  it('maps each 命宮 onto the palace with the same branch in the other chart', () => {
    const soulA = a.palaces.find((p) => p.isSoulPalace)!;
    const inB = b.palaces.find((p) => p.earthlyBranch === soulA.earthlyBranch)!;
    expect(syn.soulAInB).toBe(inB.name);
  });

  it('report and prompt are clean', () => {
    const pa = { name: '甲', chart: a, timeUnknown: false };
    const pb = { name: '乙', chart: b, timeUnknown: true };
    const items = ziweiSynastryItems(pa, pb, syn);
    const all = items.map((i) => `${i.term}${i.field}${i.meaning}`).join('\n');
    expect(all).not.toMatch(/undefined|null|NaN/);
    expect(all).toContain('出生時間不確定');
    const prompt = buildZiweiSynastryAiPrompt(pa, pb, syn);
    expect(prompt).toContain('## 四化互飛');
    expect(prompt).not.toMatch(/undefined|NaN/);
  });
});
