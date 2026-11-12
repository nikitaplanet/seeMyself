import type { MeaningItem } from '@/lib/ui/personMeaning';
import { BODY_NAMES, SIGN_ELEMENTS, SIGN_NAMES } from './labels';
import {
    ASC_KB,
    BODY_VOICE,
    ELEMENT_STRESS_HOOK,
    ELEMENT_TONE,
    HOUSE_KB,
    JUPITER_KB,
    MARS_KB,
    MERCURY_KB,
    MODE_NAMES,
    MODE_TONE,
    MOON_KB,
    SATURN_KB,
    SIGN_KB,
    SUN_KB,
    VENUS_KB,
    type PlanetKey,
} from './natalKb';
import * as V from './natalKb';
import {
    AXIS_NAMES,
    describeConfig,
    grandTrine,
    HARD_ASPECTS,
    NATAL_SECTIONS,
    PLANET_KEYS,
    SOFT_ASPECTS,
    weighNatal,
    type AspectConfig,
    type AxisConfig,
    type HouseConfig,
    type NatalConfig,
    type NatalSectionId,
    type NatalWeights,
    type PlacementConfig,
} from './natalWeight';
import type { AstroAspect, AstroBodyKey, AstroChart } from './types';

// 個人本命盤解析（星盤開發準則 §3A、§4），規則式產生。Eleven sections, each built only from that
// section's top-weighted configurations (natalWeight.ts) and the local knowledge base
// (natalKb.ts). Sections 7–11 also read the cusp sign of the houses they are about. Sections are written in order and share a context: every sentence already used
// is skipped later, and a planet's adjectives switch to an alternate wording the second time it
// shows up, so the same sentence never appears twice in a report.
// Client-safe: imports labels/types/KB only, never compute.ts.

/** Short noun phrases for what each body is about (also used by synastry.ts). */
export const BODY_FUNCTION: Record<AstroBodyKey, string> = {
    sun: '自我認同',
    moon: '情緒需求',
    mercury: '思考表達',
    venus: '感情喜好',
    mars: '行動衝勁',
    jupiter: '成長信心',
    saturn: '責任紀律',
    uranus: '求新求變',
    neptune: '理想想像',
    pluto: '深層掌控',
    northNode: '人生方向',
    chiron: '內在舊傷',
};

/** Outer planets move slowly, so aspects between two of them are shared by a whole generation. */
const OUTER = new Set<AstroBodyKey>(['uranus', 'neptune', 'pluto']);

/**
 * Up to three aspects with the smallest orb. Outer–outer (generational) aspects are skipped, and
 * so are Moon aspects when the birth time is unknown.
 */
export function tightestAspects(chart: AstroChart): AstroAspect[] {
    return chart.aspects
        .filter((a) => !(OUTER.has(a.a) && OUTER.has(a.b)))
        .filter((a) => !chart.timeUnknown || (a.a !== 'moon' && a.b !== 'moon'))
        .slice()
        .sort((x, y) => x.orb - y.orb)
        .slice(0, 3);
}

/** Card length budgets (字 = code points, punctuation and the parenthesised basis included). */
export const NATAL_LIMITS = { hook: 20, paragraph: 80, scene: 60, advice: 50 } as const;

export interface NatalSection {
    id: NatalSectionId;
    title: string;
    /** One plain line: what this section is based on (and what is uncertain). */
    field: string;
    hook: string;
    /** Two paragraphs (core_insight). */
    insight: [string, string];
    /** key_dynamic: a concrete everyday scene. */
    scene: string;
    /** actionable_advice. */
    advice: string;
    configs: NatalConfig[];
}

export const charLen = (s: string): number => [...s].length;

/**
 * A sentence, optionally with other wordings for when it follows one in the same paragraph.
 * Either slot may list several options in order of preference; the paragraph takes the first
 * one that does not repeat a content word already in it.
 */
type Part = string | { first: string | readonly string[]; then: string | readonly string[] };
const optionsOf = (v: string | readonly string[]): readonly string[] =>
    typeof v === 'string' ? [v] : v;
const thenOf = (p: Part) => (typeof p === 'string' ? p : optionsOf(p.then)[0]);

/** Shared state across sections (context chaining / anti-repetition). */
class Ctx {
    readonly sentences = new Set<string>();
    private readonly phrases = new Set<string>();

    /** Primary wording the first time a phrase key is used, the alternate afterwards. */
    phrase(key: string, primary: string, alt: string): string {
        if (this.phrases.has(key)) return alt;
        this.phrases.add(key);
        return primary;
    }

    /**
     * Concatenate unused sentences in order while the paragraph stays within `max`. A part with
     * a `then` wording uses it when it follows another sentence, so the paragraph reads as one
     * connected thought instead of sentences set side by side.
     */
    pack(candidates: Array<Part | null | undefined>, max: number, last?: Part | null): string {
        let out = '';
        const add = (c: Part | null | undefined, limit: number) => {
            if (!c) return;
            const forms =
                typeof c === 'string' ? [c] : [...optionsOf(c.first), ...optionsOf(c.then)];
            // Any wording of this part already said (here or in an earlier card): skip it.
            if (forms.some((f) => this.sentences.has(f) || out.includes(f))) return;
            const options = typeof c === 'string' ? [c] : optionsOf(out ? c.then : c.first);
            const fitting = options.filter((o) => charLen(out + o) <= limit);
            // Prefer a wording that repeats no word of the paragraph and does not open the way
            // an earlier sentence did (「而且…。而且…」).
            const openers = splitSentences(out).map((t) => t.slice(0, 2));
            const fresh = fitting.filter((o) => isClean(o) && !openers.includes(o.slice(0, 2)));
            const pool = fresh.length ? fresh : fitting;
            const shared = pool.map((o) => sharedWords(out, o));
            out += pool[shared.indexOf(Math.min(...shared))] ?? '';
        };
        // `last` (a blind spot) closes the paragraph, so room is kept for it and nothing
        // positive trails after its 「只是…」.
        const reserve = last ? charLen(thenOf(last)) : 0;
        for (const c of candidates) add(c, max - reserve);
        add(last, max);
        // Register right away so the next paragraph of the same section cannot repeat it.
        for (const t of splitSentences(out)) this.sentences.add(t);
        return out;
    }

    /** First unused candidate within `max`. */
    first(candidates: Array<string | null | undefined>, max: number): string {
        for (const s of candidates) {
            if (s && !this.sentences.has(s) && charLen(s) <= max) {
                this.sentences.add(s);
                return s;
            }
        }
        return '';
    }

    commit(section: NatalSection): void {
        for (const text of [...section.insight, section.scene, section.advice]) {
            for (const s of splitSentences(text)) this.sentences.add(s);
        }
    }
}

export function splitSentences(text: string): string[] {
    return text
        .split(/(?<=[。！？])/)
        .map((s) => s.trim())
        .filter(Boolean);
}

const N = (k: PlanetKey) => BODY_NAMES[k];
const S = (sign: number) => SIGN_NAMES[((sign % 12) + 12) % 12];
const names = (keys: PlanetKey[]) => keys.map(N).join('、');

function aspectBasis(a: AspectConfig['aspect']): string {
    if (a.type === 'conjunction') return `（${N(a.a)}與${N(a.b)}緊密交會）`;
    const rel = SOFT_ASPECTS.has(a.type) ? '順暢' : a.type === 'square' ? '拉扯' : '對立';
    return `（${N(a.a)}與${N(a.b)}的${rel}角度）`;
}

const other = (a: AspectConfig['aspect'], focus: PlanetKey): PlanetKey =>
    a.a === focus ? a.b : a.a;

/** Planets whose conjunctions read as a strain rather than a gift. */
const HEAVY = new Set<PlanetKey>(['saturn', 'pluto', 'mars', 'uranus', 'neptune']);

const GIFT_PRIORITY: PlanetKey[] = [
    'uranus',
    'neptune',
    'pluto',
    'saturn',
    'jupiter',
    'mars',
    'venus',
    'moon',
    'mercury',
    'sun',
];
const CHALLENGE_PRIORITY: PlanetKey[] = [
    'saturn',
    'pluto',
    'mars',
    'uranus',
    'neptune',
    'moon',
    'jupiter',
    'sun',
    'mercury',
    'venus',
];

function pickBody(a: AspectConfig['aspect'], order: PlanetKey[]): PlanetKey {
    return order.indexOf(a.a) <= order.indexOf(a.b) ? a.a : a.b;
}

const aspects = (cs: NatalConfig[]) => cs.filter((c): c is AspectConfig => c.kind === 'aspect');
const placement = (cs: NatalConfig[], body: PlacementConfig['body']) =>
    cs.find((c): c is PlacementConfig => c.kind === 'placement' && c.body === body);
const house = (cs: NatalConfig[], h: number) =>
    cs.find((c): c is HouseConfig => c.kind === 'house' && c.house === h);

/** FNV-1a string hash, for deterministic chart-seeded variant choice. */
function hashStr(s: string): number {
    let h = 2166136261;
    for (const ch of s) {
        h ^= ch.codePointAt(0)!;
        h = Math.imul(h, 16777619) >>> 0;
    }
    // Final avalanche (murmur3 fmix32) so short, similar seeds spread over the options.
    h ^= h >>> 16;
    h = Math.imul(h, 0x85ebca6b) >>> 0;
    h ^= h >>> 13;
    h = Math.imul(h, 0xc2b2ae35) >>> 0;
    h ^= h >>> 16;
    return h >>> 0;
}

/**
 * Characters that make a two-character window a function-word combination (你的、會讓、一點…),
 * not a content word. Only windows of two content characters count as a repeat.
 */
export const FUNCTION_CHARS = new Set(
    '你我他她它們的了是在會也就和與跟讓很有沒一不都時這那對要得著把被給先再又更最還而且或及之上下中裡來去到說個些點樣麼什為以所如但卻才能可已從向比當常偶爾些每兩幾多少大小好像起出過自己'.split(
        '',
    ),
);
/** Content words allowed to repeat inside one sentence (none needed: the list is empty). */
export const REPEAT_ALLOWED = new Set<string>();

/**
 * First two-character content word that appears twice in a sentence, ignoring the parenthesised
 * chart basis; null when the sentence is clean.
 */
