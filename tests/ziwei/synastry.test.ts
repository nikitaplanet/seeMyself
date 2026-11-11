import { describe, expect, it } from 'vitest';
import { computeZiwei } from '@/lib/ziwei/compute';
import {
  analyzeZiweiSynastry,
  bureauElement,
  buildZiweiSynastryAiPrompt,
  elementRelation,
  ziweiFit,
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

describe('ziweiSynastryItems — 日常相處 and specific copy', () => {
  const mk = (date: string, time: string, gender: 'male' | 'female') =>
    computeZiwei({ date, time, timezone: 'Asia/Taipei', place: PLACE, gender });
  const pair = (a: ReturnType<typeof mk>, b: ReturnType<typeof mk>) =>
    ziweiSynastryItems(
      { name: '甲', chart: a, timeUnknown: false },
      { name: '乙', chart: b, timeUnknown: false },
      analyzeZiweiSynastry(a, b),
    );
  const one = pair(mk('1990-05-12', '14:30', 'male'), mk('1992-11-03', '08:15', 'female'));
  const two = pair(mk('1985-01-20', '23:40', 'female'), mk('1998-07-07', '03:10', 'male'));
  const daily = (items: ReturnType<typeof pair>) => items.find((i) => i.term === '日常相處');

  it('adds a 日常相處 section covering the four themes', () => {
    for (const items of [one, two]) {
      const d = daily(items);
      expect(d).toBeDefined();
      for (const theme of ['【個性】', '【思考方式】', '【處理矛盾】', '【親密與愛】']) {
        expect(d!.meaning).toContain(theme);
      }
      expect(d!.meaning).toContain('意見不合時');
      expect(items.map((i) => i.meaning).join('\n')).not.toMatch(/undefined|null|NaN/);
    }
  });

  it('日常相處 changes with the pair', () => {
    const l1 = daily(one)!.meaning.split('\n');
    const l2 = daily(two)!.meaning.split('\n');
    l1.forEach((line, i) => expect(line).not.toBe(l2[i]));
  });

  it('flight lines differ beyond the names (祿權科忌 all get their own wording)', () => {
    for (const items of [one, two]) {
      const lines = items.find((i) => i.term === '四化互飛')!.meaning.split('\n').filter((l) => l.includes('→'));
      const bodies = lines.map((l) => l.split('：')[1].replace(/[甲乙]/g, ''));
      expect(new Set(bodies).size).toBe(bodies.length);
    }
  });

  it('ends with a pair-specific 這段關係的禮物 just before 相處建議', () => {
    const gifts = [one, two].map((items) => {
      const terms = items.map((i) => i.term);
      expect(terms.at(-1)).toBe('相處建議');
      expect(terms.at(-2)).toBe('這段關係的禮物');
      const g = items.at(-2)!.meaning;
      expect(g.length).toBeGreaterThan(40);
      expect(g).not.toMatch(/undefined|null|NaN/);
      return g.replace(/[甲乙]/g, '');
    });
    expect(gifts[0]).not.toBe(gifts[1]);
  });
});

describe('ziweiFit — honest tone only for clearly difficult pairs', () => {
  const mk = (date: string, time: string, gender: 'male' | 'female') =>
    computeZiwei({ date, time, timezone: 'Asia/Taipei', place: PLACE, gender });
  const run = (a: ReturnType<typeof mk>, b: ReturnType<typeof mk>) => {
    const syn = analyzeZiweiSynastry(a, b);
    const pa = { name: '甲', chart: a, timeUnknown: false };
    const pb = { name: '乙', chart: b, timeUnknown: false };
    return { fit: ziweiFit(syn), items: ziweiSynastryItems(pa, pb, syn), prompt: buildZiweiSynastryAiPrompt(pa, pb, syn) };
  };
  // 兩條化忌落在命宮／福德、核心宮位無化祿、五行局水剋火。
  const hard = run(mk('1980-01-15', '18:00', 'female'), mk('1984-10-05', '18:00', 'female'));
  // 同樣五行相剋，但核心化忌只有一條、且有化祿落在交友宮：一般組合。
  const normal = run(mk('1985-01-20', '23:40', 'female'), mk('1998-07-07', '03:10', 'male'));

  it('triggers on the difficult pair only', () => {
    expect(hard.fit).toMatchObject({ difficult: true, keyLu: 0, elementClash: true });
    expect(hard.fit.bondJi).toBeGreaterThanOrEqual(2);
    expect(normal.fit.difficult).toBe(false);
  });

  it('difficult pair: says so up front, retitles the closing item, adds practical advice', () => {
    const daily = hard.items.find((i) => i.term === '日常相處')!.meaning;
    expect(daily.startsWith('【先說在前面】')).toBe(true);
    const terms = hard.items.map((i) => i.term);
    expect(terms).toContain('這段關係的課題與禮物');
    expect(terms).not.toContain('這段關係的禮物');
    const closing = hard.items.find((i) => i.term === '這段關係的課題與禮物')!.meaning;
    expect(closing).toContain('真實而珍貴');
    expect(closing).toContain('需要的是');
    expect(hard.items.find((i) => i.term === '相處建議')!.meaning).toContain('暫停暗號');
    expect(hard.prompt).toContain('結構上較辛苦');
  });

  it('normal pair: no difficulty framing, encouraging prompt', () => {
    const all = normal.items.map((i) => i.meaning).join('\n');
    expect(all).not.toContain('先說在前面');
    expect(all).not.toContain('暫停暗號');
    expect(normal.prompt).toContain('優點先行');
    expect(normal.prompt).not.toContain('結構上較辛苦');
  });
});
