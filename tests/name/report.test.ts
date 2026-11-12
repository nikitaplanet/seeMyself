import { describe, expect, it } from 'vitest';
import { NAME_LIMITS, sentencesOf } from '@/lib/name/assemble';
import { CLASH_COST, HARMONY_GIFT, MASK_GAP, WUXING_FACE } from '@/lib/name/kb/harmony';
import { NUMEROLOGY_81, NUMEROLOGY_LIMITS, numerology } from '@/lib/name/kb/numerology81';
import * as pairKb from '@/lib/name/kb/pairKb';
import {
    SANCAI_COMBOS,
    SANCAI_PATTERN_NOTE,
    SANCAI_REN_DI,
    SANCAI_TIAN_REN,
} from '@/lib/name/kb/sancai';
import { relation, WUXING } from '@/lib/name/kb/wuxing';
import {
    AVOID_EFFECTS,
    LIKE_EFFECTS,
    TEMPER_WEAR,
    ZODIAC_RULES,
    matchRoot,
} from '@/lib/name/kb/zodiacRules';
import { buildNameAiPrompt } from '@/lib/name/prompt';
import { NAME_CARD_TERMS, nameReportItems } from '@/lib/name/report';
import { NAME_PAIR_TERMS, nameSynastryItems } from '@/lib/name/synastry';
import type { Wuxing } from '@/lib/name/types';
import type { MeaningItem } from '@/lib/ui/personMeaning';
import { makeAnalysis, spreadFixtures } from './fixtures';

const len = (s: string) => [...s].length;
const ELEMENTS: Wuxing[] = ['木', '火', '土', '金', '水'];

// 傳統的恐嚇性判語與宿命字眼：知識庫與報告內文都不能出現。
const BANNED_VERDICTS = [
    '大凶',
    '凶',
    '孤寡',
    '破敗',
    '短命',
    '剋夫',
    '剋妻',
    '剋子',
    '刑剋',
    '夭折',
    '災',
    '禍',
    '厄運',
    '孤獨終老',
    '命中注定',
    '註定',
    '改名',
    '改運',
    '破財',
    '血光',
    '守寡',
    '敗家',
];
// 命理術語只能出現在 tags，不能出現在內文。
const NUMEROLOGY_TERMS = [
    '天格',
    '人格',
    '地格',
    '外格',
    '總格',
    '三才',
    '五行',
    '數理',
    '筆畫',
    '康熙',
    '靈動',
    '生肖',
    '字根',
    '相生',
    '相剋',
    '相沖',
    '比和',
    '喜用',
    '忌用',
    '屬木',
    '屬火',
    '屬土',
    '屬金',
    '屬水',
    '吉',
];
// 大陸用語與常見簡體字。
const MAINLAND = [
    '質量',
    '視頻',
    '信息',
    '軟件',
    '網絡',
    '默認',
    '屏幕',
    '打印',
    '項目經理',
    '土豆',
    '激活',
];
const SIMPLIFIED =
    /[们这为东车长门问间关见觉过还时会个国学说话对开发边应该给让种儿点业务总从内两义乐书买卖]/;

function allStrings(value: unknown, out: string[] = []): string[] {
    if (typeof value === 'string') out.push(value);
    else if (Array.isArray(value)) for (const v of value) allStrings(v, out);
    else if (value && typeof value === 'object')
        for (const v of Object.values(value)) allStrings(v, out);
    return out;
}

function expectClean(text: string, label: string) {
    for (const w of BANNED_VERDICTS)
        expect(text.includes(w), `${label} 含「${w}」：${text}`).toBe(false);
    for (const w of MAINLAND) expect(text.includes(w), `${label} 含「${w}」：${text}`).toBe(false);
    expect(SIMPLIFIED.test(text), `${label} 含簡體字：${text}`).toBe(false);
}

function parse(item: MeaningItem, pair = false) {
    const lines = item.meaning.split('\n');
    expect(lines).toHaveLength(6);
    expect(lines[0]).toBe('【解析】');
    expect(lines[2]).toBe(pair ? '【相處場景】' : '【盲點與場景】');
    expect(lines[4]).toBe(pair ? '【給兩人的建議】' : '【給你的建議】');
    return { core: lines[1], scene: lines[3], advice: lines[5] };
}

