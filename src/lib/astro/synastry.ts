import type { PartnerKey } from '@/lib/hd/synastry';
import type { MeaningItem } from '@/lib/ui/personMeaning';
import { ASPECT_ANGLES, ASPECT_NAMES, ASPECT_ORBS, BODY_NAMES, formatDegMin } from './labels';
import { BODY_FUNCTION } from './meaning';
import type { AspectType, AstroBodyKey, AstroChart, AstroZodiacPos } from './types';

// 星盤比對（synastry）— pure logic, no React, client-safe (labels/types only, never compute.ts).
//   - Inter-aspects: every A point × every B point, the five major aspects with the same orb rule
//     as the natal chart (the larger orb of the two points: Sun/Moon 8°, planets 6°, points 3°;
//     the Ascendant counts as a point). Outer–outer pairs (同世代) are skipped.
//   - House overlays: each person's planets placed in the other's houses.
// When a birth time is unknown, that person's Moon, Ascendant and houses are left out.

export type SynastryPointKey = AstroBodyKey | 'asc';

export const POINT_NAMES: Record<SynastryPointKey, string> = { ...BODY_NAMES, asc: '上升' };

const ASPECT_TYPES: AspectType[] = ['conjunction', 'sextile', 'square', 'trine', 'opposition'];

const OUTER = new Set<SynastryPointKey>(['uranus', 'neptune', 'pluto']);

export interface SynastryPoint {
    key: SynastryPointKey;
    longitude: number;
}

export interface InterAspect {
    /** Point of person A. */
    a: SynastryPointKey;
    /** Point of person B. */
    b: SynastryPointKey;
    type: AspectType;
    name: string;
    angle: number;
    orb: number;
    /** One of the classic relationship pairs (Sun–Moon, Venus–Mars, Saturn contacts …). */
    key: boolean;
}

function normalize(x: number): number {
    const r = x % 360;
    return r < 0 ? r + 360 : r;
}

export function orbOf(key: SynastryPointKey): number {
    if (key === 'sun' || key === 'moon') return ASPECT_ORBS.luminary;
    if (key === 'northNode' || key === 'chiron' || key === 'asc') return ASPECT_ORBS.point;
    return ASPECT_ORBS.planet;
}

/** The points of a chart usable for synastry (Moon / ASC dropped when the time is unknown). */
export function synastryPoints(chart: AstroChart): SynastryPoint[] {
    const pts: SynastryPoint[] = chart.bodies
        .filter((b) => !(chart.timeUnknown && b.key === 'moon'))
        .map((b) => ({ key: b.key, longitude: b.longitude }));
    if (chart.angles && !chart.timeUnknown) pts.push({ key: 'asc', longitude: chart.angles.asc.longitude });
    return pts;
}

const PERSONAL = new Set<SynastryPointKey>(['sun', 'moon', 'mercury', 'venus', 'mars', 'asc']);

function pairId(x: SynastryPointKey, y: SynastryPointKey): string {
    return [x, y].sort().join('|');
}

const KEY_PAIRS = new Set([
    pairId('sun', 'moon'),
    pairId('sun', 'sun'),
    pairId('moon', 'moon'),
    pairId('venus', 'mars'),
    pairId('sun', 'venus'),
    pairId('moon', 'venus'),
    pairId('venus', 'venus'),
    pairId('sun', 'mars'),
    pairId('moon', 'mars'),
    pairId('asc', 'sun'),
    pairId('asc', 'moon'),
    pairId('asc', 'venus'),
]);

export function isKeyPair(x: SynastryPointKey, y: SynastryPointKey): boolean {
    if (KEY_PAIRS.has(pairId(x, y))) return true;
    // Saturn on a personal point: commitment / pressure.
    return (x === 'saturn' && PERSONAL.has(y)) || (y === 'saturn' && PERSONAL.has(x));
}

