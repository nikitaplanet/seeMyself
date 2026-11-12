import type { MeaningItem } from '@/lib/ui/personMeaning';
import {
    append,
    buildCard,
    canonPair,
    fill,
    fit,
    GRID_LABEL,
    GRID_WEIGHT,
    gridTag,
    NAME_LIMITS,
    numberClause,
    relationTag,
    rootEffect,
    rootHit,
    rootTag,
    rotate,
    SANCAI_WEIGHT,
    seedOf,
    Tracker,
    type RootHit,
    type Variant,
} from './assemble';
import { CLASH_COST, HARMONY_GIFT, MASK_GAP, WUXING_FACE } from './kb/harmony';
import { numerology } from './kb/numerology81';
import {
    SANCAI_PATTERN_NOTE,
    SANCAI_REN_DI,
    SANCAI_TIAN_REN,
    sancaiPattern,
    type SancaiRelationEntry,
} from './kb/sancai';
import { isHarmony, polarity, relation, WUXING } from './kb/wuxing';
import { AVOID_EFFECTS, LIKE_EFFECTS, TEMPER_WEAR, type WearGrid } from './kb/zodiacRules';
import type { Grid, GridKey, NameAnalysis, NameChar } from './types';

// 姓名學個人盤文案 — pure logic, no React, no runtime API. Follows .claude/gemini-code-姓名學.md §3B／§4：
//   個性＝人格數理＋外格數理＋名一字根；思考＝人格五行（分陰陽）＋天格對人格的生剋；
//   壓力＝三才的相剋路徑；感情＝地格數理＋名一字根；工作＝總格數理＋名二字根；
//   優缺點＝最和諧的相生／喜用字根 vs 最強的相剋／忌用字根；
//   面具＝外格 vs 地格；耗損點＝忌用字根或過剛／過柔的字位；金錢＝總格五行＋名二字根。
// 每張卡只取權重最高的 2～3 項；命理參數只放 tags，內文是行為與心理描述。
// usedRuleIds 追蹤整份報告：數理用過一個變體就換下一個，句子不重複。
// 沒有生肖（沒填生日）時只用數理與五行；單名沒有名二時，工作與金錢改看名一。

export const NAME_CARD_TERMS = [
    '個性與外在人設',
    '底層邏輯思考方式',
    '面對壓力的顯現',
    '感情模式與親密需求',
    '工作天賦與財庫格局',
    '核心優缺點',
    '面具與真實的反差感',
    '隱藏耗損點與開運策略',
    '金錢觀與資源掌控力',
] as const;

interface Env {
    a: NameAnalysis;
    t: Tracker;
    seed: number;
    g: Record<GridKey, Grid>;
    given1?: NameChar;
    /** 名二；單名時退回名一。 */
    last?: NameChar;
    hit1?: RootHit;
    hitLast?: RootHit;
    hits: RootHit[];
}

function buildEnv(a: NameAnalysis): Env {
    const given1 = a.given[0];
    const last = a.given[a.given.length - 1];
    const hits = [...a.surname, ...a.given]
        .map((c) => rootHit(a.zodiac, c))
        .filter((h): h is RootHit => !!h);
    return {
        a,
        t: new Tracker(),
        seed: seedOf(a),
        g: a.grids,
        given1,
        last,
        hit1: rootHit(a.zodiac, given1),
        hitLast: rootHit(a.zodiac, last),
        hits,
    };
}

const YOU = '你';

const clause = (env: Env, grid: Grid, order: Variant[]) => numberClause(env.t, grid, order, YOU);

/** 字根在某個面向的句子；同一個字的同一面向只用一次。 */
function rootSentence(
    env: Env,
    hit: RootHit | undefined,
    facet: 'self' | 'love' | 'work' | 'money',
) {
    if (!hit || !env.a.zodiac) return undefined;
    const text = rootEffect(hit)[facet];
    if (!env.t.fresh(text)) return undefined;
    if (!env.t.claim(`root:${hit.char.position}:${hit.char.char}:${facet}`)) return undefined;
    return { text, tag: rootTag(hit, env.a.zodiac) };
}

