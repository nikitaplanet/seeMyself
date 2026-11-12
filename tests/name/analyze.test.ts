import { describe, expect, it } from 'vitest';
import { analyzeName, toLingdong, zodiacOf } from '@/lib/name/analyze';
import { dictSize, lookupChar } from '@/lib/name/dict';
import { isNameError, NameError } from '@/lib/name/errors';
import type { GridKey, NameInput } from '@/lib/name/types';
import { wuxingOfNumber, wuxingRelation } from '@/lib/name/wuxing';

const strokes = (char: string): number | undefined => lookupChar(char)?.strokes;

function gridStrokes(input: NameInput): Record<GridKey, number> {
  const { grids } = analyzeName(input);
  return {
    tian: grids.tian.strokes,
    ren: grids.ren.strokes,
    di: grids.di.strokes,
    wai: grids.wai.strokes,
    zong: grids.zong.strokes,
  };
}

function catchNameError(fn: () => unknown): NameError {
  try {
    fn();
  } catch (e) {
    if (isNameError(e)) return e;
    throw e;
  }
  throw new Error('expected a NameError');
}

describe('康熙字典', () => {
  it('收錄至少 5,000 字', () => {
    expect(dictSize()).toBeGreaterThanOrEqual(5000);
  });

  // 規格書 §2A 點名的部首：艸 6、氵 4、扌 4、王旁 5、辶 7、阝左 8、阝右 7。
  // 其餘部首還原（忄 犭 礻 衤 月(肉) 罒）見〈姓名學理論知識(3)〉「有些特殊部首按規定筆劃計算」。
  it.each([
    ['艸 6 畫', { 芬: 10, 英: 11, 華: 14, 萱: 15, 蓉: 16, 葉: 15, 蘇: 22, 蔡: 17, 莊: 13, 蕭: 18 }],
    ['氵→水 4 畫', { 清: 12, 洪: 10, 淑: 12, 江: 7, 海: 11, 涵: 12, 潔: 16, 瀚: 20, 潘: 16, 游: 13 }],
    ['扌→手 4 畫', { 揚: 13, 振: 11 }],
    ['王旁→玉 5 畫', { 玲: 10, 珠: 11, 瑞: 14, 琪: 13, 瑋: 14 }],
    ['辶→辵 7 畫', { 進: 15, 達: 16, 遠: 17 }],
    ['阝在左→阜 8 畫', { 陳: 16, 陽: 17 }],
    ['阝在右→邑 7 畫', { 郭: 15, 鄭: 19, 邱: 12, 鄧: 19 }],
    ['忄→心 4 畫', { 怡: 9, 慎: 14 }],
    ['犭→犬 4 畫', { 獨: 17, 猛: 12 }],
    ['礻→示 5 畫', { 祥: 11, 福: 14, 禮: 18 }],
    ['衤→衣 6 畫', { 裕: 13 }],
    ['月(肉)→肉 6 畫', { 育: 10, 胡: 11 }],
    ['罒→网 6 畫', { 羅: 20 }],
  ])('部首以原字計：%s', (_label, table) => {
    for (const [char, expected] of Object.entries(table)) expect([char, strokes(char)]).toEqual([char, expected]);
  });

  // 對照漢典（zdic.net）各字頁面的「康熙筆畫」。
  it('常見姓名用字對照漢典康熙筆畫', () => {
    const table: Record<string, number> = {
      黃: 12, 龍: 16, 馬: 10, 家: 10, 林: 8, 李: 7, 張: 11, 劉: 15, 楊: 13, 吳: 7, 許: 11, 謝: 17,
      歐: 15, 司: 5, 諸: 16, 葛: 15, 光: 6, 亮: 9, 修: 10, 明: 8, 志: 7, 偉: 11, 淵: 12, 寶: 20,
      德: 15, 慧: 15, 敏: 11, 麗: 19, 雅: 12, 婷: 12, 凱: 12, 豪: 14, 傑: 12, 鑫: 24, 靜: 16, 嘉: 14,
      翔: 12, 臻: 16, 博: 12, 勝: 12, 壽: 14, 興: 15, 與: 14, 燕: 16, 鼎: 13, 龜: 16, 臣: 6, 巨: 5,
      瓜: 5, 印: 6, 延: 7, 政: 8, 敬: 13, 夢: 14, 寬: 15, 黑: 12, 馮: 12, 瀅: 19, 聰: 17, 聖: 13,
      麟: 23, 成: 7, 卿: 11, 萬: 15, 百: 6, 千: 3, 泰: 9, 致: 9, 鴻: 17, 視: 12,
    };
    for (const [char, expected] of Object.entries(table)) expect([char, strokes(char)]).toEqual([char, expected]);
  });

  it('王姓 4 畫（玉部減一畫），玉 5 畫', () => {
    expect(strokes('王')).toBe(4);
    expect(strokes('玉')).toBe(5);
  });

  it('只有部首還原：酒歸酉部、巡歸巛部', () => {
    expect(strokes('酒')).toBe(10);
    expect(strokes('巡')).toBe(7);
  });

  // 〈姓名學理論知識(3)〉(13)：「一、二、三、四、五、六、七、八、九、十」分別按 1–10 畫。
  it('數字依數值計算', () => {
    expect([...'一二三四五六七八九十'].map(strokes)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('五行與字根', () => {
    expect(lookupChar('芬')).toEqual({ char: '芬', strokes: 10, wuxing: '木', roots: ['艸', '八', '刀'] });
    expect(lookupChar('家')?.roots).toEqual(['宀', '豕']);
    expect(lookupChar('清')?.wuxing).toBe('水');
    expect(lookupChar('鈺')?.wuxing).toBe('金');
    expect(lookupChar('炎')?.wuxing).toBe('火');
    expect(lookupChar('坤')?.wuxing).toBe('土');
  });

  it('字根的變形部首一律轉為原字', () => {
    expect(lookupChar('湖')?.roots).toEqual(['水', '十', '口', '肉']);
    expect(lookupChar('陳')?.roots[0]).toBe('阜');
    expect(lookupChar('郭')?.roots.at(-1)).toBe('邑');
    expect(lookupChar('珠')?.roots).toEqual(['玉', '朱']);
    expect(lookupChar('皇')?.roots).toEqual(['白', '王']);
    expect(lookupChar('明')?.roots).toEqual(['日', '月']);
    expect(lookupChar('怡')?.roots[0]).toBe('心');
    expect(lookupChar('揚')?.roots[0]).toBe('手');
    expect(lookupChar('猛')?.roots[0]).toBe('犬');
    expect(lookupChar('進')?.roots).toContain('辵');
    expect(lookupChar('祥')?.roots).toEqual(['示', '羊']);
    expect(lookupChar('羅')?.roots[0]).toBe('网');
    expect(lookupChar('夢')?.roots).toContain('目');
  });
});

describe('analyzeName 五格', () => {
  // 範例與數字出自〈姓名學理論知識(3)：姓名與五格取象〉
  // https://www.secretchina.com/news/gb/2009/03/15/284767p.html
  it('複姓單名：司馬懿', () => {
    // 天格 5+10=15、人格 10+22=32、地格 22+1=23、外格 37-32+1=6、總格 37
    expect(gridStrokes({ surname: '司馬', given: '懿' })).toEqual({ tian: 15, ren: 32, di: 23, wai: 6, zong: 37 });
  });

  it('單姓雙名：劉江海', () => {
    // 人格 15+7=22、地格 7+11=18、外格 33-22+1=12、總格 33；天格 15+1=16
    expect(gridStrokes({ surname: '劉', given: '江海' })).toEqual({ tian: 16, ren: 22, di: 18, wai: 12, zong: 33 });
  });

  it('單姓單名：劉江、李剛', () => {
    // 劉江人格 15+7=22；李剛天格 7+1=8；單姓單名外格固定為 2
    expect(gridStrokes({ surname: '劉', given: '江' })).toEqual({ tian: 16, ren: 22, di: 8, wai: 2, zong: 22 });
    expect(gridStrokes({ surname: '李', given: '剛' })).toEqual({ tian: 8, ren: 17, di: 11, wai: 2, zong: 17 });
  });

  it('複姓雙名：歐陽菲菲', () => {
    // 文中規則：天格兩姓相加、人格姓二+名一、地格兩名相加、外格＝總格－人格（複姓雙名不加 1，即姓一+名二）
    // 歐 15、陽 17、菲 14：天 32、人 31、地 28、總 60、外 60-31=29=15+14
    expect(gridStrokes({ surname: '歐陽', given: '菲菲' })).toEqual({ tian: 32, ren: 31, di: 28, wai: 29, zong: 60 });
  });

  it('複姓天格：司馬光 5+10=15', () => {
    expect(analyzeName({ surname: '司馬', given: '光' }).grids.tian.strokes).toBe(15);
  });

  it('五格五行取個位數，三才為天人地', () => {
    const a = analyzeName({ surname: '劉', given: '江海' });
    expect(a.grids.tian.wuxing).toBe('土'); // 16
    expect(a.grids.ren.wuxing).toBe('木'); // 22
    expect(a.grids.di.wuxing).toBe('金'); // 18
    expect(a.grids.wai.wuxing).toBe('木'); // 12
    expect(a.grids.zong.wuxing).toBe('火'); // 33
    expect(a.sancai).toEqual(['土', '木', '金']);
    expect(a.grids.zong).toEqual({ key: 'zong', strokes: 33, number: 33, wuxing: '火' });
  });

  it('字位與字根', () => {
    const a = analyzeName({ surname: '歐陽', given: '菲菲' });
    expect(a.surname.map((c) => c.position)).toEqual(['surname', 'surname']);
    expect(a.given.map((c) => c.position)).toEqual(['given1', 'given2']);
    const b = analyzeName({ surname: '李', given: '剛' });
    expect(b.given.map((c) => c.position)).toEqual(['given1']);
    expect(b.surname[0]).toMatchObject({ char: '李', strokes: 7, roots: ['木', '子'] });
  });

  it('去除空白後再計算', () => {
    expect(gridStrokes({ surname: ' 劉 ', given: '江　海' })).toEqual(gridStrokes({ surname: '劉', given: '江海' }));
  });

  it('超過 81 的數減 80', () => {
    expect([1, 80, 81, 82, 100, 161, 162].map(toLingdong)).toEqual([1, 80, 81, 2, 20, 81, 2]);
  });
});

describe('生肖（立春為界）', () => {
  it('沒有出生日期就不算生肖', () => {
    expect(analyzeName({ surname: '劉', given: '江海' }).zodiac).toBeUndefined();
  });

  it('2024 年立春在 2 月 4 日', () => {
    expect(zodiacOf('2024-02-03')).toBe('兔');
    expect(zodiacOf('2024-02-04')).toBe('龍');
    // 農曆新年（2 月 10 日）之前、立春之後，已經算龍年
    expect(analyzeName({ surname: '劉', given: '江海', birthDate: '2024-02-05' }).zodiac).toBe('龍');
  });

  it('2025 年立春在 2 月 3 日', () => {
    expect(zodiacOf('2025-02-02')).toBe('龍');
    expect(zodiacOf('2025-02-03')).toBe('蛇');
  });

  it('農曆新年早於立春時仍以立春換年（2023 年春節 1 月 22 日）', () => {
    expect(zodiacOf('2023-01-22')).toBe('虎');
    expect(zodiacOf('2023-02-03')).toBe('虎');
    expect(zodiacOf('2023-02-04')).toBe('兔');
  });

  it('輸出臺灣用字（豬、雞、龍、馬）', () => {
    expect(zodiacOf('2019-12-31')).toBe('豬');
    expect(zodiacOf('2017-06-01')).toBe('雞');
    expect(zodiacOf('2014-06-01')).toBe('馬');
  });

  it('日期格式錯誤', () => {
    expect(catchNameError(() => analyzeName({ surname: '劉', given: '江', birthDate: '2024/02/04' })).code).toBe(
      'INVALID_BIRTH_DATE',
    );
    expect(catchNameError(() => zodiacOf('2023-02-30')).code).toBe('INVALID_BIRTH_DATE');
  });
});

describe('輸入錯誤', () => {
  it('字典沒有的字', () => {
    const err = catchNameError(() => analyzeName({ surname: '王', given: 'a明' }));
    expect(err.code).toBe('UNKNOWN_CHAR');
    expect(err.details).toEqual({ chars: ['a'] });
    expect(err.message).toContain('a');
  });

  it('字數不符', () => {
    expect(catchNameError(() => analyzeName({ surname: '', given: '明' })).code).toBe('INVALID_SHAPE');
    expect(catchNameError(() => analyzeName({ surname: '王', given: '' })).code).toBe('INVALID_SHAPE');
    expect(catchNameError(() => analyzeName({ surname: '歐陽王', given: '明' })).code).toBe('INVALID_SHAPE');
    expect(catchNameError(() => analyzeName({ surname: '王', given: '大小明' })).code).toBe('INVALID_SHAPE');
  });
});

describe('五行', () => {
  it('個位數換算', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 21, 30].map(wuxingOfNumber)).toEqual([
      '木', '木', '火', '火', '土', '土', '金', '金', '水', '水', '木', '水',
    ]);
  });

  it('生剋關係與方向', () => {
    expect(wuxingRelation('木', '火')).toMatchObject({ kind: '相生', direction: 'forward', from: '木', to: '火', label: '木生火' });
    expect(wuxingRelation('火', '木')).toMatchObject({ kind: '相生', direction: 'reverse', from: '木', to: '火' });
    expect(wuxingRelation('金', '木')).toMatchObject({ kind: '相剋', direction: 'forward', label: '金剋木' });
    expect(wuxingRelation('土', '木')).toMatchObject({ kind: '相剋', direction: 'reverse', from: '木', to: '土' });
    expect(wuxingRelation('水', '水')).toMatchObject({ kind: '比和', direction: null });
  });
});