/** Aspect between two longitudes (or null), using the larger orb of the two points. */
export function aspectBetween(
    a: SynastryPoint,
    b: SynastryPoint,
): { type: AspectType; angle: number; orb: number } | null {
    const d = normalize(b.longitude - a.longitude);
    const sep = d > 180 ? 360 - d : d;
    const maxOrb = Math.max(orbOf(a.key), orbOf(b.key));
    for (const type of ASPECT_TYPES) {
        const angle = ASPECT_ANGLES[type];
        const orb = Math.abs(sep - angle);
        if (orb <= maxOrb) return { type, angle, orb: Math.round(orb * 100) / 100 };
    }
    return null;
}

/** All A × B aspects: key pairs first, then by orb. */
export function interAspects(a: AstroChart, b: AstroChart): InterAspect[] {
    const out: InterAspect[] = [];
    for (const pa of synastryPoints(a)) {
        for (const pb of synastryPoints(b)) {
            if (OUTER.has(pa.key) && OUTER.has(pb.key)) continue;
            const asp = aspectBetween(pa, pb);
            if (!asp) continue;
            out.push({
                a: pa.key,
                b: pb.key,
                type: asp.type,
                name: ASPECT_NAMES[asp.type],
                angle: asp.angle,
                orb: asp.orb,
                key: isKeyPair(pa.key, pb.key),
            });
        }
    }
    return out.sort((x, y) => Number(y.key) - Number(x.key) || x.orb - y.orb);
}

/** 1..12: the house whose cusp the longitude has passed (cusps[0] = house 1). */
export function houseIn(longitude: number, cusps: number[]): number {
    const lon = normalize(longitude);
    for (let i = 0; i < 12; i++) {
        const start = cusps[i];
        const span = normalize(cusps[(i + 1) % 12] - start);
        if (normalize(lon - start) < span) return i + 1;
    }
    return 1;
}

export interface HouseOverlay {
    /** Whose planet. */
    from: PartnerKey;
    body: AstroBodyKey;
    /** House of the other person's chart. */
    house: number;
}

const OVERLAY_BODIES: AstroBodyKey[] = [
    'sun',
    'moon',
    'mercury',
    'venus',
    'mars',
    'jupiter',
    'saturn',
];

function overlaysOf(from: PartnerKey, src: AstroChart, dst: AstroChart): HouseOverlay[] {
    if (!dst.houses || dst.timeUnknown) return [];
    const cusps = dst.houses.map((h) => h.longitude);
    return OVERLAY_BODIES.flatMap((key) => {
        if (key === 'moon' && src.timeUnknown) return [];
        const body = src.bodies.find((x) => x.key === key);
        return body ? [{ from, body: key, house: houseIn(body.longitude, cusps) }] : [];
    });
}

export interface AstroSynastry {
    aspects: InterAspect[];
    overlays: HouseOverlay[];
    harmonious: number;
    tense: number;
    conjunctions: number;
}

export function analyzeAstroSynastry(a: AstroChart, b: AstroChart): AstroSynastry {
    const aspects = interAspects(a, b);
    return {
        aspects,
        overlays: [...overlaysOf('a', a, b), ...overlaysOf('b', b, a)],
        harmonious: aspects.filter((x) => x.type === 'trine' || x.type === 'sextile').length,
        tense: aspects.filter((x) => x.type === 'square' || x.type === 'opposition').length,
        conjunctions: aspects.filter((x) => x.type === 'conjunction').length,
    };
}

// ---------------------------------------------------------------------------
// Report text
// ---------------------------------------------------------------------------

export interface AstroPartner {
    name: string;
    chart: AstroChart;
}

const ASPECT_TONE: Record<AspectType, string> = {
    conjunction: '能量融在一起，感受強烈、存在感很高',
    trine: '自然流動、相處輕鬆，不費力就能懂彼此',
    sextile: '和諧而有機會，稍微主動經營就會很順',
    square: '有張力與摩擦，也帶來互相推動的成長',
    opposition: '像照鏡子，強烈吸引也容易拉扯，需要找平衡點',
};