describe('姓名學知識庫', () => {
    it('81 靈動數齊全，欄位都在字數上限內', () => {
        expect(NUMEROLOGY_81).toHaveLength(81);
        expect(NUMEROLOGY_81.map((e) => e.number_or_pattern)).toEqual(
            Array.from({ length: 81 }, (_, i) => i + 1),
        );
        for (const e of NUMEROLOGY_81) {
            const id = `數 ${e.number_or_pattern}`;
            expect(['auspicious', 'challenging', 'mixed']).toContain(e.energy_type);
            expect(len(e.hook_phrase), id).toBeLessThanOrEqual(NUMEROLOGY_LIMITS.hook);
            expect(len(e.hook_phrase), id).toBeGreaterThan(3);
            const clauses = [e.trait_clause, ...Object.values(e.context_variants)];
            for (const c of clauses) {
                expect(len(c), `${id}：${c}`).toBeLessThanOrEqual(NUMEROLOGY_LIMITS.clause);
                expect(len(c), `${id}：${c}`).toBeGreaterThanOrEqual(12);
                // 子句要能接在「你」或名字後面：不含「你」、句尾不帶標點。
                expect(c.includes('你'), `${id}：${c}`).toBe(false);
                expect(/[。，；：！？]$/.test(c), `${id}：${c}`).toBe(false);
            }
            expect(new Set(clauses).size).toBe(4);
            expect(len(e.shadow_trigger), id).toBeLessThanOrEqual(NUMEROLOGY_LIMITS.shadow);
            expect(e.shadow_trigger.endsWith('。') || e.shadow_trigger.endsWith('」'), id).toBe(
                true,
            );
            expect(len(e.advice_snippet), `${id}：${e.advice_snippet}`).toBeLessThanOrEqual(
                NUMEROLOGY_LIMITS.advice,
            );
        }
        expect(numerology(82).number_or_pattern).toBe(2);
        expect(numerology(161).number_or_pattern).toBe(81);
    });

    it('81 數的文案彼此不重複', () => {
        const texts = NUMEROLOGY_81.flatMap((e) => [
            e.hook_phrase,
            e.trait_clause,
            ...Object.values(e.context_variants),
            e.shadow_trigger,
            e.advice_snippet,
        ]);
        expect(new Set(texts).size).toBe(texts.length);
    });

    it('能量屬性依傳統判讀：三種都有，吉數、凶數各歸其類', () => {
        const energy = (n: number) => numerology(n).energy_type;
        for (const n of [1, 3, 5, 6, 11, 13, 15, 16, 21, 23, 24, 31, 32, 41, 45, 47, 48, 52, 81])
            expect(energy(n), `數 ${n}`).toBe('auspicious');
        for (const n of [2, 4, 9, 10, 12, 14, 19, 20, 22, 28, 34, 54, 56, 60, 70, 79])
            expect(energy(n), `數 ${n}`).toBe('challenging');
        for (const n of [26, 27, 30, 38, 49, 50, 55]) expect(energy(n), `數 ${n}`).toBe('mixed');
    });

    it('三才：天→人、人→地 各 25 種關係齊全，125 種組合都有能量屬性', () => {
        for (const table of [SANCAI_TIAN_REN, SANCAI_REN_DI]) {
            expect(Object.keys(table)).toHaveLength(25);
            for (const x of ELEMENTS)
                for (const y of ELEMENTS) {
                    const e = table[`${x}${y}`];
                    expect(e, `${x}${y}`).toBeDefined();
                    expect(len(e.hook_phrase), e.hook_phrase).toBeLessThanOrEqual(15);
                    expect(len(e.pressure_clause), e.pressure_clause).toBeLessThanOrEqual(55);
                    if (e.trait_clause !== undefined)
                        expect(len(e.trait_clause), e.trait_clause).toBeLessThanOrEqual(55);
                    expect(len(e.shadow_trigger), e.shadow_trigger).toBeLessThanOrEqual(150);
                    expect(len(e.advice_snippet), e.advice_snippet).toBeLessThanOrEqual(40);
                }
        }
        // 天生人算順遂、天剋人算磨練。
        expect(SANCAI_TIAN_REN['水木'].relation).toBe('genBy');
        expect(SANCAI_TIAN_REN['水木'].energy_type).toBe('auspicious');
        expect(SANCAI_TIAN_REN['金木'].relation).toBe('ctlBy');
        expect(SANCAI_TIAN_REN['金木'].energy_type).toBe('challenging');
        expect(SANCAI_REN_DI['木土'].relation).toBe('ctl');
        expect(Object.keys(SANCAI_COMBOS)).toHaveLength(125);
        expect(SANCAI_COMBOS['木火土'].energy_type).toBe('auspicious');
        expect(SANCAI_COMBOS['木火土'].pattern).toBe('chainDown');
        expect(SANCAI_COMBOS['金木金'].energy_type).toBe('challenging');
        expect(SANCAI_COMBOS['金木金'].pattern).toBe('squeezed');
        expect(SANCAI_COMBOS['水水水'].pattern).toBe('allSame');
        expect(SANCAI_COMBOS['水土金'].energy_type).toBe('mixed');
    });

    it('五行關係的方向正確', () => {
        expect(relation('木', '火')).toBe('gen');
        expect(relation('火', '木')).toBe('genBy');
        expect(relation('木', '土')).toBe('ctl');
        expect(relation('土', '木')).toBe('ctlBy');
        expect(relation('金', '金')).toBe('same');
    });

    it('十二生肖喜忌：每個生肖都有喜用與忌用，字根是單一字元且附理由', () => {
        expect(ZODIAC_RULES.map((r) => r.zodiac).join('')).toBe('鼠牛虎兔龍蛇馬羊猴雞狗豬');
        for (const r of ZODIAC_RULES) {
            expect(r.like.length, r.zodiac).toBeGreaterThanOrEqual(8);
            expect(r.avoid.length, r.zodiac).toBeGreaterThanOrEqual(8);
            for (const x of [...r.like, ...r.avoid]) {
                expect(len(x.root), `${r.zodiac} ${x.root}`).toBe(1);
                expect(len(x.reason)).toBeGreaterThan(1);
                expect(len(x.reason)).toBeLessThanOrEqual(8);
                // 不使用部首變形
                expect('艹氵忄扌犭亻衤礻糹辶灬刂'.includes(x.root), x.root).toBe(false);
            }
            expect(r.like.some((x) => x.category === 'ally')).toBe(true);
            expect(r.avoid.some((x) => x.category === 'clash')).toBe(true);
        }
        expect(matchRoot('虎', '山')?.kind).toBe('like');
        expect(matchRoot('虎', '玉')?.kind).toBe('like');
        expect(matchRoot('虎', '肉')?.kind).toBe('like');
        expect(matchRoot('虎', '口')?.kind).toBe('avoid');
        expect(matchRoot('虎', '申')?.category).toBe('clash');
        expect(matchRoot('鼠', '午')?.category).toBe('clash');
        expect(matchRoot('馬', '艸')?.kind).toBe('like');
        expect(matchRoot('馬', '子')?.category).toBe('clash');
    });

    it('所有知識庫文案沒有恐嚇判語、簡體字與大陸用語', () => {
        const texts = allStrings([
            NUMEROLOGY_81,
            WUXING,
            SANCAI_TIAN_REN,
            SANCAI_REN_DI,
            SANCAI_PATTERN_NOTE,
            HARMONY_GIFT,
            CLASH_COST,
            WUXING_FACE,
            MASK_GAP,
            LIKE_EFFECTS,
            AVOID_EFFECTS,
            TEMPER_WEAR,
            { ...pairKb },
        ]);
        expect(texts.length).toBeGreaterThan(1200);
        for (const t of texts) {
            expectClean(t, '知識庫');
            for (const w of NUMEROLOGY_TERMS)
                expect(t.includes(w), `知識庫文案含命理術語「${w}」：${t}`).toBe(false);
        }
        // 合盤文案不用「你們」，也不分性別。
        for (const t of allStrings({ ...pairKb })) {
            expect(/你們|他|她/.test(t), t).toBe(false);
        }
    });
});