export function repeatedWord(sentence: string): string | null {
    const text = [...sentence.replace(/（[^）]*）/g, '')];
    const seen = new Set<string>();
    for (let i = 0; i + 1 < text.length; i++) {
        const [a, b] = [text[i], text[i + 1]];
        if (!/\p{Script=Han}/u.test(a) || !/\p{Script=Han}/u.test(b)) continue;
        if (FUNCTION_CHARS.has(a) || FUNCTION_CHARS.has(b)) continue;
        const w = a + b;
        if (REPEAT_ALLOWED.has(w)) continue;
        if (seen.has(w)) return w;
        seen.add(w);
    }
    return null;
}

const isClean = (s: string) => splitSentences(s).every((t) => repeatedWord(t) === null);

/** Two-character content words of a text, the parenthesised chart basis left out. */
function contentWords(text: string): Set<string> {
    const chars = [...text.replace(/（[^）]*）/g, '')];
    const out = new Set<string>();
    for (let i = 0; i + 1 < chars.length; i++) {
        const [a, b] = [chars[i], chars[i + 1]];
        if (!/\p{Script=Han}/u.test(a) || !/\p{Script=Han}/u.test(b)) continue;
        if (FUNCTION_CHARS.has(a) || FUNCTION_CHARS.has(b)) continue;
        out.add(a + b);
    }
    return out;
}

/** How many content words of the paragraph `said` the sentence `next` would bring back. */
function sharedWords(said: string, next: string): number {
    if (!said) return 0;
    const words = contentWords(said);
    return [...contentWords(next)].filter((w) => words.has(w)).length;
}

/**
 * Every option without a repeated word, starting from the chart-seeded one; `fallback` options
 * come after the primary ones. Never empty.
 */
function cleanOptions(
    seed: string,
    primary: readonly string[],
    fallback: readonly string[] = [],
): string[] {
    const i = hashStr(seed) % primary.length;
    const rotated = [...primary.slice(i), ...primary.slice(0, i), ...fallback];
    const clean = rotated.filter(isClean);
    return clean.length ? clean : [rotated[0]];
}

/** Chart-seeded choice; for text options, rotates to the first one without a repeated word. */
function pickBy<T>(seed: string, options: readonly T[]): T {
    const i = hashStr(seed) % options.length;
    if (typeof options[i] !== 'string') return options[i];
    for (let k = 0; k < options.length; k++) {
        const o = options[(i + k) % options.length];
        if (isClean(o as string)) return o;
    }
    return options[i];
}

/**
 * Frames filled with one of a planet's two wordings: the one this report has not used yet, and
 * the other one when every frame would repeat a word with it.
 */
function voiced(
    ctx: Ctx,
    seed: string,
    key: string,
    pair: readonly [string, string],
    frames: (w: string) => string[],
): string[] {
    const w = ctx.phrase(key, pair[0], pair[1]);
    return cleanOptions(seed, frames(w), frames(w === pair[0] ? pair[1] : pair[0]));
}

/** One of a planet's three growth tips / two gift scenes, chosen by seed. */
const tipOf = (k: PlanetKey, seed: string) => pickBy(`${seed}|tip`, tipsOf(k));
const tipsOf = (k: PlanetKey) => [
    BODY_VOICE[k].trapTip,
    BODY_VOICE[k].trapTip2,
    BODY_VOICE[k].trapTip3,
    BODY_VOICE[k].trapTip4,
    BODY_VOICE[k].trapTip5,
];
const sceneOf = (k: PlanetKey, seed: string) =>
    pickBy(`${seed}|gs`, [BODY_VOICE[k].giftScene, BODY_VOICE[k].giftScene2]);

function houseSentence(env: Env, c: HouseConfig | undefined): Exclude<Part, string> | null {
    if (!c || c.bodies.length === 0) return null;
    const h = c.house - 1;
    const seed = `house${c.house}|${c.bodies.join()}|${env.mix}`;
    const basis = `（${names(c.bodies)}在第 ${c.house} 宮）。`;
    const first = pickBy(seed, [HOUSE_KB[h].focus, ...V.HOUSE_FOCUS_ALT[h]]) + basis;
    const follow = V.HOUSE_FOLLOW[c.house];
    if (!follow) return { first, then: first };
    const brief = pickBy(seed, follow.brief);
    return { first, then: [`${follow.lead}${brief}${basis}`, `另外，${brief}${basis}`] };
}

function moonNeighbour(chart: AstroChart): string {
    const moon = chart.bodies.find((b) => b.key === 'moon');
    if (!moon) return '';
    if (moon.degree < 7) return `（也可能還在${S(moon.sign - 1)}）`;
    if (moon.degree >= 23) return `（也可能已進入${S(moon.sign + 1)}）`;
    return '';
}

function noHouseReason(chart: AstroChart): string {
    return chart.timeUnknown ? '出生時間不確定' : '缺少可計算宮位的出生地資料';
}

interface Env {
    chart: AstroChart;
    w: NatalWeights;
    ctx: Ctx;
    /** Signs of the planets the later sections chain from. */
    sunSign: number;
    mercurySign: number;
    /** Element / mode counts, e.g. 「3241|433」, part of every variant seed. */
    mix: string;
    /** Planet 核心優缺點 put in its hook, so 天賦盲區 can spotlight another one. */
    coreGift?: PlanetKey;
}

/**
 * Seed for one planet's wording: its sign, house, the chart's element/mode mix and its tightest
 * aspect. Two people with the same sign but a different house, mix or aspect get other wording.
 */
function seedOf(env: Env, key: PlanetKey): string {
    const b = env.chart.bodies.find((x) => x.key === key);
    const tight = env.w.configs
        .filter(
            (c): c is AspectConfig =>
                c.kind === 'aspect' && (c.aspect.a === key || c.aspect.b === key),
        )
        .sort((x, y) => x.aspect.orb - y.aspect.orb)[0];
    const asp = tight ? `${other(tight.aspect, key)}${tight.aspect.type}` : '-';
    return `${key}|${b?.sign}|${env.w.housesKnown ? b?.house : '-'}|${env.mix}|${asp}`;
}

const signOfBody = (env: Env, k: PlanetKey) => env.chart.bodies.find((b) => b.key === k)?.sign ?? 0;
const houseOfBody = (env: Env, k: PlanetKey) =>
    env.w.housesKnown ? (env.chart.bodies.find((b) => b.key === k)?.house ?? null) : null;

function section(
    env: Env,
    id: NatalSectionId,
    parts: Omit<NatalSection, 'id' | 'title' | 'configs'>,
): NatalSection {
    const title = NATAL_SECTIONS.find((s) => s.id === id)!.title;
    const out: NatalSection = { id, title, ...parts, configs: env.w.sections[id] };
    env.ctx.commit(out);
    return out;
}

/**
 * Deterministic variant picker seeded by the section's top configurations, so two charts with the
 * same placements but a different top combination get different frames.
 */
function vary<T>(cs: NatalConfig[], options: readonly T[], salt = 0, depth = 3): T {
    return pickBy(`${salt}|${cs.slice(0, depth).map(describeConfig).join('|')}`, options);
}

/** Highest-weight config that is not one of the given anchors. */
const topOther = (cs: NatalConfig[], skip: (c: NatalConfig) => boolean) => cs.find((c) => !skip(c));

const isAnchor =
    (...bodies: Array<PlacementConfig['body']>) =>
    (c: NatalConfig) =>
        c.kind === 'placement' && bodies.includes(c.body);

/** Whether an aspect reads as a strain (hard aspects, or a conjunction with a heavy planet). */
const strained = (a: AspectConfig['aspect'], x: PlanetKey) =>
    HARD_ASPECTS.has(a.type) || (a.type === 'conjunction' && HEAVY.has(x));

/** Seed for a shared aspect: both signs, the focus planet's house and the aspect type. */
function aspectSeed(env: Env, a: AspectConfig['aspect'], focus: PlanetKey): string {
    const x = other(a, focus);
    return `${focus}${signOfBody(env, focus)}|${x}${signOfBody(env, x)}|${houseOfBody(env, focus)}|${a.type}`;
}

/** Keyword of the other planet's sign, e.g. 「務實的責任感」. */
const xKw = (env: Env, x: PlanetKey) => SIGN_KB[signOfBody(env, x)].keywords[0];

const ANGULAR = new Set([1, 4, 7, 10]);