type Domain = 'persona' | 'love' | 'work' | 'mask';

/** 盲點：優先用該格數理的 shadow，已經用過（兩格同數）就改用該格五行在這個領域的備用句。 */
function shadowOf(env: Env, grid: Grid, domain: Domain): string {
    const e = numerology(grid.number);
    if (env.t.claim(`n${e.number_or_pattern}:shadow`) && env.t.fresh(e.shadow_trigger))
        return e.shadow_trigger;
    return WUXING[grid.wuxing].shadow[domain];
}

function adviceOf(env: Env, grid: Grid, domain: Domain): string {
    const e = numerology(grid.number);
    if (env.t.claim(`n${e.number_or_pattern}:advice`) && env.t.fresh(e.advice_snippet)) {
        env.t.commit(e.advice_snippet);
        return e.advice_snippet;
    }
    const alt = WUXING[grid.wuxing].advice[domain];
    env.t.commit(alt);
    return alt;
}

function hookOf(env: Env, grid: Grid, fallback: string): string {
    const e = numerology(grid.number);
    if (env.t.claim(`n${e.number_or_pattern}:hook`)) return e.hook_phrase;
    return fallback;
}

/** 兩個子句的句型：相生／比和用順接，相剋用轉折；第二子句缺席時用單句型。 */
function compose(
    env: Env,
    salt: number,
    frames: { harmony: string[]; tension: string[]; single: string[] },
    harmonious: boolean,
    first: string,
    second: string | undefined,
    extra?: string,
): string {
    const list = second ? (harmonious ? frames.harmony : frames.tension) : frames.single;
    const bodies = rotate(list, env.seed, salt).map((f) => fill(f, { a: first, b: second ?? '' }));
    const withExtra = extra ? bodies.map((b) => b + extra) : [];
    return fit(env.t, [...withExtra, ...bodies, `你${first}。`]);
}

// ── 1. 個性與外在人設 ─────────────────────────────────────────────────────────────

const PERSONA_FRAMES = {
    harmony: [
        '骨子裡，你{a}；走進人群時，你{b}。這兩面彼此幫襯，所以別人對你的印象和真實的你相去不遠。',
        '和你熟的人會說，你{a}。剛認識的人則會先注意到你{b}，兩種印象其實互相呼應。',
        '你{a}。別人第一眼看到的你，{b}，和骨子裡的樣子是同一個方向。',
    ],
    tension: [
        '在人前，你往往{b}；但骨子裡，你{a}。兩面的節奏不同，所以剛認識和熟了以後，別人對你的描述常常不太一樣。',
        '你{a}。可是一走進人群，你{b}，裡外像是兩套節奏，切換之間有多費力只有你自己清楚。',
        '熟人眼中的你，{a}；不熟的人看到的卻是另一面：你{b}。這層落差讓人需要一點時間才能真正認識你。',
    ],
    single: ['骨子裡，你{a}。', '和你熟的人會說，你{a}。', '你{a}。'],
};

function personaCard(env: Env): MeaningItem {
    const { ren, wai } = env.g;
    const first = clause(env, ren, ['trait', 'general', 'work']) ?? WUXING_FACE[ren.wuxing].inner;
    const second =
        clause(env, wai, ['general', 'trait']) ??
        WUXING_FACE[wai.wuxing].outer.replace(/\{self\}/g, YOU);
    const harmonious = isHarmony(relation(ren.wuxing, wai.wuxing));
    const root = rootSentence(env, env.hit1, 'self');
    const base = compose(env, 1, PERSONA_FRAMES, harmonious, first, second);
    const core = append(env.t, base, root?.text);
    return buildCard(NAME_CARD_TERMS[0], '你的核心個性，以及別人第一眼看到的你', {
        hook: hookOf(env, ren, '裡外都有自己的樣子'),
        core,
        scene: fit(env.t, [shadowOf(env, ren, 'persona')]),
        advice: adviceOf(env, ren, 'persona'),
        tags: [
            gridTag(ren),
            gridTag(wai),
            relationTag(ren.wuxing, wai.wuxing),
            ...(root && core !== base ? [root.tag] : []),
        ],
    });
}

