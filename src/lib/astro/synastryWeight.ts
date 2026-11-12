import type { PartnerKey } from '@/lib/hd/synastry';
import type { AstroSynastry, InterAspect, SynastryPointKey } from './synastry';
import type { AstroBodyKey, AstroChart } from './types';

// 合盤權重引擎（星盤開發準則 §3B）— pure functions, type-only imports from synastry.ts (no cycle).
//
// Every cross-chart contact gets a weight score 1–100:
//   base by orb tier  < 1° 30 · < 2° 24 · < 3° 18 · < 4° 14 · < 6° 8 · wider 4
//   + 35  personal planet × personal planet (Sun, Moon, Mercury, Venus, Mars), orb < 2°
//   + 35  a planet within 3° of the other person's ASC / DSC / MC / IC (axis contact)
//   + 30  North Node / Saturn / Pluto × the other's personal planet, orb < 3° (karmic contact)
//   + 10  any other contact that involves at least one personal planet (incl. axis contacts)
//   House overlays have no orb: base 20 for a personal planet, 12 otherwise, + 10 in the
//   houses the guideline singles out: 1 / 2 / 4 / 5 / 6 / 7 / 8 / 10 / 12.
// Aspects to the Ascendant are left to the axis rule (conjunct ASC, or conjunct DSC = opposite
// ASC), so the same contact is never counted twice.
//
// Contacts are then dealt into the five report sections. Each contact carries an ordered list of
// sections it fits; going from the highest score down, it lands in the first fitting section that
// still has room (at most 5 per section). A contact therefore feeds exactly one section, which is
// what keeps the sections from repeating each other.
//
// Sections 6–10 (吵架與冷戰 … 初見 vs 深交) are a second layer: each re-reads the weighted contacts
// through its own filter (see EXTRA_FITS), because they look at the same chart from another angle
// (a Saturn contact is a 課題, but also how the two go silent and what is left once the first
// impression fades). The report prefers a contact no earlier card has written.
//
// When a birth time is unknown, that person's Moon, axes and houses are left out entirely.

export type SectionId =
    | 'synastry_highlight'
    | 'synastry_friction'
    | 'synastry_intimacy'
    | 'synastry_lesson'
    | 'synastry_daily';

export const SECTION_ORDER: readonly SectionId[] = [
    'synastry_highlight',
    'synastry_friction',
    'synastry_intimacy',
    'synastry_lesson',
    'synastry_daily',
];

export const SECTION_TITLES: Record<SectionId, string> = {
    synastry_highlight: '一起時的亮點與發揮特色',
    synastry_friction: '兩人需磨合的地方',
    synastry_intimacy: '兩人的內心世界與親密度方式',
    synastry_lesson: '關係的生命課題',
    synastry_daily: '日常相處與溝通模式',
};

/** Interaction themes; the strongest one or two form the pair's 互動主軸. */
export type ThemeId =
    'spark' | 'care' | 'admire' | 'mirror' | 'mind' | 'bond' | 'depth' | 'freedom' | 'expand';

export interface ThemeInfo {
    label: string;
    /** What draws the two together (used in 亮點). */
    light: string;
    /** What the same quality turns into while adjusting (used in 磨合). */
    shadow: string;
}

export const THEMES: Record<ThemeId, ThemeInfo> = {
    spark: { label: '心動與熱度', light: '心動的熱度', shadow: '一點就著的火氣' },
    care: { label: '照顧與安心', light: '被照顧的安心', shadow: '放不下的牽掛' },
    admire: { label: '欣賞與好感', light: '互相欣賞', shadow: '怕破壞氣氛的沉默' },
    mirror: { label: '互相成全', light: '互相成全', shadow: '誰配合誰的拉扯' },
    mind: { label: '聊得來', light: '聊不完的話', shadow: '話中有話的誤會' },
    bond: { label: '承諾與可靠', light: '說到做到的可靠', shadow: '沉甸甸的期待' },
    depth: { label: '深刻的牽引', light: '看進心底的吸引', shadow: '想抓緊的控制欲' },
    freedom: { label: '自由與新鮮', light: '自由感', shadow: '缺乏安全感' },
    expand: { label: '一起長大', light: '互相打氣的樂觀', shadow: '承諾給得太快' },
};

export type AxisKey = 'asc' | 'dsc' | 'mc' | 'ic';

export const AXIS_NAMES: Record<AxisKey, string> = {
    asc: '上升點',
    dsc: '下降點',
    mc: '天頂',
    ic: '天底',
};