const PAIR_THEME: Record<string, string> = {
    [pairId('sun', 'moon')]: '日月相位是合盤最重要的一組，看彼此的核心自我與情感需求是否搭得上',
    [pairId('sun', 'sun')]: '日日相位反映兩人的人生方向與自我表現是否同調',
    [pairId('moon', 'moon')]: '月月相位反映生活習慣與情緒節奏，關乎住在一起舒不舒服',
    [pairId('venus', 'mars')]: '金火相位是吸引力與性張力的來源',
    [pairId('sun', 'venus')]: '日金相位帶來欣賞與好感，容易覺得對方可愛',
    [pairId('moon', 'venus')]: '月金相位帶來溫柔與照顧，相處有安全感',
    [pairId('venus', 'venus')]: '金金相位反映審美、喜好與愛的方式是否相近',
    [pairId('sun', 'mars')]: '日火相位帶來行動上的推動，也可能互相較勁',
    [pairId('moon', 'mars')]: '月火相位帶來熱度與情緒的激發，容易一點就燃',
    [pairId('asc', 'sun')]: '上升接觸關乎第一印象，對方的存在感很強',
    [pairId('asc', 'moon')]: '上升接觸關乎第一印象，相處起來有熟悉、放鬆的感覺',
    [pairId('asc', 'venus')]: '上升接觸關乎第一印象，容易一見就有好感',
};

const SATURN_THEME = '土星接觸帶來承諾、責任與長久感，也可能讓一方覺得被要求或受限';

function themeOf(x: SynastryPointKey, y: SynastryPointKey): string {
    if (x === 'saturn' || y === 'saturn') {
        if (PAIR_THEME[pairId(x, y)]) return PAIR_THEME[pairId(x, y)];
        return SATURN_THEME;
    }
    if (PAIR_THEME[pairId(x, y)]) return PAIR_THEME[pairId(x, y)];
    const fx = x === 'asc' ? '第一印象' : BODY_FUNCTION[x];
    const fy = y === 'asc' ? '第一印象' : BODY_FUNCTION[y];
    return `牽動${fx}與${fy}`;
}

function aspectHead(x: InterAspect, a: AstroPartner, b: AstroPartner): string {
    return `${a.name}的${POINT_NAMES[x.a]} ${x.name} ${b.name}的${POINT_NAMES[x.b]}（容許度 ${x.orb.toFixed(1)}°）`;
}

const HOUSE_AREA: Record<number, string> = {
    1: '自我與外在形象',
    2: '金錢、價值觀與安全感',
    3: '溝通、學習與日常往來',
    4: '家庭與內心的根',
    5: '戀愛、玩樂與創造',
    6: '日常作息、工作與健康',
    7: '伴侶與一對一關係',
    8: '親密、信任與共同資源',
    9: '信念、旅行與視野',
    10: '事業與社會地位',
    11: '朋友、社群與願景',
    12: '潛意識與隱藏的一面',
};

const KEY_HOUSES = new Set([1, 5, 7, 8]);

function item(term: string, field: string, meaning: string): MeaningItem {
    return { term, field, meaning };
}

function caveatLine(a: AstroPartner, b: AstroPartner): string {
    const unknown = [a, b].filter((p) => p.chart.timeUnknown).map((p) => p.name);
    return unknown.length > 0
        ? `${unknown.join('、')}的出生時間不確定，不列入月亮、上升與宮位相關的比對。`
        : '';
}