// ── 2. 底層邏輯思考方式 ───────────────────────────────────────────────────────────

const THINK_FRAMES = {
    harmony: [
        '你{a}。這樣的思路其來有自：你{b}。',
        '先說思考的習慣：你{a}。再往深處看，你{b}，這讓你的判斷有一貫的脈絡。',
        '你{a}。背後的養成也有關係：你{b}。',
    ],
    tension: [
        '你{a}。不過，你{b}，所以腦中常有兩個聲音在辯論，結論也來得比別人費力。',
        '先說思考的習慣：你{a}。可是你{b}，這層拉扯讓你想得比別人多一圈。',
        '你{a}，但另一方面，你{b}。兩股力量並存，讓你的思考多了一層自我檢查。',
    ],
    single: ['你{a}。'],
};

const THINK_TEMPER = {
    hard: '一旦下了判斷，你很少回頭修改。',
    soft: '下判斷之前，你習慣多繞幾圈確認。',
    even: '想清楚之後，你通常能平穩地照著結論去做。',
} as const;

function thinkCard(env: Env): MeaningItem {
    const { ren, tian } = env.g;
    const think = WUXING[ren.wuxing].think[polarity(ren.number)];
    const tr = SANCAI_TIAN_REN[`${tian.wuxing}${ren.wuxing}`];
    const harmonious = isHarmony(tr.relation);
    const base = compose(env, 2, THINK_FRAMES, harmonious, think.clause, tr.trait_clause);
    // 人格數理的剛柔決定下判斷之後的樣子（放得下才加）。
    const core = append(env.t, base, THINK_TEMPER[numerology(ren.number).temper]);
    env.t.commit(think.shadow);
    env.t.commit(think.advice);
    return buildCard(NAME_CARD_TERMS[1], '你習慣怎麼想事情、怎麼下判斷', {
        hook: think.hook,
        core,
        scene: think.shadow,
        advice: think.advice,
        tags: [
            `${gridTag(ren)}${polarity(ren.number) === 'yang' ? '陽' : '陰'}`,
            gridTag(tian),
            relationTag(tian.wuxing, ren.wuxing),
        ],
    });
}

// ── 3. 面對壓力的顯現 ─────────────────────────────────────────────────────────────

const PRESSURE_FRAMES = {
    both: [
        '面對外界的壓力，你{a}。回到私底下也沒有比較輕鬆：你{b}。',
        '壓力來自外面的時候，你{a}；關起門來，你{b}。',
        '在外，你{a}；在內，你{b}。',
    ],
    outer: [
        '面對外界的壓力，你{a}。好在回到私底下，你{b}，這讓你有地方把力氣補回來。',
        '壓力多半來自外面的要求：你{a}。不過關起門來，你{b}，所以通常撐得過去。',
    ],
    inner: [
        '面對外界的壓力，你{a}，對外大致應付得來。真正耗神的是私底下：你{b}。',
        '外面的事多半難不倒你：你{a}。比較辛苦的是關起門來之後，你{b}。',
    ],
    none: ['面對外界的壓力，你{a}。回到私底下，你{b}。', '壓力來的時候，你{a}；關起門來，你{b}。'],
};

const PRESSURE_TAIL = {
    both: '兩邊同時用力時，你比外表看起來累得多。',
    none: '這樣的配置讓你撐得比多數人久，只是也比較晚才發現自己累了。',
};

const isClash = (e: SancaiRelationEntry) => e.relation === 'ctl' || e.relation === 'ctlBy';
const PRESSURE_RANK = { ctlBy: 0, ctl: 1, gen: 2, same: 3, genBy: 4 } as const;