interface ContactBase {
    id: string;
    score: number;
    theme: ThemeId;
    /** Sections this contact fits, best first. */
    prefs: SectionId[];
}

export interface AspectContact extends ContactBase {
    kind: 'aspect';
    aspect: InterAspect;
}

export interface AxisContact extends ContactBase {
    kind: 'axis';
    /** Whose planet. */
    from: PartnerKey;
    body: AstroBodyKey;
    /** The other person's angle. */
    axis: AxisKey;
    orb: number;
}

export interface HouseContact extends ContactBase {
    kind: 'house';
    /** Whose planet. */
    from: PartnerKey;
    body: AstroBodyKey;
    /** House of the other person's chart. */
    house: number;
}

export type WeightedContact = AspectContact | AxisContact | HouseContact;

export const WEIGHT = {
    personalTight: 35,
    axis: 35,
    karmicTight: 30,
    personalInvolved: 10,
    houseKey: 10,
    housePersonal: 20,
    houseOther: 12,
    /** Orb limits for the tight rules. */
    personalTightOrb: 2,
    karmicTightOrb: 3,
    axisOrb: 3,
} as const;

export const MAX_PER_SECTION = 5;
/** Contacts below this score are too faint to write about. */
export const MIN_SCORE = 10;

const PERSONAL = new Set<SynastryPointKey>(['sun', 'moon', 'mercury', 'venus', 'mars']);
const KARMIC = new Set<SynastryPointKey>(['northNode', 'saturn', 'pluto']);
const KEY_HOUSES = new Set([1, 2, 4, 5, 6, 7, 8, 10, 12]);

/** Base score by orb tier. */
export function orbBase(orb: number): number {
    if (orb < 1) return 30;
    if (orb < 2) return 24;
    if (orb < 3) return 18;
    if (orb < 4) return 14;
    if (orb < 6) return 8;
    return 4;
}

function clampScore(x: number): number {
    return Math.max(1, Math.min(100, Math.round(x)));
}

export function scoreAspect(x: Pick<InterAspect, 'a' | 'b' | 'orb'>): number {
    const pa = PERSONAL.has(x.a);
    const pb = PERSONAL.has(x.b);
    let s = orbBase(x.orb);
    if (pa && pb && x.orb < WEIGHT.personalTightOrb) s += WEIGHT.personalTight;
    else if (((KARMIC.has(x.a) && pb) || (KARMIC.has(x.b) && pa)) && x.orb < WEIGHT.karmicTightOrb)
        s += WEIGHT.karmicTight;
    else if (pa || pb) s += WEIGHT.personalInvolved;
    return clampScore(s);
}

export function scoreAxis(body: AstroBodyKey, orb: number): number {
    return clampScore(
        orbBase(orb) + WEIGHT.axis + (PERSONAL.has(body) ? WEIGHT.personalInvolved : 0),
    );
}

export function scoreHouse(body: AstroBodyKey, house: number): number {
    return clampScore(
        (PERSONAL.has(body) ? WEIGHT.housePersonal : WEIGHT.houseOther) +
            (KEY_HOUSES.has(house) ? WEIGHT.houseKey : 0),
    );
}

// ---------------------------------------------------------------------------
// Themes and section preferences
// ---------------------------------------------------------------------------

const has = (x: InterAspect, k: SynastryPointKey) => x.a === k || x.b === k;
const isHard = (x: InterAspect) => x.type === 'square' || x.type === 'opposition';

export function aspectTheme(x: InterAspect): ThemeId {
    if (has(x, 'uranus')) return 'freedom';
    if (has(x, 'saturn')) return 'bond';
    if (has(x, 'pluto') || has(x, 'neptune') || has(x, 'chiron')) return 'depth';
    if (has(x, 'northNode')) return 'expand';
    // Jupiter colours the personal planet it touches; only Jupiter with a slow point is 一起長大.
    if (
        has(x, 'jupiter') &&
        !['sun', 'moon', 'mercury', 'venus', 'mars'].some((k) => has(x, k as SynastryPointKey))
    )
        return 'expand';
    if (has(x, 'mercury')) return 'mind';
    if (has(x, 'mars')) return 'spark';
    if (has(x, 'sun') && (has(x, 'moon') || has(x, 'jupiter') || (x.a === 'sun' && x.b === 'sun')))
        return 'mirror';
    if (has(x, 'moon')) return 'care';
    return 'admire';
}

