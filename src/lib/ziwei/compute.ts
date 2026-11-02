import { astro } from 'iztro';
import { solar2lunar } from 'lunar-lite';
import { DateTime } from 'luxon';
import type { BirthInput, Gender } from '../hd/types';
import {
  displayPalaceName,
  earthlyBranchIndex,
  fiveElementsLabel,
  fixPalaceIndex,
  formatChineseDate,
  monthHorseBranch,
  MUTAGEN_ORDER,
  nayinOf,
  palaceNamesFromSoulIndex,
  yinYangGender,
} from './labels';
import { luckIndex } from './luck';
import { toZiweiTiming, timeIndexFromHour } from './time';
import { GENDER_NAMES_ZH, type ZiweiChart, type ZiweiFlowStar, type ZiweiHoroscope, type ZiweiHoroscopeScope, type ZiweiMutagen, type ZiweiPalace, type ZiweiStar } from './types';

function text(v: unknown): string {
  return v == null ? '' : String(v);
}

function pair(v: unknown): [string, string] {
  return Array.isArray(v) && v.length >= 2 ? [text(v[0]), text(v[1])] : ['', ''];
}

function starOf(v: unknown): ZiweiStar {
  const s = v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
  const mutagen = text(s.mutagen);
  return {
    name: text(s.name),
    type: text(s.type),
    brightness: text(s.brightness),
    ...(mutagen ? { mutagen } : {}),
  };
}

function starsOf(v: unknown): ZiweiStar[] {
  return Array.isArray(v) ? v.map(starOf).filter((s) => s.name !== '') : [];
}

function palaceOf(v: unknown): ZiweiPalace | null {
  if (!v || typeof v !== 'object') return null;
  const p = v as Record<string, unknown>;
  if (typeof p.index !== 'number') return null;
  const decadal =
    p.decadal && typeof p.decadal === 'object'
      ? (p.decadal as { range?: [number, number]; heavenlyStem?: unknown; earthlyBranch?: unknown })
      : null;
  const name = text(p.name);
  const isBodyPalace = p.isBodyPalace === true;
  const isSoulPalace = name === '命宮';
  return {
    index: p.index,
    name,
    displayName: displayPalaceName(name, { isSoulPalace, isBodyPalace }),
    isSoulPalace,
    isBodyPalace,
    isOriginalPalace: p.isOriginalPalace === true,
    heavenlyStem: text(p.heavenlyStem),
    earthlyBranch: text(p.earthlyBranch),
    majorStars: starsOf(p.majorStars),
    minorStars: starsOf(p.minorStars),
    adjectiveStars: starsOf(p.adjectiveStars),
    changsheng12: text(p.changsheng12),
    boshi12: text(p.boshi12),
    ...(decadal && Array.isArray(decadal.range) && decadal.range.length === 2
      ? {
          decadal: {
            range: [Number(decadal.range[0]), Number(decadal.range[1])] as [number, number],
            heavenlyStem: text(decadal.heavenlyStem),
            earthlyBranch: text(decadal.earthlyBranch),
          },
        }
      : {}),
    ages: Array.isArray(p.ages) ? p.ages.filter((n): n is number => typeof n === 'number') : [],
  };
}

function addMonthHorse(palaces: ZiweiPalace[], monthBranch: string): void {
  const horseBranch = monthHorseBranch(monthBranch);
  if (!horseBranch) return;
  const palace = palaces.find((p) => p.earthlyBranch === horseBranch);
  if (!palace) return;
  const names = [...palace.majorStars, ...palace.minorStars, ...palace.adjectiveStars].map((s) => s.name);
  if (names.includes('月馬')) return;
  palace.adjectiveStars.unshift({ name: '月馬', type: 'tianma', brightness: '' });
}

function natalMutagens(palaces: ZiweiPalace[]): ZiweiMutagen[] {
  const found: ZiweiMutagen[] = [];
  for (const p of palaces) {
    for (const s of [...p.majorStars, ...p.minorStars]) {
      if (s.mutagen) found.push({ star: s.name, mutagen: s.mutagen });
    }
  }
  return MUTAGEN_ORDER.flatMap((m) => found.filter((x) => x.mutagen === m));
}

function flowStarsOf(stars: unknown): ZiweiFlowStar[] {
  if (!Array.isArray(stars)) return [];
  const out: ZiweiFlowStar[] = [];
  stars.forEach((arr, index) => {
    if (!Array.isArray(arr)) return;
    for (const item of arr) {
      const s = starOf(item);
      if (!s.name) continue;
      out.push({ index, name: s.name, type: s.type, ...(s.mutagen ? { mutagen: s.mutagen } : {}) });
    }
  });
  return out;
}

function namesOf(v: unknown): string[] {
  return Array.isArray(v) ? v.map(text).filter((s) => s !== '') : [];
}

function scopeOf(v: unknown): ZiweiHoroscopeScope {
  const s = v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
  return {
    index: typeof s.index === 'number' ? s.index : -1,
    heavenlyStem: text(s.heavenlyStem),
    earthlyBranch: text(s.earthlyBranch),
    palaceNames: namesOf(s.palaceNames),
    mutagen: namesOf(s.mutagen),
    stars: flowStarsOf(s.stars),
  };
}

function hourFromClock(clockTime: string): number {
  const n = Number.parseInt(clockTime.slice(0, 2), 10);
  return Number.isFinite(n) ? n : 12;
}

export interface ComputeZiweiOptions {
  targetDate?: string;
  targetTimeIndex?: number;
}

