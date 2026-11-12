import { BODY_NAMES, SIGN_ELEMENTS, SIGN_NAMES } from './labels';
import type { PlanetKey } from './natalKb';
import type { AspectType, AstroAspect, AstroBody, AstroChart } from './types';

// 個人本命盤權重引擎（星盤開發準則 §3A）。Pure functions: chart in, scored configurations out.
//
// Every configuration starts from BASE and adds the guideline bonuses, clamped to 1..100:
//   核心三巨頭（太陽、月亮、上升）與命主星（上升星座的傳統守護星）  +30
//   角度緊密度  < 1.5° +35；1.5°–4° +20；4°–5° +10（準則未定義的區間，取中間值）；> 5° +5
//   行星貼近四軸點（ASC / MC / DSC / IC，3° 內）                      +30
//   群星（同一星座或宮位 ≥ 3 顆行星）                                 +25
// Houses also get +5 per occupant (max +20) so a busy house outranks an empty one; that rule is
// ours, not the guideline's. When the birth time is unknown (or there is no place), houses, axes
// and the chart ruler are skipped, and so are Moon aspects (the Moon may be off by ±7°).

export const WEIGHT = {
    base: 10,
    core: 30,
    axis: 30,
    stellium: 25,
    occupant: 5,
    occupantMax: 20,
} as const;

/** Orb bonus per the guideline tiers. */
export function orbBonus(orb: number): number {
    if (orb < 1.5) return 35;
    if (orb <= 4) return 20;
    if (orb <= 5) return 10;
    return 5;
}

export const PLANET_KEYS: readonly PlanetKey[] = [
    'sun',
    'moon',
    'mercury',
    'venus',
    'mars',
    'jupiter',
    'saturn',
    'uranus',
    'neptune',
    'pluto',
];

const OUTER = new Set<PlanetKey>(['uranus', 'neptune', 'pluto']);
const PERSONAL_PLACEMENTS: readonly PlanetKey[] = [
    'sun',
    'moon',
    'mercury',
    'venus',
    'mars',
    'jupiter',
    'saturn',
];

/** Traditional rulers, indexed by sign (0 = 牡羊). */
const TRADITIONAL_RULER: readonly PlanetKey[] = [
    'mars',
    'venus',
    'mercury',
    'moon',
    'sun',
    'mercury',
    'venus',
    'mars',
    'jupiter',
    'saturn',
    'saturn',
    'jupiter',
];

export type AxisKey = 'asc' | 'mc' | 'dsc' | 'ic';
export const AXIS_NAMES: Record<AxisKey, string> = {
    asc: '上升點',
    mc: '天頂',
    dsc: '下降點',
    ic: '天底',
};

export const HARD_ASPECTS: ReadonlySet<AspectType> = new Set(['square', 'opposition']);
export const SOFT_ASPECTS: ReadonlySet<AspectType> = new Set(['trine', 'sextile']);

export type NatalSectionId =
    | 'natal_personality'
    | 'natal_logic'
    | 'natal_stress'
    | 'natal_love'
    | 'natal_career'
    | 'natal_core';

export const NATAL_SECTIONS: ReadonlyArray<{ id: NatalSectionId; title: string }> = [
    { id: 'natal_personality', title: '個性與日常特色' },
    { id: 'natal_logic', title: '底層邏輯思考方式' },
    { id: 'natal_stress', title: '面對壓力的顯現' },
    { id: 'natal_love', title: '感情模式' },
    { id: 'natal_career', title: '工作與天賦潛能' },
    { id: 'natal_core', title: '核心優缺點' },
];

interface ConfigBase {
    id: string;
    weight: number;
    /** Human-readable scoring trail, e.g. 「核心三巨頭 +30」. */
    reasons: string[];
}

export interface PlacementConfig extends ConfigBase {
    kind: 'placement';
    body: PlanetKey | 'asc';
    sign: number;
    house: number | null;
    retrograde: boolean;
}