function aspectPrefs(x: InterAspect): SectionId[] {
    const hard = isHard(x);
    // Where a Saturn / Node / Chiron / Pluto contact goes once 生命課題 is full: by the other point.
    const overflow: SectionId = has(x, 'mercury')
        ? 'synastry_daily'
        : has(x, 'moon') || has(x, 'venus')
          ? 'synastry_intimacy'
          : hard
            ? 'synastry_friction'
            : 'synastry_highlight';
    if (has(x, 'saturn') || has(x, 'northNode') || has(x, 'chiron'))
        return ['synastry_lesson', overflow];
    if (has(x, 'pluto'))
        return hard ? ['synastry_lesson', overflow] : ['synastry_intimacy', 'synastry_lesson'];
    if (has(x, 'uranus'))
        return hard
            ? ['synastry_friction', 'synastry_highlight']
            : ['synastry_highlight', 'synastry_daily'];
    if (has(x, 'mercury')) {
        // Mercury–Mars tension is the classic argument trigger: 磨合 first.
        if (hard && has(x, 'mars')) return ['synastry_friction', 'synastry_daily'];
        return ['synastry_daily', hard ? 'synastry_friction' : 'synastry_highlight'];
    }
    if (has(x, 'moon') || has(x, 'venus')) {
        if (hard)
            return has(x, 'mars')
                ? ['synastry_friction', 'synastry_intimacy']
                : ['synastry_intimacy', 'synastry_friction'];
        return has(x, 'sun') || has(x, 'jupiter')
            ? ['synastry_highlight', 'synastry_intimacy']
            : ['synastry_intimacy', 'synastry_highlight'];
    }
    if (has(x, 'neptune'))
        return hard ? ['synastry_friction'] : ['synastry_intimacy', 'synastry_highlight'];
    return hard
        ? ['synastry_friction', 'synastry_daily']
        : ['synastry_highlight', 'synastry_daily'];
}

const BODY_THEME: Record<AstroBodyKey, ThemeId> = {
    sun: 'admire',
    moon: 'care',
    mercury: 'mind',
    venus: 'admire',
    mars: 'spark',
    jupiter: 'expand',
    saturn: 'bond',
    uranus: 'freedom',
    neptune: 'depth',
    pluto: 'depth',
    northNode: 'expand',
    chiron: 'depth',
};

function axisPrefs(body: AstroBodyKey, axis: AxisKey): SectionId[] {
    if (body === 'saturn' || body === 'pluto' || body === 'northNode' || body === 'chiron')
        return ['synastry_lesson'];
    if (axis === 'ic') return ['synastry_intimacy', 'synastry_highlight'];
    if (body === 'mercury') return ['synastry_daily', 'synastry_highlight'];
    if (body === 'moon') return ['synastry_intimacy', 'synastry_highlight'];
    if (body === 'mars' || body === 'uranus') return ['synastry_highlight', 'synastry_friction'];
    return ['synastry_highlight', 'synastry_intimacy'];
}

const HOUSE_THEME: Record<number, ThemeId> = {
    1: 'admire',
    2: 'care',
    3: 'mind',
    4: 'care',
    5: 'spark',
    6: 'mind',
    7: 'admire',
    8: 'depth',
    9: 'expand',
    10: 'expand',
    11: 'expand',
    12: 'depth',
};

function houseTheme(body: AstroBodyKey, house: number): ThemeId {
    if (body === 'saturn' || body === 'mercury' || body === 'mars' || body === 'jupiter')
        return BODY_THEME[body];
    return HOUSE_THEME[house];
}

function housePrefs(body: AstroBodyKey, house: number): SectionId[] {
    if (house === 4 || house === 8 || house === 12) return ['synastry_intimacy'];
    if (house === 3 || house === 6 || house === 2) return ['synastry_daily'];
    if (body === 'saturn') return ['synastry_lesson'];
    return ['synastry_highlight'];
}

// ---------------------------------------------------------------------------
// Contacts
// ---------------------------------------------------------------------------

function normalize(x: number): number {
    const r = x % 360;
    return r < 0 ? r + 360 : r;
}

function separation(x: number, y: number): number {
    const d = normalize(y - x);
    return d > 180 ? 360 - d : d;
}