export function computeZiwei(
  input: BirthInput & { gender: Gender },
  timeUnknown = false,
  options?: ComputeZiweiOptions,
): ZiweiChart {
  const timing = toZiweiTiming({
    date: input.date,
    time: input.time,
    timezone: input.timezone,
    lon: input.place?.lon,
    timeUnknown,
    disambiguation: input.options?.disambiguation,
  });
  const raw = astro.bySolar(timing.solarDate, timing.timeIndex, GENDER_NAMES_ZH[input.gender], true, 'zh-TW');
  const palaces = (raw.palaces ?? []).map(palaceOf).filter((p): p is ZiweiPalace => p !== null);
  if (palaces.length !== 12) {
    throw new Error('ZIWEI_PALACE_COUNT');
  }

  const chinese = raw.rawDates.chineseDate;
  const yearly = pair(chinese.yearly);
  const monthly = pair(chinese.monthly);
  const daily = pair(chinese.daily);
  const hourly = pair(chinese.hourly);
  addMonthHorse(palaces, monthly[1]);

  const soul = palaces.find((p) => p.isSoulPalace);
  const nayin = soul ? nayinOf(soul.heavenlyStem, soul.earthlyBranch) : '';
  const fiveElementsClass = text(raw.fiveElementsClass);
  const lunar = raw.rawDates.lunarDate;
  const clockHour = hourFromClock(timing.clockTime);
  const [sy, sm, sd] = timing.solarDate.split('-').map(Number);

  const zone = DateTime.now().setZone(input.timezone);
  const targetDate = options?.targetDate ?? zone.toISODate() ?? timing.solarDate;
  const targetTimeIndex =
    options?.targetTimeIndex !== undefined ? options.targetTimeIndex : timeIndexFromHour(zone.hour);
  const horoscope = buildHoroscope(raw.horoscope(targetDate, targetTimeIndex), targetDate, hourly[1]);

  return {
    gender: input.gender,
    yinYangGender: yinYangGender(yearly[0], input.gender),
    solarDate: text(raw.solarDate),
    lunarDate: text(raw.lunarDate),
    chineseDate: text(raw.chineseDate),
    solarDateLabel: `${sy}年 ${sm}月${sd}日${clockHour}時`,
    lunarDateLabel: `${lunar.lunarYear}年 ${lunar.lunarMonth}月 ${lunar.lunarDay}日${text(raw.time)}`,
    chineseDateLabel: formatChineseDate(yearly, monthly, daily, hourly),
    time: text(raw.time),
    timeRange: text(raw.timeRange),
    sign: text(raw.sign),
    zodiac: text(raw.zodiac),
    soul: text(raw.soul),
    body: text(raw.body),
    fiveElementsClass,
    nayin,
    fiveElementsLabel: fiveElementsLabel(nayin, fiveElementsClass),
    earthlyBranchOfSoulPalace: text(raw.earthlyBranchOfSoulPalace),
    earthlyBranchOfBodyPalace: text(raw.earthlyBranchOfBodyPalace),
    mutagens: natalMutagens(palaces),
    luckIndex: luckIndex(palaces),
    palaces,
    timing,
    timeUnknown,
    horoscope,
  };
}

function buildHoroscope(
  raw: ReturnType<ReturnType<typeof astro.bySolar>['horoscope']>,
  targetDate: string,
  birthHourBranch: string,
): ZiweiHoroscope {
  const lunar = solar2lunar(targetDate);
  const yearly = scopeOf(raw.yearly);
  const monthly = scopeOf(raw.monthly);
  const daily = scopeOf(raw.daily);
  const hourly = scopeOf(raw.hourly);
  const decadal = scopeOf(raw.decadal);
  const age = scopeOf(raw.age);
  const yearlyDec =
    raw.yearly && typeof raw.yearly === 'object' && 'yearlyDecStar' in raw.yearly
      ? (raw.yearly as { yearlyDecStar?: { suiqian12?: unknown; jiangqian12?: unknown } }).yearlyDecStar
      : undefined;

  const monthlyFromYearlyIndex = fixPalaceIndex(yearly.index + lunar.lunarMonth - 1);
  const dailyFromYearlyIndex = fixPalaceIndex(monthlyFromYearlyIndex + lunar.lunarDay - 1);
  const hourlyFromYearlyIndex = fixPalaceIndex(dailyFromYearlyIndex + earthlyBranchIndex(hourly.earthlyBranch || birthHourBranch));

  return {
    solarDate: text(raw.solarDate),
    lunarDate: text(raw.lunarDate),
    lunarYear: lunar.lunarYear,
    lunarMonth: lunar.lunarMonth,
    lunarDay: lunar.lunarDay,
    isLeapMonth: lunar.isLeap === true,
    nominalAge: raw.age?.nominalAge ?? 0,
    decadal,
    age,
    yearly: {
      ...yearly,
      suiqian12: namesOf(yearlyDec?.suiqian12),
      jiangqian12: namesOf(yearlyDec?.jiangqian12),
    },
    monthly,
    daily,
    hourly,
    monthlyFromYearly: {
      index: monthlyFromYearlyIndex,
      palaceNames: palaceNamesFromSoulIndex(monthlyFromYearlyIndex),
    },
    dailyFromYearly: {
      index: dailyFromYearlyIndex,
      palaceNames: palaceNamesFromSoulIndex(dailyFromYearlyIndex),
    },
    hourlyFromYearly: {
      index: hourlyFromYearlyIndex,
      palaceNames: palaceNamesFromSoulIndex(hourlyFromYearlyIndex),
    },
  };
}