export interface AspectConfig extends ConfigBase {
    kind: 'aspect';
    aspect: AstroAspect & { a: PlanetKey; b: PlanetKey };
}

export interface AxisConfig extends ConfigBase {
    kind: 'axis';
    body: PlanetKey;
    axis: AxisKey;
    orb: number;
}

export interface StelliumConfig extends ConfigBase {
    kind: 'stellium';
    scope: 'sign' | 'house';
    /** Sign index (0..11) or house number (1..12). */
    index: number;
    bodies: PlanetKey[];
}

export interface HouseConfig extends ConfigBase {
    kind: 'house';
    house: number;
    /** Sign on the cusp; for 7 / 10 the composer uses DSC / MC instead. */
    cuspSign: number;
    bodies: PlanetKey[];
}

export interface BalanceConfig extends ConfigBase {
    kind: 'balance';
    /** 0 = 火 … 3 = 水 */
    element: number;
    count: number;
    /** 0 = 開創, 1 = 固定, 2 = 變動; null when no single mode leads. */
    mode: number | null;
}

export type NatalConfig =
    PlacementConfig | AspectConfig | AxisConfig | StelliumConfig | HouseConfig | BalanceConfig;

export interface NatalWeights {
    /** Houses, axes and the chart ruler are usable. */
    housesKnown: boolean;
    /** Moon position is reliable (birth time known). */
    moonReliable: boolean;
    ruler: PlanetKey | null;
    ascSign: number | null;
    mcSign: number | null;
    /** All configurations, highest weight first. */
    configs: NatalConfig[];
    /** Top configurations per section (≤ 5), highest weight first. */
    sections: Record<NatalSectionId, NatalConfig[]>;
}

function clamp(w: number): number {
    return Math.max(1, Math.min(100, w));
}

function separation(a: number, b: number): number {
    const d = Math.abs(a - b) % 360;
    return d > 180 ? 360 - d : d;
}

function isPlanet(k: string): k is PlanetKey {
    return (PLANET_KEYS as readonly string[]).includes(k);
}

function byWeight(x: NatalConfig, y: NatalConfig): number {
    if (y.weight !== x.weight) return y.weight - x.weight;
    const ox = x.kind === 'aspect' ? x.aspect.orb : x.kind === 'axis' ? x.orb : 99;
    const oy = y.kind === 'aspect' ? y.aspect.orb : y.kind === 'axis' ? y.orb : 99;
    if (ox !== oy) return ox - oy;
    return x.id < y.id ? -1 : x.id > y.id ? 1 : 0;
}

