import type { WuXing } from './types';

export const PILLAR_KEYS = ['year', 'month', 'day', 'time'] as const;
export const PILLAR_LABELS = { year: '年柱', month: '月柱', day: '日柱', time: '時柱' } as const;

export const STEMS = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'] as const;
export const BRANCHES = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'] as const;

export const STEM_WX: Record<string, WuXing> = {
  甲: '木', 乙: '木', 丙: '火', 丁: '火', 戊: '土', 己: '土',
  庚: '金', 辛: '金', 壬: '水', 癸: '水',
};

export const BRANCH_WX: Record<string, WuXing> = {
  子: '水', 亥: '水', 寅: '木', 卯: '木', 巳: '火', 午: '火',
  申: '金', 酉: '金', 辰: '土', 戌: '土', 丑: '土', 未: '土',
};

const YANG = new Set(['甲', '丙', '戊', '庚', '壬']);

/** 日干 + 他干 → 十神（簡體庫輸出會再轉繁）。 */
export function tenGodOf(dayGan: string, otherGan: string): string {
  const d = STEMS.indexOf(dayGan as (typeof STEMS)[number]);
  const o = STEMS.indexOf(otherGan as (typeof STEMS)[number]);
  if (d < 0 || o < 0) return '';
  const sameWx = Math.floor(d / 2) === Math.floor(o / 2);
  const samePol = YANG.has(dayGan) === YANG.has(otherGan);
  if (sameWx) return samePol ? '比肩' : '劫財';
  const rel = (Math.floor(o / 2) - Math.floor(d / 2) + 5) % 5;
  if (rel === 1) return samePol ? '食神' : '傷官';
  if (rel === 2) return samePol ? '偏財' : '正財';
  if (rel === 3) return samePol ? '七殺' : '正官';
  return samePol ? '偏印' : '正印';
}

const TW: Record<string, string> = {
  阴阳: '陰陽', 阴: '陰', 阳: '陽',
  鸡: '雞', 龙: '龍', 马: '馬',
  双子: '雙子', 处女: '處女', 射手: '射手', 水瓶: '水瓶', 双鱼: '雙魚',
  芒种: '芒種', 谷雨: '穀雨', 惊蛰: '驚蟄', 大雪: '大雪',
  小满: '小滿', 处暑: '處暑', 白露: '白露',
  仲夏: '夏', 孟夏: '夏', 季夏: '夏', 仲春: '春', 孟春: '春', 季春: '春',
  仲秋: '秋', 孟秋: '秋', 季秋: '秋', 仲冬: '冬', 孟冬: '冬', 季冬: '冬',
  偏财: '偏財', 正财: '正財', 劫财: '劫財', 伤官: '傷官',
  七杀: '七殺', 七煞: '七殺',
  绝: '絕', 临官: '臨官', 冠带: '冠帶', 长生: '長生',
  剑锋金: '劍鋒金', 钗钏金: '釵釧金', 海中金: '海中金',
  炉中火: '爐中火', 山下火: '山下火', 覆灯火: '覆燈火',
  大林木: '大林木', 平地木: '平地木', 桑柘木: '桑柘木',
  路旁土: '路旁土', 城头土: '城頭土', 壁上土: '壁上土', 大驿土: '大驛土',
  天河水: '天河水', 大海水: '大海水', 泉中水: '泉中水',
  日主: '日主',
};

export function toTW(s: string): string {
  if (!s) return s;
  let out = s;
  for (const [k, v] of Object.entries(TW)) {
    if (k !== v) out = out.split(k).join(v);
  }
  return out;
}

export const WX_COLOR: Record<WuXing, string> = {
  木: '#2f7d4a',
  火: '#c0392b',
  土: '#8d6e4c',
  金: '#c9a227',
  水: '#2b6cb0',
};

export const WX_CARD_BG: Record<WuXing, string> = {
  木: '#e7efe4',
  火: '#f8eaea',
  土: '#eeeae4',
  金: '#f7f0d6',
  水: '#e4eef7',
};

export const CHANG_SHENG_COLOR: Record<string, string> = {
  長生: '#1b7f4e',
  沐浴: '#1b7f4e',
  冠帶: '#1b7f4e',
  臨官: '#1b7f4e',
  帝旺: '#1b7f4e',
  衰: '#8a4bb3',
  病: '#8a4bb3',
  死: '#8a4bb3',
  墓: '#8a4bb3',
  絕: '#8a4bb3',
};

export function wxColorOf(ch: string): string {
  return WX_COLOR[wxOfStemOrBranch(ch)];
}

export function wxOfGan(gan: string): WuXing {
  return STEM_WX[gan] ?? '土';
}

export function wxOfZhi(zhi: string): WuXing {
  return BRANCH_WX[zhi] ?? '土';
}

export function wxOfStemOrBranch(ch: string): WuXing {
  return STEM_WX[ch] ?? BRANCH_WX[ch] ?? '土';
}

