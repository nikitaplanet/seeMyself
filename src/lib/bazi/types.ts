import type { Gender } from '../hd/types';

export type { Gender };

export type WuXing = '木' | '火' | '土' | '金' | '水';

export interface BaziHiddenStem {
  gan: string;
  tenGod: string;
}

export interface BaziPillar {
  key: 'year' | 'month' | 'day' | 'time';
  label: string;
  gan: string;
  zhi: string;
  ganTenGod: string;
  hidden: BaziHiddenStem[];
  diShi: string;
  ziZuo: string;
  xunKong: string;
  naYin: string;
  shensha: string[];
}

export interface BaziDaYun {
  ganZhi: string;
  gan: string;
  zhi: string;
  tenGod: string;
  diShi: string;
  startYear: number;
  endYear: number;
  startAge: number;
  endAge: number;
  years: { ganZhi: string; year: number }[];
}

export interface BaziWuXingScore {
  wx: WuXing;
  percent: number;
  stage: string;
  gods: string;
}

export interface BaziChart {
  gender: Gender;
  timeUnknown: boolean;
  solarLabel: string;
  lunarLabel: string;
  ganZhiLabel: string;
  genderLabel: string;
  yinYang: string;
  shengXiao: string;
  xingZuo: string;
  jieQi: string;
  season: string;
  dayMaster: string;
  dayMasterWx: WuXing;
  siLing: string;
  geJu: string;
  strength: string;
  wangShuai: string;
  mingGong: string;
  shenGong: string;
  taiYuan: string;
  taiXi: string;
  yunStartLabel: string;
  yunStartNote: string;
  yunForward: boolean;
  pillars: BaziPillar[];
  stemNotes: string;
  branchNotes: string;
  daYun: BaziDaYun[];
  wuXing: BaziWuXingScore[];
  helpers: string;
  drainers: string;
  yongShenSummary: string;
  yongShenBody: string;
  tiaoHou: string;
  xiShen: string;
  yongShen: string;
  jiShen: string;
  boneLiang: number;
  boneQian: number;
  boneVerse: string;
  boneNote: string;
}