function pressureCard(env: Env): MeaningItem {
    const [tian, ren, di] = env.a.sancai;
    const tr = SANCAI_TIAN_REN[`${tian}${ren}`];
    const rd = SANCAI_REN_DI[`${ren}${di}`];
    const kind =
        isClash(tr) && isClash(rd)
            ? 'both'
            : isClash(tr)
              ? 'outer'
              : isClash(rd)
                ? 'inner'
                : 'none';
    // 相剋路徑優先；兩條都不是相剋時，取消耗較大的那一條當主軸。
    const primary = PRESSURE_RANK[rd.relation] < PRESSURE_RANK[tr.relation] ? rd : tr;
    const bodies = rotate(PRESSURE_FRAMES[kind], env.seed, 3).map((f) =>
        fill(f, { a: tr.pressure_clause, b: rd.pressure_clause }),
    );
    const pattern = sancaiPattern(env.a.sancai);
    const notes = pattern === 'plain' ? [] : rotate(SANCAI_PATTERN_NOTE[pattern], env.seed, 3);
    const generic = kind === 'both' || kind === 'none' ? [PRESSURE_TAIL[kind]] : [];
    const tails = [...notes, ...generic];
    const core = fit(env.t, [...tails.flatMap((tail) => bodies.map((b) => b + tail)), ...bodies]);
    env.t.commit(primary.shadow_trigger);
    env.t.commit(primary.advice_snippet);
    return buildCard(NAME_CARD_TERMS[2], '壓力來的時候，你會怎麼反應', {
        hook: primary.hook_phrase,
        core,
        scene: primary.shadow_trigger,
        advice: primary.advice_snippet,
        tags: [
            gridTag(env.g.tian),
            gridTag(env.g.ren),
            gridTag(env.g.di),
            relationTag(tian, ren),
            relationTag(ren, di),
        ],
    });
}

// ── 4. 感情模式與親密需求 ─────────────────────────────────────────────────────────

const LOVE_FRAMES = {
    harmony: [
        '在親密關係裡，你{a}。骨子裡的你也是同一個方向：你{b}，所以對方感受到的你前後一致。',
        '談感情的時候，你{a}；同時，你{b}。這兩面互相幫襯，讓你在關係裡給得很自然。',
    ],
    tension: [
        '在親密關係裡，你{a}。可是骨子裡，你{b}，兩種需要有時會打架，連你自己都要想一下現在要的是哪一個。',
        '談感情的時候，你{a}；但另一面的你{b}。對方有時會覺得你忽近忽遠，其實你只是在兩種需要之間調整。',
    ],
    single: ['在親密關係裡，你{a}。', '談感情的時候，你{a}。', '面對在乎的人，你{a}。'],
};

const LOVE_ROOT_FRAMES = [
    '在親密關係裡，你{a}。{r}骨子裡，你{b}。',
    '談感情的時候，你{a}；骨子裡，你{b}。{r}',
];

function loveCard(env: Env): MeaningItem {
    const { di, ren } = env.g;
    const first = clause(env, di, ['love', 'general']) ?? WUXING_FACE[di.wuxing].closeness;
    const root = rootSentence(env, env.hit1, 'love');
    let core: string;
    const tags = [gridTag(di)];
    if (root) {
        // 地格數理＋名一字根，放得下時再帶入人格在感情裡的樣子（三項都取）。
        const second = clause(env, ren, ['love', 'general']);
        const full = second
            ? rotate(LOVE_ROOT_FRAMES, env.seed, 4).map((f) =>
                  fill(f, { a: first, b: second, r: root.text }),
              )
            : [];
        const short = rotate(LOVE_FRAMES.single, env.seed, 4).map(
            (f) => fill(f, { a: first }) + root.text,
        );
        core = fit(env.t, [...full, ...short]);
        tags.push(root.tag);
        if (full.includes(core)) tags.push(gridTag(ren));
        else core = append(env.t, core, `你也${WUXING_FACE[di.wuxing].closeness}。`);
    } else {
        const second = clause(env, ren, ['love', 'general']);
        core = compose(
            env,
            4,
            LOVE_FRAMES,
            isHarmony(relation(ren.wuxing, di.wuxing)),
            first,
            second,
        );
        if (second) tags.push(gridTag(ren), relationTag(ren.wuxing, di.wuxing));
        else core = append(env.t, core, `你也${WUXING_FACE[di.wuxing].closeness}。`);
    }
    return buildCard(NAME_CARD_TERMS[3], '你在親密關係裡的樣子與需要', {
        hook: hookOf(env, di, '靠近的方式很有自己的節奏'),
        core,
        scene: fit(env.t, [shadowOf(env, di, 'love')]),
        advice: adviceOf(env, di, 'love'),
        tags,
    });
}