export function astroSynastryItems(a: AstroPartner, b: AstroPartner, syn: AstroSynastry): MeaningItem[] {
    const items: MeaningItem[] = [];
    const caveat = caveatLine(a, b);
    const key = syn.aspects.filter((x) => x.key);
    const rest = syn.aspects.filter((x) => !x.key);

    items.push(
        item(
            '重點相位',
            '合盤最常看的幾組：日月、金火、月月、日金、上升，以及土星與個人行星的接觸。',
            [
                ...(key.length > 0
                    ? key.map((x) => `${aspectHead(x, a, b)}：${themeOf(x.a, x.b)}；${ASPECT_TONE[x.type]}。`)
                    : ['重點組合之間沒有形成主要相位，兩人的連結多來自其他行星的互動。']),
                caveat,
            ]
                .filter(Boolean)
                .join('\n'),
        ),
    );

    const shown = rest.slice(0, 10);
    items.push(
        item(
            '其他相位',
            '其餘行星之間的主要相位，依容許度由緊到鬆列出（最多 10 組）。',
            shown.length > 0
                ? shown.map((x) => `${aspectHead(x, a, b)}：${themeOf(x.a, x.b)}，${ASPECT_TONE[x.type]}。`).join('\n')
                : '其餘行星之間沒有主要相位。',
        ),
    );

    const total = syn.harmonious + syn.tense + syn.conjunctions;
    const balance =
        total === 0
            ? '兩盤之間幾乎沒有主要相位，彼此的影響比較溫和。'
            : syn.harmonious > syn.tense * 1.5
              ? '和諧相位明顯較多，相處起來順、少摩擦；要留意太舒服而缺少推動，偶爾一起挑戰新事物。'
              : syn.tense > syn.harmonious * 1.5
                ? '張力相位較多，火花與摩擦都明顯；這種組合很有成長的力量，但需要更多溝通與包容。'
                : '和諧與張力相位大致平衡，既有默契也有互相推動的力量。';
    items.push(
        item(
            '和諧與張力',
            '三分、六分屬和諧；四分、對分屬張力；合相則看兩顆星的性質。',
            `和諧 ${syn.harmonious} 組、張力 ${syn.tense} 組、合相 ${syn.conjunctions} 組。${balance}`,
        ),
    );

    const overlayLines = (from: PartnerKey): string[] => {
        const [src, dst] = from === 'a' ? [a, b] : [b, a];
        const list = syn.overlays.filter((o) => o.from === from);
        if (list.length === 0) return [];
        return [
            `${src.name}的行星落在${dst.name}的宮位：`,
            ...list.map(
                (o) =>
                    `${KEY_HOUSES.has(o.house) ? '★ ' : ''}${BODY_NAMES[o.body]} → 第 ${o.house} 宮（${HOUSE_AREA[o.house]}）：${src.name}的${BODY_FUNCTION[o.body]}會牽動${dst.name}的${HOUSE_AREA[o.house]}。`,
            ),
        ];
    };
    const overlay = [...overlayLines('a'), ...overlayLines('b')];
    items.push(
        item(
            '宮位疊加',
            '一人的行星落在另一人的哪一宮，表示你在對方生活的哪一塊最有影響。★ 為第 1、5、7、8 宮這些和關係最直接相關的宮位。',
            overlay.length > 0
                ? overlay.join('\n')
                : '兩人都沒有可用的宮位資料（需要確定的出生時間與出生地），因此不做宮位疊加。',
        ),
    );

    items.push(item('相處建議', '依相位與宮位整理的提醒。', adviceLines(a, b, syn).join('\n')));
    return items;
}