function personality(env: Env): NatalSection {
    const { w, ctx, chart } = env;
    const cs = w.sections.natal_personality;
    const sun = env.sunSign;
    const asc = w.ascSign;
    const sunCfg = placement(cs, 'sun');
    const P = NATAL_LIMITS.paragraph;
    const sunKw = SIGN_KB[sun].keywords;
    const sunSeed = seedOf(env, 'sun');
    const core = pickBy(`${sunSeed}|core`, [SUN_KB[sun].core, ...V.SUN_CORE_ALT[sun]]);
    const ascSeed = `asc|${asc}|${sun}|${w.ruler}|${env.mix}|${sunCfg?.house}`;
    const basis = asc !== null ? `（上升${S(asc)}、太陽${S(sun)}）` : `（太陽${S(sun)}）`;

    // Opening blend of ASC + Sun, frame and wording seeded by the chart. `core` always follows
    // 「你」, so no frame stacks a second locative (骨子裡 / 內在) in front of it.
    let blend: string;
    if (asc !== null) {
        const persona = pickBy(`${ascSeed}|persona`, [
            ASC_KB[asc].persona,
            ...V.ASC_PERSONA_ALT[asc],
        ]);
        const personaIn = persona.replace('，', '、');
        blend =
            asc === sun
                ? `你裡外很一致：${core}，給人的第一印象也是${personaIn}${basis}。`
                : pickBy(`${ascSeed}|frame`, [
                      `一出場，你給人的感覺是${personaIn}；真正熟了才知道，你${core}${basis}。`,
                      `別人第一眼看到的你${persona}；熟了才發現，你${core}${basis}。`,
                      `初次見面，大家會覺得你${persona}；相處久了，才發現你${core}${basis}。`,
                      `你給人的第一印象是${personaIn}；再往裡看，你${core}${basis}。`,
                      `表面上你${persona}，私底下的你${core}${basis}。`,
                  ]);
    } else {
        blend = pickBy(`${sunSeed}|blend`, [
            `說到本性，你${core}${basis}。`,
            `你這個人，${core}${basis}。`,
            `認識你的人都知道，你${core}${basis}。`,
        ]);
    }

    const parts = new Map<string, Part>();
    const tenseIds = new Set<string>();
    for (const c of cs) {
        if (c.kind === 'placement' && c.body === 'sun' && c.house !== null) {
            const th = HOUSE_KB[c.house - 1].theme;
            const hb = `（太陽第 ${c.house} 宮）。`;
            parts.set(c.id, {
                first: cleanOptions(`${sunSeed}|house`, [
                    `你的力氣多半往${th}去，在這裡有所表現，最讓你覺得活得有意義${hb}`,
                    `人生的重心常落在${th}，這是你最想證明自己的地方${hb}`,
                    `${th}是你發光的主場，投入在這裡時你最有活力${hb}`,
                ]),
                then: cleanOptions(`${sunSeed}|house`, [
                    `這樣的你，最想在${th}上證明自己${hb}`,
                    `而${th}，正是你最願意花力氣的地方${hb}`,
                    `這份性格，最常用在${th}上${hb}`,
                ]),
            });
        } else if (
            c.kind === 'placement' &&
            c.body === w.ruler &&
            c.body !== 'sun' &&
            c.house !== null
        ) {
            const trait = SIGN_KB[c.sign].trait;
            const short = HOUSE_KB[c.house - 1].short;
            const rb = `（命主星${N(c.body)}在${S(c.sign)}、第 ${c.house} 宮）。`;
            parts.set(c.id, {
                first: `你做起事來帶著一股${trait}，人生的重心也常落在${short}${rb}`,
                then: `做起事來，你還帶著一股${trait}，重心常放在${short}${rb}`,
            });
        } else if (c.kind === 'aspect') {
            const x = other(c.aspect, 'sun');
            const v = BODY_VOICE[x];
            const b = aspectBasis(c.aspect);
            const tense = strained(c.aspect, x);
            const pair = tense ? ([v.hard, v.hardAlt] as const) : V.SELF_SOFT[x];
            const word = ctx.phrase(`${tense ? 'hard' : 'self'}:${x}`, pair[0], pair[1]);
            const w2 = word === pair[0] ? pair[1] : pair[0];
            const xk = xKw(env, x);
            const seed = aspectSeed(env, c.aspect, 'sun');
            const framesOf = (wd: string, kw: string) =>
                tense
                    ? [
                          `只是${v.fn}一過頭，你就容易${wd}`,
                          `不過你也有${v.trapKw}的一面，有時會${wd}`,
                          `${sunKw[0]}的你，偶爾也會${wd}`,
                      ]
                    : [
                          `你${xk}、${V.GIFT_HAS[x]}的那一面，和你的${kw}很合拍，讓你${wd}`,
                          `你的${kw}背後有${v.gift}撐腰，所以你${wd}`,
                          `${v.gift}替你的${kw}加了分，讓你${wd}`,
                      ];
            // Guard: the Sun keyword and the aspect wording must not repeat a word.
            const bodies = cleanOptions(seed, framesOf(word, sunKw[1]), [
                ...framesOf(w2, sunKw[1]),
                ...framesOf(word, sunKw[2]),
                ...framesOf(w2, sunKw[2]),
            ]);
            // Life-area clause only when the house supports it: an angular Sun, or both planets
            // in the same house.
            const sh = houseOfBody(env, 'sun');
            const supported = sh !== null && (ANGULAR.has(sh) || houseOfBody(env, x) === sh);
            const texts = bodies.map((body) => {
                const withArena = supported
                    ? pickBy(
                          `${seed}|${env.mix}|arena`,
                          V.HOUSE_ARENA[sh - 1].map((ar) => `${body}；${ar}${b}。`),
                      )
                    : null;
                return withArena && charLen(withArena) <= P - 3 ? withArena : `${body}${b}。`;
            });
            parts.set(c.id, {
                first: texts,
                then: tense ? texts : texts.map((t) => `再加上${t}`),
            });
            if (tense) tenseIds.add(c.id);
        } else if (c.kind === 'stellium' && c.scope === 'sign') {
            const kw = SIGN_KB[c.index].keywords;
            const text = `你的能量特別集中，${kw[1]}與${kw[2]}的特質在你身上格外鮮明（${c.bodies.length} 顆行星聚在${S(c.index)}）。`;
            parts.set(c.id, { first: text, then: `整體來看，${text}` });
        } else if (c.kind === 'stellium' && c.scope === 'house') {
            const focus = pickBy(`st${c.index}|${c.bodies.join()}`, [
                HOUSE_KB[c.index - 1].focus,
                ...V.HOUSE_FOCUS_ALT[c.index - 1],
            ]);
            const sb = `（${c.bodies.length} 顆行星同在第 ${c.index} 宮）。`;
            parts.set(c.id, {
                first: pickBy(`st${c.index}|${env.mix}`, [
                    `${focus}，你大半的心力都放在這裡${sb}`,
                    `${focus}，這是你生活裡份量最重的一塊${sb}`,
                ]),
                then: `說到生活重心，${focus}${sb}`,
            });
        } else if (c.kind === 'axis' && c.axis === 'asc') {
            const tone = BODY_VOICE[c.body].tone;
            const ab = `（${N(c.body)}緊貼上升點）。`;
            parts.set(c.id, {
                first: `${tone}直接寫在你的第一印象裡${ab}`,
                then: `${tone}也直接寫在你的第一印象裡${ab}`,
            });
        } else if (c.kind === 'balance') {
            const mode = c.mode !== null ? `，也${MODE_TONE[c.mode]}` : '';
            const mb = c.mode !== null ? `、${MODE_NAMES[c.mode]}星座` : '星座';
            const text = `${ELEMENT_TONE[c.element]}${mode}（多數行星落在${SIGN_ELEMENTS[c.element]}象${mb}）。`;
            parts.set(c.id, { first: text, then: `大方向上，${text}` });
        }
    }

    // The highest-weight non-anchor configuration leads when it outweighs the Sun; a strained
    // Sun aspect never opens the section (strengths first) but still shapes the hook.
    const top = topOther(cs, isAnchor('asc', 'sun'));
    const leadFirst =
        top &&
        sunCfg &&
        top.weight > sunCfg.weight &&
        parts.has(top.id) &&
        !(top.kind === 'aspect' && strained(top.aspect, other(top.aspect, 'sun')));
    // Strengths in weight order; one strained Sun aspect, if any, closes its paragraph.
    const ordered = [...parts.entries()]
        .filter(([id]) => id !== 'placement:sun' && !tenseIds.has(id))
        .map(([, t]) => t);
    const tenseId = [...tenseIds][0];
    const tensePart = tenseId ? parts.get(tenseId) : null;
    const sunHouse = sunCfg ? parts.get(sunCfg.id) : undefined;
    let p1: string;
    let p2: string;
    if (leadFirst) {
        p1 = ctx.pack([parts.get(top.id)!, ...ordered], P, tensePart);
        p2 = ctx.pack([blend, sunHouse], P);
    } else {
        p1 = ctx.pack([blend], P);
        p2 = ctx.pack([...ordered, sunHouse], P, tensePart);
    }
    if (!p2) p2 = ctx.pack([`日常裡，你${SIGN_KB[sun].light_side}`], P);

    let hook: string;
    if (top && leadFirst && top.kind === 'stellium') {
        hook =
            top.scope === 'sign'
                ? `${SIGN_KB[top.index].keywords[1]}被放大成你的主旋律`
                : `人生重心都押在${HOUSE_KB[top.index - 1].short}`;
    } else if (top && leadFirst && top.kind === 'axis') {
        hook = `一出場就帶著${BODY_VOICE[top.body].tone}`;
    } else if (top && top.weight > (sunCfg?.weight ?? 0) && top.kind === 'aspect') {
        const x = other(top.aspect, 'sun');
        const v = BODY_VOICE[x];
        const seed = aspectSeed(env, top.aspect, 'sun') + ascSeed;
        const k0 = pickBy(`${seed}|kw`, [sunKw[0], sunKw[2]]);
        hook = strained(top.aspect, x)
            ? pickBy(seed, [
                  `${k0}與${v.trapKw}的拉鋸`,
                  `${sunKw[0]}的你，也在和${v.trapKw}過招`,
                  `${k0}背後，藏著${v.trapKw}的課題`,
              ])
            : pickBy(seed, [
                  `${v.giftKw}是你${k0}背後的底氣`,
                  `${k0}裡藏著${v.giftKw}`,
                  `${v.giftKw}替你的${k0}加分`,
                  `${sunKw[1]}又帶著${v.giftKw}`,
              ]);
    } else if (asc !== null && asc !== sun) {
        const a = SIGN_KB[asc].keywords[0];
        hook = pickBy(ascSeed, [
            `看起來${a}，骨子裡${sunKw[0]}`,
            `${a}的外表，${sunKw[0]}的心`,
            `外在${a}，內在${sunKw[0]}`,
        ]);
    } else {
        hook = pickBy(sunSeed, [
            `${sunKw[0]}是本色，${sunKw[1]}是底氣`,
            `${sunKw[0]}又${sunKw[1]}的你`,
            `裡外如一的${sunKw[0]}`,
        ]);
    }

    const field = w.housesKnown
        ? '依上升星座、命主星、太陽星座與行星聚集處，看你給人的感覺與日常樣貌。'
        : `依太陽星座與行星分布推估；${noHouseReason(chart)}，算不出上升星座與宮位，第一印象的部分較不確定。`;

    const dailyPool =
        asc !== null
            ? [
                  ASC_KB[asc].daily,
                  V.ASC_DAILY_ALT[asc],
                  ASC_KB[sun].daily,
                  V.ASC_DAILY_ALT[sun],
                  ...(w.ruler ? [V.ASC_DAILY_ALT[signOfBody(env, w.ruler)]] : []),
              ]
            : [ASC_KB[sun].daily, V.ASC_DAILY_ALT[sun]];
    const sunAsp = top?.kind === 'aspect' ? top : undefined;
    const adviceOpts = asc !== null ? [SUN_KB[sun].tip, V.ASC_TIP[asc]] : [SUN_KB[sun].tip];
    return section(env, 'natal_personality', {
        field,
        hook,
        insight: [p1, p2],
        scene: ctx.first([pickBy(`${ascSeed}|daily`, dailyPool), ...dailyPool], NATAL_LIMITS.scene),
        advice: ctx.first(
            [
                sunAsp && strained(sunAsp.aspect, other(sunAsp.aspect, 'sun'))
                    ? tipOf(other(sunAsp.aspect, 'sun'), aspectSeed(env, sunAsp.aspect, 'sun'))
                    : null,
                // Sun-sign tip or ASC tip, chosen by the ascendant and the top configuration.
                pickBy(`${ascSeed}|${top ? describeConfig(top) : '-'}|tip`, adviceOpts),
                ...adviceOpts,
            ],
            NATAL_LIMITS.advice,
        ),
    });
}

