import { ROWS_A } from './numerologyRowsA';
import { ROWS_B } from './numerologyRowsB';

// 五格 81 靈動數知識庫（spec §2B）。能量屬性依傳統 81 數理的吉凶歸類：
// 兩份對照來源都判吉 → auspicious；都判凶 → challenging；半吉、吉凶參半或來源不一致 → mixed
// （來源一判半吉、台灣來源判大凶的 2、44、46、59、62、64、66、69、70 取 challenging）。
// 文案一律轉譯成性格、盲點與日常行為，不寫吉凶判語。

export type EnergyType = 'auspicious' | 'challenging' | 'mixed';
/** 數理的剛柔：hard 過剛（主見強、獨斷）、soft 過柔（猶豫、易退讓）、even 持平。 */
export type Temper = 'hard' | 'soft' | 'even';
export type ContextKey = 'general' | 'love' | 'work';

export interface NumerologyEntry {
    number_or_pattern: number;
    energy_type: EnergyType;
    temper: Temper;
    /** 精煉特質標籤，≤ 15 字。 */
    hook_phrase: string;
    /** 核心行為與心理描述子句，主詞省略，≤ 55 字。 */
    trait_clause: string;
    /** 各領域變體，皆 ≤ 55 字、主詞省略。 */
    context_variants: Record<ContextKey, string>;
    /** 壓力或衝突時的盲點與生活場景，≤ 150 字。 */
    shadow_trigger: string;
    /** 可執行的日常建議，≤ 40 字。 */
    advice_snippet: string;
}

/** [數, 能量 a/c/m, 剛柔 h/s/e, hook, trait, general, love, work, shadow, advice] */
export type NumerologyRow = [
    number,
    'a' | 'c' | 'm',
    'h' | 's' | 'e',
    string,
    string,
    string,
    string,
    string,
    string,
    string,
];

const ENERGY = { a: 'auspicious', c: 'challenging', m: 'mixed' } as const;
const TEMPER = { h: 'hard', s: 'soft', e: 'even' } as const;

export const NUMEROLOGY_LIMITS = { hook: 15, clause: 55, shadow: 150, advice: 40 } as const;

export const NUMEROLOGY_81: NumerologyEntry[] = [...ROWS_A, ...ROWS_B].map(
    ([n, e, t, hook, trait, general, love, work, shadow, advice]) => ({
        number_or_pattern: n,
        energy_type: ENERGY[e],
        temper: TEMPER[t],
        hook_phrase: hook,
        trait_clause: trait,
        context_variants: { general, love, work },
        shadow_trigger: shadow,
        advice_snippet: advice,
    }),
);

const BY_NUMBER = new Map(NUMEROLOGY_81.map((e) => [e.number_or_pattern, e]));

/** 取 1–81 的數理；超出範圍時依慣例減 80 化約。 */
export function numerology(n: number): NumerologyEntry {
    let k = Math.round(n);
    while (k > 81) k -= 80;
    if (k < 1) k = 1;
    return BY_NUMBER.get(k) as NumerologyEntry;
}
