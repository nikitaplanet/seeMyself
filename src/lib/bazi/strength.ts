import { BRANCH_WX, monthStage, STEM_WX, toTW, WX_GOD_GROUP } from './labels';
import type { BaziHiddenStem, BaziWuXingScore, WuXing } from './types';

const HIDE_WEIGHTS = [1, 0.4, 0.15];
const STAGE_MULT: Record<string, number> = { 旺: 1.55, 相: 1.4, 休: 0.75, 囚: 0.95, 死: 0.55 };

export function wuXingScores(
  gans: string[],
  zhis: string[],
  hidden: string[][],
  monthZhi: string,
  dayWx: WuXing,
): BaziWuXingScore[] {
  const raw: Record<WuXing, number> = { 木: 0, 火: 0, 土: 0, 金: 0, 水: 0 };
  for (const g of gans) raw[STEM_WX[g] ?? '土'] += 1;
  zhis.forEach((z, i) => {
    const hides = hidden[i] ?? [];
    const monthBoost = i === 1 ? 2 : 1;
    hides.forEach((h, hi) => {
      raw[STEM_WX[h] ?? BRANCH_WX[z] ?? '土'] += (HIDE_WEIGHTS[hi] ?? 0.1) * monthBoost;
    });
    if (hides.length === 0) raw[BRANCH_WX[z] ?? '土'] += monthBoost;
  });
  const stages = monthStage(dayWx, monthZhi);
  const weighted: Record<WuXing, number> = { 木: 0, 火: 0, 土: 0, 金: 0, 水: 0 };
  let total = 0;
  (Object.keys(raw) as WuXing[]).forEach((wx) => {
    const v = raw[wx] * (STAGE_MULT[stages[wx]] ?? 1);
    weighted[wx] = v;
    total += v;
  });
  const groups = WX_GOD_GROUP[dayWx];
  return (['木', '火', '土', '金', '水'] as WuXing[]).map((wx) => ({
    wx,
    percent: total > 0 ? Math.round((weighted[wx] / total) * 100) : 0,
    stage: stages[wx],
    gods: groups[wx],
  }));
}

export function classifyStrength(scores: BaziWuXingScore[], dayWx: WuXing): {
  strength: string;
  wangShuai: string;
  helpers: string;
  drainers: string;
} {
  const byGods: Record<string, number> = {};
  for (const s of scores) byGods[s.gods] = (byGods[s.gods] ?? 0) + s.percent;
  const help = (byGods['比劫'] ?? 0) + (byGods['印梟'] ?? 0);
  const wangShuai = help < 28 ? '太弱' : help < 40 ? '偏弱' : help > 62 ? '太旺' : help > 52 ? '偏旺' : '中和';
  const strength = help < 45 ? '身弱' : help > 55 ? '身旺' : '中和';
  const helpers = (['比劫', '印梟'] as const)
    .flatMap((g) => scores.filter((s) => s.gods === g).map((s) => s.wx))
    .join('');
  const drainers = (['官殺', '財星', '食傷'] as const)
    .flatMap((g) => scores.filter((s) => s.gods === g).map((s) => s.wx))
    .join('');
  return { strength, wangShuai, helpers, drainers };
}

export function geJuOf(monthHidden: BaziHiddenStem[], monthGanTenGod: string): string {
  const ben = monthHidden[0]?.tenGod;
  if (ben && ben !== '比肩' && ben !== '劫財') return `${ben}格`;
  if (monthGanTenGod && monthGanTenGod !== '比肩' && monthGanTenGod !== '劫財')
    return `${monthGanTenGod}格`;
  return '建祿格';
}

const TIAO_HOU: Partial<Record<string, string>> = {
  癸午: '癸水生於午月，庚辛為生身之本，但丁火司權，金難敵火，宜兼有比劫，方得庚辛之用。',
  癸巳: '癸水生於巳月，火土當權，宜用庚辛生身，兼比劫方能任財。',
  癸未: '癸水生於未月，土旺金囚，先取庚辛，次用比劫。',
};

export function yongShenText(opts: {
  dayGan: string;
  dayWx: WuXing;
  monthZhi: string;
  geJu: string;
  strength: string;
  monthStageName: string;
  di: string;
  shi: string;
}): { summary: string; body: string; tiaoHou: string; xiShen: string; yongShen: string; jiShen: string } {
  const weak = opts.strength === '身弱';
  const yongShen = weak ? '比劫' : '財官';
  const xiShen = weak ? '印梟' : '食傷';
  const jiShen = weak ? '食傷、官殺' : '比劫、印梟';
  const ling = opts.monthStageName === '旺' || opts.monthStageName === '相' ? '得令' : '失令';
  const summary = `${opts.strength}-${opts.geJu}`;
  const lingText =
    opts.dayWx === '水' && ling === '失令' ? '水囚失令' : ling;
  const wealthHeavy = weak && opts.geJu.includes('財');
  const body = weak
    ? `${opts.dayGan}生於${opts.monthZhi}月，${lingText}，${opts.di}，${opts.shi}。日主${opts.strength}，局成${opts.geJu}。${wealthHeavy ? '日主弱，財多，身轉弱，' : ''}取比劫幫身奪財為用，喜印生身，忌食傷生財，官殺剋身。`
    : `${opts.dayGan}生於${opts.monthZhi}月，${lingText}，${opts.di}，${opts.shi}。日主${opts.strength}，局成${opts.geJu}。宜洩秀用財官，忌比劫爭財、印星晦食。`;
  const tiaoHou = TIAO_HOU[`${opts.dayGan}${opts.monthZhi}`] ?? '調候宜參月令寒暖燥濕，冬月喜火，夏月喜水金。';
  return { summary, body: toTW(body), tiaoHou, xiShen, yongShen, jiShen };
}

/** 人元司令：從當月節起算，取該日當令之藏干。 */
export function siLingOf(monthZhi: string, dayOfLing: number): string {
  const table: Record<string, [string, number][]> = {
    寅: [['戊', 7], ['丙', 7], ['甲', 16]],
    卯: [['甲', 10], ['乙', 20]],
    辰: [['乙', 9], ['癸', 3], ['戊', 18]],
    巳: [['戊', 5], ['庚', 9], ['丙', 16]],
    午: [['丙', 10], ['己', 9], ['丁', 11]],
    未: [['丁', 9], ['乙', 3], ['己', 18]],
    申: [['戊', 7], ['壬', 7], ['庚', 16]],
    酉: [['庚', 10], ['辛', 20]],
    戌: [['辛', 9], ['丁', 3], ['戊', 18]],
    亥: [['戊', 7], ['甲', 7], ['壬', 16]],
    子: [['壬', 10], ['癸', 20]],
    丑: [['癸', 9], ['辛', 3], ['己', 18]],
  };
  const rows = table[monthZhi] ?? [['戊', 30]];
  let left = Math.max(1, dayOfLing);
  for (const [gan, days] of rows) {
    if (left <= days) return `${gan}${STEM_WX[gan] ?? ''}`;
    left -= days;
  }
  const last = rows[rows.length - 1];
  return `${last[0]}${STEM_WX[last[0]] ?? ''}`;
}
