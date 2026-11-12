import type { MeaningItem } from '@/lib/ui/personMeaning';
import {
    append,
    buildCard,
    canonPair,
    fill,
    fit,
    gridTag,
    numberClause,
    POSITION_LABEL,
    relationTag,
    rootHit,
    rotate,
    seedOf,
    Tracker,
    type RootHit,
    type Variant,
} from './assemble';
import { numerology } from './kb/numerology81';
import {
    CROSS_TIAN_REN,
    EXEC_STYLE,
    GOAL_STYLE,
    PAIR_FRICTION,
    PAIR_INTIMACY,
    PAIR_LONGTERM,
    PAIR_SPARK,
    PARTNER_VERDICT,
    PRIDE_TRIGGER,
    QUARREL_LANDING,
    QUARREL_STYLE,
    TEMPER_MIX,
    type PartnerKind,
} from './kb/pairKb';
import { isHarmony, relation, type Relation } from './kb/wuxing';
import { LIKE_EFFECTS } from './kb/zodiacRules';
import type { Grid, GridKey, NameAnalysis, NameChar } from './types';

// 姓名學雙人合盤文案 — pure logic, no runtime API. Follows .claude/gemini-code-姓名學.md §3C：
//   亮點＝雙方人格五行相生／比和（人格相剋時改看其他相生的格，都沒有就寫差異的互補面）＋對方生肖喜用的字根；
//   摩擦＝雙方人格相剋，或一方外格剋另一方人格；親密＝雙方地格數理與五行；
//   長遠＝雙方總格五行＋彼此天格對人格；吵架＝外格（表達）對人格（自尊）；拍檔＝總格（目標）＋名二（執行）。
// 內文用兩人的名字，不用「你們」，不分性別；命理參數只放 tags。

export interface NamePerson {
    name: string;
    analysis: NameAnalysis;
}

export const NAME_PAIR_TERMS = [
    '一起時的亮點與互補磁場',
    '兩人需磨合的摩擦點',
    '內心世界與親密度方式',
    '關係的長遠發展與課題',
    '吵架與溝通地雷區',
    '最佳拍檔測試（室友／旅伴／合夥人）',
] as const;

interface Env {
    A: NamePerson;
    B: NamePerson;
    t: Tracker;
    seed: number;
}

const grid = (p: NamePerson, k: GridKey): Grid => p.analysis.grids[k];
const ptag = (p: NamePerson, k: GridKey) => gridTag(grid(p, k), p.name);

/** 依標準化五行對排好 {a}／{b} 的名字（{a} 是生者或剋者）。 */
function roles(x: NamePerson, y: NamePerson, kx: GridKey, ky: GridKey = kx) {
    const gx = grid(x, kx);
    const gy = grid(y, ky);
    const c = canonPair(gx.wuxing, gy.wuxing);
    const [a, b] = c.swap ? [y, x] : [x, y];
    return {
        key: c.key,
        rel: c.rel,
        slots: { a: a.name, b: b.name },
        tag: relationTag(gx.wuxing, gy.wuxing),
    };
}

const clauseOf = (env: Env, p: NamePerson, k: GridKey, order: Variant[]) =>
    numberClause(env.t, grid(p, k), order, p.name);

// ── 1. 一起時的亮點與互補磁場 ─────────────────────────────────────────────────────

const SPARK_FRAMES = {
    harmony: [
        '{A}{a}；{B}{b}。兩人的性子天生就容易互相幫襯。',
        '先看個性：{A}{a}，{B}則{b}。這樣的兩個人放在一起，力氣會往同一個方向使。',
    ],
    tension: [
        '{A}{a}；{B}{b}。性子雖然不同調，卻正好握有對方缺少的那一塊。',
        '先看個性：{A}{a}，{B}則{b}。差異不小，但用對地方就是互補。',
    ],
};

/** x 的名字裡，y 的生肖最喜用的一個字。 */
function giftRoot(x: NamePerson, y: NamePerson): RootHit | undefined {
    const z = y.analysis.zodiac;
    if (!z) return undefined;
    return [...x.analysis.given, ...x.analysis.surname]
        .map((c) => rootHit(z, c))
        .filter((h): h is RootHit => !!h && h.rule.kind === 'like')
        .sort((p, q) => q.rule.strength * 10 + q.weight - (p.rule.strength * 10 + p.weight))[0];
}

