import { describe, expect, it } from 'vitest';
import { computeBazi } from '@/lib/bazi/compute';
import { BAZI_LIMITS, baziMeaningItems, baziThemeCards } from '@/lib/bazi/meaning';
import { analyzeBaziSynastry, baziSynastryItems } from '@/lib/bazi/synastry';
import { BAZI_PAIR_LIMITS, baziPairCards } from '@/lib/bazi/synastryCards';
import type { MeaningItem } from '@/lib/ui/personMeaning';

const PLACE = { name: '臺北市', lat: 25.04776, lon: 121.53185, countryCode: 'TW' };
const len = (s: string) => [...s].length;

function chartAt(i: number, gender: 'male' | 'female' = i % 2 ? 'male' : 'female') {
  // Deterministic spread of birth dates and hours: 1960–2019, every month, all twelve 時辰.
  const y = 1960 + ((i * 7) % 60);
  const m = 1 + ((i * 5) % 12);
  const d = 1 + ((i * 11) % 28);
  const h = (i * 5) % 24;
  const pad = (n: number) => String(n).padStart(2, '0');
  return computeBazi({
    date: `${y}-${pad(m)}-${pad(d)}`,
    time: `${pad(h)}:${pad((i * 13) % 60)}`,
    timezone: 'Asia/Taipei',
    place: PLACE,
    gender,
  });
}

const CHARTS = Array.from({ length: 80 }, (_, i) => chartAt(i));

const PERSONAL_TERMS = [
  '個性與日常特色',
  '思考方式',
  '面對壓力',
  '感情模式',
  '工作與天賦',
  '核心優缺點',
  '面具與真實的反差',
  '內耗與充電說明書',
  '金錢觀與安全感',
  '原生家庭與依附',
  '天賦盲區',
];

const PAIR_TERMS = [
  '一起時的亮點',
  '需要磨合的地方',
  '內心世界與親密',
  '關係的生命課題',
  '吵架與冷戰',
  '兩人內耗與充電說明書',
  '關係中的權力與主導權',
  '一起財運與共事',
  '初見印象與深交後的反轉',
];

