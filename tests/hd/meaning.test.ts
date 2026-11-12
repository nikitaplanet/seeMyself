import { describe, expect, it } from 'vitest';
import { computeChart } from '@/lib/hd/chart';
import {
  AUTHORITY_NAMES_ZH,
  CENTER_ORDER,
  CHANNELS,
  CROSS_ANGLE_NAMES_ZH,
  DEFINITION_NAMES_ZH,
  TYPE_NAMES_ZH,
  VALID_PROFILES,
} from '@/lib/hd/constants';
import { swephProvider } from '@/lib/hd/ephemeris/sweph-provider';
import { HD_CARD_LIMITS, hdMeaningItems, hdThemeCards, type HdCard } from '@/lib/hd/meaning';
import type { Authority, CenterId, ChartResult, CrossAngle, Definition, HDType } from '@/lib/hd/types';

function hd(date: string, time: string): ChartResult {
  return computeChart({ date, time, timezone: 'Asia/Taipei' }, swephProvider);
}

const base = hd('1990-05-12', '14:30');
const len = (s: string) => Array.from(s).length;

const THEMES = [
  '個性與日常特色',
  '思考方式',
  '面對壓力',
  '感情模式',
  '工作與天賦',
  '核心優缺點',
  '面具與真實的反差',
  '內耗與充電說明書',
  '金錢觀與安全感',
  '天賦盲區',
];

/** Every card part is filled, within the guideline limits, in 台灣用語 and gender-neutral. */
function expectCards(cards: HdCard[], label: string) {
  expect(cards.map((c) => c.term)).toEqual(THEMES);
  for (const c of cards) {
    const where = `${label} ${c.term}`;
    expect(len(c.hook), `${where} hook: ${c.hook}`).toBeLessThanOrEqual(HD_CARD_LIMITS.hook);
    expect(c.hook.length, where).toBeGreaterThan(0);
    for (const p of c.insight) {
      expect(len(p), `${where} insight: ${p}`).toBeLessThanOrEqual(HD_CARD_LIMITS.insight);
      expect(len(p), `${where} insight: ${p}`).toBeGreaterThanOrEqual(30);
    }
    expect(len(c.scene), `${where} scene: ${c.scene}`).toBeLessThanOrEqual(HD_CARD_LIMITS.scene);
    expect(len(c.scene), where).toBeGreaterThanOrEqual(15);
    expect(len(c.advice), `${where} advice: ${c.advice}`).toBeLessThanOrEqual(HD_CARD_LIMITS.advice);
    expect(len(c.advice), where).toBeGreaterThanOrEqual(10);
    const text = [c.hook, ...c.insight, c.scene, c.advice, c.basis, c.field].join('\n');
    expect(text, where).not.toMatch(/undefined|null|NaN|\[object/);
    expect(text, where).not.toMatch(/[他她]|質量|視頻|信息|軟件|網絡|屏幕|項目經理/);
  }
}

describe('hdThemeCards', () => {
  it('real charts give ten cards in guideline order', () => {
    expectCards(hdThemeCards(base), 'base');
    expectCards(hdThemeCards(hd('1993-06-21', '11:18')), 'second');
  });

  it('every type, authority, definition, angle and profile stays within the limits', () => {
    for (const type of Object.keys(TYPE_NAMES_ZH) as HDType[])
      expectCards(hdThemeCards({ ...base, type }), type);
    for (const authority of Object.keys(AUTHORITY_NAMES_ZH) as Authority[])
      expectCards(hdThemeCards({ ...base, authority }), authority);
    for (const definition of Object.keys(DEFINITION_NAMES_ZH) as Definition[])
      expectCards(hdThemeCards({ ...base, definition }), definition);
    for (const angle of Object.keys(CROSS_ANGLE_NAMES_ZH) as CrossAngle[])
      expectCards(hdThemeCards({ ...base, cross: { ...base.cross, angle } }), angle);
    for (const key of VALID_PROFILES) {
      const [personality, design] = key.split('/').map(Number);
      expectCards(hdThemeCards({ ...base, profile: { personality, design } }), key);
    }
  });

  it('every combination of defined centers stays within the limits', () => {
    for (let mask = 0; mask < 1 << CENTER_ORDER.length; mask++) {
      const definedCenters = CENTER_ORDER.filter((_, i) => mask & (1 << i)) as CenterId[];
      expectCards(hdThemeCards({ ...base, definedCenters, channels: [] }), `centers ${mask}`);
    }
  });

  it('every channel (alone and paired) and every design Sun gate has its own copy', () => {
    const all = CHANNELS.map(([a, b]) => ({ ...base.channels[0], id: `${a}-${b}`, gates: [a, b] as [number, number] }));
    const workTexts = new Set<string>();
    for (let i = 0; i < all.length; i++) {
      const one = hdThemeCards({ ...base, channels: [all[i]] });
      expectCards(one, all[i].id);
      workTexts.add(one[4].insight[1]);
      expectCards(hdThemeCards({ ...base, channels: [all[i], all[(i + 1) % all.length]] }), `${all[i].id}+`);
    }
    expect(workTexts.size).toBe(all.length);

    const giftTexts = new Set<string>();
    for (let gate = 1; gate <= 64; gate++) {
      const [pSun, pEarth, , dEarth] = base.cross.gates;
      const cards = hdThemeCards({ ...base, cross: { ...base.cross, gates: [pSun, pEarth, gate, dEarth] } });
      expectCards(cards, `gate ${gate}`);
      giftTexts.add(cards[9].insight[0]);
    }
    expect(giftTexts.size).toBe(64);
  });

  it('two different charts do not read alike', () => {
    const one = hdThemeCards(base);
    const two = hdThemeCards(hd('1985-01-20', '23:10'));
    const body = (c: HdCard) => [c.hook, ...c.insight, c.scene, c.advice].join('\n');
    const same = one.filter((c, i) => body(c) === body(two[i])).length;
    expect(same).toBe(0);
    // No sentence is used twice inside one report.
    for (const cards of [one, two]) {
      const sentences = cards
        .flatMap((c) => [...c.insight, c.scene, c.advice])
        .flatMap((t) => t.split('。'))
        .map((x) => x.trim())
        .filter((x) => x.length > 10);
      expect(new Set(sentences).size).toBe(sentences.length);
    }
  });
});

describe('hdMeaningItems', () => {
  it('puts the theme cards first then the term reference', () => {
    const items = hdMeaningItems(base);
    expect(items.slice(0, THEMES.length).map((x) => x.term)).toEqual(THEMES);
    for (const it of items.slice(0, THEMES.length)) {
      expect(it.hook).toBeTruthy();
      expect(it.collapsed).toBeFalsy();
      expect(it.meaning.split('\n').filter((l) => l.startsWith('【'))).toEqual(['【解析】', '【生活場景】', '【給你的建議】']);
      expect(it.meaning.split('\n').at(-1)).toMatch(/^（依據：.+）$/);
    }
    const rest = items.slice(THEMES.length);
    expect(rest.map((x) => x.term)).toEqual(
      expect.arrayContaining(['類型', '策略', '內在權威', '人生角色', '定義型態', '輪迴交叉']),
    );
    for (const it of rest) expect(it.collapsed).toBeFalsy();
  });
});