function sparkCard(env: Env): MeaningItem {
    const { A, B } = env;
    // 人格相生／比和優先；人格相剋時，依序找地格、總格、外格裡相生的一組。
    const order: GridKey[] = ['ren', 'di', 'zong', 'wai'];
    const key =
        order.find((k) => isHarmony(relation(grid(A, k).wuxing, grid(B, k).wuxing))) ?? 'ren';
    const r = roles(A, B, key);
    const spark = PAIR_SPARK[r.key];
    const renHarmony = isHarmony(relation(grid(A, 'ren').wuxing, grid(B, 'ren').wuxing));
    const ta =
        clauseOf(env, A, 'ren', ['trait', 'general']) ??
        numerology(grid(A, 'ren').number).trait_clause;
    const tb =
        clauseOf(env, B, 'ren', ['trait', 'general']) ??
        numerology(grid(B, 'ren').number).trait_clause;
    const core = fit(
        env.t,
        rotate(renHarmony ? SPARK_FRAMES.harmony : SPARK_FRAMES.tension, env.seed, 1).map((f) =>
            fill(f, { A: A.name, B: B.name, a: ta, b: tb }),
        ),
    );
    const tags = [ptag(A, 'ren'), ptag(B, 'ren')];
    if (key !== 'ren') tags.push(ptag(A, key), ptag(B, key));
    tags.push(r.tag);
    let scene = fit(env.t, [fill(spark.core + spark.scene, r.slots), fill(spark.scene, r.slots)]);
    for (const [x, y] of [
        [A, B],
        [B, A],
    ] as const) {
        const hit = giftRoot(x, y);
        if (!hit) continue;
        const text = fill(LIKE_EFFECTS[hit.rule.category as keyof typeof LIKE_EFFECTS].pairGift, {
            a: x.name,
            b: y.name,
        });
        const more = append(env.t, scene, text);
        if (more !== scene) {
            const carries = hit.rule.root === hit.char.char ? '' : `帶${hit.rule.root}`;
            tags.push(
                `${x.name}${POSITION_LABEL[hit.char.position]}「${hit.char.char}」${carries}（${y.name}屬${y.analysis.zodiac}喜用：${hit.rule.reason}）`,
            );
            scene = more;
        }
    }
    const advice = fill(spark.advice, r.slots);
    env.t.commit(advice);
    return buildCard(
        NAME_PAIR_TERMS[0],
        '兩個人在一起時最合拍、最能互補的地方',
        { hook: spark.hook, core, scene, advice, tags },
        true,
    );
}

// ── 2. 兩人需磨合的摩擦點 ─────────────────────────────────────────────────────────

const TEMPER_CODE = { hard: 'h', soft: 's', even: 'e' } as const;

function temperMix(A: NamePerson, B: NamePerson): string {
    const ca = TEMPER_CODE[numerology(grid(A, 'ren').number).temper];
    const cb = TEMPER_CODE[numerology(grid(B, 'ren').number).temper];
    const direct = TEMPER_MIX[`${ca}${cb}`];
    if (direct) return fill(direct, { a: A.name, b: B.name });
    return fill(TEMPER_MIX[`${cb}${ca}`], { a: B.name, b: A.name });
}

function frictionCard(env: Env): MeaningItem {
    const { A, B } = env;
    const isCtl = (r: Relation) => r === 'ctl' || r === 'ctlBy';
    const renRel = relation(grid(A, 'ren').wuxing, grid(B, 'ren').wuxing);
    // 權重：人格對人格相剋最高；其次是一方外格剋另一方人格；都沒有時談人格組合本身的磨合。
    let r = roles(A, B, 'ren');
    const tags = [ptag(A, 'ren'), ptag(B, 'ren')];
    if (!isCtl(renRel)) {
        const ab = relation(grid(A, 'wai').wuxing, grid(B, 'ren').wuxing);
        const ba = relation(grid(B, 'wai').wuxing, grid(A, 'ren').wuxing);
        if (isCtl(ab)) {
            r = roles(A, B, 'wai', 'ren');
            tags.splice(0, 2, ptag(A, 'wai'), ptag(B, 'ren'));
        } else if (isCtl(ba)) {
            r = roles(B, A, 'wai', 'ren');
            tags.splice(0, 2, ptag(B, 'wai'), ptag(A, 'ren'));
        }
    }
    tags.push(r.tag);
    const friction = PAIR_FRICTION[r.key];
    let core = fit(env.t, [fill(friction.core, r.slots)]);
    core = append(env.t, core, temperMix(A, B));
    const scene = fit(env.t, [fill(friction.scene, r.slots)]);
    const advice = fill(friction.advice, r.slots);
    env.t.commit(advice);
    return buildCard(
        NAME_PAIR_TERMS[1],
        '兩個人最容易卡住、需要練習磨合的地方',
        { hook: friction.hook, core, scene, advice, tags },
        true,
    );
}

// ── 3. 內心世界與親密度方式 ───────────────────────────────────────────────────────

