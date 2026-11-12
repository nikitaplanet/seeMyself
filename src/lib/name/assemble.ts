import type { MeaningItem } from '@/lib/ui/personMeaning';
import { numerology, type ContextKey, type NumerologyEntry } from './kb/numerology81';
import { relation, RELATION_TAG, type Relation } from './kb/wuxing';
import {
    AVOID_EFFECTS,
    LIKE_EFFECTS,
    matchRoot,
    type AvoidEffect,
    type LikeEffect,
    type ZodiacRootRule,
} from './kb/zodiacRules';
import type { Grid, GridKey, NameAnalysis, NameChar, Wuxing, Zodiac } from './types';

// 姓名學文案組裝的共用工具：字數上限、全域已使用追蹤器、句型挑選、標籤與卡片格式。
// 個人盤（report.ts）與合盤（synastry.ts）都用這裡的函式，本身不含任何文案。

/** 卡片各欄位的字數上限（spec §4B）：hook ≤ 15、解析與場景各 ≤ 150、建議 ≤ 40。 */
export const NAME_LIMITS = { hook: 15, block: 150, advice: 40 } as const;

/** 權重（spec §3A）。 */
export const GRID_WEIGHT: Record<GridKey, number> = { tian: 0, ren: 35, di: 30, wai: 20, zong: 30 };
export const SANCAI_WEIGHT = 25;
export const POSITION_WEIGHT = { surname: 15, given1: 30, given2: 30 } as const;

export const GRID_LABEL: Record<GridKey, string> = {
    tian: '天格',
    ren: '人格',
    di: '地格',
    wai: '外格',
    zong: '總格',
};

export const POSITION_LABEL = { surname: '姓氏', given1: '名一', given2: '名二' } as const;

export const len = (s: string) => [...s].length;

/** 由姓名的字與筆畫得到固定的種子：同一個名字永遠挑到同一組句型。 */
export function seedOf(a: NameAnalysis): number {
    let h = 7;
    for (const c of [...a.surname, ...a.given])
        h = (h * 31 + (c.char.codePointAt(0) ?? 0) + c.strokes * 17) % 1000003;
    return h;
}

export const sentencesOf = (text: string): string[] =>
    text
        .split(/(?<=[。！？]|[。！？][」』])(?![」』])/)
        .map((s) => s.trim())
        .filter(Boolean);

/**
 * 全域已使用追蹤器（spec §4A）：usedRuleIds 記錄用過的數理變體、字根面向與片段，
 * sentences 記錄已寫進報告的句子，確保同一份報告沒有重複的句子。
 */
export class Tracker {
    readonly usedRuleIds = new Set<string>();
    private readonly sentences = new Set<string>();

    has(id: string): boolean {
        return this.usedRuleIds.has(id);
    }

    /** 這個 ID 還沒用過就占用並回傳 true。 */
    claim(id: string): boolean {
        if (this.usedRuleIds.has(id)) return false;
        this.usedRuleIds.add(id);
        return true;
    }

    fresh(text: string): boolean {
        return sentencesOf(text).every((s) => !this.sentences.has(s));
    }

    commit(text: string): void {
        for (const s of sentencesOf(text)) this.sentences.add(s);
    }
}

/** 從 seed 決定起點，依序輪過所有句型（同名同結果，不同名不同起點）。 */
export function rotate<T>(items: readonly T[], seed: number, salt: number): T[] {
    const n = items.length;
    const start = (((seed + salt * 7) % n) + n) % n;
    return items.map((_, i) => items[(start + i) % n]);
}

export const fill = (frame: string, slots: Record<string, string>): string =>
    frame.replace(/\{(\w+)\}/g, (m, k: string) => slots[k] ?? m);

/** 第一個不超過字數上限、且沒有重複句子的候選；都不符合時取最短的。 */
export function fit(t: Tracker, candidates: string[], limit: number = NAME_LIMITS.block): string {
    const ok = candidates.find((c) => len(c) <= limit && t.fresh(c));
    const chosen = ok ?? [...candidates].sort((x, y) => len(x) - len(y))[0];
    t.commit(chosen);
    return chosen;
}