const CHANG_SHENG = ['長生', '沐浴', '冠帶', '臨官', '帝旺', '衰', '病', '死', '墓', '絕', '胎', '養'] as const;
const CS_START: Record<string, { start: number; dir: 1 | -1 }> = {
  甲: { start: 11, dir: 1 },
  乙: { start: 6, dir: -1 },
  丙: { start: 2, dir: 1 },
  丁: { start: 9, dir: -1 },
  戊: { start: 2, dir: 1 },
  己: { start: 9, dir: -1 },
  庚: { start: 5, dir: 1 },
  辛: { start: 0, dir: -1 },
  壬: { start: 8, dir: 1 },
  癸: { start: 3, dir: -1 },
};

export function ziZuoOf(gan: string, zhi: string): string {
  const meta = CS_START[gan];
  const zi = BRANCHES.indexOf(zhi as (typeof BRANCHES)[number]);
  if (!meta || zi < 0) return '';
  const offset = meta.dir === 1 ? (zi - meta.start + 12) % 12 : (meta.start - zi + 12) % 12;
  return CHANG_SHENG[offset];
}

/** 月支對日主的十二長生旺衰（長生沐浴…）。 */
export const YUE_LING_STAGE: Record<WuXing, Record<string, string>> = {
  木: { 亥: '長生', 子: '沐浴', 丑: '冠帶', 寅: '臨官', 卯: '帝旺', 辰: '衰', 巳: '病', 午: '死', 未: '墓', 申: '絕', 酉: '胎', 戌: '養' },
  火: { 寅: '長生', 卯: '沐浴', 辰: '冠帶', 巳: '臨官', 午: '帝旺', 未: '衰', 申: '病', 酉: '死', 戌: '墓', 亥: '絕', 子: '胎', 丑: '養' },
  土: { 寅: '長生', 卯: '沐浴', 辰: '冠帶', 巳: '臨官', 午: '帝旺', 未: '衰', 申: '病', 酉: '死', 戌: '墓', 亥: '絕', 子: '胎', 丑: '養' },
  金: { 巳: '長生', 午: '沐浴', 未: '冠帶', 申: '臨官', 酉: '帝旺', 戌: '衰', 亥: '病', 子: '死', 丑: '墓', 寅: '絕', 卯: '胎', 辰: '養' },
  水: { 申: '長生', 酉: '沐浴', 戌: '冠帶', 亥: '臨官', 子: '帝旺', 丑: '衰', 寅: '病', 卯: '死', 辰: '墓', 巳: '絕', 午: '胎', 未: '養' },
};

/** 月令旺相休囚死。 */
export function monthStage(dayWx: WuXing, monthZhi: string): Record<WuXing, string> {
  const yueWx = BRANCH_WX[monthZhi] ?? '土';
  const order: WuXing[] = ['木', '火', '土', '金', '水'];
  const i = order.indexOf(yueWx);
  return {
    [order[i]]: '旺',
    [order[(i + 1) % 5]]: '相',
    [order[(i + 4) % 5]]: '休',
    [order[(i + 3) % 5]]: '囚',
    [order[(i + 2) % 5]]: '死',
  } as Record<WuXing, string>;
}

export const WX_GOD_GROUP: Record<WuXing, Record<WuXing, string>> = {
  木: { 木: '比劫', 火: '食傷', 土: '財星', 金: '官殺', 水: '印梟' },
  火: { 火: '比劫', 土: '食傷', 金: '財星', 水: '官殺', 木: '印梟' },
  土: { 土: '比劫', 金: '食傷', 水: '財星', 木: '官殺', 火: '印梟' },
  金: { 金: '比劫', 水: '食傷', 木: '財星', 火: '官殺', 土: '印梟' },
  水: { 水: '比劫', 木: '食傷', 火: '財星', 土: '官殺', 金: '印梟' },
};

export const STEM_HE: [string, string, string][] = [
  ['甲', '己', '土'], ['乙', '庚', '金'], ['丙', '辛', '水'], ['丁', '壬', '木'], ['戊', '癸', '火'],
];

export function stemNotesOf(gans: string[]): string {
  const notes: string[] = [];
  for (const [a, b, hua] of STEM_HE) {
    if (gans.includes(a) && gans.includes(b)) {
      notes.push(`${a}${b}合化${hua}`, `${a}${b}相剋`);
    }
  }
  return notes.length ? `※天干留意：${notes.join('，')}。` : '';
}

export function branchNotesOf(zhis: string[]): string {
  const notes: string[] = [];
  const count: Record<string, number> = {};
  for (const z of zhis) count[z] = (count[z] ?? 0) + 1;
  for (const z of ['午', '酉', '辰', '亥']) {
    if ((count[z] ?? 0) >= 2) notes.push(`${z}${z}自刑`);
  }
  return notes.length ? `※地支留意：${notes.join('，')}。` : '';
}