/** Planets of `src` within 3° of an angle of `dst` (none when either side lacks the data). */
export function axisContactsOf(from: PartnerKey, src: AstroChart, dst: AstroChart): AxisContact[] {
    if (!dst.angles || dst.timeUnknown) return [];
    const asc = dst.angles.asc.longitude;
    const mc = dst.angles.mc.longitude;
    const axes: [AxisKey, number][] = [
        ['asc', asc],
        ['dsc', normalize(asc + 180)],
        ['mc', mc],
        ['ic', normalize(mc + 180)],
    ];
    const out: AxisContact[] = [];
    for (const body of src.bodies) {
        if (body.key === 'moon' && src.timeUnknown) continue;
        for (const [axis, lon] of axes) {
            const orb = Math.round(separation(body.longitude, lon) * 100) / 100;
            if (orb > WEIGHT.axisOrb) continue;
            out.push({
                kind: 'axis',
                id: `axis:${from}:${body.key}:${axis}`,
                from,
                body: body.key,
                axis,
                orb,
                score: scoreAxis(body.key, orb),
                theme: BODY_THEME[body.key],
                prefs: axisPrefs(body.key, axis),
            });
        }
    }
    return out;
}

/** Every weighted contact of the pair, highest score first. */
export function weighContacts(a: AstroChart, b: AstroChart, syn: AstroSynastry): WeightedContact[] {
    const aspects: AspectContact[] = syn.aspects
        .filter((x) => x.a !== 'asc' && x.b !== 'asc')
        .map((x) => ({
            kind: 'aspect',
            id: `aspect:${x.a}:${x.b}`,
            aspect: x,
            score: scoreAspect(x),
            theme: aspectTheme(x),
            prefs: aspectPrefs(x),
        }));
    const houses: HouseContact[] = syn.overlays.map((o) => ({
        kind: 'house',
        id: `house:${o.from}:${o.body}`,
        from: o.from,
        body: o.body,
        house: o.house,
        score: scoreHouse(o.body, o.house),
        theme: houseTheme(o.body, o.house),
        prefs: housePrefs(o.body, o.house),
    }));
    const all: WeightedContact[] = [
        ...aspects,
        ...axisContactsOf('a', a, b),
        ...axisContactsOf('b', b, a),
        ...houses,
    ];
    // Stable: equal scores keep aspect → axis → house order.
    return all
        .map((c, i) => [c, i] as const)
        .sort((x, y) => y[0].score - x[0].score || x[1] - y[1])
        .map(([c]) => c);
}

/** Deal contacts into the five sections (each contact once, at most 5 per section). */
export function allocateSections(
    contacts: WeightedContact[],
): Record<SectionId, WeightedContact[]> {
    const out = Object.fromEntries(
        SECTION_ORDER.map((s) => [s, [] as WeightedContact[]]),
    ) as Record<SectionId, WeightedContact[]>;
    for (const c of contacts) {
        if (c.score < MIN_SCORE) continue;
        const target = c.prefs.find((s) => out[s].length < MAX_PER_SECTION);
        if (target) out[target].push(c);
    }
    return out;
}

/** Generational / point contacts (Uranus … Chiron, Node) count half toward the 主軸. */
const SLOW_THEME_FACTOR = 0.5;
const SLOW = new Set<SynastryPointKey>(['uranus', 'neptune', 'pluto', 'chiron', 'northNode']);

function involvesSlow(c: WeightedContact): boolean {
    return c.kind === 'aspect' ? SLOW.has(c.aspect.a) || SLOW.has(c.aspect.b) : SLOW.has(c.body);
}

function involvesPersonal(c: WeightedContact): boolean {
    return c.kind === 'aspect'
        ? PERSONAL.has(c.aspect.a) || PERSONAL.has(c.aspect.b)
        : PERSONAL.has(c.body);
}

export interface ThemeScore {
    id: ThemeId;
    score: number;
}

/**
 * 互動主軸: the one or two themes carrying the most weight among contacts that touch a personal
 * planet (the second only when it has at least half the weight of the first). Falls back to 欣賞 when the pair has no usable contact.
 */
export function interactionAxis(contacts: WeightedContact[]): ThemeScore[] {
    const usable = contacts.filter((c) => c.score >= MIN_SCORE);
    // Contacts that touch a personal planet drive the 主軸; slow–slow contacts only as a fallback.
    const personal = usable.filter(involvesPersonal);
    const sums = new Map<ThemeId, number>();
    for (const c of personal.length > 0 ? personal : usable)
        sums.set(
            c.theme,
            (sums.get(c.theme) ?? 0) + c.score * (involvesSlow(c) ? SLOW_THEME_FACTOR : 1),
        );
    const ranked = [...sums.entries()]
        .map(([id, score]) => ({ id, score: Math.round(score) }))
        .sort((x, y) => y.score - x.score);
    if (ranked.length === 0) return [{ id: 'admire', score: 0 }];
    return ranked.length > 1 && ranked[1].score >= ranked[0].score / 2
        ? ranked.slice(0, 2)
        : ranked.slice(0, 1);
}