/** 在不超過上限、不重複的前提下，把補充句接在後面。 */
export function append(
    t: Tracker,
    base: string,
    extra: string | undefined,
    limit: number = NAME_LIMITS.block,
): string {
    if (!extra || len(base) + len(extra) > limit || !t.fresh(extra)) return base;
    t.commit(extra);
    return base + extra;
}

export type Variant = 'trait' | ContextKey;

export const variantText = (e: NumerologyEntry, v: Variant): string =>
    v === 'trait' ? e.trait_clause : e.context_variants[v];

/**
 * 取某一格數理的子句：依 order 找第一個這份報告還沒用過的變體（用過 general 就換 work／love）。
 * 全部用過時回傳 undefined，呼叫端順延到下一個權重項目。
 */
export function numberClause(
    t: Tracker,
    grid: Grid,
    order: Variant[],
    self: string,
): string | undefined {
    const e = numerology(grid.number);
    for (const v of order)
        if (t.claim(`n${e.number_or_pattern}:${v}`))
            return variantText(e, v).replace(/\{self\}/g, self);
    return undefined;
}

export const gridTag = (g: Grid, prefix = ''): string =>
    `${prefix}${GRID_LABEL[g.key]} ${g.strokes} 畫（${g.wuxing}）`;

export const relationTag = (a: Wuxing, b: Wuxing): string => RELATION_TAG[relation(a, b)](a, b);

/** 標準化的五行對：比和「木木」、相生「生者+被生者」、相剋「剋者+被剋者」；swap 表示第二個是 {a}。 */
export function canonPair(x: Wuxing, y: Wuxing): { key: string; rel: Relation; swap: boolean } {
    const rel = relation(x, y);
    const swap = rel === 'genBy' || rel === 'ctlBy';
    return { key: swap ? `${y}${x}` : `${x}${y}`, rel, swap };
}

export interface RootHit {
    char: NameChar;
    rule: ZodiacRootRule;
    /** 位置權重（姓 15、名一 30、名二 30）。 */
    weight: number;
}

/** 這個字對某生肖最強的一條喜忌（字本身或任一字根）；強度相同取喜用。 */
export function rootHit(z: Zodiac | undefined, c: NameChar | undefined): RootHit | undefined {
    if (!z || !c) return undefined;
    let best: ZodiacRootRule | undefined;
    for (const root of [c.char, ...c.roots]) {
        const r = matchRoot(z, root);
        if (!r) continue;
        if (
            !best ||
            r.strength > best.strength ||
            (r.strength === best.strength && r.kind === 'like' && best.kind === 'avoid')
        )
            best = r;
    }
    return best ? { char: c, rule: best, weight: POSITION_WEIGHT[c.position] } : undefined;
}

export const rootEffect = (hit: RootHit): LikeEffect | AvoidEffect =>
    hit.rule.kind === 'like'
        ? LIKE_EFFECTS[hit.rule.category as keyof typeof LIKE_EFFECTS]
        : AVOID_EFFECTS[hit.rule.category as keyof typeof AVOID_EFFECTS];

export function rootTag(hit: RootHit, z: Zodiac, owner = ''): string {
    const { char, rule } = hit;
    const carries = rule.root === char.char ? '' : `帶${rule.root}`;
    const kind = rule.kind === 'like' ? '喜用' : '忌用';
    return `${owner}${POSITION_LABEL[char.position]}「${char.char}」${carries}（屬${z}${kind}：${rule.reason}）`;
}

export function buildCard(
    term: string,
    field: string,
    parts: { hook: string; core: string; scene: string; advice: string; tags: string[] },
    pair = false,
): MeaningItem {
    return {
        term,
        field,
        hook: parts.hook,
        meaning: [
            '【解析】',
            parts.core,
            pair ? '【相處場景】' : '【盲點與場景】',
            parts.scene,
            pair ? '【給兩人的建議】' : '【給你的建議】',
            parts.advice,
        ].join('\n'),
        tags: [...new Set(parts.tags)],
    };
}