// ── 5. 工作天賦與財庫格局 ─────────────────────────────────────────────────────────

const WORK_FRAMES = {
    harmony: [
        '在工作上，你{a}。再加上你{b}，兩種本事用在同一個方向，累積起來特別快。',
        '談到事業，你{a}；而且你{b}。長期的目標和做事的性子互相配合，是你累積資源的優勢。',
    ],
    tension: [
        '在工作上，你{a}。不過你{b}，兩種傾向需要輪流上場，選對時機比一味用力更重要。',
        '談到事業，你{a}；另一方面，你{b}。這兩股力量方向不同，分配得好是互補，分配不好就是內耗。',
    ],
    single: ['在工作上，你{a}。', '談到事業，你{a}。', '長期來看，你{a}。'],
};

function workCard(env: Env): MeaningItem {
    const { zong, ren } = env.g;
    const first = clause(env, zong, ['work', 'general', 'trait']) ?? WUXING[zong.wuxing].gift;
    const root = rootSentence(env, env.hitLast, 'work');
    let core: string;
    const tags = [gridTag(zong)];
    if (root) {
        core = compose(env, 5, WORK_FRAMES, true, first, undefined, root.text);
        tags.push(root.tag);
        const more = !env.t.has(`n${numerology(ren.number).number_or_pattern}:work`)
            ? numerology(ren.number).context_variants.work.replace(/\{self\}/g, YOU)
            : undefined;
        const extended = append(env.t, core, more ? `此外，你${more}。` : undefined);
        if (extended !== core) {
            env.t.claim(`n${numerology(ren.number).number_or_pattern}:work`);
            tags.push(gridTag(ren));
            core = extended;
        }
    } else {
        const second = clause(env, ren, ['work', 'general']);
        core = compose(
            env,
            5,
            WORK_FRAMES,
            isHarmony(relation(ren.wuxing, zong.wuxing)),
            first,
            second,
        );
        if (second) tags.push(gridTag(ren), relationTag(ren.wuxing, zong.wuxing));
    }
    return buildCard(NAME_CARD_TERMS[4], '你的工作天賦與累積資源的方式', {
        hook: hookOf(env, zong, '把本事慢慢養成資源'),
        core,
        scene: fit(env.t, [shadowOf(env, zong, 'work')]),
        advice: adviceOf(env, zong, 'work'),
        tags,
    });
}

// ── 6. 核心優缺點 ────────────────────────────────────────────────────────────────

const GRID_PAIRS: [GridKey, GridKey, number][] = [
    ['ren', 'di', GRID_WEIGHT.ren + GRID_WEIGHT.di],
    ['ren', 'zong', GRID_WEIGHT.ren + GRID_WEIGHT.zong],
    ['tian', 'ren', GRID_WEIGHT.ren + SANCAI_WEIGHT],
    ['di', 'zong', GRID_WEIGHT.di + GRID_WEIGHT.zong],
    ['ren', 'wai', GRID_WEIGHT.ren + GRID_WEIGHT.wai],
    ['wai', 'di', GRID_WEIGHT.wai + GRID_WEIGHT.di],
    ['wai', 'zong', GRID_WEIGHT.wai + GRID_WEIGHT.zong],
];

interface PairCand {
    key: string;
    weight: number;
    tag: string;
}

function gridPairs(env: Env): { harmony: PairCand[]; clash: PairCand[] } {
    const harmony: PairCand[] = [];
    const clash: PairCand[] = [];
    for (const [x, y, weight] of GRID_PAIRS) {
        const gx = env.g[x];
        const gy = env.g[y];
        const { key, rel } = canonPair(gx.wuxing, gy.wuxing);
        const word = rel === 'same' ? '比和' : isHarmony(rel) ? '相生' : '相剋';
        const cand = {
            key,
            weight,
            tag: `${GRID_LABEL[x]}${gx.wuxing}、${GRID_LABEL[y]}${gy.wuxing}${word}`,
        };
        (isHarmony(rel) ? harmony : clash).push(cand);
    }
    const byWeight = (p: PairCand, q: PairCand) => q.weight - p.weight;
    return { harmony: harmony.sort(byWeight), clash: clash.sort(byWeight) };
}