/** Scores every natal configuration. */
export function natalConfigs(chart: AstroChart): {
    configs: NatalConfig[];
    housesKnown: boolean;
    moonReliable: boolean;
    ruler: PlanetKey | null;
} {
    const housesKnown = !chart.timeUnknown && chart.angles !== null && chart.houses !== null;
    const moonReliable = !chart.timeUnknown;
    const ruler = housesKnown ? TRADITIONAL_RULER[chart.angles!.asc.sign] : null;
    const core = new Set<PlanetKey>(['sun', 'moon']);
    if (ruler) core.add(ruler);

    const planets = new Map<PlanetKey, AstroBody>();
    for (const b of chart.bodies) if (isPlanet(b.key)) planets.set(b.key, b);

    const configs: NatalConfig[] = [];
    const coreBonus = (keys: PlanetKey[], reasons: string[]): number => {
        const hit = keys.find((k) => core.has(k));
        if (!hit) return 0;
        reasons.push(
            `${hit === ruler && hit !== 'sun' && hit !== 'moon' ? '命主星' : '核心三巨頭'} +${WEIGHT.core}`,
        );
        return WEIGHT.core;
    };

    // Placements: the seven personal / social planets plus the ascendant.
    if (housesKnown) {
        const asc = chart.angles!.asc;
        configs.push({
            kind: 'placement',
            id: 'placement:asc',
            body: 'asc',
            sign: asc.sign,
            house: 1,
            retrograde: false,
            weight: clamp(WEIGHT.base + WEIGHT.core),
            reasons: [`基礎 ${WEIGHT.base}`, `核心三巨頭 +${WEIGHT.core}`],
        });
    }
    for (const key of PERSONAL_PLACEMENTS) {
        const b = planets.get(key);
        if (!b) continue;
        const reasons = [`基礎 ${WEIGHT.base}`];
        const w = WEIGHT.base + coreBonus([key], reasons);
        configs.push({
            kind: 'placement',
            id: `placement:${key}`,
            body: key,
            sign: b.sign,
            house: housesKnown ? b.house : null,
            retrograde: b.retrograde,
            weight: clamp(w),
            reasons,
        });
    }

    // Aspects between the ten planets; generational outer–outer pairs are skipped.
    for (const a of chart.aspects) {
        if (!isPlanet(a.a) || !isPlanet(a.b)) continue;
        if (OUTER.has(a.a) && OUTER.has(a.b)) continue;
        if (!moonReliable && (a.a === 'moon' || a.b === 'moon')) continue;
        const reasons = [`基礎 ${WEIGHT.base}`];
        const ob = orbBonus(a.orb);
        reasons.push(`角度差 ${a.orb.toFixed(1)}° +${ob}`);
        const w = WEIGHT.base + ob + coreBonus([a.a, a.b], reasons);
        configs.push({
            kind: 'aspect',
            id: `aspect:${a.a}-${a.b}`,
            aspect: a as AspectConfig['aspect'],
            weight: clamp(w),
            reasons,
        });
    }

    // Planets within 3° of an angle.
    if (housesKnown) {
        const asc = chart.angles!.asc.longitude;
        const mc = chart.angles!.mc.longitude;
        const axes: Array<[AxisKey, number]> = [
            ['asc', asc],
            ['mc', mc],
            ['dsc', (asc + 180) % 360],
            ['ic', (mc + 180) % 360],
        ];
        for (const [key, b] of planets) {
            for (const [axis, lon] of axes) {
                const orb = separation(b.longitude, lon);
                if (orb > 3) continue;
                const reasons = [`基礎 ${WEIGHT.base}`, `貼近四軸點 +${WEIGHT.axis}`];
                const ob = orbBonus(orb);
                reasons.push(`角度差 ${orb.toFixed(1)}° +${ob}`);
                const w = WEIGHT.base + WEIGHT.axis + ob + coreBonus([key], reasons);
                configs.push({
                    kind: 'axis',
                    id: `axis:${key}-${axis}`,
                    body: key,
                    axis,
                    orb: Math.round(orb * 100) / 100,
                    weight: clamp(w),
                    reasons,
                });
            }
        }
    }

    // Stelliums: ≥ 3 of the ten planets in one sign, or (time known) in one house.
    const groups: Array<['sign' | 'house', Map<number, PlanetKey[]>]> = [['sign', new Map()]];
    if (housesKnown) groups.push(['house', new Map()]);
    for (const [scope, map] of groups) {
        for (const [key, b] of planets) {
            const idx = scope === 'sign' ? b.sign : b.house;
            if (idx === null) continue;
            map.set(idx, [...(map.get(idx) ?? []), key]);
        }
        for (const [index, bodies] of map) {
            if (bodies.length < 3) continue;
            const reasons = [`基礎 ${WEIGHT.base}`, `群星 ${bodies.length} 顆 +${WEIGHT.stellium}`];
            const w = WEIGHT.base + WEIGHT.stellium + coreBonus(bodies, reasons);
            configs.push({
                kind: 'stellium',
                id: `stellium:${scope}:${index}`,
                scope,
                index,
                bodies,
                weight: clamp(w),
                reasons,
            });
        }
    }

    // Houses the sections read: 2, 3, 5, 6, 9 when occupied; 7 (DSC) and 10 (MC) always.
    if (housesKnown) {
        for (const house of [2, 3, 5, 6, 7, 9, 10]) {
            const bodies = [...planets].filter(([, b]) => b.house === house).map(([k]) => k);
            if (bodies.length === 0 && house !== 7 && house !== 10) continue;
            const reasons = [`基礎 ${WEIGHT.base}`];
            let w = WEIGHT.base;
            if (bodies.length > 0) {
                const occ = Math.min(WEIGHT.occupantMax, WEIGHT.occupant * bodies.length);
                reasons.push(`宮內 ${bodies.length} 顆行星 +${occ}`);
                w += occ + coreBonus(bodies, reasons);
            }
            configs.push({
                kind: 'house',
                id: `house:${house}`,
                house,
                cuspSign: chart.houses![house - 1].sign,
                bodies,
                weight: clamp(w),
                reasons,
            });
        }
    }

    // Element balance: only when one element clearly leads.
    const counts = SIGN_ELEMENTS.map(
        (_, i) => [...planets.values()].filter((b) => b.sign % 4 === i).length,
    );
    const max = Math.max(...counts);
    const modes = [0, 1, 2].map(
        (i) => [...planets.values()].filter((b) => b.sign % 3 === i).length,
    );
    const modeMax = Math.max(...modes);
    if (counts.filter((n) => n === max).length === 1 && max >= 4) {
        configs.push({
            kind: 'balance',
            id: 'balance',
            element: counts.indexOf(max),
            count: max,
            mode: modes.filter((n) => n === modeMax).length === 1 ? modes.indexOf(modeMax) : null,
            weight: WEIGHT.base,
            reasons: [`基礎 ${WEIGHT.base}`],
        });
    }

    configs.sort(byWeight);
    return { configs, housesKnown, moonReliable, ruler };
}