function logic(env: Env): NatalSection {
    const { w, ctx, chart } = env;
    const cs = w.sections.natal_logic;
    const m = env.mercurySign;
    const merc = placement(cs, 'mercury');
    const h = merc?.house ?? null;
    const P = NATAL_LIMITS.paragraph;
    const seed = seedOf(env, 'mercury');
    const mind = pickBy(`${seed}|mind`, [MERCURY_KB[m].mind, ...V.MERCURY_MIND_ALT[m]]);
    const mb = `（水星${S(m)}${h ? `、第 ${h} 宮` : ''}）`;
    const mindLine: Part = {
        first: cleanOptions(`${seed}|frame`, [
            `你${mind}${mb}。`,
            `動起腦來，你${mind}${mb}。`,
            `你的思路很有個人特色：${mind}${mb}。`,
            `想事情的時候，你${mind}${mb}。`,
            `在思考這件事上，你${mind}${mb}。`,
        ]),
        then: cleanOptions(`${seed}|frame2`, [
            `說到思考習慣，你${mind}${mb}。`,
            `平常想事情，你${mind}${mb}。`,
            `細看你的思考方式，你${mind}${mb}。`,
        ]),
    };
    // Skipped when a house sentence below already covers Mercury's own house.
    const houseOpts =
        h && !cs.some((c) => c.kind === 'house' && c.house === h && c.bodies.length > 0)
            ? cleanOptions(`${seed}|houseLine`, [
                  `這股腦力最常用在${HOUSE_KB[h - 1].theme}上。`,
                  `你特別愛把腦力花在${HOUSE_KB[h - 1].theme}。`,
                  `${HOUSE_KB[h - 1].theme}是你最常動腦的地方。`,
              ])
            : null;
    const houseLine: Part | null = houseOpts && { first: houseOpts, then: houseOpts };

    const extras: Part[] = [];
    const strains: Part[] = [];
    let lead: Part | null = null;
    for (const c of cs) {
        let t: Part | null = null;
        if (c.kind === 'aspect') {
            const x = other(c.aspect, 'mercury');
            const v = BODY_VOICE[x];
            const b = aspectBasis(c.aspect);
            const as = aspectSeed(env, c.aspect, 'mercury');
            if (HARD_ASPECTS.has(c.aspect.type)) {
                const o = voiced(ctx, as, `mindHard:${x}`, V.MIND_HARD[x], (wd) => [
                    `只是${v.fn}偶爾會干擾判斷，讓你${wd}${b}。`,
                    `不過${v.fn}一過頭，你容易${wd}${b}。`,
                    `要留意的是，你有時會${wd}${b}。`,
                ]);
                strains.push({ first: o, then: o });
            } else if (c.aspect.type === 'conjunction' && HEAVY.has(x)) {
                const good = ctx.phrase(`mind:${x}`, ...V.MIND_SOFT[x]);
                const o = voiced(ctx, as, `mindHard:${x}`, V.MIND_HARD[x], (wd) => [
                    `${v.fn}和你的思考綁得很緊：你${good}，但有時也會${wd}${b}。`,
                ]);
                strains.push({ first: o, then: o });
            } else {
                const pair = V.MIND_SOFT[x];
                const wd = ctx.phrase(`mind:${x}`, pair[0], pair[1]);
                const w2 = wd === pair[0] ? pair[1] : pair[0];
                const opening = (m: string) => [
                    `你${xKw(env, x)}、${V.GIFT_HAS[x]}的那一面替思考加了分，讓你${m}${b}。`,
                    `${v.gift}是你動腦時的好幫手，讓你${m}${b}。`,
                    `遇到問題時，你${m}${b}。`,
                ];
                const following = (m: string) => [`你也${m}${b}。`, `而且你${m}${b}。`];
                t = {
                    first: cleanOptions(as, opening(wd), opening(w2)),
                    then: cleanOptions(as, following(wd), following(w2)),
                };
            }
            // A very tight supportive aspect outweighs the sign and opens the section.
            if (t && !lead && merc && c.weight > merc.weight) {
                lead = t;
                continue;
            }
        } else if (c.kind === 'house') {
            t = houseSentence(env, c);
        } else if (c.kind === 'axis') {
            const text = `說出口的話很容易被看見，常讓人留下深刻印象（水星緊貼${AXIS_NAMES[c.axis]}）。`;
            t = { first: `你${text}`, then: `而且你${text}` };
        }
        if (t) extras.push(t);
    }
    if (merc?.retrograde) {
        const text = '習慣把想法反覆咀嚼才定案，回顧和修改是你的強項（水星逆行）。';
        extras.push({ first: `你${text}`, then: `你也${text}` });
    }

    // With a leading aspect and nothing else to say, the Mercury sign line opens paragraph two.
    const p1 = lead
        ? ctx.pack([lead, extras.length || strains.length ? mindLine : null], P)
        : ctx.pack([mindLine, houseLine], P);
    // Strengths first; one strain, if any, closes the paragraph.
    const p2 =
        ctx.pack(lead ? [mindLine, houseLine, ...extras] : extras, P, strains[0]) ||
        ctx.pack(
            [
                houseLine,
                '你的思考比較獨立運作，不太被其他面向牽動，想法往往很純粹（水星沒有緊密角度）。',
            ],
            P,
        );

    const topAsp = aspects(cs)[0];
    const topLeads = topAsp && merc && topAsp.weight > merc.weight;
    let hook = MERCURY_KB[m].hook;
    if (topLeads) {
        const x = other(topAsp.aspect, 'mercury');
        const v = BODY_VOICE[x];
        hook = pickBy(`${seed}|hook`, [
            strained(topAsp.aspect, x) ? v.mindHard : v.mindSoft,
            MERCURY_KB[m].hook,
        ]);
    }

    const field = w.housesKnown
        ? '依水星的星座、落點與它和其他行星的角度，以及學習與信念相關的人生領域。'
        : `依水星星座與它和其他行星的角度；${noHouseReason(chart)}，學習與信念相關的宮位這次略過。`;

    const scenes = [MERCURY_KB[m].scene, V.MERCURY_SCENE_ALT[m], V.MERCURY_SCENE_ALT2[m]];
    const tips = [MERCURY_KB[m].tip, V.MERCURY_TIP_ALT[m]];
    return section(env, 'natal_logic', {
        field,
        hook,
        insight: [p1, p2],
        scene: ctx.first([pickBy(`${seed}|scene`, scenes), ...scenes], NATAL_LIMITS.scene),
        advice: ctx.first(
            [
                topLeads && strained(topAsp.aspect, other(topAsp.aspect, 'mercury'))
                    ? tipOf(
                          other(topAsp.aspect, 'mercury'),
                          aspectSeed(env, topAsp.aspect, 'mercury'),
                      )
                    : null,
                pickBy(`${seed}|tip`, tips),
                ...tips,
            ],
            NATAL_LIMITS.advice,
        ),
    });
}

function stress(env: Env): NatalSection {
    const { w, ctx, chart } = env;
    const cs = w.sections.natal_stress;
    const P = NATAL_LIMITS.paragraph;
    const moon = placement(cs, 'moon');
    const mars = placement(cs, 'mars');
    const hard = aspects(cs).filter((c) => HARD_ASPECTS.has(c.aspect.type));
    const moonSeed = seedOf(env, 'moon');
    const marsSeed = seedOf(env, 'mars');

    const moonS = moon
        ? pickBy(`${moonSeed}|stress`, [MOON_KB[moon.sign].stress, ...V.MOON_STRESS_ALT[moon.sign]])
        : null;
    const marsS = mars
        ? pickBy(`${marsSeed}|stress`, [MARS_KB[mars.sign].stress, ...V.MARS_STRESS_ALT[mars.sign]])
        : null;
    let reaction: string[];
    const jointBasis = moon && mars ? `（月亮${S(moon.sign)}、火星${S(mars.sign)}）` : '';
    const joint =
        moon && mars
            ? pickBy(`${moonSeed}|${marsSeed}`, [
                  `壓力一大，你${moonS}；真的被逼急時，${marsS}${jointBasis}。`,
                  `心裡一亂，你${moonS}；情況再緊一點，${marsS}${jointBasis}。`,
                  `遇到難關時，你${moonS}；要是被逼到牆角，${marsS}${jointBasis}。`,
                  `事情一多，你${moonS}；再被推一把，${marsS}${jointBasis}。`,
              ])
            : null;
    if (joint && charLen(joint) <= P) reaction = [joint];
    else {
        reaction = [
            moon ? `壓力一大，你${moonS}（月亮${S(moon.sign)}）。` : null,
            mars ? `真的被逼急時，${marsS}（火星${S(mars.sign)}）。` : null,
        ].filter((x): x is string => x !== null);
    }

    const tension: string[] = hard.map((c, i) => {
        const a = c.aspect;
        const b = aspectBasis(a);
        const wa = BODY_VOICE[a.a].want;
        const wb = BODY_VOICE[a.b].want;
        const seed = `${aspectSeed(env, a, a.a)}|${i}`;
        if (i > 0) {
            return pickBy(seed, [
                `另外，${BODY_VOICE[a.a].fnShort}和${BODY_VOICE[a.b].fnShort}的需要也不時互相卡住${b}。`,
                `${BODY_VOICE[a.a].fnShort}與${BODY_VOICE[a.b].fnShort}之間還有一條暗線，偶爾讓你卡關${b}。`,
            ]);
        }
        return pickBy(seed, [
            `一邊想${wa}，一邊又想${wb}，壓力下這兩股力量最容易打架${b}。`,
            `你心裡同時住著想${wa}和想${wb}的兩個自己，壓力越大，拉扯越明顯${b}。`,
            `想${wa}的你，偏偏又想${wb}，越忙越容易卡在中間${b}。`,
            `壓力來時，想${wa}與想${wb}的念頭會同時冒出來，讓你左右為難${b}。`,
        ]);
    });
    const sat = placement(cs, 'saturn');
    const lesson = sat
        ? `${pickBy(`${seedOf(env, 'saturn')}|lesson`, [SATURN_KB[sat.sign].lesson, ...V.SATURN_LESSON_ALT[sat.sign]])}（土星${S(sat.sign)}）。`
        : null;
    const satLine: Part | null = lesson && {
        first: lesson,
        then: pickBy(`${seedOf(env, 'saturn')}|link`, [
            `說到底，${lesson}`,
            `壓力的根源在於，${lesson}`,
            `往深處看，${lesson}`,
        ]),
    };

    // Lead with the tense aspect when it outweighs the Moon.
    const topHard = hard[0];
    const hardFirst = topHard && moon && topHard.weight > moon.weight;
    const p1 = ctx.pack(hardFirst ? [tension[0]] : reaction, P);
    const p2 =
        ctx.pack(
            hardFirst ? [...reaction, ...tension.slice(1), satLine] : [...tension, satLine],
            P,
        ) ||
        ctx.pack(
            [satLine, '你的盤面沒有特別尖銳的拉扯，壓力多半來自外在環境，而不是內心的自我拉鋸。'],
            P,
        );

    const hookBody = topHard ? pickBody(topHard.aspect, CHALLENGE_PRIORITY) : null;
    const bothWants = topHard
        ? `又想${BODY_VOICE[topHard.aspect.a].want}，又想${BODY_VOICE[topHard.aspect.b].want}`
        : '';
    const hook =
        topHard && hookBody
            ? pickBy(aspectSeed(env, topHard.aspect, topHard.aspect.a) + moonSeed, [
                  BODY_VOICE[hookBody].stressHook,
                  V.STRESS_HOOK2[hookBody],
                  charLen(bothWants) <= 16 ? bothWants : V.STRESS_HOOK2[hookBody],
                  `${BODY_VOICE[topHard.aspect.a].fnShort}與${BODY_VOICE[topHard.aspect.b].fnShort}的拉鋸戰`,
              ])
            : ELEMENT_STRESS_HOOK[(moon?.sign ?? env.sunSign) % 4];

    let field = '依月亮、火星、土星與行星間較緊繃的角度，看你在壓力下的防衛方式。';
    if (!w.moonReliable) {
        field += `出生時間不確定，月亮位置可能偏差${moonNeighbour(chart)}，情緒反應的部分僅供參考。`;
    }

    const ms = moon?.sign ?? env.sunSign;
    const scenes = [MOON_KB[ms].scene, V.MOON_SCENE_ALT[ms]];
    const tips = [MOON_KB[ms].tip, V.MOON_TIP_ALT[ms]];
    return section(env, 'natal_stress', {
        field,
        hook,
        insight: [p1, p2],
        scene: ctx.first([pickBy(`${moonSeed}|scene`, scenes), ...scenes], NATAL_LIMITS.scene),
        advice: ctx.first([pickBy(`${moonSeed}|tip`, tips), ...tips], NATAL_LIMITS.advice),
    });
}