// ---------------------------------------------------------------------------
// Second layer: sections 6–10 (準則 §3B)
// ---------------------------------------------------------------------------

export type ExtraSectionId =
    | 'synastry_fight'
    | 'synastry_battery'
    | 'synastry_power'
    | 'synastry_work'
    | 'synastry_filter';

export const EXTRA_ORDER: readonly ExtraSectionId[] = [
    'synastry_fight',
    'synastry_battery',
    'synastry_power',
    'synastry_work',
    'synastry_filter',
];

export const EXTRA_TITLES: Record<ExtraSectionId, string> = {
    synastry_fight: '吵架與冷戰模式',
    synastry_battery: '兩人內耗與充電說明書',
    synastry_power: '關係中的權力與主導權',
    synastry_work: '一起財運與共事潛力',
    synastry_filter: '初見印象 vs 深交後的反轉',
};

/** The point at the other end of an aspect from `k`. */
export function otherEnd(x: InterAspect, k: SynastryPointKey): SynastryPointKey {
    return x.a === k ? x.b : x.a;
}

const among = (...keys: SynastryPointKey[]) => {
    const set = new Set(keys);
    return (k: SynastryPointKey) => set.has(k);
};
const isPlanet = among(
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
);
const isPersonal = (k: SynastryPointKey) => PERSONAL.has(k);

/** What sets a fight off: Mars (else Mercury) in a hard aspect to one of the other's planets. */
export function fightTrigger(x: InterAspect): 'mars' | 'mercury' | null {
    if (!isHard(x)) return null;
    const fast = has(x, 'mars') ? 'mars' : has(x, 'mercury') ? 'mercury' : null;
    return fast && isPlanet(otherEnd(x, fast)) ? fast : null;
}

/** Saturn in a hard aspect to the other's Sun, Mercury, Venus or Mars (how the two go cold). */
export function saturnChill(x: InterAspect): boolean {
    return (
        isHard(x) &&
        has(x, 'saturn') &&
        among('sun', 'mercury', 'venus', 'mars')(otherEnd(x, 'saturn'))
    );
}

/**
 * Who carries the weight in an aspect: Saturn, else Pluto, else the Sun, meeting one of the
 * other's personal planets. Returns [heavy point, the other end], or null.
 */
export function powerEnds(x: InterAspect): ['sun' | 'saturn' | 'pluto', SynastryPointKey] | null {
    for (const heavy of ['saturn', 'pluto', 'sun'] as const)
        if (has(x, heavy)) {
            const other = otherEnd(x, heavy);
            return isPersonal(other) ? [heavy, other] : null;
        }
    return null;
}

