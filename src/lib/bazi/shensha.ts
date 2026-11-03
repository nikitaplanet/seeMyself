import { BRANCHES } from './labels';

function sanHePeak(zhi: string): string | null {
  if ('寅午戌'.includes(zhi)) return '午';
  if ('申子辰'.includes(zhi)) return '子';
  if ('巳酉丑'.includes(zhi)) return '酉';
  if ('亥卯未'.includes(zhi)) return '卯';
  return null;
}

function peachOf(yearZhi: string): string | null {
  if ('寅午戌'.includes(yearZhi)) return '卯';
  if ('申子辰'.includes(yearZhi)) return '酉';
  if ('巳酉丑'.includes(yearZhi)) return '午';
  if ('亥卯未'.includes(yearZhi)) return '子';
  return null;
}

/** 紅鸞：子年在卯，逆排。 */
function hongLuanOf(yearZhi: string): string {
  const i = BRANCHES.indexOf(yearZhi as (typeof BRANCHES)[number]);
  return BRANCHES[(3 - i + 12) % 12];
}

/** 披麻：子年在酉，順排。 */
function piMaOf(yearZhi: string): string {
  const i = BRANCHES.indexOf(yearZhi as (typeof BRANCHES)[number]);
  return BRANCHES[(9 + i) % 12];
}

const TIAN_GUAN: Record<string, string[]> = {
  甲: ['未'],
  乙: ['辰'],
  丙: ['巳', '申'],
  丁: ['酉', '亥'],
  戊: ['丑', '未'],
  己: ['子', '寅'],
  庚: ['亥', '丑'],
  辛: ['寅', '午'],
  壬: ['卯', '巳'],
  癸: ['午', '申'],
};

const JIN_SHEN = new Set(['乙丑', '己巳', '癸酉']);

export function natalDeXiu(dayGan: string, monthZhi: string): boolean {
  if ('甲己'.includes(dayGan) && '寅午戌'.includes(monthZhi)) return true;
  if ('乙庚'.includes(dayGan) && '亥卯未'.includes(monthZhi)) return true;
  if ('丙辛'.includes(dayGan) && '申子辰'.includes(monthZhi)) return true;
  if ('丁壬'.includes(dayGan) && '巳酉丑'.includes(monthZhi)) return true;
  if ('戊癸'.includes(dayGan) && '巳午申'.includes(monthZhi)) return true;
  return false;
}

export function shenshaOf(opts: {
  dayGan: string;
  yearZhi: string;
  yearNaYinWx: string;
  pillarKey: 'year' | 'month' | 'day' | 'time';
  pillarGan: string;
  pillarZhi: string;
  pillarGanZhi: string;
  deXiu: boolean;
}): string[] {
  const out: string[] = [];
  if (opts.deXiu) out.push('德秀貴人');
  if ((TIAN_GUAN[opts.dayGan] ?? []).includes(opts.pillarZhi))
    out.push('天官貴人');
  if (opts.pillarKey === 'day' && JIN_SHEN.has(opts.pillarGanZhi))
    out.push('金神');
  const jiang = sanHePeak(opts.yearZhi);
  if (jiang && opts.pillarZhi === jiang) out.push('將星');
  if (opts.pillarKey === 'time') {
    if (opts.yearNaYinWx === '金' && '午卯'.includes(opts.pillarZhi))
      out.push('童子煞');
    if (opts.yearNaYinWx === '木' && '午巳'.includes(opts.pillarZhi))
      out.push('童子煞');
    if (
      (opts.yearNaYinWx === '水' ||
        opts.yearNaYinWx === '火' ||
        opts.yearNaYinWx === '土') &&
      '酉戌'.includes(opts.pillarZhi)
    )
      out.push('童子煞');
  }
  const peach = peachOf(opts.yearZhi);
  if (peach && opts.pillarZhi === peach) out.push('桃花');
  if (opts.pillarZhi === hongLuanOf(opts.yearZhi)) out.push('紅鸞');
  if (opts.pillarZhi === piMaOf(opts.yearZhi)) out.push('披麻');
  return unique(out);
}

function unique(xs: string[]): string[] {
  return [...new Set(xs)];
}

/** 納音字串取五行。 */
export function naYinWx(naYin: string): string {
  if (naYin.includes('金')) return '金';
  if (naYin.includes('木')) return '木';
  if (naYin.includes('水')) return '水';
  if (naYin.includes('火')) return '火';
  return '土';
}