function love(env: Env): NatalSection {
    const { w, ctx, chart } = env;
    const cs = w.sections.natal_love;
    const P = NATAL_LIMITS.paragraph;
    const venus = placement(cs, 'venus');
    const vSign = venus?.sign ?? env.sunSign;
    const vSeed = seedOf(env, 'venus');

    const loveText = pickBy(`${vSeed}|love`, [VENUS_KB[vSign].love, ...V.VENUS_LOVE_ALT[vSign]]);
    const vb = `（金星${S(vSign)}）。`;
    const venusLine: Part = {
        first: pickBy(`${vSeed}|frame`, [
            `你${loveText}${vb}`,
            `在愛裡，你${loveText}${vb}`,
            `談感情時，你${loveText}${vb}`,
        ]),
        then: `你${loveText}${vb}`,
    };
    // Weight order, so the chart's top love configuration opens the section; strengths first and
    // at most one strain named (2:1 tone).
    const positives: Part[] = [];
    const strains: Part[] = [];
    let moonNeed: string | null = null;
    for (const c of cs) {
        if (c.kind === 'placement' && c.body === 'venus') {
            positives.push(venusLine);
        } else if (c.kind === 'placement' && c.body === 'moon') {
            const s = seedOf(env, 'moon');
            const need = pickBy(`${s}|need`, [MOON_KB[c.sign].need, V.MOON_NEED_ALT[c.sign]]);
            moonNeed = need;
            const mb = `（月亮${S(c.sign)}）。`;
            positives.push({
                first: cleanOptions(`${s}|needFrame`, [
                    `你在感情裡需要的是${need}${mb}`,
                    `感情裡最能讓你安心的，是${need}${mb}`,
                ]),
                then: cleanOptions(`${s}|needThen`, [
                    `而真正讓你安心的，是${need}${mb}`,
                    `而你最想要的，是${need}${mb}`,
                ]),
            });
        } else if (c.kind === 'placement' && c.body === 'mars') {
            const s = seedOf(env, 'mars');
            const pursue = pickBy(`${s}|pursue`, [
                MARS_KB[c.sign].pursue,
                V.MARS_PURSUE_ALT[c.sign],
            ]);
            const mb = `（火星${S(c.sign)}）。`;
            positives.push({
                first: pickBy(`${s}|pursueFrame`, [
                    `喜歡上一個人時，你${pursue}${mb}`,
                    `心動的時候，你${pursue}${mb}`,
                ]),
                then: `一旦心動，你${pursue}${mb}`,
            });
        } else if (c.kind === 'house' && c.house === 7 && w.ascSign !== null) {
            const dsc = (w.ascSign + 6) % 12;
            const attract = SIGN_KB[dsc].attract;
            const db = `（下降點${S(dsc)}）。`;
            positives.push({
                first: pickBy(`dsc|${dsc}|${vSeed}`, [
                    `你容易被${attract}的人吸引${db}`,
                    `${attract}的人特別容易讓你心動${db}`,
                ]),
                then: `會讓你心動的，多半是${attract}的人${db}`,
            });
            const occ = houseSentence(env, c);
            if (occ) positives.push(occ);
        } else if (c.kind === 'house') {
            const s = houseSentence(env, c);
            if (s) positives.push(s);
        } else if (c.kind === 'aspect') {
            const focus: PlanetKey =
                c.aspect.a === 'venus' || c.aspect.b === 'venus' ? 'venus' : 'moon';
            const x = other(c.aspect, focus);
            const b = aspectBasis(c.aspect);
            const as = aspectSeed(env, c.aspect, focus);
            if (strained(c.aspect, x)) {
                const o = voiced(ctx, as, `loveHard:${x}`, V.LOVE_HARD[x], (wd) => [
                    `只是你偶爾會${wd}${b}。`,
                    `不過感情裡的你，有時會${wd}${b}。`,
                    `要留意的是，你有時會${wd}${b}。`,
                ]);
                strains.push({ first: o, then: o });
            } else {
                const pair = V.LOVE_SOFT[x];
                const wd = ctx.phrase(`love:${x}`, pair[0], pair[1]);
                const w2 = wd === pair[0] ? pair[1] : pair[0];
                const opening = (t: string) => [
                    `感情裡的你${t}${b}。`,
                    `面對喜歡的人，你${t}${b}。`,
                    `在感情中，你${xKw(env, x)}、${V.GIFT_HAS[x]}的那一面讓你${t}${b}。`,
                ];
                const following = (t: string) => [`而且你${t}${b}。`, `你也${t}${b}。`];
                positives.push({
                    first: cleanOptions(as, opening(wd), opening(w2)),
                    then: cleanOptions(as, following(wd), following(w2)),
                });
            }
        } else if (c.kind === 'axis') {
            positives.push(
                `你常在伴侶身上遇見${BODY_VOICE[c.body].tone}，或在關係裡被激發出這一面（${N(c.body)}緊貼下降點）。`,
            );
        }
    }
    const twist = pickBy(`${seedOf(env, 'sun')}|twist`, [
        SIGN_KB[env.sunSign].loveTwist,
        V.LOVE_TWIST_ALT[env.sunSign],
    ]);
    const p1 = ctx.pack(positives.slice(0, 2), P);
    // Paragraph two: the Sun trait turned into a love scene, more strengths while there is
    // room, and the strain last so nothing positive trails after the 「只是…」.
    const rest = positives.slice(2).filter((t) => !p1.includes(thenOf(t)));
    const p2 = ctx.pack([twist, ...rest], P, strains[0]);

    const top = cs[0];
    let hook = VENUS_KB[vSign].hook;
    if (top?.kind === 'aspect') {
        const focus: PlanetKey =
            top.aspect.a === 'venus' || top.aspect.b === 'venus' ? 'venus' : 'moon';
        const x = other(top.aspect, focus);
        hook = V.LOVE_HOOK[x][strained(top.aspect, x) ? 1 : 0];
    } else if (top?.kind === 'placement' && top.body === 'moon') {
        // The wording the paragraph did not use, so hook and first line do not echo each other.
        const need =
            moonNeed === MOON_KB[top.sign].need
                ? V.MOON_NEED_ALT[top.sign]
                : MOON_KB[top.sign].need;
        if (charLen(`你要的是${need}`) <= NATAL_LIMITS.hook)
            hook = pickBy(`${vSeed}|hook`, [`你要的是${need}`, VENUS_KB[vSign].hook]);
    }

    let field: string;
    if (w.housesKnown) field = '依金星、火星、月亮，以及戀愛與伴侶相關的人生領域。';
    else {
        field = `依金星、火星、月亮推估；${noHouseReason(chart)}，看不出戀愛與伴侶的宮位`;
        field += w.moonReliable ? '。' : `，月亮位置也可能偏差${moonNeighbour(chart)}。`;
    }

    const scenes = [VENUS_KB[vSign].scene, V.VENUS_SCENE_ALT[vSign], V.VENUS_SCENE_ALT2[vSign]];
    const tips = [VENUS_KB[vSign].tip, V.VENUS_TIP_ALT[vSign]];
    return section(env, 'natal_love', {
        field,
        hook,
        insight: [p1, p2],
        scene: ctx.first([pickBy(`${vSeed}|scene`, scenes), ...scenes], NATAL_LIMITS.scene),
        advice: ctx.first([pickBy(`${vSeed}|tip`, tips), ...tips], NATAL_LIMITS.advice),
    });
}