const rootScore = (h: RootHit) => h.weight + h.rule.strength * 10;

const STRENGTH_FRAMES = {
    two: [
        '你{a}，這是你最大的本錢。再加上你{b}，遇到難關時比別人多一層底氣。',
        '說到優勢，你{a}；同時，你{b}。這兩點在關鍵時刻特別派得上用場。',
        '先看你最站得住的地方：你{a}。不只如此，你{b}，兩者疊在一起就是你的招牌。',
        '你最讓人放心的一點，是你{a}。另外，你{b}，這讓你的優勢不只一個面向。',
    ],
    one: ['你{a}，這是你最大的本錢。', '說到優勢，你{a}。', '先看你最站得住的地方：你{a}。'],
};

function coreCard(env: Env): MeaningItem {
    const { ren } = env.g;
    const z = env.a.zodiac;
    const pairs = gridPairs(env);
    const likes = env.hits
        .filter((h) => h.rule.kind === 'like')
        .sort((p, q) => rootScore(q) - rootScore(p));
    const avoids = env.hits
        .filter((h) => h.rule.kind === 'avoid')
        .sort((p, q) => rootScore(q) - rootScore(p));
    const tags: string[] = [];

    // 優點：最和諧的相生／比和，加上最強的喜用字根（沒有就取次高的相生，或人格五行的天賦）。
    const bestPair = pairs.harmony[0];
    const gifts: { text: string; tag: string }[] = [];
    if (bestPair) gifts.push({ text: HARMONY_GIFT[bestPair.key].clause, tag: bestPair.tag });
    if (likes[0] && z)
        gifts.push({
            text: LIKE_EFFECTS[likes[0].rule.category as keyof typeof LIKE_EFFECTS].gift,
            tag: rootTag(likes[0], z),
        });
    const nextPair = pairs.harmony.find((p) => p.key !== bestPair?.key);
    if (gifts.length < 2 && nextPair)
        gifts.push({ text: HARMONY_GIFT[nextPair.key].clause, tag: nextPair.tag });
    if (gifts.length < 2) gifts.push({ text: WUXING[ren.wuxing].gift, tag: gridTag(ren) });

    const two = rotate(STRENGTH_FRAMES.two, env.seed, 6).map((f) =>
        fill(f, { a: gifts[0].text, b: gifts[1].text }),
    );
    const one = rotate(STRENGTH_FRAMES.one, env.seed, 6).map((f) => fill(f, { a: gifts[0].text }));
    const core = fit(env.t, [...two, ...one]);
    tags.push(gifts[0].tag);
    if (two.includes(core)) tags.push(gifts[1].tag);

    // 缺點：最強的相剋與最強的忌用字根，權重高者為主；都沒有時取人格五行過旺的一面。
    const worstPair = pairs.clash[0];
    const worstRoot = avoids[0];
    const costs: { text: string; advice: string; tag: string; weight: number }[] = [];
    if (worstPair)
        costs.push({
            text: CLASH_COST[worstPair.key].sentence,
            advice: CLASH_COST[worstPair.key].advice,
            tag: worstPair.tag,
            weight: worstPair.weight,
        });
    if (worstRoot && z) {
        const e = AVOID_EFFECTS[worstRoot.rule.category as keyof typeof AVOID_EFFECTS];
        costs.push({
            text: e.cost,
            advice: e.costAdvice,
            tag: rootTag(worstRoot, z),
            weight: rootScore(worstRoot),
        });
    }
    costs.sort((p, q) => q.weight - p.weight);
    if (!costs.length)
        costs.push({
            text: WUXING[ren.wuxing].excess,
            advice: WUXING[ren.wuxing].excessAdvice,
            tag: `${gridTag(ren)}偏旺`,
            weight: 0,
        });
    let scene = fit(env.t, [costs[0].text]);
    tags.push(costs[0].tag);
    if (costs[1]) {
        const more = append(env.t, scene, costs[1].text);
        if (more !== scene) tags.push(costs[1].tag);
        scene = more;
    }
    env.t.commit(costs[0].advice);
    return buildCard(NAME_CARD_TERMS[5], '你最大的本錢，和最需要留意的地方', {
        hook: bestPair ? HARMONY_GIFT[bestPair.key].hook : WUXING_FACE[ren.wuxing].giftHook,
        core,
        scene,
        advice: costs[0].advice,
        tags,
    });
}