const involves = (c: NatalConfig, k: PlanetKey) =>
    c.kind === 'aspect' && (c.aspect.a === k || c.aspect.b === k);
const isPlacement = (c: NatalConfig, k: PlanetKey | 'asc') =>
    c.kind === 'placement' && c.body === k;
const isHouse = (c: NatalConfig, h: number) => c.kind === 'house' && c.house === h;
const isAxis = (c: NatalConfig, a: AxisKey) => c.kind === 'axis' && c.axis === a;
const isHard = (c: NatalConfig) => c.kind === 'aspect' && HARD_ASPECTS.has(c.aspect.type);
const isSoft = (c: NatalConfig) => c.kind === 'aspect' && SOFT_ASPECTS.has(c.aspect.type);

const LIMIT = 5;

/** Anchors are always kept (the section's main planet); the rest fill by weight up to 5. */
function pick(
    configs: NatalConfig[],
    anchor: (c: NatalConfig) => boolean,
    pool: (c: NatalConfig) => boolean,
): NatalConfig[] {
    const anchors = configs.filter(anchor);
    const rest = configs.filter((c) => !anchor(c) && pool(c));
    return [...anchors, ...rest].slice(0, LIMIT).sort(byWeight);
}

export function weighNatal(chart: AstroChart): NatalWeights {
    const { configs, housesKnown, moonReliable, ruler } = natalConfigs(chart);

    const topSunAspect = configs.find((c) => involves(c, 'sun'))?.id;
    const personality = pick(
        configs,
        (c) => isPlacement(c, 'asc') || isPlacement(c, 'sun'),
        (c) =>
            (ruler !== null && isPlacement(c, ruler)) ||
            c.kind === 'stellium' ||
            isAxis(c, 'asc') ||
            c.id === topSunAspect ||
            c.kind === 'balance',
    );
    const logic = pick(
        configs,
        (c) => isPlacement(c, 'mercury'),
        (c) =>
            involves(c, 'mercury') ||
            isHouse(c, 3) ||
            isHouse(c, 9) ||
            (c.kind === 'axis' && c.body === 'mercury'),
    );
    const stressBodies: PlanetKey[] = ['saturn', 'pluto', 'mars', 'moon'];
    const stress = pick(
        configs,
        (c) => isPlacement(c, 'moon') || isPlacement(c, 'mars'),
        (c) => (isHard(c) && stressBodies.some((k) => involves(c, k))) || isPlacement(c, 'saturn'),
    );
    const love = pick(
        configs,
        (c) => isPlacement(c, 'venus') || isHouse(c, 7),
        (c) =>
            isPlacement(c, 'moon') ||
            isPlacement(c, 'mars') ||
            isHouse(c, 5) ||
            involves(c, 'venus') ||
            (involves(c, 'moon') && involves(c, 'mars')) ||
            isAxis(c, 'dsc'),
    );
    const career = pick(
        configs,
        (c) => isHouse(c, 10) || (!housesKnown && isPlacement(c, 'jupiter')),
        (c) =>
            isHouse(c, 6) ||
            isHouse(c, 2) ||
            isPlacement(c, 'saturn') ||
            isPlacement(c, 'jupiter') ||
            isAxis(c, 'mc'),
    );

    // 核心優缺點：最緊密的和諧角度（優勢，最多 3）＋最緊繃角度與軸點（盲點，最多 2），不足再互補。
    const soft = configs.filter(isSoft);
    const hard = configs.filter((c) => isHard(c) || c.kind === 'axis');
    const coreSel = [...soft.slice(0, 3), ...hard.slice(0, 2)];
    for (const c of [...soft.slice(3), ...hard.slice(2)].sort(byWeight)) {
        if (coreSel.length >= LIMIT) break;
        coreSel.push(c);
    }
    coreSel.sort(byWeight);

    return {
        housesKnown,
        moonReliable,
        ruler,
        ascSign: housesKnown ? chart.angles!.asc.sign : null,
        mcSign: housesKnown ? chart.angles!.mc.sign : null,
        configs,
        sections: {
            natal_personality: personality,
            natal_logic: logic,
            natal_stress: stress,
            natal_love: love,
            natal_career: career,
            natal_core: coreSel,
        },
    };
}