const FIXTURES = spreadFixtures();
const REPORTS = FIXTURES.map((f) => ({ ...f, items: nameReportItems(f.analysis) }));

describe('個人姓名解析（九張卡）', () => {
    it('fixture 涵蓋五種人格五行、三種能量、有無生肖、單名／雙名／複姓', () => {
        const ren = new Set(FIXTURES.map((f) => f.analysis.grids.ren.wuxing));
        expect(ren.size).toBe(5);
        const energies = new Set(
            FIXTURES.map((f) => numerology(f.analysis.grids.ren.number).energy_type),
        );
        expect(energies.size).toBe(3);
        expect(FIXTURES.some((f) => !f.analysis.zodiac)).toBe(true);
        expect(new Set(FIXTURES.map((f) => f.analysis.zodiac).filter(Boolean)).size).toBe(12);
        expect(FIXTURES.some((f) => f.analysis.given.length === 1)).toBe(true);
        expect(FIXTURES.some((f) => f.analysis.surname.length === 2)).toBe(true);
        expect(
            FIXTURES.some((f) => f.analysis.surname.length === 1 && f.analysis.given.length === 1),
        ).toBe(true);
        expect(FIXTURES.length).toBeGreaterThan(200);
    });

    it('卡片順序與數量固定', () => {
        for (const r of REPORTS) {
            expect(
                r.items.map((i) => i.term),
                r.name,
            ).toEqual([...NAME_CARD_TERMS]);
            expect(r.items).toHaveLength(9);
        }
    });

    it('每張卡都在字數上限內，三個區塊齊全，並帶 tags', () => {
        for (const r of REPORTS)
            for (const item of r.items) {
                const id = `${r.name}／${item.term}`;
                const { core, scene, advice } = parse(item);
                expect(item.hook, id).toBeTruthy();
                expect(len(item.hook ?? ''), `${id} hook：${item.hook}`).toBeLessThanOrEqual(
                    NAME_LIMITS.hook,
                );
                expect(len(core), `${id} 解析：${core}`).toBeLessThanOrEqual(NAME_LIMITS.block);
                expect(len(core), `${id} 解析：${core}`).toBeGreaterThanOrEqual(30);
                expect(len(scene), `${id} 場景：${scene}`).toBeLessThanOrEqual(NAME_LIMITS.block);
                expect(len(scene), `${id} 場景：${scene}`).toBeGreaterThanOrEqual(20);
                expect(len(advice), `${id} 建議：${advice}`).toBeLessThanOrEqual(
                    NAME_LIMITS.advice,
                );
                expect(len(advice), id).toBeGreaterThanOrEqual(8);
                expect(len(item.field), id).toBeLessThanOrEqual(30);
                expect(item.tags?.length, id).toBeGreaterThanOrEqual(1);
                expect(item.collapsed).toBeUndefined();
                // 句子完整：沒有留下未填的槽位，也沒有疊在一起的標點。
                expect(/\{|\}|undefined/.test(item.meaning), `${id}：${item.meaning}`).toBe(false);
                expect(
                    /[。，；：]{2}|你你|。，|，。/.test(item.meaning),
                    `${id}：${item.meaning}`,
                ).toBe(false);
                expect(core.endsWith('。'), `${id}：${core}`).toBe(true);
            }
    });

    it('命理術語只在 tags，不在內文；內文沒有恐嚇判語', () => {
        for (const r of REPORTS)
            for (const item of r.items) {
                const body = `${item.hook}\n${item.field}\n${item.meaning}`;
                for (const w of NUMEROLOGY_TERMS)
                    expect(body.includes(w), `${r.name}／${item.term} 內文含「${w}」`).toBe(false);
                expect(/\d+ ?畫/.test(body), `${r.name}／${item.term}`).toBe(false);
                expectClean(body, `${r.name}／${item.term}`);
            }
        const tags = REPORTS.flatMap((r) => r.items.flatMap((i) => i.tags ?? []));
        expect(tags.some((t) => /^人格 \d+ 畫（[木火土金水]）/.test(t))).toBe(true);
        expect(tags.some((t) => t.includes('張力'))).toBe(true);
        expect(tags.some((t) => t.includes('喜用'))).toBe(true);
        expect(tags.some((t) => t.includes('忌用'))).toBe(true);
    });

    it('同一份報告裡沒有重複的句子或 hook', () => {
        for (const r of REPORTS) {
            const sentences = r.items.flatMap((i) => {
                const { core, scene, advice } = parse(i);
                return [...sentencesOf(core), ...sentencesOf(scene), ...sentencesOf(advice)];
            });
            const dup = sentences.filter((s, i) => sentences.indexOf(s) !== i);
            expect(dup, `${r.name} 重複句：${dup.join(' | ')}`).toEqual([]);
            const hooks = r.items.map((i) => i.hook);
            expect(new Set(hooks).size, `${r.name} hook 重複：${hooks.join(' | ')}`).toBe(
                hooks.length,
            );
        }
    });

    it('同一個數理的同一個子句不會在一份報告裡出現兩次', () => {
        for (const r of REPORTS) {
            const text = r.items.map((i) => parse(i).core).join('\n');
            const numbers = new Set(Object.values(r.analysis.grids).map((g) => g.number));
            for (const n of numbers) {
                const e = numerology(n);
                for (const c of [e.trait_clause, ...Object.values(e.context_variants)]) {
                    const filled = c.replace(/\{self\}/g, '你');
                    expect(
                        text.split(filled).length - 1,
                        `${r.name} 數 ${n}：${filled}`,
                    ).toBeLessThanOrEqual(1);
                }
            }
        }
    });

    it('同一個名字每次產生相同的報告', () => {
        for (const f of FIXTURES.slice(0, 20))
            expect(nameReportItems(f.analysis)).toEqual(nameReportItems(f.analysis));
    });

    it('不同的名字讀起來不同：兩份報告沒有任何一張卡完全相同', () => {
        // 取五格與生肖都不同的名字兩兩比較。
        const distinct = REPORTS.filter(
            (r, i) =>
                REPORTS.findIndex(
                    (o) => JSON.stringify(o.analysis.grids) === JSON.stringify(r.analysis.grids),
                ) === i,
        ).slice(0, 60);
        expect(distinct.length).toBeGreaterThanOrEqual(40);
        let identical = 0;
        let compared = 0;
        for (let i = 0; i < distinct.length; i += 1)
            for (let j = i + 1; j < distinct.length; j += 1) {
                const x = distinct[i];
                const y = distinct[j];
                const sameRen = x.analysis.grids.ren.number === y.analysis.grids.ren.number;
                // 單姓雙名的外格與地格只由名字決定：同名不同姓的人，面具卡取材相同。
                const given = (r: (typeof distinct)[number]) =>
                    r.analysis.given.map((c) => c.char).join('');
                const sameGiven = given(x) === given(y);
                // 優缺點卡取材於五格的五行組合：五格五行全同的兩個人，這張卡取材相同。
                const wx = (r: (typeof distinct)[number]) =>
                    Object.values(r.analysis.grids)
                        .map((g) => g.wuxing)
                        .join('') + (r.analysis.zodiac ?? '');
                const sameWx = wx(x) === wx(y);
                // 思考卡取材於人格五行（分陰陽）與天格：這三項相同的兩個人取材相同。
                const think = (r: (typeof distinct)[number]) =>
                    `${r.analysis.grids.ren.wuxing}${r.analysis.grids.ren.number % 2}${r.analysis.grids.tian.wuxing}`;
                for (let k = 0; k < 9; k += 1) {
                    compared += 1;
                    if (x.items[k].meaning === y.items[k].meaning) {
                        identical += 1;
                        // 完全相同只允許出現在取材本來就相同的卡（同一個人格數或同一組三才）。
                        expect(
                            sameRen ||
                                x.analysis.sancai.join('') === y.analysis.sancai.join('') ||
                                (sameGiven && k === 6) ||
                                (k === 1 && think(x) === think(y)) ||
                                (sameWx && sameGiven && k === 5) ||
                                k === 8 ||
                                k === 7,
                            `${x.name} 與 ${y.name} 的「${x.items[k].term}」完全相同`,
                        ).toBe(true);
                    }
                }
            }
        expect(identical / compared).toBeLessThan(0.01);
        // 整份報告層級：任兩個人相同的句子不超過三成。
        for (let i = 0; i < 30; i += 1) {
            const x = distinct[i];
            const y = distinct[i + 7];
            const sx = new Set(x.items.flatMap((it) => sentencesOf(it.meaning)));
            const sy = y.items.flatMap((it) => sentencesOf(it.meaning));
            const shared = sy.filter((s) => sx.has(s) && !s.startsWith('【')).length;
            expect(shared / sy.length, `${x.name} vs ${y.name}`).toBeLessThan(0.3);
        }
    });

    it('指定的兩個名字：九張卡沒有一張相同', () => {
        const a = makeAnalysis(
            [['王', 4, '土', ['王']]],
            [
                ['怡', 9, '土', ['心', '口']],
                ['君', 7, '木', ['君', '口']],
            ],
            '虎',
        );
        const b = makeAnalysis(
            [['林', 8, '木', ['木']]],
            [
                ['志', 7, '火', ['士', '心']],
                ['明', 8, '火', ['日', '月']],
            ],
            '馬',
        );
        const x = nameReportItems(a);
        const y = nameReportItems(b);
        for (let k = 0; k < 9; k += 1) {
            expect(x[k].meaning).not.toBe(y[k].meaning);
            expect(x[k].hook).not.toBe(y[k].hook);
            expect(x[k].tags).not.toEqual(y[k].tags);
        }
    });

    it('沒有生肖時只用數理與五行，tags 不提喜忌', () => {
        const base: Parameters<typeof makeAnalysis> = [
            [['林', 8, '木', ['木']]],
            [
                ['琳', 13, '木', ['玉', '木']],
                ['山', 3, '土', ['山']],
            ],
        ];
        const without = nameReportItems(makeAnalysis(base[0], base[1]));
        const withTiger = nameReportItems(makeAnalysis(base[0], base[1], '虎'));
        const tags = without.flatMap((i) => i.tags ?? []).join('｜');
        expect(/喜用|忌用|屬[鼠牛虎兔龍蛇馬羊猴雞狗豬]/.test(tags)).toBe(false);
        const tigerTags = withTiger.flatMap((i) => i.tags ?? []).join('｜');
        expect(tigerTags).toContain('屬虎喜用');
        expect(tigerTags).toContain('名二「山」');
        expect(without[3].meaning).not.toBe(withTiger[3].meaning);
    });

    it('單名：工作與金錢改看名一，卡片仍完整', () => {
        const a = makeAnalysis([['王', 4, '土', ['王']]], [['明', 8, '火', ['日', '月']]], '虎');
        const items = nameReportItems(a);
        expect(items).toHaveLength(9);
        expect(a.grids.wai.number).toBe(2);
        expect((items[8].tags ?? []).join('｜')).toContain('名一「明」');
        expect((items[8].tags ?? []).join('｜')).not.toContain('名二');
        for (const i of items) parse(i);
    });

    it('開運策略只給日常行為調整，不建議改名', () => {
        for (const r of REPORTS) {
            const card = r.items[7];
            expect(/改名|換名字|取名|更名/.test(card.meaning), `${r.name}：${card.meaning}`).toBe(
                false,
            );
        }
    });

    it('提示詞帶入五格與主題，沒有生肖時請 AI 略過', () => {
        const a = makeAnalysis([['王', 4, '土', ['王']]], [['怡', 9, '土', ['心', '口']]]);
        const prompt = buildNameAiPrompt(a);
        expect(prompt).toContain('王怡');
        expect(prompt).toContain('人格：13 畫（火）');
        expect(prompt).toContain('略過生肖字根');
        for (const t of NAME_CARD_TERMS) expect(prompt).toContain(t);
    });
});

