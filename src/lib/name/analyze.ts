// 姓名學計算引擎：康熙筆畫 → 五格、三才、生肖。只讀本地字典，不呼叫任何外部服務。
//
// 五格規則（.claude/gemini-code-姓名學.md §3A）與範例出處：
//   〈姓名學理論知識(3)：姓名與五格取象〉https://www.secretchina.com/news/gb/2009/03/15/284767p.html
//   「外格：姓名各字的筆劃數全部相加，減去人格數。如是單字名或單姓，再分別加1。」
// 規格書寫的「外格＝總格－人格＋1」只對單姓雙名成立；四種姓名型態依上述慣例分別是：
//   單姓雙名＝名二＋1、單姓單名＝2、複姓雙名＝姓一＋名二、複姓單名＝姓一＋1。
import { Solar } from 'lunar-javascript';
import { lookupChar } from './dict';
import { NameError } from './errors';
import type { Grid, GridKey, NameAnalysis, NameChar, NameInput, NamePosition, Zodiac } from './types';
import { wuxingOfNumber } from './wuxing';

export const GRID_KEYS: readonly GridKey[] = ['tian', 'ren', 'di', 'wai', 'zong'];

const ZHI = '子丑寅卯辰巳午未申酉戌亥';
const ZODIACS: readonly Zodiac[] = ['鼠', '牛', '虎', '兔', '龍', '蛇', '馬', '羊', '猴', '雞', '狗', '豬'];

/**
 * 筆畫數 → 81 靈動數。81 數「還本歸元」，超過 81 的數減去 80 再論（82 視同 2）。
 * 註：也有流派改用除以 81 取餘數（82 視同 1）；一般姓名的總格很少超過 81。
 */
export function toLingdong(strokes: number): number {
  let n = strokes;
  while (n > 81) n -= 80;
  return n;
}

function makeGrid(key: GridKey, strokes: number): Grid {
  return { key, strokes, number: toLingdong(strokes), wuxing: wuxingOfNumber(strokes) };
}

function splitChars(text: unknown): string[] {
  if (typeof text !== 'string') return [];
  return [...text.normalize('NFC').replace(/[\s　·•・]/gu, '')];
}

/**
 * 以立春為界換算生肖。只有日期、沒有時刻，所以立春當天算新的一年。
 * 交節日以東八區（臺灣時間）的日期為準。
 */
export function zodiacOf(birthDate: string): Zodiac {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthDate);
  if (!m) throw new NameError('INVALID_BIRTH_DATE', { details: { birthDate } });
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const probe = new Date(Date.UTC(y, mo - 1, d));
  if (y < 1 || probe.getUTCFullYear() !== y || probe.getUTCMonth() !== mo - 1 || probe.getUTCDate() !== d) {
    throw new NameError('INVALID_BIRTH_DATE', { details: { birthDate } });
  }
  // 八字年柱以立春交節時刻換年；取當天 23:59:59，讓立春當天整天都算新的一年。
  const zhi = Solar.fromYmdHms(y, mo, d, 23, 59, 59).getLunar().getEightChar().getYearZhi();
  const index = ZHI.indexOf(zhi);
  if (index < 0) throw new NameError('INVALID_BIRTH_DATE', { details: { birthDate } });
  return ZODIACS[index];
}

/**
 * 計算姓名的五格、三才與生肖。姓與名分開傳入；支援單姓／複姓 × 單名／雙名。
 * 字數不符、字典查不到的字、日期格式錯誤時丟出 `NameError`。
 */
export function analyzeName(input: NameInput): NameAnalysis {
  const surnameChars = splitChars(input?.surname);
  const givenChars = splitChars(input?.given);
  if (surnameChars.length < 1 || surnameChars.length > 2 || givenChars.length < 1 || givenChars.length > 2) {
    throw new NameError('INVALID_SHAPE', {
      details: { surnameLength: surnameChars.length, givenLength: givenChars.length },
    });
  }

  const unknown = [...new Set([...surnameChars, ...givenChars].filter((c) => !lookupChar(c)))];
  if (unknown.length > 0) {
    throw new NameError('UNKNOWN_CHAR', {
      message: `「${unknown.join('、')}」不在字典收錄範圍內，暫時無法計算筆畫。`,
      details: { chars: unknown },
    });
  }

  const toNameChar = (char: string, position: NamePosition): NameChar => {
    const entry = lookupChar(char)!;
    return { char, strokes: entry.strokes, wuxing: entry.wuxing, roots: [...entry.roots], position };
  };
  const surname = surnameChars.map((c) => toNameChar(c, 'surname'));
  const given = givenChars.map((c, i) => toNameChar(c, i === 0 ? 'given1' : 'given2'));

  const compoundSurname = surname.length === 2;
  const doubleGiven = given.length === 2;
  const s1 = surname[0].strokes;
  const sLast = surname[surname.length - 1].strokes;
  const g1 = given[0].strokes;
  const gLast = given[given.length - 1].strokes;

  const tian = compoundSurname ? s1 + sLast : s1 + 1;
  const ren = sLast + g1;
  const di = doubleGiven ? g1 + gLast : g1 + 1;
  const zong = [...surname, ...given].reduce((sum, c) => sum + c.strokes, 0);
  // 總格－人格，單姓、單名各補一個假借數 1。
  const wai = zong - ren + (compoundSurname ? 0 : 1) + (doubleGiven ? 0 : 1);

  const grids: Record<GridKey, Grid> = {
    tian: makeGrid('tian', tian),
    ren: makeGrid('ren', ren),
    di: makeGrid('di', di),
    wai: makeGrid('wai', wai),
    zong: makeGrid('zong', zong),
  };

  const analysis: NameAnalysis = {
    surname,
    given,
    grids,
    sancai: [grids.tian.wuxing, grids.ren.wuxing, grids.di.wuxing],
  };
  if (input.birthDate !== undefined && input.birthDate !== '') analysis.zodiac = zodiacOf(input.birthDate);
  return analysis;
}