function career(env: Env): NatalSection {
    const { w, ctx, chart } = env;
    const cs = w.sections.natal_career;
    const P = NATAL_LIMITS.paragraph;
    const jup = placement(cs, 'jupiter');
    const jupSign = jup?.sign ?? signOfBody(env, 'jupiter');
    const mc = w.mcSign;
    const h10 = house(cs, 10);
    const sat = placement(cs, 'saturn');
    const satSign = sat?.sign ?? signOfBody(env, 'saturn');
    const satFirst =
        !!sat && (!jup || cs.indexOf(sat) < cs.indexOf(jup) || vary(cs, [false, true], 7));
    const cSeed = `career|${mc}|${env.mix}|${h10?.bodies.join()}|${seedOf(env, 'jupiter')}`;

    const lead: Part[] = [];
    const rest: Part[] = [];
    if (mc !== null) {
        const f = SIGN_KB[mc].careerField;
        const j = SIGN_KB[mc].careerJobs;
        lead.push(
            pickBy(cSeed, [
                `你最能發揮的地方，是${f}，例如${j}（天頂${S(mc)}）。`,
                `${f}最適合你，像${j}都是可以考慮的方向（天頂${S(mc)}）。`,
                `把力氣放在${f}，例如${j}，最容易做出成績（天頂${S(mc)}）。`,
                `你的事業方向偏向${f}，${j}都很能發揮你的長處（天頂${S(mc)}）。`,
            ]),
        );
    }
    for (const c of cs) {
        if (c.kind === 'house' && c.house === 10) {
            const s = houseSentence(env, c);
            if (s) lead.push(s);
        } else if (c.kind === 'axis') {
            lead.push(
                `在工作場合，你的${BODY_VOICE[c.body].tone}特別顯眼，容易被賦予重任（${N(c.body)}緊貼天頂）。`,
            );
        } else if (c.kind === 'placement' && c.body === 'jupiter') {
            const js = seedOf(env, 'jupiter');
            const gift = pickBy(`${js}|gift`, [
                JUPITER_KB[c.sign].gift,
                ...V.JUPITER_GIFT_ALT[c.sign],
            ]);
            lead.push({
                first: pickBy(`${js}|giftFrame`, [
                    `機會常在你${gift}時出現（木星${S(c.sign)}）。`,
                    `當你${gift}，好機會就跟著來（木星${S(c.sign)}）。`,
                ]),
                then: pickBy(`${js}|giftFrame`, [
                    `機會也常在你${gift}時出現（木星${S(c.sign)}）。`,
                    `而當你${gift}，好機會就跟著來（木星${S(c.sign)}）。`,
                ]),
            });
            if (mc === null) lead.push(`${SIGN_KB[c.sign].careerJobs}這類工作，很能讓你發揮所長。`);
        } else if (c.kind === 'placement' && c.body === 'saturn') {
            const work = pickBy(`${seedOf(env, 'saturn')}|work`, [
                SATURN_KB[c.sign].work,
                ...V.SATURN_WORK_ALT[c.sign],
            ]);
            const text = `${work}（土星${S(c.sign)}）。`;
            rest.push({
                first: text,
                then: [`長期來看，${text}`, `說到工作態度，${text}`],
            });
        } else if (c.kind === 'house') {
            const s = houseSentence(env, c);
            if (s) rest.push(s);
        }
    }
    const p1 = ctx.pack(lead, P);
    const p2 =
        ctx.pack(rest, P) ||
        ctx.pack(
            [
                `你的韌性在於${SIGN_KB[jupSign].light_side}`,
                '長期來看，穩穩累積比短期衝刺更能讓你走得遠。',
            ],
            P,
        );

    // Context chaining: the thinking style from 底層邏輯 turned into a workplace scene.
    const ms = env.mercurySign;
    const mSeed = seedOf(env, 'mercury');
    const twist = pickBy(`${mSeed}|work`, [SIGN_KB[ms].workTwist, V.WORK_TWIST_ALT[ms]]);
    const scene = ctx.first(
        [
            pickBy(`${mSeed}|workFrame`, [
                `這樣的思考方式放到職場上，你${twist}。`,
                `換到工作現場，你${twist}。`,
                `帶著這種腦袋上班，你${twist}。`,
                `在職場上，這樣的你${twist}。`,
                `把這份思考力帶進工作，你${twist}。`,
                `上班時，你${twist}。`,
                `工作上，你${twist}。`,
            ]),
        ],
        NATAL_LIMITS.scene,
    );

    const lead10 = h10?.bodies
        .slice()
        .sort((a, b) => GIFT_PRIORITY.indexOf(a) - GIFT_PRIORITY.indexOf(b))[0];
    const hookSign = SIGN_KB[mc ?? jupSign];
    const hook = lead10
        ? pickBy(cSeed, [`在工作裡，${BODY_VOICE[lead10].giftKw}就是你的武器`, hookSign.careerHook])
        : pickBy(cSeed, [
              hookSign.careerHook,
              `把${hookSign.keywords[1]}變成你的專業`,
              `${hookSign.keywords[2]}是你在職場的招牌`,
              `在職場上，${hookSign.keywords[0]}會替你加分`,
          ]);

    const field = w.housesKnown
        ? '依天頂（事業方向）、日常工作與金錢相關的人生領域，以及木星、土星。'
        : `依木星與土星推估；${noHouseReason(chart)}，算不出代表事業方向的天頂與宮位，這段參考性較低。`;

    return section(env, 'natal_career', {
        field,
        hook,
        insight: [p1, p2],
        scene,
        // Saturn's tip when Saturn outranks Jupiter in this section, Jupiter's otherwise.
        advice: ctx.first(
            satFirst
                ? [SATURN_KB[satSign].tip, JUPITER_KB[jupSign].tip]
                : [JUPITER_KB[jupSign].tip, SATURN_KB[satSign].tip],
            NATAL_LIMITS.advice,
        ),
    });
}

const AXIS_DOMAIN: Record<AxisConfig['axis'], string> = {
    asc: '給人的第一印象',
    mc: '工作場合',
    dsc: '親密關係',
    ic: '家庭生活',
};

function core(env: Env): NatalSection {
    const { w, ctx } = env;
    const cs = w.sections.natal_core;
    const P = NATAL_LIMITS.paragraph;
    const soft = aspects(cs).filter((c) => SOFT_ASPECTS.has(c.aspect.type));
    const hard = cs.filter(
        (c): c is AspectConfig | AxisConfig =>
            (c.kind === 'aspect' && HARD_ASPECTS.has(c.aspect.type)) || c.kind === 'axis',
    );

    const strengths: string[] = soft.map((c, i) => {
        const a = c.aspect;
        const b = aspectBasis(a);
        const ga = BODY_VOICE[a.a].gift;
        const gb = BODY_VOICE[a.b].gift;
        const seed = `${aspectSeed(env, a, a.a)}|core${i}`;
        if (i > 0) {
            return pickBy(seed, [
                `${ga}與${gb}之間也很有默契，關鍵時刻常幫你一把${b}。`,
                `另外，${ga}和${gb}也常聯手替你解圍${b}。`,
                `${ga}和${gb}互相補位，是你的另一張王牌${b}。`,
            ]);
        }
        return pickBy(seed, [
            `你最大的本錢，是${ga}和${gb}能互相成全${b}。`,
            `${ga}加上${gb}，是你最拿得出手的組合${b}。`,
            `你身上最順的一條線，是${ga}和${gb}彼此撐腰${b}。`,
            `${ga}和${gb}在你身上配合得天衣無縫${b}。`,
            `一旦同時用上${ga}和${gb}，你幾乎無往不利${b}。`,
        ]);
    });
    if (strengths.length === 0) strengths.push(`你的優勢在於${SIGN_KB[env.sunSign].light_side}`);

    const blind: Part[] = [];
    hard.forEach((c, i) => {
        if (c.kind === 'axis') {
            blind.push(
                `在${AXIS_DOMAIN[c.axis]}裡，你的${BODY_VOICE[c.body].tone}有時會用力過頭，需要拿捏分寸（${N(c.body)}緊貼${AXIS_NAMES[c.axis]}）。`,
            );
            return;
        }
        const a = c.aspect;
        const ch = pickBody(a, CHALLENGE_PRIORITY);
        const v = BODY_VOICE[ch];
        const fa = BODY_VOICE[a.a].fnShort;
        const fb = BODY_VOICE[a.b].fnShort;
        const b = aspectBasis(a);
        const seed = `${aspectSeed(env, a, a.a)}|blind${i}`;
        const o = voiced(ctx, seed, `hard:${ch}`, [v.hard, v.hardAlt], (trait) =>
            i === 0
                ? [
                      `最需要留意的盲點，是${fa}和${fb}互不相讓時，你容易${trait}${b}。`,
                      `你的罩門在於：${fa}和${fb}一卡住，你很容易${trait}${b}。`,
                      `當${fa}和${fb}打架，你最容易${trait}，這是值得練習的地方${b}。`,
                      `${fa}與${fb}較勁的時候，你常不自覺地${trait}${b}。`,
                  ]
                : [
                      `另一個要注意的地方，是你偶爾會${trait}${b}。`,
                      `還有一個小盲點：你有時會${trait}${b}。`,
                  ],
        );
        blind.push({ first: o, then: o });
    });
    if (blind.length === 0) blind.push(`最需要留意的盲點是：${SIGN_KB[env.sunSign].shadow_side}`);

    const topSoft = soft[0];
    const giftFirst = topSoft ? pickBody(topSoft.aspect, GIFT_PRIORITY) : 'sun';
    const strengthBody: PlanetKey = topSoft
        ? pickBy(aspectSeed(env, topSoft.aspect, giftFirst), [
              giftFirst,
              other(topSoft.aspect, giftFirst),
          ])
        : 'sun';
    const topHard = hard[0];
    const challengeBody: PlanetKey | null = !topHard
        ? null
        : topHard.kind === 'axis'
          ? topHard.body
          : pickBody(topHard.aspect, CHALLENGE_PRIORITY);
    const giftKw = BODY_VOICE[strengthBody].giftKw;
    if (topSoft) env.coreGift = strengthBody;
    const hook = challengeBody
        ? vary(cs, [
              `${giftKw}是天賦，${BODY_VOICE[challengeBody].trapKw}是功課`,
              `靠${giftKw}發光，因${BODY_VOICE[challengeBody].trapKw}卡關`,
              `${giftKw}是武器，${BODY_VOICE[challengeBody].trapKw}是罩門`,
          ])
        : `${giftKw}是你最可靠的天賦`;

    let field = '從整張盤最順暢與最緊繃的行星角度，整理你最大的優勢與盲點。';
    if (!w.moonReliable) field += '月亮的角度受出生時間影響，這次略過。';

    const secondHard = hard.find((c) => c !== topHard);
    const secondBody =
        secondHard &&
        (secondHard.kind === 'axis'
            ? secondHard.body
            : pickBody(secondHard.aspect, CHALLENGE_PRIORITY));
    return section(env, 'natal_core', {
        field,
        hook,
        insight: [ctx.pack(strengths, P), ctx.pack(blind, P)],
        scene: ctx.first(
            [
                sceneOf(
                    strengthBody,
                    topSoft ? aspectSeed(env, topSoft.aspect, strengthBody) : env.mix,
                ),
                ...soft
                    .slice(1)
                    .map((c) =>
                        sceneOf(
                            pickBody(c.aspect, GIFT_PRIORITY),
                            aspectSeed(env, c.aspect, c.aspect.a),
                        ),
                    ),
                BODY_VOICE.sun.giftScene2,
                BODY_VOICE.sun.giftScene,
            ],
            NATAL_LIMITS.scene,
        ),
        advice: ctx.first(
            [
                challengeBody && topHard
                    ? pickBy(`${describeConfig(topHard)}|${env.mix}`, [
                          ...tipsOf(challengeBody),
                          ...(secondBody ? tipsOf(secondBody).slice(2) : []),
                      ])
                    : null,
                secondBody && secondHard
                    ? tipOf(secondBody, `${describeConfig(secondHard)}|${env.mix}`)
                    : null,
                challengeBody ? BODY_VOICE[challengeBody].trapTip3 : null,
                SUN_KB[env.sunSign].tip,
                '每週回顧一次做得好與卡住的事，優點會更穩，盲點也更早被看見。',
            ],
            NATAL_LIMITS.advice,
        ),
    });
}