// ── 7. 面具與真實的反差感 ─────────────────────────────────────────────────────────

const MASK_FRAMES = {
    harmony: [
        '在外人眼中，你{a}。回到私底下，你{b}。這兩面沒有太大的斷層，面具和真心比較像同一張臉的不同表情。',
        '走進人群時，你{a}；關起門來，你{b}。裡外的樣子互相支撐，所以你不太需要刻意切換。',
        '別人認識的你，{a}。只有親近的人才看得到的你，{b}。兩者之間是延續，不是偽裝。',
        '對外，你{a}；對內，你{b}。這一外一內互相接得上，所以你在不同場合都還是同一個人。',
    ],
    tension: [
        '在外人眼中，你{a}。可是回到私底下，你{b}。這兩個你節奏不同，切換之間常讓你特別累。',
        '走進人群時，你{a}；關起門來，你{b}。熟人和不熟的人口中的你，常常像是兩個不同的人。',
        '別人認識的你，{a}。只有親近的人才看得到的你，{b}。這層反差不是偽裝，而是你保護自己的方式。',
        '對外，你{a}；對內，你{b}。一外一內落差不小，所以你需要一段獨處的時間，才能從一個模式換到另一個。',
    ],
    single: ['在外人眼中，你{a}。'],
};

function maskCard(env: Env): MeaningItem {
    const { wai, di } = env.g;
    const outer =
        clause(env, wai, ['general', 'trait']) ??
        WUXING_FACE[wai.wuxing].outer.replace(/\{self\}/g, YOU);
    const inner = clause(env, di, ['trait', 'general']) ?? WUXING_FACE[di.wuxing].inner;
    const rel = relation(wai.wuxing, di.wuxing);
    const core = compose(env, 7, MASK_FRAMES, isHarmony(rel), outer, inner);
    const gap = rotate(MASK_GAP[rel], env.seed, 7);
    const shadow = shadowOf(env, wai, 'mask');
    const scene = fit(env.t, [...gap.map((g) => g + shadow), ...gap]);
    return buildCard(NAME_CARD_TERMS[6], '別人眼中的你，和私底下的你', {
        hook: hookOf(env, wai, isHarmony(rel) ? '表裡如一的那種人' : '人前人後，兩種節奏'),
        core,
        scene,
        advice: adviceOf(env, wai, 'mask'),
        tags: [gridTag(wai), gridTag(di), relationTag(wai.wuxing, di.wuxing)],
    });
}

// ── 8. 隱藏耗損點與開運策略 ───────────────────────────────────────────────────────

interface WearCand {
    weight: number;
    hook: string;
    core: string;
    scene: string;
    advice: string;
    tag: string;
}

