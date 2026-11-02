import type { Gender } from '../hd/types';

/** 年柱骨重（錢）。 */
const YEAR: Record<string, number> = {
  甲子: 12, 乙丑: 9, 丙寅: 6, 丁卯: 7, 戊辰: 12, 己巳: 5, 庚午: 9, 辛未: 8, 壬申: 7, 癸酉: 8,
  甲戌: 15, 乙亥: 9, 丙子: 16, 丁丑: 8, 戊寅: 8, 己卯: 19, 庚辰: 12, 辛巳: 6, 壬午: 8, 癸未: 7,
  甲申: 5, 乙酉: 15, 丙戌: 6, 丁亥: 16, 戊子: 15, 己丑: 7, 庚寅: 9, 辛卯: 12, 壬辰: 10, 癸巳: 7,
  甲午: 15, 乙未: 6, 丙申: 5, 丁酉: 14, 戊戌: 14, 己亥: 9, 庚子: 7, 辛丑: 7, 壬寅: 9, 癸卯: 12,
  甲辰: 8, 乙巳: 7, 丙午: 13, 丁未: 5, 戊申: 14, 己酉: 5, 庚戌: 9, 辛亥: 17, 壬子: 5, 癸丑: 7,
  甲寅: 12, 乙卯: 8, 丙辰: 8, 丁巳: 6, 戊午: 19, 己未: 6, 庚申: 8, 辛酉: 16, 壬戌: 10, 癸亥: 6,
};

const MONTH = [6, 7, 18, 9, 5, 16, 9, 15, 18, 8, 9, 5];
const DAY = [
  5, 10, 8, 15, 16, 15, 8, 16, 8, 16, 9, 17, 8, 17, 10, 8, 9, 18, 5, 15, 10, 9, 8, 9, 15, 18, 7, 8,
  16, 6,
];
const HOUR: Record<string, number> = {
  子: 16, 丑: 6, 寅: 7, 卯: 10, 辰: 9, 巳: 16, 午: 10, 未: 8, 申: 8, 酉: 9, 戌: 6, 亥: 6,
};

export function boneWeightQian(yearGanZhi: string, lunarMonth: number, lunarDay: number, timeZhi: string): number {
  const y = YEAR[yearGanZhi] ?? 8;
  const m = MONTH[Math.min(11, Math.max(0, lunarMonth - 1))] ?? 5;
  const d = DAY[Math.min(29, Math.max(0, lunarDay - 1))] ?? 8;
  const h = HOUR[timeZhi] ?? 8;
  return y + m + d + h;
}

export function formatBone(qian: number): { liang: number; qian: number } {
  return { liang: Math.floor(qian / 10), qian: qian % 10 };
}

const VERSE_33_FEMALE = {
  verse: '八字命來張張薄，勤儉持家皆可過。年華已如流水過，未年運至受福祿。',
  note: '人心巧靈，善良待人，無心口直，恩中招怨，夫君事敬，姐妹妒嫉，骨肉少親，夫君大配方可，前都平平，凡事須謹慎交接自然和，女命生來八字輕，未年交運隨夫君，方有後發，壽元六十歲。',
};

const VERSE_33_MALE = {
  verse: '早年作事事難成，百計徒勞枉費心。半世自如流水去，後來運到得黃金。',
  note: '此命生人性巧心靈，弄假成真，口快無心，恩中招怨，君子敬佩，小人氣恨，骨肉無援，志在四方。',
};

export function boneVerse(qian: number, gender: Gender): { verse: string; note: string } {
  if (qian === 33) return gender === 'female' ? VERSE_33_FEMALE : VERSE_33_MALE;
  return {
    verse: `骨重 ${formatBone(qian).liang}兩${formatBone(qian).qian}錢，可對照袁天罡稱骨歌。`,
    note: '',
  };
}