const ASPECT_LABEL: Record<AspectType, string> = {
    conjunction: '合',
    sextile: '六分',
    square: '四分',
    trine: '三分',
    opposition: '對分',
};

/** Technical one-line label (for the AI prompt data, not for the report text). */
export function describeConfig(c: NatalConfig): string {
    switch (c.kind) {
        case 'placement': {
            const name = c.body === 'asc' ? '上升' : BODY_NAMES[c.body];
            const house = c.house !== null && c.body !== 'asc' ? ` 第 ${c.house} 宮` : '';
            return `${name} ${SIGN_NAMES[c.sign]}${house}${c.retrograde ? '（逆行）' : ''}`;
        }
        case 'aspect':
            return `${BODY_NAMES[c.aspect.a]} ${ASPECT_LABEL[c.aspect.type]} ${BODY_NAMES[c.aspect.b]}（容許度 ${c.aspect.orb.toFixed(1)}°）`;
        case 'axis':
            return `${BODY_NAMES[c.body]} 合 ${AXIS_NAMES[c.axis]}（${c.orb.toFixed(1)}°）`;
        case 'stellium':
            return `群星：${c.bodies.map((k) => BODY_NAMES[k]).join('、')} 同在${c.scope === 'sign' ? SIGN_NAMES[c.index] : `第 ${c.index} 宮`}`;
        case 'house':
            return `第 ${c.house} 宮（宮首${SIGN_NAMES[c.cuspSign]}）${c.bodies.length ? `：${c.bodies.map((k) => BODY_NAMES[k]).join('、')}` : '：無行星'}`;
        case 'balance':
            return `${SIGN_ELEMENTS[c.element]}象星座 ${c.count} 顆行星`;
    }
}