function adviceLines(a: AstroPartner, b: AstroPartner, syn: AstroSynastry): string[] {
    const lines: string[] = [];
    const has = (x: SynastryPointKey, y: SynastryPointKey, types?: AspectType[]) =>
        syn.aspects.some(
            (s) =>
                pairId(s.a, s.b) === pairId(x, y) && (types === undefined || types.includes(s.type)),
        );
    if (has('sun', 'moon')) lines.push('日月有相位，彼此的核心需求容易被看見；多說出自己需要什麼，對方接得住。');
    if (has('venus', 'mars')) lines.push('金火有相位，吸引力是這段關係的燃料；也記得在激情之外經營日常的溫柔。');
    if (has('moon', 'moon', ['square', 'opposition']))
        lines.push('月亮之間有張力，生活習慣與情緒反應可能不同，住在一起前先聊聊彼此的作息與需要。');
    if (syn.aspects.some((s) => s.key && (s.a === 'saturn' || s.b === 'saturn')))
        lines.push('有土星接觸，關係容易走得長久，也容易讓人覺得被要求；把期待說清楚，不要用沉默表達不滿。');
    const tight = syn.aspects.filter((s) => s.type === 'square' || s.type === 'opposition').slice(0, 1);
    for (const s of tight)
        lines.push(
            `${a.name}的${POINT_NAMES[s.a]}與${b.name}的${POINT_NAMES[s.b]}形成${s.name}，是兩人最緊的張力相位；碰到${POINT_NAMES[s.a]}與${POINT_NAMES[s.b]}相關的話題，多給彼此一點耐心。`,
        );
    lines.push('合盤描述的是互動傾向，不是緣分的判決；相位的張力也可以透過理解變成成長。');
    return lines;
}

// ---------------------------------------------------------------------------
// AI prompt
// ---------------------------------------------------------------------------

function pos(p: AstroZodiacPos): string {
    return `${p.signName} ${formatDegMin(p.degree, p.minute)}`;
}

function chartBlock(p: AstroPartner): string {
    const c = p.chart;
    const bodies = c.bodies
        .filter((x) => !(c.timeUnknown && x.key === 'moon'))
        .map((x) => `- ${x.name}：${pos(x)}${x.house !== null ? `，第 ${x.house} 宮` : ''}${x.retrograde ? '（逆行）' : ''}`)
        .join('\n');
    const asc =
        c.angles && !c.timeUnknown ? `- 上升：${pos(c.angles.asc)}；天頂：${pos(c.angles.mc)}` : '- 無上升與宮位資料';
    const moonNote = c.timeUnknown ? '\n- 出生時間不確定：月亮位置可能偏差，已略過' : '';
    return `### ${p.name}
- 出生時刻（UTC）：${c.utc}；出生地：${c.placeName ?? '未提供'}${moonNote}
${asc}
${bodies}`;
}

export function buildAstroSynastryAiPrompt(a: AstroPartner, b: AstroPartner, syn: AstroSynastry): string {
    const aspects =
        syn.aspects
            .map((x) => `- ${a.name}的${POINT_NAMES[x.a]} ${x.name} ${b.name}的${POINT_NAMES[x.b]}（容許度 ${x.orb.toFixed(1)}°）`)
            .join('\n') || '- 無主要相位';
    const overlays =
        syn.overlays
            .map((o) => {
                const [src, dst] = o.from === 'a' ? [a.name, b.name] : [b.name, a.name];
                return `- ${src}的${BODY_NAMES[o.body]} → ${dst}的第 ${o.house} 宮`;
            })
            .join('\n') || '- （無宮位資料）';

    return `請依下列兩人的西洋占星本命盤與比對盤（synastry）資料，用繁體中文解讀兩人的關係。

解讀原則：
- 回歸黃道、地心座標；相位容許度：太陽／月亮 8°、行星 6°、交點／凱龍／上升 3°（取兩者較大者），已略過外行星彼此之間的同世代相位。
- 以日月、金火、月月、上升與土星接觸為主軸，再看行星落入對方宮位。
- 這是星盤結構說明，不是緣分的判決；請給可對照生活的觀察與建議，避免恐嚇或保證。

## 兩人星盤
${chartBlock(a)}

${chartBlock(b)}

## 比對相位
${aspects}

## 宮位疊加
${overlays}

請先總覽兩人的吸引與互補，再分「情感與吸引」「溝通與生活」「張力與成長課題」「長期相處」說明，最後給兩人各 3 條相處提醒。`;
}