const FILTER_OTHER = among('sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'asc');

/** Neptune (the first-impression filter) or Saturn (what is real later) on a personal point. */
export function filterEnd(x: InterAspect): 'neptune' | 'saturn' | null {
    if (has(x, 'neptune')) return FILTER_OTHER(otherEnd(x, 'neptune')) ? 'neptune' : null;
    if (has(x, 'saturn')) return FILTER_OTHER(otherEnd(x, 'saturn')) ? 'saturn' : null;
    return null;
}

const asAspect = (c: WeightedContact) => (c.kind === 'aspect' ? c.aspect : null);
const asHouse = (c: WeightedContact) => (c.kind === 'house' ? c : null);

/** Which contacts each of sections 6–10 reads (準則 §3B). */
export const EXTRA_FITS: Record<ExtraSectionId, (c: WeightedContact) => boolean> = {
    // Mars / Mercury tension (導火線), Moon–Saturn in any aspect and hard Saturn (冷戰).
    synastry_fight: (c) => {
        const x = asAspect(c);
        if (!x || has(x, 'asc')) return false;
        return fightTrigger(x) !== null || (has(x, 'moon') && has(x, 'saturn')) || saturnChill(x);
    },
    // The Moon's aspects and house (回血), planets in the other's 6th / 12th (耗損).
    synastry_battery: (c) => {
        const x = asAspect(c);
        if (x)
            return (
                has(x, 'moon') &&
                !has(x, 'saturn') &&
                !has(x, 'asc') &&
                isPlanet(otherEnd(x, 'moon'))
            );
        const h = asHouse(c);
        return !!h && h.body !== 'pluto' && (h.body === 'moon' || h.house === 6 || h.house === 12);
    },
    // Sun / Saturn / Pluto on the other's personal planets, or in the other's houses.
    synastry_power: (c) => {
        const x = asAspect(c);
        if (x) return !has(x, 'asc') && powerEnds(x) !== null;
        const h = asHouse(c);
        return !!h && (h.body === 'sun' || h.body === 'saturn' || h.body === 'pluto');
    },
    // Planets in the other's 2nd / 6th / 10th, and Jupiter / Mercury aspects.
    synastry_work: (c) => {
        const x = asAspect(c);
        if (x) {
            if (has(x, 'asc')) return false;
            if (has(x, 'jupiter')) return isPlanet(otherEnd(x, 'jupiter'));
            return (
                has(x, 'mercury') &&
                among('sun', 'moon', 'mercury', 'venus', 'mars', 'saturn')(otherEnd(x, 'mercury'))
            );
        }
        const h = asHouse(c);
        return !!h && h.body !== 'pluto' && (h.house === 2 || h.house === 6 || h.house === 10);
    },
    synastry_filter: (c) => {
        const x = asAspect(c);
        return !!x && filterEnd(x) !== null;
    },
};

/** 1..12: the house of `cusps` (cusps[0] = house 1) that holds the longitude. */
function houseOfLongitude(longitude: number, cusps: number[]): number {
    for (let i = 0; i < 12; i++) {
        const span = normalize(cusps[(i + 1) % 12] - cusps[i]);
        if (normalize(longitude - cusps[i]) < span) return i + 1;
    }
    return 1;
}

/** Pluto in the other's houses: read by 權力與主導權 only, so it stays out of the base overlays. */
function plutoHouse(from: PartnerKey, src: AstroChart, dst: AstroChart): HouseContact[] {
    const pluto = src.bodies.find((x) => x.key === 'pluto');
    if (!pluto || !dst.houses || dst.timeUnknown) return [];
    const house = houseOfLongitude(
        pluto.longitude,
        dst.houses.map((h) => h.longitude),
    );
    return [
        {
            kind: 'house',
            id: `house:${from}:pluto`,
            from,
            body: 'pluto',
            house,
            score: scoreHouse('pluto', house),
            theme: 'depth',
            prefs: [],
        },
    ];
}

/**
 * Contacts for sections 6–10, highest score first. On top of the weighted contacts this adds the
 * two kinds only these sections read: Neptune / Saturn aspects to the Ascendant (first
 * impressions) and Pluto's house in the other chart (power).
 */
export function extraSections(
    a: AstroChart,
    b: AstroChart,
    syn: AstroSynastry,
    contacts: WeightedContact[],
): Record<ExtraSectionId, WeightedContact[]> {
    const ascAspects: AspectContact[] = syn.aspects
        .filter((x) => has(x, 'asc') && filterEnd(x) !== null)
        .map((x) => ({
            kind: 'aspect',
            id: `aspect:${x.a}:${x.b}`,
            aspect: x,
            // The Ascendant counts as a personal point here.
            score: clampScore(orbBase(x.orb) + WEIGHT.personalInvolved),
            theme: aspectTheme(x),
            prefs: [],
        }));
    const pool = [...contacts, ...ascAspects, ...plutoHouse('a', a, b), ...plutoHouse('b', b, a)]
        .filter((c) => c.score >= MIN_SCORE)
        .map((c, i) => [c, i] as const)
        .sort((x, y) => y[0].score - x[0].score || x[1] - y[1])
        .map(([c]) => c);
    return Object.fromEntries(
        EXTRA_ORDER.map((id) => [id, pool.filter(EXTRA_FITS[id])]),
    ) as Record<ExtraSectionId, WeightedContact[]>;
}

export interface SynastryWeighting {
    contacts: WeightedContact[];
    sections: Record<SectionId, WeightedContact[]>;
    /** Contacts sections 6–10 may read (not exclusive, see EXTRA_FITS). */
    extras: Record<ExtraSectionId, WeightedContact[]>;
    axis: ThemeScore[];
}

export function weighSynastry(a: AstroChart, b: AstroChart, syn: AstroSynastry): SynastryWeighting {
    const contacts = weighContacts(a, b, syn);
    return {
        contacts,
        sections: allocateSections(contacts),
        extras: extraSections(a, b, syn, contacts),
        axis: interactionAxis(contacts),
    };
}
