import { describe, expect, it } from 'vitest';
import { computeBazi } from '@/lib/bazi/compute';
import {
  analyzeBaziSynastry,
  baziSynastryItems,
  branchRelations,
  buildBaziSynastryAiPrompt,
  stemRelation,
  usefulElements,
} from '@/lib/bazi/synastry';

const kinds = (x: string, y: string) => branchRelations(x, y).map((r) => r.kind);

describe('branchRelations', () => {
  it('六合', () => {
    expect(kinds('子', '丑')).toEqual(['liuHe']);
    expect(kinds('戌', '卯')).toEqual(['liuHe']);
  });
  it('六沖', () => {
    expect(kinds('子', '午')).toEqual(['liuChong']);
    expect(kinds('亥', '巳')).toEqual(['liuChong']);
  });
  it('a pair can be 沖 and 刑 at once', () => {
    expect(kinds('寅', '申')).toEqual(['liuChong', 'xing']);
    expect(kinds('丑', '未')).toEqual(['liuChong', 'xing']);
  });
  it('半合 carries the 三合局 element', () => {
    expect(branchRelations('申', '子')).toEqual([{ kind: 'banHe', wx: '水' }]);
    expect(branchRelations('午', '戌')).toEqual([{ kind: 'banHe', wx: '火' }]);
  });
  it('相害 / 相刑 / 自刑', () => {
    expect(kinds('子', '未')).toEqual(['hai']);
    expect(kinds('子', '卯')).toEqual(['xing']);
    expect(kinds('寅', '巳')).toEqual(['xing', 'hai']);
    expect(kinds('午', '午')).toEqual(['ziXing']);
    expect(kinds('子', '子')).toEqual([]);
    expect(kinds('子', '寅')).toEqual([]);
  });
});

describe('stemRelation', () => {
  it('天干五合', () => {
    expect(stemRelation('甲', '己')).toEqual({ kind: 'he', hua: '土' });
    expect(stemRelation('癸', '戊')).toEqual({ kind: 'he', hua: '火' });
  });
  it('生 / 剋 / 比和', () => {
    expect(stemRelation('甲', '丙').kind).toBe('aGeneratesB');
    expect(stemRelation('丙', '甲').kind).toBe('bGeneratesA');
    expect(stemRelation('丁', '癸').kind).toBe('bControlsA');
    expect(stemRelation('庚', '甲').kind).toBe('aControlsB');
    expect(stemRelation('甲', '乙').kind).toBe('same');
  });
});

describe('usefulElements', () => {
  it('maps 喜神／用神 god groups to elements relative to the day master', () => {
    // 丁火: 食傷 = 土, 財 = 金, 官 = 水
    expect(usefulElements({ xiShen: '食傷', yongShen: '財官', dayMasterWx: '火' })).toEqual(['土', '金', '水']);
    // 癸水: 印梟 = 金, 比劫 = 水
    expect(usefulElements({ xiShen: '印梟', yongShen: '比劫', dayMasterWx: '水' })).toEqual(['金', '水']);
  });
});