/** Planets in a house, in body order (personal planets first); empty without houses. */
const planetsIn = (env: Env, h: number): PlanetKey[] =>
    env.w.housesKnown ? PLANET_KEYS.filter((k) => houseOfBody(env, k) === h) : [];

/** Sign on a house cusp. Only call when houses are known. */
const cuspSign = (env: Env, h: number) => env.chart.houses![h - 1].sign;

/**
 * Two wordings of one line, the chart-seeded one first. The paragraph then takes whichever
 * repeats fewer words of what it already says.
 */
function either(seed: string, a: string, b: string, basis: string): Part {
    const o = cleanOptions(seed, [`${a}${basis}。`, `${b}${basis}。`]);
    return { first: o, then: o };
}

const moonCaveat = (env: Env) =>
    env.w.moonReliable
        ? ''
        : `月亮位置也可能偏差${moonNeighbour(env.chart)}，和月亮有關的描述僅供參考。`;

/**
 * 面具與真實的反差感：上升（外在人設）對月亮（內在小孩），加上第 12 宮。The first-impression
 * adjectives belong to 個性; here the mask is what you do in public and the Moon is what shows
 * once the door is closed.
 */
function mask(env: Env): NatalSection {
    const { w, ctx, chart } = env;
    const P = NATAL_LIMITS.paragraph;
    const moon = signOfBody(env, 'moon');
    const outer = w.ascSign ?? env.sunSign;
    const outerName = w.ascSign !== null ? '上升' : '太陽';
    const in12 = planetsIn(env, 12);
    // Wording seeded by the rest of the chart, so a shared ascendant does not read the same.
    const seed = `mask|${outer}|${moon}|${env.mix}|${in12.join()}|${houseOfBody(env, 'moon')}`;
    const alt = pickBy(`${seed}|outer`, [false, true]);
    const p1 = ctx.pack(
        [
            `${(alt ? V.MASK_ALT : V.MASK_KB)[outer].outer}（${outerName}${S(outer)}）。`,
            `${V.INNER_KB[moon].inner}（月亮${S(moon)}）。`,
        ],
        P,
    );

    // What even you do not notice: a planet in the 12th house, else the sign on its cusp.
    const hidden = in12.length
        ? `${V.HIDDEN_PLANET[in12[0]]}（${N(in12[0])}在第 12 宮）。`
        : w.housesKnown
          ? `${V.HIDDEN_SIGN[cuspSign(env, 12)]}（第 12 宮起點在${S(cuspSign(env, 12))}）。`
          : null;
    const gap = pickBy(`${seed}|gap`, [V.MASK_GAP, V.MASK_GAP_ALT])[outer % 4][moon % 4];
    const p2 = ctx.pack([`${gap}。`, hidden], P);

    const role = V.MASK_KB[outer].role;
    const child = V.INNER_KB[moon].child;
    const hook =
        outer === moon
            ? pickBy(seed, ['面具和真心，幾乎是同一張臉', `表裡如一，只是藏著${child}`])
            : pickBy(seed, [
                  `人前是${role}，人後是${child}`,
                  `${role}面具下，住著${child}`,
                  `外表${role}，心裡住著${child}`,
              ]);

    const field = w.housesKnown
        ? '依上升星座（別人看到的你）與月亮星座（關起門來的你）的落差，加上代表潛意識的人生領域。'
        : `依太陽與月亮星座的落差推估；${noHouseReason(chart)}，算不出上升星座與潛意識相關的宮位，外在人設的部分較不確定。${moonCaveat(env)}`;

    return section(env, 'natal_mask', {
        field,
        hook: charLen(hook) <= NATAL_LIMITS.hook ? hook : `人前${role}，人後${child}`,
        insight: [p1, p2],
        scene: ctx.first([V.INNER_KB[moon].scene], NATAL_LIMITS.scene),
        advice: ctx.first(
            [pickBy(`${seed}|tip`, [V.MASK_KB, V.MASK_ALT])[outer].tip, V.MASK_KB[outer].tip],
            NATAL_LIMITS.advice,
        ),
    });
}

/**
 * 內耗與充電說明書：月亮宮位與和諧角度是回血方式，第 6／12 宮是耗損點。Without houses the
 * Moon sign gives the recharge and the Mars sign (where the energy is spent) the drain.
 */
function battery(env: Env): NatalSection {
    const { w, ctx, chart } = env;
    const cs = w.sections.natal_battery;
    const P = NATAL_LIMITS.paragraph;
    const moon = signOfBody(env, 'moon');
    const mh = houseOfBody(env, 'moon');
    const softMoon = aspects(cs).find((c) => SOFT_ASPECTS.has(c.aspect.type));
    const boost = softMoon ? other(softMoon.aspect, 'moon') : null;
    const moonSeed = seedOf(env, 'moon');
    const rh = (part: string) =>
        pickBy(`${moonSeed}|${part}`, [V.RECHARGE_HOUSE, V.RECHARGE_HOUSE_ALT])[(mh ?? 1) - 1];
    const p1 = ctx.pack(
        [
            mh ? `${rh('way').way}（月亮在第 ${mh} 宮）。` : null,
            softMoon && boost && boost !== 'moon'
                ? `${V.RECHARGE_ASPECT[boost]}${aspectBasis(softMoon.aspect)}。`
                : null,
            `${V.RECHARGE_SIGN[moon]}（月亮${S(moon)}）。`,
        ],
        P,
    );

    const drainSign = w.housesKnown ? cuspSign(env, 6) : signOfBody(env, 'mars');
    const in6 = planetsIn(env, 6);
    const in12 = planetsIn(env, 12);
    // 面具 already read the first 12th-house planet; take the next one when there is one.
    const p12 = in12[1] ?? in12[0];
    const p2 = ctx.pack(
        [
            in6.length ? `${V.DRAIN_PLANET[in6[0]].six}（${N(in6[0])}在第 6 宮）。` : null,
            p12
                ? either(
                      `${seedOf(env, p12)}|drain`,
                      V.DRAIN_PLANET[p12].twelve,
                      V.DRAIN_TWELVE_ALT[p12],
                      `（${N(p12)}在第 12 宮）`,
                  )
                : null,
            `${V.DRAIN_SIGN[drainSign].drain}（${w.housesKnown ? '第 6 宮起點在' : '火星'}${S(drainSign)}）。`,
        ],
        P,
    );

    const el = V.RECHARGE_ELEMENT[moon % 4];
    const tips = [V.DRAIN_SIGN[drainSign].tip, V.DRAIN_TIP_ALT[drainSign]];
    const field = w.housesKnown
        ? '依月亮的落點與它的順暢角度看你怎麼回血，再從日常工作與幕後獨處的人生領域看電力漏在哪裡。'
        : `依月亮與火星的星座推估；${noHouseReason(chart)}，看不出回血與耗損落在哪個人生領域，這段參考性較低。${moonCaveat(env)}`;

    return section(env, 'natal_battery', {
        field,
        hook: mh ? rh('hook').hook : el.hook,
        insight: [p1, p2],
        scene: ctx.first([mh ? rh('scene').scene : el.scene], NATAL_LIMITS.scene),
        advice: ctx.first(
            [pickBy(`${seedOf(env, 'mars')}|${drainSign}|drainTip`, tips), ...tips],
            NATAL_LIMITS.advice,
        ),
    });
}

/**
 * 金錢觀與安全感來源：第 2 宮（怎麼賺、錢給你什麼）、第 8 宮（共同資源與對失去的反應）、
 * 金星（錢花去哪）與木星（財運從哪來）。工作 already covered how you work; this card only talks
 * about what you do with money.
 */