const INTIMACY_FRAMES = {
    harmony: [
        '關起門來，{A}{a}；{B}{b}。兩人要的親密方式接得上，相處起來不太需要翻譯。',
        '在親密關係裡，{A}{a}，{B}則{b}。這兩種方式放在一起很合拍。',
    ],
    tension: [
        '關起門來，{A}{a}；{B}{b}。兩人要的親密方式不太一樣，需要把各自的需要說出來。',
        '在親密關係裡，{A}{a}，{B}則{b}。方式不同，很容易各自努力卻沒對上頻率。',
    ],
};

function intimacyCard(env: Env): MeaningItem {
    const { A, B } = env;
    const r = roles(A, B, 'di');
    const text = PAIR_INTIMACY[r.key];
    const la =
        clauseOf(env, A, 'di', ['love', 'general', 'trait']) ??
        numerology(grid(A, 'di').number).context_variants.love;
    const lb =
        clauseOf(env, B, 'di', ['love', 'general', 'trait']) ??
        numerology(grid(B, 'di').number).context_variants.general;
    const core = fit(
        env.t,
        rotate(
            isHarmony(r.rel) ? INTIMACY_FRAMES.harmony : INTIMACY_FRAMES.tension,
            env.seed,
            3,
        ).map((f) => fill(f, { A: A.name, B: B.name, a: la, b: lb })),
    );
    const scene = fit(env.t, [fill(text.scene, r.slots)]);
    const advice = fill(text.advice, r.slots);
    env.t.commit(advice);
    return buildCard(
        NAME_PAIR_TERMS[2],
        '兩個人私下怎麼靠近、怎麼給彼此安全感',
        { hook: text.hook, core, scene, advice, tags: [ptag(A, 'di'), ptag(B, 'di'), r.tag] },
        true,
    );
}

// ── 4. 關係的長遠發展與課題 ───────────────────────────────────────────────────────

function longtermCard(env: Env): MeaningItem {
    const { A, B } = env;
    const r = roles(A, B, 'zong');
    const text = PAIR_LONGTERM[r.key];
    const core = fit(env.t, [fill(text.core, r.slots)]);
    // A 的天格對 B 的人格，再換方向。
    const ab = relation(grid(B, 'ren').wuxing, grid(A, 'tian').wuxing);
    const ba = relation(grid(A, 'ren').wuxing, grid(B, 'tian').wuxing);
    const first = fill(CROSS_TIAN_REN[ab][0], { a: A.name, b: B.name });
    const second = fill(CROSS_TIAN_REN[ba][1], { a: B.name, b: A.name });
    const scene = append(env.t, fit(env.t, [first]), second);
    const advice = fill(text.advice, r.slots);
    env.t.commit(advice);
    return buildCard(
        NAME_PAIR_TERMS[3],
        '兩個人走長遠時的方向，以及彼此家庭背景的影響',
        {
            hook: text.hook,
            core,
            scene,
            advice,
            tags: [
                ptag(A, 'zong'),
                ptag(B, 'zong'),
                r.tag,
                `${A.name}天格${grid(A, 'tian').wuxing}對${B.name}人格${grid(B, 'ren').wuxing}`,
                `${B.name}天格${grid(B, 'tian').wuxing}對${A.name}人格${grid(A, 'ren').wuxing}`,
            ],
        },
        true,
    );
}

// ── 5. 吵架與溝通地雷區 ───────────────────────────────────────────────────────────

const QUARREL_FRAMES = [
    '{A}{sa}，而{B}{pb}。反過來，{B}{sb}，{A}{pa}。',
    '吵架的時候，{A}{sa}，{B}{pb}。換個方向看，{B}{sb}，{A}則{pa}。',
];

const SEVERITY: Relation[] = ['ctl', 'ctlBy', 'same', 'genBy', 'gen'];

