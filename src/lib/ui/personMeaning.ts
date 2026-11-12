export interface MeaningItem {
    term: string;
    field: string;
    meaning: string;
    /** Optional one-line hook shown above the meaning (星盤準則 hook_quote, ≤ 20 字). */
    hook?: string;
    /** Start folded; the reader opens it on demand (reference material such as 星盤依據). */
    collapsed?: boolean;
}

/** 人類圖個人盤文案 lives in src/lib/hd/meaning.ts (theme cards + folded term reference). */
export { hdMeaningItems } from '@/lib/hd/meaning';

/** 紫微斗數個人盤文案 lives in src/lib/ziwei/meaning.ts (theme cards + folded references). */
export { ziweiMeaningItems } from '@/lib/ziwei/meaning';

// 八字的個人盤文案在 src/lib/bazi/meaning.ts；這裡保留原本的匯出名稱。
export { baziMeaningItems } from '@/lib/bazi/meaning';