/** hook ≤ 20; 【解析】 two paragraphs ≤ 80; scene ≤ 60; advice ≤ 50; basis in a trailing （…）. */
function expectCard(
  it: MeaningItem,
  heads: [string, string, string],
  limits: { hook: number; paragraph: number; scene: number; advice: number },
) {
  expect(it.hook, it.term).toBeTruthy();
  expect(len(it.hook!), `${it.term} hook: ${it.hook}`).toBeLessThanOrEqual(limits.hook);
  const ls = it.meaning.split('\n');
  expect(ls.filter((l) => l.startsWith('【')), it.term).toEqual(heads);
  const at = heads.map((h) => ls.indexOf(h));
  const paras = ls.slice(at[0] + 1, at[1]);
  expect(paras.length, it.term).toBe(2);
  for (const p of paras) {
    expect(len(p), `${it.term}: ${p}`).toBeLessThanOrEqual(limits.paragraph);
    expect(p, it.term).toMatch(/（[^（）]+）$/);
  }
  const scene = ls.slice(at[1] + 1, at[2]);
  expect(scene.length, it.term).toBe(1);
  expect(len(scene[0]), `${it.term}: ${scene[0]}`).toBeLessThanOrEqual(limits.scene);
  const advice = ls.slice(at[2] + 1);
  expect(advice.length, it.term).toBe(1);
  expect(len(advice[0]), `${it.term}: ${advice[0]}`).toBeLessThanOrEqual(limits.advice);
  expect(`${it.hook}${it.meaning}${it.field}`, it.term).not.toMatch(/undefined|null|NaN|\[object/);
}

describe('八字個人盤主題卡片', () => {
  it('covers the eleven guideline themes in order, then the folded reference items', () => {
    for (const chart of CHARTS) {
      const items = baziMeaningItems(chart);
      expect(items.slice(0, 11).map((x) => x.term)).toEqual(PERSONAL_TERMS);
      expect(items.slice(11).every((x) => x.collapsed)).toBe(true);
      expect(new Set(items.map((x) => x.term)).size).toBe(items.length);
    }
  });

  it('every card keeps the card layout and length limits', () => {
    for (const chart of CHARTS) {
      for (const c of baziThemeCards(chart))
        expectCard(c, ['【解析】', '【生活場景】', '【給你的建議】'], BAZI_LIMITS);
    }
  });

  it('has no fatalistic verdicts, jargon without a basis, or non-Taiwan wording', () => {
    for (const chart of CHARTS) {
      const text = baziThemeCards(chart)
        .map((c) => `${c.hook}\n${c.meaning}`)
        .join('\n');
      expect(text).not.toMatch(/剋夫|剋妻|破財|注定|命中註定|質量|視頻|信息|猪/);
      // 十神等術語只出現在句尾括號（依據）裡。
      const main = text.replace(/（[^（）]*）/g, '');
      expect(main).not.toMatch(/比肩|劫財|食神|傷官|正財|偏財|正官|七殺|正印|偏印|身弱|身旺|忌神|喜神|用神/);
      expect(main).not.toMatch(/她|(?<!其)他/);
    }
  });

  it('does not repeat a sentence across the cards of one chart', () => {
    for (const chart of CHARTS) {
      const sentences = baziThemeCards(chart).flatMap((c) =>
        c.meaning
          .split('\n')
          .filter((l) => !l.startsWith('【'))
          .flatMap((l) => l.replace(/（[^（）]*）$/, '').split('。'))
          .filter((x) => len(x) >= 8),
      );
      expect(new Set(sentences).size).toBe(sentences.length);
    }
  });

  it('different charts read differently', () => {
    const texts = CHARTS.map((c) =>
      baziThemeCards(c)
        .map((x) => x.meaning)
        .join('\n'),
    );
    // Whole reports are never identical unless the charts share every keyed element.
    expect(new Set(texts).size).toBeGreaterThanOrEqual(CHARTS.length - 2);
    // Any two charts share only a minority of their card lines.
    let worst = 0;
    for (let i = 0; i < 30; i++) {
      for (let j = i + 1; j < 30; j++) {
        const a = new Set(texts[i].split('\n').filter((l) => !l.startsWith('【')));
        const b = texts[j].split('\n').filter((l) => !l.startsWith('【'));
        worst = Math.max(worst, b.filter((l) => a.has(l)).length / b.length);
      }
    }
    expect(worst).toBeLessThan(0.6);
  });

  it('leaves the time pillar out when the birth time is unknown', () => {
    const chart = computeBazi(
      { date: '1990-05-12', time: '12:00', timezone: 'Asia/Taipei', place: PLACE, gender: 'female' },
      true,
    );
    const mask = baziMeaningItems(chart).find((x) => x.term === '面具與真實的反差');
    expect(mask?.field).toContain('出生時間不確定');
    expect(baziMeaningItems(chart).find((x) => x.term === '四柱')?.meaning).toContain('出生時間不確定');
  });

  it('shows 生肖 in traditional characters', () => {
    // 1995 乙亥年：排盤套件輸出簡體的生肖，顯示時要是「豬」。
    const pig = computeBazi({ date: '1995-06-01', time: '10:00', timezone: 'Asia/Taipei', place: PLACE, gender: 'male' });
    expect(pig.shengXiao).toBe('豬');
  });
});

describe('八字合盤主題卡片', () => {
  const pairs = Array.from({ length: 60 }, (_, i) => [CHARTS[i], CHARTS[(i * 3 + 7) % 80]] as const);

  it('adds the nine pair cards around 日常相處, in guideline order', () => {
    for (const [x, y] of pairs) {
      const syn = analyzeBaziSynastry(x, y);
      const terms = baziSynastryItems({ name: '小明', chart: x }, { name: '阿華', chart: y }, syn).map((i) => i.term);
      expect(terms[0]).toBe('日主關係');
      expect(terms.slice(1, 5)).toEqual(PAIR_TERMS.slice(0, 4));
      expect(terms[5]).toBe('日常相處');
      expect(terms.slice(6, 11)).toEqual(PAIR_TERMS.slice(4));
      expect(terms[terms.length - 1]).toBe('相處建議');
      expect(new Set(terms).size).toBe(terms.length);
    }
  });

  it('every pair card keeps the card layout and length limits, also with three-character names', () => {
    for (const [x, y] of pairs) {
      const syn = analyzeBaziSynastry(x, y);
      const { before, after } = baziPairCards({ name: '王小明', chart: x }, { name: '陳阿華', chart: y }, syn);
      for (const c of [...before, ...after]) {
        expectCard(c, ['【解析】', '【相處場景】', '【給兩人的建議】'], BAZI_PAIR_LIMITS);
        expect(`${c.hook}${c.meaning}`, c.term).not.toMatch(/你|他|她|剋夫|剋妻|猪/);
      }
    }
  });

  it('is blunt only when the pair is marked difficult', () => {
    const hard = analyzeBaziSynastry(
      computeBazi({ date: '1995-11-11', time: '03:30', timezone: 'Asia/Taipei', place: PLACE, gender: 'male' }),
      computeBazi({ date: '2001-06-06', time: '14:30', timezone: 'Asia/Taipei', place: PLACE, gender: 'female' }),
    );
    expect(hard.fit.difficult).toBe(true);
    for (const [x, y] of pairs) {
      const syn = analyzeBaziSynastry(x, y);
      const { before, after } = baziPairCards({ name: '甲', chart: x }, { name: '乙', chart: y }, syn);
      const text = [...before, ...after].map((c) => `${c.hook}${c.meaning}`).join('\n');
      expect(text.includes('坦白說')).toBe(syn.fit.difficult);
    }
  });

  it('different pairs read differently', () => {
    const texts = pairs.map(([x, y]) => {
      const { before, after } = baziPairCards({ name: '甲', chart: x }, { name: '乙', chart: y }, analyzeBaziSynastry(x, y));
      return [...before, ...after].map((c) => c.meaning).join('\n');
    });
    expect(new Set(texts).size).toBe(texts.length);
    let worst = 0;
    for (let i = 0; i < 30; i++) {
      for (let j = i + 1; j < 30; j++) {
        const a = new Set(texts[i].split('\n').filter((l) => !l.startsWith('【')));
        const b = texts[j].split('\n').filter((l) => !l.startsWith('【'));
        worst = Math.max(worst, b.filter((l) => a.has(l)).length / b.length);
      }
    }
    expect(worst).toBeLessThan(0.6);
  });
});
