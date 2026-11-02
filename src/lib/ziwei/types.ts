import type { Gender } from '../hd/types';
import type { ZiweiScope } from './labels';

export type { Gender, ZiweiScope };

export interface ZiweiStar {
  name: string;
  type: string;
  brightness: string;
  mutagen?: string;
}

export interface ZiweiFlowStar {
  index: number;
  name: string;
  type: string;
  mutagen?: string;
}

export interface ZiweiPalace {
  index: number;
  name: string;
  displayName: string;
  isSoulPalace: boolean;
  isBodyPalace: boolean;
  isOriginalPalace: boolean;
  heavenlyStem: string;
  earthlyBranch: string;
  majorStars: ZiweiStar[];
  minorStars: ZiweiStar[];
  adjectiveStars: ZiweiStar[];
  changsheng12: string;
  boshi12: string;
  decadal?: {
    range: [number, number];
    heavenlyStem: string;
    earthlyBranch: string;
  };
  ages: number[];
}

export interface ZiweiTiming {
  solarDate: string;
  timeIndex: number;
  timeName: string;
  timeRange: string;
  clockTime: string;
  trueSolarTime: string;
  usedTrueSolar: boolean;
}

export interface ZiweiHoroscopeScope {
  index: number;
  heavenlyStem: string;
  earthlyBranch: string;
  palaceNames: string[];
  mutagen: string[];
  stars: ZiweiFlowStar[];
}

export interface ZiweiHoroscope {
  solarDate: string;
  lunarDate: string;
  lunarYear: number;
  lunarMonth: number;
  lunarDay: number;
  isLeapMonth: boolean;
  nominalAge: number;
  decadal: ZiweiHoroscopeScope;
  age: ZiweiHoroscopeScope;
  yearly: ZiweiHoroscopeScope & {
    suiqian12: string[];
    jiangqian12: string[];
  };
  monthly: ZiweiHoroscopeScope;
  daily: ZiweiHoroscopeScope;
  hourly: ZiweiHoroscopeScope;
  /** 流月起自流年命宮（截圖「流年本宮」）。 */
  monthlyFromYearly: { index: number; palaceNames: string[] };
  dailyFromYearly: { index: number; palaceNames: string[] };
  hourlyFromYearly: { index: number; palaceNames: string[] };
}

export interface ZiweiMutagen {
  star: string;
  mutagen: string;
}

export interface ZiweiChart {
  gender: Gender;
  yinYangGender: string;
  solarDate: string;
  lunarDate: string;
  chineseDate: string;
  solarDateLabel: string;
  lunarDateLabel: string;
  chineseDateLabel: string;
  time: string;
  timeRange: string;
  sign: string;
  zodiac: string;
  soul: string;
  body: string;
  fiveElementsClass: string;
  nayin: string;
  fiveElementsLabel: string;
  earthlyBranchOfSoulPalace: string;
  earthlyBranchOfBodyPalace: string;
  mutagens: ZiweiMutagen[];
  luckIndex: number;
  palaces: ZiweiPalace[];
  timing: ZiweiTiming;
  timeUnknown: boolean;
  horoscope: ZiweiHoroscope;
}

export const TIME_INDEX_NAMES = [
  '早子時',
  '丑時',
  '寅時',
  '卯時',
  '辰時',
  '巳時',
  '午時',
  '未時',
  '申時',
  '酉時',
  '戌時',
  '亥時',
  '晚子時',
] as const;

export const TIME_INDEX_RANGES = [
  '00:00～00:59',
  '01:00～02:59',
  '03:00～04:59',
  '05:00～06:59',
  '07:00～08:59',
  '09:00～10:59',
  '11:00～12:59',
  '13:00～14:59',
  '15:00～16:59',
  '17:00～18:59',
  '19:00～20:59',
  '21:00～22:59',
  '23:00～23:59',
] as const;

export const GENDER_NAMES_ZH = { male: '男', female: '女' } as const;

/** iztro palace index 0 = 寅, then clockwise. CSS grid-area "row / column". */
export const PALACE_GRID_AREA: Record<number, string> = {
  0: '4 / 1',
  1: '3 / 1',
  2: '2 / 1',
  3: '1 / 1',
  4: '1 / 2',
  5: '1 / 3',
  6: '1 / 4',
  7: '2 / 4',
  8: '3 / 4',
  9: '4 / 4',
  10: '4 / 3',
  11: '4 / 2',
};