describe('analyzeBaziSynastry — real charts', () => {
  const PLACE = { name: '臺北市', lat: 25.04, lon: 121.53, countryCode: 'TW' };
  // 庚午 辛巳 丁丑 丁未 (male) × 壬申 庚戌 癸未 丙辰 (female) — see /api/bazi.
  const a = computeBazi({ date: '1990-05-12', time: '14:30', timezone: 'Asia/Taipei', place: PLACE, gender: 'male' });
  const b = computeBazi({ date: '1992-11-03', time: '08:15', timezone: 'Asia/Taipei', place: PLACE, gender: 'female' });
  const syn = analyzeBaziSynastry(a, b);

  it('day stems and ten gods', () => {
    expect(syn.dayGanA).toBe('丁');
    expect(syn.dayGanB).toBe('癸');
    expect(syn.stem.kind).toBe('bControlsA');
    expect(syn.tenGodBForA).toBe('七殺');
    expect(syn.tenGodAForB).toBe('偏財');
  });

  it('日支 丑 × 未 is 沖 + 刑 and listed first', () => {
    expect(syn.dayPair?.relations.map((r) => r.kind)).toEqual(['liuChong', 'xing']);
    expect(syn.branchPairs[0]).toBe(syn.dayPair);
  });

  it('finds cross-chart 合 such as 年支午 × 日支未', () => {
    const p = syn.branchPairs.find((x) => x.pillarA === 'year' && x.pillarB === 'day');
    expect(p?.relations.map((r) => r.kind)).toEqual(['liuHe']);
  });

  it('leaves the time pillar out when the birth time is unknown', () => {
    const unknown = analyzeBaziSynastry({ ...a, timeUnknown: true }, b);
    expect(unknown.branchPairs.some((p) => p.pillarA === 'time')).toBe(false);
    expect(syn.branchPairs.some((p) => p.pillarA === 'time')).toBe(true);
  });

  it('report and prompt are clean', () => {
    const items = baziSynastryItems({ name: '甲', chart: a }, { name: '乙', chart: b }, syn);
    const all = items.map((i) => `${i.term}${i.field}${i.meaning}`).join('\n');
    expect(all).not.toMatch(/undefined|null|NaN|你/);
    expect(all).toContain('丑未六沖');
    const prompt = buildBaziSynastryAiPrompt({ name: '甲', chart: a }, { name: '乙', chart: b }, syn);
    expect(prompt).toContain('### 甲');
    expect(prompt).toContain('### 乙');
    expect(prompt).not.toMatch(/undefined|NaN/);
  });
});

describe('日常相處 section', () => {
  const PLACE = { name: '臺北市', lat: 25.04, lon: 121.53, countryCode: 'TW' };
  const chart = (date: string, time: string, gender: 'male' | 'female') =>
    computeBazi({ date, time, timezone: 'Asia/Taipei', place: PLACE, gender });
  const daily = (x: ReturnType<typeof chart>, y: ReturnType<typeof chart>) =>
    baziSynastryItems({ name: '甲', chart: x }, { name: '乙', chart: y }, analyzeBaziSynastry(x, y)).find(
      (i) => i.term === '日常相處',
    );

  const a = chart('1990-05-12', '14:30', 'male'); // 丁日主
  const b = chart('1992-11-03', '08:15', 'female'); // 癸日主
  const c = chart('1985-03-20', '06:00', 'female');

  it('covers the four themes and reflects the pair', () => {
    const d = daily(a, b);
    expect(d).toBeDefined();
    for (const theme of ['【個性】', '【思考方式】', '【處理矛盾】', '【感受親密及愛】']) expect(d!.meaning).toContain(theme);
    expect(d!.meaning).toContain('乙是甲的七殺');
    expect(d!.meaning).toContain('丑未相沖');
    expect(d!.meaning).not.toMatch(/undefined|null|NaN|你/);
  });

  it('differs between two different pairs', () => {
    const d1 = daily(a, b)!.meaning;
    const d2 = daily(a, c)!.meaning;
    expect(d1).not.toEqual(d2);
    // Most lines change, not just one word.
    const l1 = d1.split('\n');
    const l2 = d2.split('\n');
    expect(l1.filter((l, i) => l === l2[i]).length).toBeLessThanOrEqual(1);
  });
});

describe('天干五合 notes are specific to the pair', () => {
  it('甲己 and 戊癸 read differently', () => {
    const PLACE = { name: '臺北市', lat: 25.04, lon: 121.53, countryCode: 'TW' };
    const base = computeBazi({ date: '1990-05-12', time: '14:30', timezone: 'Asia/Taipei', place: PLACE, gender: 'male' });
    const withDay = (gan: string) => ({ ...base, pillars: base.pillars.map((p) => (p.key === 'day' ? { ...p, gan } : p)) });
    const text = (x: string, y: string) => {
      const ca = withDay(x);
      const cb = withDay(y);
      return baziSynastryItems({ name: 'A', chart: ca }, { name: 'B', chart: cb }, analyzeBaziSynastry(ca, cb))[0].meaning;
    };
    expect(text('甲', '己')).toContain('中正之合');
    expect(text('戊', '癸')).toContain('無情之合');
    expect(text('乙', '庚')).toContain('仁義之合');
  });
});