function quarrelCard(env: Env): MeaningItem {
    const { A, B } = env;
    const wa = grid(A, 'wai').wuxing;
    const wb = grid(B, 'wai').wuxing;
    const ra = grid(A, 'ren').wuxing;
    const rb = grid(B, 'ren').wuxing;
    const core = fit(
        env.t,
        rotate(QUARREL_FRAMES, env.seed, 5).map((f) =>
            fill(f, {
                A: A.name,
                B: B.name,
                sa: QUARREL_STYLE[wa][0],
                sb: QUARREL_STYLE[wb][wa === wb ? 1 : 0],
                pa: PRIDE_TRIGGER[ra][0],
                pb: PRIDE_TRIGGER[rb][ra === rb ? 1 : 0],
            }),
        ),
    );
    const ab = relation(wa, rb);
    const ba = relation(wb, ra);
    const first = QUARREL_LANDING[ab].lines[0];
    const second = QUARREL_LANDING[ba].lines[1];
    const sAB = { a: A.name, b: B.name };
    const sBA = { a: B.name, b: A.name };
    const scene = append(env.t, fit(env.t, [fill(first.scene, sAB)]), fill(second.scene, sBA));
    const abWorse = SEVERITY.indexOf(ab) <= SEVERITY.indexOf(ba);
    const advice = abWorse ? fill(first.advice, sAB) : fill(second.advice, sBA);
    env.t.commit(advice);
    return buildCard(
        NAME_PAIR_TERMS[4],
        '兩個人吵架時各自的說話方式，和最不能碰的地方',
        {
            hook: QUARREL_LANDING[abWorse ? ab : ba].hook,
            core,
            scene,
            advice,
            tags: [
                ptag(A, 'wai'),
                ptag(B, 'ren'),
                relationTag(wa, rb),
                ptag(B, 'wai'),
                ptag(A, 'ren'),
                relationTag(wb, ra),
            ],
        },
        true,
    );
}

// ── 6. 最佳拍檔測試 ──────────────────────────────────────────────────────────────

const lastGiven = (p: NamePerson): NameChar | undefined =>
    p.analysis.given[p.analysis.given.length - 1];

const PARTNER_FRAMES = [
    '{A}{ga}，做起事來{ea}；{B}{gb}，做起事來{eb}。',
    '看長期的目標，{A}{ga}，{B}{gb}。看執行的方式，{A}{ea}，{B}則{eb}。',
];

function partnerCard(env: Env): MeaningItem {
    const { A, B } = env;
    const za = grid(A, 'zong');
    const zb = grid(B, 'zong');
    const ca = lastGiven(A);
    const cb = lastGiven(B);
    const ea = ca?.wuxing ?? za.wuxing;
    const eb = cb?.wuxing ?? zb.wuxing;
    const goalRel = relation(za.wuxing, zb.wuxing);
    const execRel = relation(ea, eb);
    // 目標合得來 → 合夥人；目標不同但做事步調合 → 室友；兩者都不同調 → 旅伴。
    const kind: PartnerKind = isHarmony(goalRel)
        ? goalRel === 'same' && execRel === 'same'
            ? 'roommate'
            : 'partner'
        : isHarmony(execRel)
          ? 'roommate'
          : 'travel';
    const verdict = PARTNER_VERDICT[kind];
    const core = fit(
        env.t,
        rotate(PARTNER_FRAMES, env.seed, 6).map((f) =>
            fill(f, {
                A: A.name,
                B: B.name,
                ga: GOAL_STYLE[za.wuxing][0],
                gb: GOAL_STYLE[zb.wuxing][za.wuxing === zb.wuxing ? 1 : 0],
                ea: EXEC_STYLE[ea][0],
                eb: EXEC_STYLE[eb][ea === eb ? 1 : 0],
            }),
        ),
    );
    // 目標與步調都相同時，只有第二個室友變體的說法成立（不提「目標不同」）。
    const alike = goalRel === 'same' && execRel === 'same';
    const v = alike ? verdict.variants[1] : rotate(verdict.variants, env.seed, 6)[0];
    const slots = { a: A.name, b: B.name };
    const scene = fit(env.t, [fill(v.scene, slots)]);
    const advice = fill(v.advice, slots);
    env.t.commit(advice);
    const execTag = (p: NamePerson, c: NameChar | undefined) =>
        c
            ? `${p.name}${POSITION_LABEL[c.position]}「${c.char}」字義屬${c.wuxing}`
            : ptag(p, 'zong');
    return buildCard(
        NAME_PAIR_TERMS[5],
        '兩個人最適合用什麼身分搭檔：室友、旅伴，還是合夥人',
        {
            hook: verdict.hook,
            core,
            scene,
            advice,
            tags: [
                ptag(A, 'zong'),
                ptag(B, 'zong'),
                relationTag(za.wuxing, zb.wuxing),
                execTag(A, ca),
                execTag(B, cb),
                `最合拍：${verdict.label}`,
            ],
        },
        true,
    );
}

/** 雙人姓名合盤的六張卡（四張核心基礎＋兩張 Deep Talk），順序固定。 */
export function nameSynastryItems(a: NamePerson, b: NamePerson): MeaningItem[] {
    const env: Env = {
        A: a,
        B: b,
        t: new Tracker(),
        seed: seedOf(a.analysis) + seedOf(b.analysis) * 3,
    };
    return [
        sparkCard(env),
        frictionCard(env),
        intimacyCard(env),
        longtermCard(env),
        quarrelCard(env),
        partnerCard(env),
    ];
}
