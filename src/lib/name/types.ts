// 姓名學：共用型別。計算引擎（analyze.ts）產出 NameAnalysis，文案組裝（report.ts）只讀它。

export type Wuxing = '木' | '火' | '土' | '金' | '水';

export type Zodiac = '鼠' | '牛' | '虎' | '兔' | '龍' | '蛇' | '馬' | '羊' | '猴' | '雞' | '狗' | '豬';

/** 字在姓名中的位置；複姓兩字都是 surname，單名只有 given1。 */
export type NamePosition = 'surname' | 'given1' | 'given2';

export interface NameChar {
    char: string;
    /** 康熙字典筆畫（部首以原字計，例如 氵 算 4 畫）。 */
    strokes: number;
    /** 字義五行。 */
    wuxing: Wuxing;
    /** 拆字後的字根（單一部件字元，例如「家」→ ['宀', '豕']），供生肖喜忌比對。 */
    roots: string[];
    position: NamePosition;
}

export type GridKey = 'tian' | 'ren' | 'di' | 'wai' | 'zong';

export interface Grid {
    key: GridKey;
    /** 該格的筆畫數（未化約）。 */
    strokes: number;
    /** 對應的 81 靈動數（1–81；超過 81 依慣例化約）。 */
    number: number;
    /** 由個位數換算：1,2 木；3,4 火；5,6 土；7,8 金；9,0 水。 */
    wuxing: Wuxing;
}

export interface NameInput {
    surname: string;
    given: string;
    /** 出生日期（ISO，YYYY-MM-DD），用來以立春為界換算生肖；沒有就不做生肖分析。 */
    birthDate?: string;
}

export interface NameAnalysis {
    surname: NameChar[];
    given: NameChar[];
    grids: Record<GridKey, Grid>;
    /** 天、人、地三格的五行。 */
    sancai: [Wuxing, Wuxing, Wuxing];
    zodiac?: Zodiac;
}