describe('雙人姓名合盤（六張卡）', () => {
    const NAMES = ['小明', '阿華', '怡君', '志豪', '雅婷', '家宏'];
    const pairs = Array.from({ length: 120 }, (_, i) => {
        const a = FIXTURES[(i * 5) % FIXTURES.length];
        const b = FIXTURES[(i * 11 + 3) % FIXTURES.length];
        return {
            a: { name: NAMES[i % 6], analysis: a.analysis },
            b: { name: NAMES[(i + 1) % 6], analysis: b.analysis },
        };
    });
    const results = pairs.map((p) => ({ ...p, items: nameSynastryItems(p.a, p.b) }));

    it('卡片順序與數量固定', () => {
        for (const r of results) expect(r.items.map((i) => i.term)).toEqual([...NAME_PAIR_TERMS]);
    });

    it('每張卡都在字數上限內，用兩人的名字、不用你們、不分性別', () => {
        for (const r of results)
            for (const item of r.items) {
                const id = `${r.a.name}×${r.b.name}／${item.term}`;
                const { core, scene, advice } = parse(item, true);
                expect(len(item.hook ?? ''), `${id} hook`).toBeLessThanOrEqual(NAME_LIMITS.hook);
                expect(len(item.hook ?? ''), `${id} hook`).toBeGreaterThan(3);
                expect(len(core), `${id} 解析：${core}`).toBeLessThanOrEqual(NAME_LIMITS.block);
                expect(len(scene), `${id} 場景：${scene}`).toBeLessThanOrEqual(NAME_LIMITS.block);
                expect(len(advice), `${id} 建議：${advice}`).toBeLessThanOrEqual(
                    NAME_LIMITS.advice,
                );
                expect(len(core), id).toBeGreaterThanOrEqual(30);
                expect(len(scene), id).toBeGreaterThanOrEqual(25);
                const body = `${item.hook}\n${item.field}\n${item.meaning}`;
                expect(/你們|他|她|\{|\}|undefined/.test(body), `${id}：${body}`).toBe(false);
                expect(core.includes(r.a.name) && core.includes(r.b.name), `${id}：${core}`).toBe(
                    true,
                );
                for (const w of NUMEROLOGY_TERMS)
                    expect(body.includes(w), `${id} 內文含「${w}」`).toBe(false);
                expectClean(body, id);
                expect(item.tags?.length, id).toBeGreaterThanOrEqual(2);
            }
    });

    it('同一份合盤裡沒有重複的句子', () => {
        for (const r of results) {
            const sentences = r.items.flatMap((i) => {
                const { core, scene, advice } = parse(i, true);
                return [...sentencesOf(core), ...sentencesOf(scene), ...sentencesOf(advice)];
            });
            const dup = sentences.filter((s, i) => sentences.indexOf(s) !== i);
            expect(dup, `${r.a.name}×${r.b.name}：${dup.join(' | ')}`).toEqual([]);
        }
    });

    it('人格相剋時摩擦卡直說、亮點卡寫互補；人格相生時亮點卡寫相生', () => {
        // 人格 木（11 畫）對 土（15 畫）：木剋土
        const wood = makeAnalysis(
            [['王', 4, '土', ['王']]],
            [
                ['志', 7, '火', ['士', '心']],
                ['明', 8, '火', ['日', '月']],
            ],
        );
        const earth = makeAnalysis(
            [['李', 7, '木', ['木', '子']]],
            [
                ['明', 8, '火', ['日', '月']],
                ['君', 7, '木', ['君', '口']],
            ],
        );
        expect(wood.grids.ren.wuxing).toBe('木');
        expect(earth.grids.ren.wuxing).toBe('土');
        const items = nameSynastryItems(
            { name: '小明', analysis: wood },
            { name: '阿華', analysis: earth },
        );
        expect(items[1].hook).toBe('一個要變，一個要穩');
        expect(items[1].meaning).toContain('小明的本性是往前推');
        expect((items[1].tags ?? []).join('｜')).toContain('木剋土張力');
        // 順序對調，角色不變（剋的一方仍是木）。
        const swapped = nameSynastryItems(
            { name: '阿華', analysis: earth },
            { name: '小明', analysis: wood },
        );
        expect(swapped[1].meaning).toContain('小明的本性是往前推');
    });

    it('對方生肖喜用的字會寫進亮點卡的 tags', () => {
        const tiger = makeAnalysis(
            [['王', 4, '土', ['王']]],
            [
                ['怡', 9, '土', ['心', '口']],
                ['君', 7, '木', ['君', '口']],
            ],
            '虎',
        );
        const other = makeAnalysis(
            [['林', 8, '木', ['木']]],
            [
                ['山', 3, '土', ['山']],
                ['明', 8, '火', ['日', '月']],
            ],
        );
        const items = nameSynastryItems(
            { name: '小虎', analysis: tiger },
            { name: '阿山', analysis: other },
        );
        expect((items[0].tags ?? []).join('｜')).toContain('小虎屬虎喜用');
    });

    it('不同的兩對讀起來不同', () => {
        let identical = 0;
        let compared = 0;
        for (let i = 0; i < 40; i += 1)
            for (let j = i + 1; j < 40; j += 1)
                for (let k = 0; k < 6; k += 1) {
                    compared += 1;
                    if (results[i].items[k].meaning === results[j].items[k].meaning) identical += 1;
                }
        expect(identical / compared).toBeLessThan(0.01);
    });
});