function money(env: Env): NatalSection {
    const { w, ctx, chart } = env;
    const P = NATAL_LIMITS.paragraph;
    const venus = signOfBody(env, 'venus');
    const jupiter = signOfBody(env, 'jupiter');
    const vSeed = seedOf(env, 'venus');
    const jSeed = seedOf(env, 'jupiter');
    const spend = `${V.MONEY_VENUS[venus].spend}（金星${S(venus)}）。`;
    const luck = either(
        `${jSeed}|${vSeed}|luck`,
        V.MONEY_JUPITER[jupiter],
        V.MONEY_JUPITER_ALT[jupiter],
        `（木星${S(jupiter)}）`,
    );
    let key = venus;
    const ms = (part: string) =>
        pickBy(`${part}|${key}|${vSeed}|${seedOf(env, 'moon')}`, [V.MONEY_SIGN, V.MONEY_SIGN_ALT])[
            key
        ];
    let p1: string;
    let p2: string;
    if (w.housesKnown) {
        const c2 = cuspSign(env, 2);
        const c8 = cuspSign(env, 8);
        const in2 = planetsIn(env, 2);
        const in8 = planetsIn(env, 8);
        key = c2;
        p1 = ctx.pack(
            [
                `${ms('earn').earn}（第 2 宮起點在${S(c2)}）。`,
                in2.length ? `${V.MONEY_PLANET[in2[0]].two}（${N(in2[0])}在第 2 宮）。` : null,
                spend,
            ],
            P,
        );
        p2 = ctx.pack(
            [
                in8.length
                    ? `${V.MONEY_PLANET[in8[0]].eight}（${N(in8[0])}在第 8 宮）。`
                    : `${V.MONEY_SIGN[c8].fear}（第 8 宮起點在${S(c8)}）。`,
                luck,
            ],
            P,
        );
    } else {
        p1 = ctx.pack([spend], P);
        p2 = ctx.pack([luck], P);
    }

    const field = w.housesKnown
        ? '依金錢與共同資源相關的人生領域，以及金星、木星，看你怎麼賺、怎麼花、靠什麼安心。'
        : `依金星與木星的星座推估；${noHouseReason(chart)}，看不出金錢與共同資源的宮位，這段參考性較低。`;

    return section(env, 'natal_money', {
        field,
        hook: ms('hook').hook,
        insight: [p1, p2],
        scene: ctx.first(
            [
                pickBy(`${vSeed}|moneyScene`, [
                    V.MONEY_VENUS[venus].scene,
                    V.MONEY_VENUS_SCENE_ALT[venus],
                ]),
            ],
            NATAL_LIMITS.scene,
        ),
        advice: ctx.first([ms('tip').tip, V.MONEY_SIGN[key].tip], NATAL_LIMITS.advice),
    });
}

/**
 * 原生家庭與依附模式：天底星座與第 4 宮行星（你心裡的「家」）、月亮與土星的角度（怎麼靠近
 * 人）。Tendencies only: nothing here claims what the family did. 感情 already described what you
 * want from a partner; this card is about how you attach.
 */
function family(env: Env): NatalSection {
    const { w, ctx, chart } = env;
    const cs = w.sections.natal_family;
    const P = NATAL_LIMITS.paragraph;
    const moon = signOfBody(env, 'moon');
    const ic = w.mcSign !== null ? (w.mcSign + 6) % 12 : null;
    const key = ic ?? moon;
    const attach = `${V.FAMILY_ATTACH[moon].attach}（月亮${S(moon)}）。`;
    const in4 = planetsIn(env, 4);
    const seed = `family|${key}|${seedOf(env, 'moon')}|${in4.join()}`;
    const icOf = (part: string) => pickBy(`${seed}|${part}`, [V.FAMILY_IC, V.FAMILY_IC_ALT])[key];

    const ms = aspects(cs).find((c) => other(c.aspect, 'moon') === 'saturn');
    const msLine = ms
        ? `${pickBy(`${seedOf(env, 'moon')}|ms`, V.MOON_SATURN[ms.aspect.type])}${aspectBasis(ms.aspect)}。`
        : null;
    const tense = !!ms && strained(ms.aspect, 'saturn');

    let p1: string;
    let p2: string;
    if (ic !== null) {
        p1 = ctx.pack(
            [
                `${icOf('home').home}（天底${S(ic)}）。`,
                in4.length
                    ? either(
                          `${seedOf(env, in4[0])}|home`,
                          V.FAMILY_PLANET[in4[0]],
                          V.FAMILY_PLANET_ALT[in4[0]],
                          `（${N(in4[0])}在第 4 宮）`,
                      )
                    : null,
            ],
            P,
        );
        // A strained Moon–Saturn angle closes the paragraph; a supportive one opens it.
        p2 = tense ? ctx.pack([attach], P, msLine) : ctx.pack([msLine, attach], P);
    } else {
        p1 = ctx.pack([attach], P);
        p2 = ctx.pack([`${icOf('home').home}（月亮${S(moon)}）。`], P);
    }

    const field = w.housesKnown
        ? '依天底與家庭相關的人生領域、月亮，以及月亮和土星的角度，看你心裡的「家」與靠近人的方式；這是傾向，不是定論。'
        : `只依月亮星座推估；${noHouseReason(chart)}，算不出代表家庭的天底與宮位，這段參考性較低。${moonCaveat(env)}`;

    return section(env, 'natal_family', {
        field,
        hook: icOf('hook').hook,
        insight: [p1, p2],
        scene: ctx.first([icOf('scene').scene], NATAL_LIMITS.scene),
        advice: ctx.first([V.FAMILY_ATTACH[moon].tip], NATAL_LIMITS.advice),
    });
}

/**
 * 天賦盲區（別人眼裡的超能力）：全盤最緊密的和諧角度或大三角、木星宮位、北交點。核心優缺點
 * named the strength; this card shows how it looks from outside, and spotlights the planet that
 * card did not put in its hook.
 */
function gift(env: Env): NatalSection {
    const { w, ctx, chart } = env;
    const cs = w.sections.natal_gift;
    const P = NATAL_LIMITS.paragraph;
    const soft = aspects(cs)
        .filter((c) => SOFT_ASPECTS.has(c.aspect.type))
        .sort((x, y) => x.aspect.orb - y.aspect.orb)[0];
    const tri = grandTrine(w.configs);

    // Spotlight: a planet of the grand trine, else of the tightest harmonious aspect.
    const pool: PlanetKey[] = tri ? tri.bodies : soft ? [soft.aspect.a, soft.aspect.b] : [];
    const fresh = pool.filter((k) => k !== env.coreGift);
    const seed = `gift|${pool.map((k) => `${k}${signOfBody(env, k)}`).join()}|${env.mix}`;
    const spot: PlanetKey = pool.length ? pickBy(seed, fresh.length ? fresh : pool) : 'jupiter';
    const kind = soft?.aspect.type === 'sextile' && !tri ? 'sextile' : 'trine';

    const jSign = signOfBody(env, 'jupiter');
    const jHouse = houseOfBody(env, 'jupiter');
    const jupLine: Part = jHouse
        ? either(
              `${seedOf(env, 'jupiter')}|gift`,
              V.GIFT_JUPITER_HOUSE[jHouse - 1],
              V.GIFT_JUPITER_HOUSE_ALT[jHouse - 1],
              `（木星在第 ${jHouse} 宮）`,
          )
        : `${V.GIFT_JUPITER_SIGN[jSign]}（木星${S(jSign)}）。`;
    const node = chart.bodies.find((b) => b.key === 'northNode')?.sign ?? null;
    const nodeLine = node !== null ? `${V.GIFT_NODE[node].path}（北交點${S(node)}）。` : null;

    const lead: string[] = [];
    if (tri) {
        // Element shared by at least two of the three planets (a trine can cross a sign border).
        const els = tri.bodies.map((k) => signOfBody(env, k) % 4);
        const el = els.find((e, i) => els.indexOf(e) !== i) ?? els[0];
        lead.push(`${V.GIFT_TRIANGLE[el]}（${names(tri.bodies)}兩兩順暢相連）。`);
    }
    if (soft && pool.includes(spot))
        lead.push(`${V.GIFT_SUPER[spot][kind]}${tri ? '' : aspectBasis(soft.aspect)}。`);
    // No harmonious aspect at all: Jupiter opens and the node closes.
    const p1 = lead.length ? ctx.pack(lead, P) : ctx.pack([jupLine], P);
    const p2 =
        ctx.pack(lead.length ? [jupLine, nodeLine] : [nodeLine], P) ||
        ctx.pack(['這份天賦用得越自然，你越容易忘記它其實不是人人都有。'], P);

    let field = w.housesKnown
        ? '依全盤最順暢的行星角度、木星的落點與北交點，找出你習以為常、別人卻很羨慕的能力。'
        : `依最順暢的行星角度、木星星座與北交點推估；${noHouseReason(chart)}，看不出木星落在哪個人生領域。`;
    if (!w.moonReliable) field += '月亮的角度受出生時間影響，這次略過。';

    return section(env, 'natal_gift', {
        field,
        hook: V.GIFT_SUPER[spot].hooks[kind === 'trine' ? 0 : 1],
        insight: [p1, p2],
        scene: ctx.first(
            [pickBy(`${seed}|scene`, [V.GIFT_SUPER[spot].scene, V.GIFT_SCENE_ALT[spot]])],
            NATAL_LIMITS.scene,
        ),
        advice: ctx.first(
            [
                node !== null ? V.GIFT_NODE[node].tip : null,
                '請三位熟人各說一件「你做起來很輕鬆、他們卻覺得很難」的事，寫下來。',
            ],
            NATAL_LIMITS.advice,
        ),
    });
}

/**
 * The eleven natal sections in guideline order. 個性 and 底層邏輯 are written first and the later
 * sections read their context (the Sun / Mercury traits, every sentence already used).
 */
export function natalReport(chart: AstroChart): NatalSection[] {
    const w = weighNatal(chart);
    const signOf = (k: AstroBodyKey) => chart.bodies.find((b) => b.key === k)?.sign ?? 0;
    const planets = chart.bodies.filter((b) => (PLANET_KEYS as readonly string[]).includes(b.key));
    const el = [0, 1, 2, 3].map((i) => planets.filter((b) => b.sign % 4 === i).length).join('');
    const md = [0, 1, 2].map((i) => planets.filter((b) => b.sign % 3 === i).length).join('');
    const env: Env = {
        chart,
        w,
        ctx: new Ctx(),
        sunSign: signOf('sun'),
        mercurySign: signOf('mercury'),
        mix: `${el}|${md}`,
    };
    return [
        personality(env),
        logic(env),
        stress(env),
        love(env),
        career(env),
        core(env),
        mask(env),
        battery(env),
        money(env),
        family(env),
        gift(env),
    ];
}

export function formatNatalMeaning(s: NatalSection): string {
    return [
        '【解析】',
        ...s.insight.filter(Boolean),
        '【生活場景】',
        s.scene,
        '【給你的建議】',
        s.advice,
    ].join('\n');
}

export function astroMeaningItems(chart: AstroChart): MeaningItem[] {
    return natalReport(chart).map((s) => ({
        term: s.title,
        field: s.field,
        hook: s.hook,
        meaning: formatNatalMeaning(s),
    }));
}
