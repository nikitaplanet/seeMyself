import type { Gender } from '../hd/types';

/** iztro 宮名 → 截圖用詞（交友／事業，並補「宮」）。 */
export const PALACE_DISPLAY: Record<string, string> = {
  命宮: '命宮',
  身宮: '身宮',
  兄弟: '兄弟宮',
  夫妻: '夫妻宮',
  子女: '子女宮',
  財帛: '財帛宮',
  疾厄: '疾厄宮',
  遷移: '遷移宮',
  僕役: '交友宮',
  官祿: '事業宮',
  田宅: '田宅宮',
  福德: '福德宮',
  父母: '父母宮',
};

/** 自命宮起逆時針，對應 iztro 地支宮位遞減。 */
export const PALACE_ORDER = [
  '命宮',
  '兄弟',
  '夫妻',
  '子女',
  '財帛',
  '疾厄',
  '遷移',
  '僕役',
  '官祿',
  '田宅',
  '福德',
  '父母',
] as const;

export const EARTHLY_BRANCHES = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'] as const;

const YANG_STEMS = new Set(['甲', '丙', '戊', '庚', '壬']);

/** 六十甲子納音（成對）。鍵為天干+地支。 */
const NAYIN: Record<string, string> = {
  甲子: '海中金',
  乙丑: '海中金',
  丙寅: '爐中火',
  丁卯: '爐中火',
  戊辰: '大林木',
  己巳: '大林木',
  庚午: '路旁土',
  辛未: '路旁土',
  壬申: '劍鋒金',
  癸酉: '劍鋒金',
  甲戌: '山頭火',
  乙亥: '山頭火',
  丙子: '澗下水',
  丁丑: '澗下水',
  戊寅: '城頭土',
  己卯: '城頭土',
  庚辰: '白蠟金',
  辛巳: '白蠟金',
  壬午: '楊柳木',
  癸未: '楊柳木',
  甲申: '井泉水',
  乙酉: '井泉水',
  丙戌: '屋上土',
  丁亥: '屋上土',
  戊子: '霹靂火',
  己丑: '霹靂火',
  庚寅: '松柏木',
  辛卯: '松柏木',
  壬辰: '長流水',
  癸巳: '長流水',
  甲午: '砂中金',
  乙未: '砂中金',
  丙申: '山下火',
  丁酉: '山下火',
  戊戌: '平地木',
  己亥: '平地木',
  庚子: '壁上土',
  辛丑: '壁上土',
  壬寅: '金箔金',
  癸卯: '金箔金',
  甲辰: '覆燈火',
  乙巳: '覆燈火',
  丙午: '天河水',
  丁未: '天河水',
  戊申: '大驛土',
  己酉: '大驛土',
  庚戌: '釵釧金',
  辛亥: '釵釧金',
  壬子: '桑柘木',
  癸丑: '桑柘木',
  甲寅: '大溪水',
  乙卯: '大溪水',
  丙辰: '沙中土',
  丁巳: '沙中土',
  戊午: '天上火',
  己未: '天上火',
  庚申: '石榴木',
  辛酉: '石榴木',
  壬戌: '大海水',
  癸亥: '大海水',
};

/** 月馬：寅午戌馬在申，申子辰馬在寅，巳酉丑馬在亥，亥卯未馬在巳。 */
const MONTH_HORSE: Record<string, string> = {
  寅: '申',
  午: '申',
  戌: '申',
  申: '寅',
  子: '寅',
  辰: '寅',
  巳: '亥',
  酉: '亥',
  丑: '亥',
  亥: '巳',
  卯: '巳',
  未: '巳',
};

export function displayPalaceName(
  name: string,
  options?: { isSoulPalace?: boolean; isBodyPalace?: boolean },
): string {
  if (options?.isSoulPalace && options?.isBodyPalace) return '命宮-身宮';
  if (PALACE_DISPLAY[name]) return PALACE_DISPLAY[name];
  return name.endsWith('宮') ? name : `${name}宮`;
}

/** 通行本「得／不」對齊截圖用詞「地／陷」。 */
export function displayBrightness(brightness: string): string {
  if (brightness === '得') return '地';
  if (brightness === '不') return '陷';
  return brightness;
}

export function nayinOf(stem: string, branch: string): string {
  return NAYIN[`${stem}${branch}`] ?? '';
}

/** 海中金 + 金四局 → 海中金四局。 */
export function fiveElementsLabel(nayin: string, fiveElementsClass: string): string {
  if (!nayin) return fiveElementsClass;
  const elem = nayin.slice(-1);
  if (fiveElementsClass.startsWith(elem)) return `${nayin.slice(0, -1)}${fiveElementsClass}`;
  return `${nayin}${fiveElementsClass}`;
}

export function yinYangGender(yearStem: string, gender: Gender): string {
  const yangYear = YANG_STEMS.has(yearStem);
  if (gender === 'male') return yangYear ? '陽男' : '陰男';
  return yangYear ? '陽女' : '陰女';
}

export function formatChineseDate(
  yearly: readonly [string, string],
  monthly: readonly [string, string],
  daily: readonly [string, string],
  hourly: readonly [string, string],
): string {
  return `${yearly[0]}${yearly[1]}年${monthly[0]}${monthly[1]}月${daily[0]}${daily[1]}日${hourly[0]}${hourly[1]}時`;
}

export function monthHorseBranch(monthBranch: string): string | undefined {
  return MONTH_HORSE[monthBranch];
}

export function earthlyBranchIndex(branch: string): number {
  const i = EARTHLY_BRANCHES.indexOf(branch as (typeof EARTHLY_BRANCHES)[number]);
  return i < 0 ? 0 : i;
}

export function fixPalaceIndex(n: number): number {
  return ((n % 12) + 12) % 12;
}

/** `soulIndex` 為命宮所在的地支宮位索引（寅起 0）。 */
export function palaceNamesFromSoulIndex(soulIndex: number): string[] {
  const start = fixPalaceIndex(soulIndex);
  return Array.from({ length: 12 }, (_, i) => PALACE_ORDER[fixPalaceIndex(start - i)]);
}

export const MUTAGEN_ORDER = ['祿', '權', '科', '忌'] as const;

export const SCOPE_LABELS = {
  origin: '本命',
  yearly: '流年',
  monthly: '流月',
  daily: '流日',
  hourly: '流時',
} as const;

export type ZiweiScope = keyof typeof SCOPE_LABELS;