function wearCard(env: Env): MeaningItem {
    const z = env.a.zodiac;
    const cands: WearCand[] = [];
    if (z)
        for (const h of env.hits.filter((x) => x.rule.kind === 'avoid')) {
            const w = AVOID_EFFECTS[h.rule.category as keyof typeof AVOID_EFFECTS].wear;
            cands.push({ ...w, weight: h.weight + h.rule.strength * 5, tag: rootTag(h, z) });
        }
    for (const key of ['ren', 'di', 'zong', 'wai'] as WearGrid[]) {
        const temper = numerology(env.g[key].number).temper;
        if (temper === 'even') continue;
        cands.push({
            ...TEMPER_WEAR[key][temper],
            weight: GRID_WEIGHT[key],
            tag: `${gridTag(env.g[key])}${temper === 'hard' ? '數理偏剛' : '數理偏柔'}`,
        });
    }
    cands.sort((p, q) => q.weight - p.weight);
    const usable = cands.filter((c, i) => cands.findIndex((d) => d.core === c.core) === i);
    const top = usable[0];
    if (!top) {
        const m = WUXING[env.g.ren.wuxing].maintain;
        for (const s of [m.core, m.scene, m.advice]) env.t.commit(s);
        return buildCard(NAME_CARD_TERMS[7], '最容易悄悄消耗你的地方，以及日常的調整方式', {
            hook: m.hook,
            core: m.core,
            scene: m.scene,
            advice: m.advice,
            tags: [gridTag(env.g.ren), '字位無明顯耗損'],
        });
    }
    const tags = [top.tag];
    let core = fit(env.t, [top.core]);
    let scene = fit(env.t, [top.scene]);
    const second = usable[1];
    if (second) {
        const more = append(env.t, core, second.core);
        if (more !== core) {
            core = more;
            tags.push(second.tag);
            scene = append(env.t, scene, second.scene.replace(/^例如/, '又例如'));
        }
    }
    env.t.commit(top.advice);
    return buildCard(NAME_CARD_TERMS[7], '最容易悄悄消耗你的地方，以及日常的調整方式', {
        hook: top.hook,
        core,
        scene,
        advice: top.advice,
        tags,
    });
}

// ── 9. 金錢觀與資源掌控力 ─────────────────────────────────────────────────────────

const MONEY_FRAMES = {
    root: ['說到資源的運用，你{a}。{b}', '你{a}。{b}'],
    spend: ['說到資源的運用，你{a}。日常裡，你{b}。', '你{a}；落到日常，你{b}。'],
    single: ['說到資源的運用，你{a}。', '你{a}。'],
};

function moneyCard(env: Env): MeaningItem {
    const { zong } = env.g;
    const money = WUXING[zong.wuxing].money[polarity(zong.number)];
    const root = rootSentence(env, env.hitLast, 'money');
    const last = env.last;
    const tags = [`${gridTag(zong)}${polarity(zong.number) === 'yang' ? '陽' : '陰'}`];
    let core: string;
    if (root) {
        core = fit(
            env.t,
            rotate(MONEY_FRAMES.root, env.seed, 9).map((f) =>
                fill(f, { a: money.clause, b: root.text }),
            ),
        );
        tags.push(root.tag);
        if (last) {
            const more = append(env.t, core, `日常裡，你${WUXING[last.wuxing].spend}。`);
            if (more !== core)
                tags.push(
                    `${last.position === 'given2' ? '名二' : '名一'}「${last.char}」字義屬${last.wuxing}`,
                );
            core = more;
        }
    } else if (last) {
        core = fit(
            env.t,
            rotate(MONEY_FRAMES.spend, env.seed, 9).map((f) =>
                fill(f, { a: money.clause, b: WUXING[last.wuxing].spend }),
            ),
        );
        tags.push(
            `${last.position === 'given2' ? '名二' : '名一'}「${last.char}」字義屬${last.wuxing}`,
        );
    } else {
        core = fit(
            env.t,
            rotate(MONEY_FRAMES.single, env.seed, 9).map((f) => fill(f, { a: money.clause })),
        );
    }
    env.t.commit(money.shadow);
    env.t.commit(money.advice);
    return buildCard(NAME_CARD_TERMS[8], '你怎麼看待錢，怎麼運用手上的資源', {
        hook: money.hook,
        core,
        scene: money.shadow,
        advice: money.advice,
        tags,
    });
}

/** 個人姓名解析的九張卡（六張核心基礎＋三張 Deep Talk），順序固定。 */
export function nameReportItems(a: NameAnalysis): MeaningItem[] {
    const env = buildEnv(a);
    return [
        personaCard(env),
        thinkCard(env),
        pressureCard(env),
        loveCard(env),
        workCard(env),
        coreCard(env),
        maskCard(env),
        wearCard(env),
        moneyCard(env),
    ];
}

export { NAME_LIMITS };
