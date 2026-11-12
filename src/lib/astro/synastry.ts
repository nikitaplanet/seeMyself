import type { PartnerKey } from '@/lib/hd/synastry';
import type { MeaningItem } from '@/lib/ui/personMeaning';
import {
    ASPECT_ANGLES,
    ASPECT_NAMES,
    ASPECT_ORBS,
    BODY_NAMES,
    formatDegMin,
    SIGN_NAMES,
} from './labels';
import { BODY_FUNCTION } from './meaning';
import {
    AXIS_NAMES,
    SECTION_ORDER,
    SECTION_TITLES,
    THEMES,
    weighSynastry,
    type AxisKey,
    type SectionId,
    type SynastryWeighting,
    type ThemeId,
    type ThemeScore,
    type WeightedContact,
} from './synastryWeight';
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
    if (chart.angles && !chart.timeUnknown)
        pts.push({ key: 'asc', longitude: chart.angles.asc.longitude });
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
    pairId('mercury', 'mercury'),
    pairId('mars', 'mars'),
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
// The report follows 星盤開發準則 §3B/§4: five sections in a fixed order, each fed only by the
// contacts the weighting engine (synastryWeight.ts) dealt to it, so no contact is written twice.
// The pair's 互動主軸 (top themes) is computed first and frames 亮點 and 磨合 as two sides of one
// quality. Each card: hook ≤ 20 字, 【解析】 two paragraphs ≤ 80 字, 【相處場景】 ≤ 60 字,
// 【給兩人的建議】 ≤ 50 字. Contact sentences come from the per-pair tables below (whose Moon,
// whose Mars, per aspect family) and carry their chart basis only in a short parenthetical.
// Afterwards: 這段關係的禮物 (or 課題與禮物 for a flagged pair) and the 星盤依據 reference card.

export interface AstroPartner {
    name: string;
    chart: AstroChart;
}

type Family = 'conj' | 'soft' | 'hard';

function familyOf(type: AspectType): Family {
    if (type === 'conjunction') return 'conj';
    return type === 'trine' || type === 'sextile' ? 'soft' : 'hard';
}

/** p = holder of the first planet in the note key, q = holder of the second. */
type Phrase = (p: string, q: string) => string;

/**
 * [strength, growth point] — each a full sentence. The strength is the lead; the growth point is
 * short and comes with a doable tip. A clearly difficult pair (see fitSignal) gets the growth point
 * of tense aspects first, so the challenge carries the weight there.
 */
type Note = (p: string, q: string) => [string, string];

interface PairNote {
    theme: string;
    conj: Note;
    soft: Note;
    hard: Note;
}

function noteKey(x: SynastryPointKey, y: SynastryPointKey): string {
    return `${x}>${y}`;
}

const PAIR_NOTES: Record<string, PairNote> = {
    [noteKey('sun', 'moon')]: {
        theme: '日月相位是合盤最重要的一組，看一人的人生方向能不能被另一人的情緒接住',
        conj: (p, q) => [
            `${p}做自己的樣子，正好是${q}心裡需要的；${q}會本能地支持${p}的目標，兩人常有「就是你」的熟悉感，像早就認識。`,
            `角色容易固定成${p}帶頭、${q}配合，連選餐廳這種小事也可以偶爾交換。`,
        ],
        soft: (p, q) => [
            `${p}想做的事，${q}多半直覺地支持；${q}心情低落時，${p}在身邊本身就是安定，兩人走在一起很自然地互相成全。`,
            `順到不太需要講，可以試試每隔一陣子問一句「最近你真正需要的是什麼」。`,
        ],
        hard: (p, q) => [
            `這組讓兩人沒辦法對彼此敷衍：${q}提醒${p}生活不只有目標，${p}帶${q}走出習慣的舒適圈，彼此都因對方變得更完整。`,
            `${p}忙著衝刺時，${q}可能正需要被陪伴；重要決定前先問一句「這對你的心情有什麼影響」，拉扯就會變成互相照顧。`,
        ],
    },
    [noteKey('sun', 'sun')]: {
        theme: '日日相位反映兩人的人生方向與自我表現是否同調',
        conj: () => [
            '兩人的核心動力相近，興趣與目標常一致，像同一隊的隊友，一起追夢時特別有底氣。',
            '偶爾會同時想當主角，分好各自發光的舞台就好。',
        ],
        soft: () => [
            '價值方向接近，各自做自己時能互相欣賞、不搶光，一起做計畫很少為大方向爭執。',
            '看事情的角度相像，重大決定時可以試試多聽一個圈外人的意見。',
        ],
        hard: () => [
            '兩人走的是不同的路，對方正好示範了你沒走過的那一種活法，一起生活眼界會變寬。',
            '當「為什麼你不能像我這樣」冒出來時，把差異當成兩種做法而不是對錯，它就會變成你們的優勢。',
        ],
    },
    [noteKey('moon', 'moon')]: {
        theme: '月月相位反映生活習慣與情緒節奏，關乎住在一起舒不舒服',
        conj: () => [
            '情緒反應幾乎同步，吃飯、睡覺、窩在家的習慣很容易合拍，常常一個眼神就知道對方今天怎麼了。',
            '一起低潮時可能互相影響，約好由狀態好的那一個先開燈、泡杯熱茶。',
        ],
        soft: () => [
            '生活節奏與情緒需求順得來，住在一起舒服，不用多解釋就知道對方今天累了，家裡的空氣是放鬆的。',
            '舒服久了，難開口的事也容易默契地繞過去，可以試試每週留十分鐘聊聊心裡話。',
        ],
        hard: () => [
            '兩人安心的方式不同，正因如此，會被逼著把「我需要什麼」說清楚，這樣的伴侶往往比只靠默契的更懂得照顧彼此。',
            '一人想談、一人想靜時，事先講好「我不舒服時希望你怎麼做」，差異就有了照顧的說明書。',
        ],
    },
    [noteKey('venus', 'mars')]: {
        theme: '金火相位是吸引力與心動感的來源',
        conj: (p, q) => [
            `${q}會主動靠近、追求，${p}很享受被追的感覺，化學反應一開始就很明顯，這份心動是很多伴侶羨慕的。`,
            `火花之外，也記得聊聊彼此的需求與界線，熱度會更長久。`,
        ],
        soft: (p, q) => [
            `${q}的主動讓${p}覺得被喜歡、被重視，${p}的回應也讓${q}更有動力，兩人的熱度穩定又自在。`,
            `可以試試偶爾換個約會方式，讓這份順一直保有新鮮感。`,
        ],
        hard: (p, q) => [
            `吸引力強烈而真實，兩人之間一直有種讓人在意的張力，這份心動不容易淡掉。`,
            `${q}偏好快而直接，${p}想被慢慢對待；把「我想要的是什麼」說出口，比期待對方猜到有效得多。`,
        ],
    },
    [noteKey('sun', 'venus')]: {
        theme: '日金相位帶來欣賞與好感，容易覺得對方可愛',
        conj: (p, q) => [
            `${q}真心欣賞${p}本來的樣子，${p}在${q}面前容易放鬆、發光；兩人很會互相寵，一起出現時總帶著甜味。`,
            `寵得多，偶爾也要讓${q}放心說出小小的不滿，甜才會更踏實。`,
        ],
        soft: (p, q) => [
            `${q}喜歡${p}的個性，常主動稱讚、送小禮物或安排約會，${p}也樂於回報，相處甜而不膩。`,
            `氣氛太好時小問題容易被擱著，可以試試趁心情好時順口聊開。`,
        ],
        hard: (p, q) => [
            `欣賞一直都在，而品味的落差常把${p}帶去本來不會嘗試的地方，生活因此多了新的顏色。`,
            `當${q}希望${p}多浪漫、多打扮時，換成「我覺得你這樣穿很好看」的邀請，就不會聽起來像要求改變。`,
        ],
    },
    [noteKey('moon', 'venus')]: {
        theme: '月金相位帶來溫柔與照顧，相處有安全感',
        conj: (p, q) => [
            `${q}的溫柔正好落在${p}的情緒需求上，${p}被照顧得很安心，是家常感最強的組合之一。`,
            `${q}習慣當給的一方，${p}也可以主動問「那你呢？」，讓照顧流向兩邊。`,
        ],
        soft: (p, q) => [
            `${q}自然知道怎麼讓${p}心情變好，一杯熱茶、一個擁抱就夠，關係的氣氛柔和又溫暖。`,
            `碰上錢、家人這類硬話題時，可以試試先約好時間，在溫柔裡也把事情談完。`,
        ],
        hard: (p, q) => [
            `兩人的好感與心意都在，一旦摸清楚彼此要的是什麼，${q}會是最懂得怎麼疼${p}的人。`,
            `${q}送禮或安排約會時，${p}可能其實只想被聽心事；直接說「今天我想要的是……」，心意就能對準。`,
        ],
    },
    [noteKey('venus', 'venus')]: {
        theme: '金金相位反映審美、喜好與愛的方式是否相近',
        conj: () => [
            '喜好很接近，選餐廳、佈置房間、休閒方式很容易一致，一起逛街本身就是享受。',
            '想要的東西一樣，一起花錢時可以約好一人負責踩一下煞車。',
        ],
        soft: () => [
            '審美與享受的方式彼此加分，常會介紹對方喜歡上新的東西，生活因此越過越有味道。',
            '繳費、存錢這類不浪漫的事，可以試試排進固定的「兩人理財日」。',
        ],
        hard: () => [
            '兩人對「浪漫」「好品味」各有一套，輪流照對方的方式過，生活的樣貌會比單一品味豐富得多。',
            '紀念日怎麼過意見不同時，今年你安排、明年我安排，就是很好的解法。',
        ],
    },
    [noteKey('sun', 'mars')]: {
        theme: '日火相位帶來行動上的推動與活力',
        conj: (p, q) => [
            `${q}會強烈推動${p}去做，兩人一起行動時效率很高，常常想到就能一起完成。`,
            `誰主導的問題偶爾會冒出來，事前分好角色就順了。`,
        ],
        soft: (p, q) => [
            `${q}的行動力支持${p}的目標，像好隊友、運動夥伴，一起完成事情很有成就感。`,
            `做事太有默契時，記得也留一點什麼都不做、只是待在一起的時間。`,
        ],
        hard: (p, q) => [
            `兩人之間的較勁會逼出彼此的實力，${q}的衝勁常讓${p}做到原本以為做不到的事。`,
            `當${q}的直接被${p}聽成批評時，把競爭心放到兩人共同的目標上，就會變成你們的優勢。`,
        ],
    },
    [noteKey('moon', 'mars')]: {
        theme: '月火相位帶來熱度與情緒上的激發',
        conj: (p, q) => [
            `${q}的直接很快就能點燃${p}的情緒，熱情來得真實；${q}的保護欲也讓${p}覺得被護著。`,
            `${q}說話時放慢一點語氣，${p}會更接得住。`,
        ],
        soft: (p, q) => [
            `${q}會保護${p}，${p}也能安撫${q}的火氣；兩人鬧彆扭通常很快就和好，相處有溫度也有彈性。`,
            `和好得快，可以試試和好後再補一句「剛剛真正卡住的是什麼」。`,
        ],
        hard: (p, q) => [
            `這組的熱度是真的，${q}的直接常讓${p}敢把壓著的情緒說出來，兩人之間很少假裝沒事。`,
            `${q}急著解決、${p}需要先被安撫時，約好一句暫停暗號，例如「我需要慢一點」，節奏就對得上。`,
        ],
    },
    [noteKey('asc', 'sun')]: {
        theme: '太陽碰上升，關乎第一印象與外在形象',
        conj: (p, q) => [
            `第一眼就注意到彼此，${q}的個性很能照亮${p}給人的形象，兩人走在一起很有存在感。`,
            `在人多的場合，${q}可以偶爾把舞台讓給${p}。`,
        ],
        soft: (p, q) => [
            `見面就自在，${q}欣賞${p}待人處事的方式，${p}也覺得${q}很好相處，是很好的起點。`,
            `表面的順可以花點時間往深處走，多聊聊彼此的過去。`,
        ],
        hard: (p, q) => [
            `${q}的作風與${p}很不一樣，熟了之後，這份不同會變成彼此最欣賞對方的地方。`,
            `第一印象可能是「跟我好不一樣」，多給彼此一點認識的時間就好。`,
        ],
    },
    [noteKey('asc', 'moon')]: {
        theme: '月亮碰上升，關乎相處時放不放鬆',
        conj: (p, q) => [
            `${q}在${p}面前很快就放鬆，像認識很久的老朋友；${p}也很能感受到${q}的情緒，是很貼心的連結。`,
            `${q}心情差時${p}容易跟著受影響，可以試試先說一句「不是你的關係」。`,
        ],
        soft: (p, q) => [
            `${p}待人的樣子讓${q}有安全感，一起出門、見朋友都很自然，帶得出門也回得了家。`,
            `自在久了，偶爾為約會多花一點心思，會讓彼此再心動一次。`,
        ],
        hard: (p, q) => [
            `${q}其實很把${p}放在心上，才會對${p}在外的樣子這麼敏感。`,
            `當${q}覺得${p}對別人太熱絡時，${p}多一句說明、一個小動作，${q}就能安心。`,
        ],
    },
    [noteKey('asc', 'venus')]: {
        theme: '金星碰上升，關乎外在的吸引',
        conj: (p, q) => [
            `${q}一見${p}就有好感，覺得${p}的樣子很吸引人，常是一見鍾情的組合。`,
            `外表的好感來得快，也給彼此時間認識外表底下的那個人。`,
        ],
        soft: (p, q) => [
            `${q}欣賞${p}的外型與氣質，兩人在社交場合很搭，是朋友眼中「好配」的一對。`,
            `內在的差異可以慢慢聊，不用急。`,
        ],
        hard: (p, q) => [
            `好感裡帶點品味的火花，${q}的建議有時真的能讓${p}發現自己的新樣子。`,
            `${q}想幫${p}換穿搭時，用分享代替要求，聽不聽留給${p}決定。`,
        ],
    },
    [noteKey('mercury', 'mercury')]: {
        theme: '水水相位看兩人說話與思考的頻率',
        conj: () => [
            '說話節奏和想法很接近，玩笑一點就通，聊天本身就是一種享受。',
            '可以偶爾聊點兩人都不熟的新話題，讓對話一直有新鮮感。',
        ],
        soft: () => [
            '不用多解釋就懂對方的意思，討論常激發出兩人各自想不到的點子。',
            '太容易同意彼此時，偶爾請對方唱個反調，想法會更周全。',
        ],
        hard: () => [
            '兩人的思路不同，一起想事情時反而特別周全，常能看到對方漏掉的角度。',
            '同一句話聽成不同意思時，先複述一次「你的意思是……嗎？」，溝通就順了。',
        ],
    },
    [noteKey('mercury', 'moon')]: {
        theme: '水月相位看講道理與談感受能否接上',
        conj: (p, q) => [
            `${p}的話很能說進${q}心裡，${q}的心情也常被${p}一語點破，是很懂彼此的組合。`,
            `被看得太透時${q}可能需要一點空間，${p}點到為止就好。`,
        ],
        soft: (p, q) => [
            `${p}會用${q}聽得進去的方式講道理，${q}心煩時很願意找${p}聊，常聊完就輕鬆了。`,
            `${q}也可以試試先自己整理一下，再找${p}一起想。`,
        ],
        hard: (p, q) => [
            `等情緒過了，${p}的冷靜分析往往正是${q}需要的那盞燈。`,
            `${q}需要先被同理、再談解決；${p}先說一句「我懂你不好受」，道理就聽得進去了。`,
        ],
    },
    [noteKey('mercury', 'venus')]: {
        theme: '水金相位讓聊天也有戀愛感',
        conj: (p, q) => [
            `聊天就是約會，${p}說的話常讓${q}覺得被欣賞、很浪漫。`,
            `甜話之外，難開口的事也趁氣氛好時一起說。`,
        ],
        soft: (p, q) => [
            `${p}很會說${q}愛聽的話，兩人有聊不完的共同喜好，訊息往來都帶著笑。`,
            `聊到錢或分歧時，換個比較正式的時間和場合，會更順。`,
        ],
        hard: (p, q) => [
            `${q}從${p}那裡聽到的多半是真話，這份坦白是很珍貴的信任。`,
            `${p}說話直白時，換個溫柔一點的說法，意思不變，${q}的感受會差很多。`,
        ],
    },
    [noteKey('mercury', 'mars')]: {
        theme: '水火相位讓討論很有火力',
        conj: (p, q) => [
            `討論熱烈，${q}會把${p}的想法立刻拿去做，點子很少只停在嘴上。`,
            `聊天變辯論時，記得笑一下，提醒彼此是同一隊。`,
        ],
        soft: (p, q) => [
            `${q}會把${p}的點子付諸行動，是很好的執行搭檔，一起做事很有成就感。`,
            `${q}動得快，可以先等${p}把想法說完再開工。`,
        ],
        hard: (p, q) => [
            `爭論會把兩人的想法磨得更利，${p}的點子經過${q}的挑戰後常更站得住。`,
            `${q}把${p}的話聽得太重時，約好讓對方先講完再回應，就能留下火力、少掉火氣。`,
        ],
    },
    [noteKey('mercury', 'sun')]: {
        theme: '水日相位看誰最懂誰的想法',
        conj: (p, q) => [
            `${p}很懂${q}在想什麼，常是${q}最好的討論對象與知音。`,
            `懂得多時，${p}可以先問再說，讓${q}自己下結論。`,
        ],
        soft: (p, q) => [
            `${p}的想法常替${q}的目標補上關鍵的一塊，兩人一起規劃很有收穫。`,
            `${p}提出不同意見時，${q}先聽完，常會發現那正是自己需要的提醒。`,
        ],
        hard: (p, q) => [
            `${p}的意見常點到${q}看不見的地方，是很難得的一面鏡子。`,
            `${p}說意見時先講肯定的部分，${q}就不會聽成對自己的評論。`,
        ],
    },
    [noteKey('mars', 'mars')]: {
        theme: '火火相位看兩人做事與生氣的節奏',
        conj: () => [
            '精力同步，一起運動、做事很有勁，是很能並肩作戰的組合。',
            '兩人同時有火氣時，約好先讓其中一人去走走、冷靜一下。',
        ],
        soft: () => [
            '行事步調合拍，分工合作順，一起搬家、裝修這類需要體力的事特別有效率。',
            '忙著做事時，也記得留時間談心。',
        ],
        hard: () => [
            '兩種做事方法各有長處，合起來比任何一人單做都完整。',
            '一人要馬上、一人要照自己的方式時，事前分好各自負責的範圍，就不必爭主導。',
        ],
    },
    // Saturn contacts: p = the Saturn person.
    [noteKey('saturn', 'sun')]: {
        theme: '土日相位帶來責任與長久感，土星一方像老師或靠山',
        conj: (p, q) => [
            `${p}像${q}的靠山，給方向也給穩定，${q}在${p}身邊會越來越踏實。`,
            `${q}偶爾覺得被管時，${p}可以多問「你想怎麼做」，少說「應該怎麼做」。`,
        ],
        soft: (p, q) => [
            `${p}給${q}穩定的支持與實際建議，${q}在${p}身邊做事更有章法，是能一起走很遠的組合。`,
            `${p}偶爾安排一點小驚喜，讓穩定裡也有輕鬆。`,
        ],
        hard: (p, q) => [
            `兩人都把這段關係當真，${p}的期待常推著${q}真的長大、變得更強。`,
            `${q}覺得怎麼做都不夠好時，${p}多說一句肯定，${q}也問清楚具體的標準，壓力就會變成支撐。`,
        ],
    },
    [noteKey('saturn', 'moon')]: {
        theme: '土月相位耐久，是適合長久陪伴的組合',
        conj: (p, q) => [
            `關係很能走長，${p}給${q}的是一種「有人會一直在」的安定。`,
            `${q}有時會把情緒收起來，兩人可以具體約定「怎樣才算有陪伴」。`,
        ],
        soft: (p, q) => [
            `${p}讓${q}的情緒有可靠的依靠，${q}知道遇到事${p}一定在。`,
            `${p}的照顧偏實際，${q}想要軟話與擁抱時，直接說出口就好。`,
        ],
        hard: (p, q) => [
            `這是長久伴侶身上常見的組合，兩人都很認真看待彼此，願意為對方負責。`,
            `${q}的感受碰上${p}的現實考量時，${p}先接住感受、再談該怎麼辦，${q}就會覺得被好好對待。`,
        ],
    },
    [noteKey('saturn', 'mercury')]: {
        theme: '土水相位影響兩人說話時的輕重',
        conj: (p, q) => [
            `${p}會認真對待${q}的想法，${q}也欣賞${p}的成熟與可靠。`,
            `${p}糾正細節前先說好的地方，${q}會更敢隨口分享。`,
        ],
        soft: (p, q) => [
            `${p}幫${q}把想法整理成可行的計畫，兩人一起規劃很可靠，說到就做得到。`,
            `偶爾也給隨興的念頭一點空間，不必每件事都先有計畫。`,
        ],
        hard: (p, q) => [
            `經過${p}把關的點子通常更站得住，${q}的想法也因此更扎實。`,
            `${q}分享點子時，${p}先聽完再評估，${q}就會一直願意說。`,
        ],
    },
    [noteKey('saturn', 'venus')]: {
        theme: '土金相位帶來忠誠與承諾',
        conj: (p, q) => [
            `關係有很強的承諾感，${p}的愛也許含蓄，卻是說到做到、很能信任的那種。`,
            `${p}偶爾做點不實用的浪漫小事，${q}會很開心。`,
        ],
        soft: (p, q) => [
            `感情穩定、忠誠，${p}願意為${q}做長期打算，兩人很適合一起規劃未來。`,
            `穩定之餘，偶爾安排一次像剛交往時的約會，讓心動也跟著長久。`,
        ],
        hard: (p, q) => [
            `這段感情不是一時興起，能一起走過這份落差的兩人，往往經得起考驗。`,
            `${q}要的甜蜜，${p}給得比較慢；把期待講成具體的小事，例如「每天睡前抱一下」，${p}就做得到。`,
        ],
    },
    [noteKey('saturn', 'mars')]: {
        theme: '土火相位是油門與煞車，配合好了就是很穩的前進',
        conj: (p, q) => [
            `${p}替${q}的衝勁把關，很多時候是一種保護，讓${q}少走冤枉路。`,
            `${q}覺得綁手綁腳時，兩人講好哪些事${q}可以自己決定。`,
        ],
        soft: (p, q) => [
            `${p}幫${q}的衝勁找到方向與節奏，兩人一起做事穩而有效率。`,
            `遇到該衝的時機，${p}也可以試著放手一次。`,
        ],
        hard: (p, q) => [
            `磨合過後，${q}的衝勁加上${p}的耐性是很難得的組合，能把事情做得又快又穩。`,
            `${p}想慢、${q}想衝時，先講好底線，其他放手，兩人都會輕鬆很多。`,
        ],
    },
    [noteKey('saturn', 'asc')]: {
        theme: '土星碰上升，帶來敬重與可靠感',
        conj: (p, q) => [
            `${q}覺得${p}可靠，是遇到事會想找的人。`,
            `${q}在${p}面前可能有點拘謹，${p}多笑、多放鬆，${q}也會跟著自在。`,
        ],
        soft: (p, q) => [
            `${p}讓${q}覺得穩重可靠，${q}在${p}身邊會想成為更好的自己。`,
            `${p}可以偶爾讓${q}看到自己輕鬆的一面。`,
        ],
        hard: (p, q) => [
            `${p}其實一直在注意${q}，這份在意本身就是一種重視。`,
            `${p}有意見時先說欣賞的部分，${q}在${p}面前就會越來越放得開。`,
        ],
    },
};

/** Plain-language noun for what a point stands for in the other person's life. */
const AREA: Record<SynastryPointKey, string> = {
    sun: '人生目標',
    moon: '情緒',
    mercury: '想法',
    venus: '感情',
    mars: '行動',
    jupiter: '信心',
    saturn: '責任感',
    uranus: '自由',
    neptune: '想像',
    pluto: '深層的自己',
    northNode: '人生方向',
    chiron: '舊傷',
    asc: '第一印象',
};

/** Actor + other person's area → [strength, growth point]; p = actor's holder, q = the other. */
type ActorNote = (p: string, q: string, area: string) => [string, string];

/** Slower planets touching the other person's point (used when no PAIR_NOTES entry exists). */
const ACTOR_NOTES: Partial<Record<SynastryPointKey, Record<Family, ActorNote>>> = {
    northNode: {
        // Node contacts are about the Node holder's growth: q's planet nudges p forward.
        conj: (p, q, area) => [
            `${q}${area}正好落在${p}想成長的方向上，${q}常在不經意間推${p}一把。`,
            `${p}可以留意${q}鼓勵自己嘗試的事，那多半是下一步。`,
        ],
        soft: (p, q, area) => [
            `${q}${area}讓${p}更容易往想去的方向走，相處中自然一起成長。`,
            `順勢的成長也需要行動，${p}可以把感受化成具體的一步。`,
        ],
        hard: (p, q, area) => [
            `${q}${area}逼${p}看清自己真正想走的路，這份提醒很難得。`,
            `方向不同時，把它當成提醒而不是阻礙。`,
        ],
    },
    chiron: {
        conj: (p, q, area) => [
            `${p}會碰到${q}${area}裡的舊傷，也帶來被療癒的機會。`,
            `碰到敏感處時，先問一句「這讓你想起什麼嗎」。`,
        ],
        soft: (p, q, area) => [
            `${p}能溫和地接住${q}${area}裡的脆弱，讓${q}覺得被理解。`,
            `被接住之後，${q}也讓${p}知道自己需要什麼。`,
        ],
        hard: (p, q, area) => [
            `${p}無心的話可能碰到${q}${area}裡的痛處，願意談開就是療癒的起點。`,
            `碰到痛處時說出來，比默默退開更能修復。`,
        ],
    },
    pluto: {
        conj: (p, q, area) => [
            `${p}對${q}${area}有很深的影響力，兩人在一起都會改變。`,
            `影響力強時，記得尊重彼此的空間。`,
        ],
        soft: (p, q, area) => [
            `${p}帶著${q}${area}往更深處走，關係越走越有分量。`,
            `深度之外，也留一點輕鬆玩樂的時間。`,
        ],
        hard: (p, q, area) => [
            `${p}會逼出${q}${area}裡最真實的一面，走過之後兩人都更強。`,
            `想掌握對方時先停一下，說出自己真正的擔心。`,
        ],
    },
    neptune: {
        conj: (p, q, area) => [
            `${p}讓${q}${area}多了浪漫與想像，兩人常有說不出的懂。`,
            `浪漫之外，也看見對方真實的樣子。`,
        ],
        soft: (p, q, area) => [
            `${p}對${q}${area}有種溫柔的體諒，像心靈上的共鳴。`,
            `重要的事還是講清楚，別只靠感覺。`,
        ],
        hard: (p, q, area) => [
            `${p}和${q}之間有種說不清的牽引，讓${q}${area}很想靠近。`,
            `${q}容易對${p}抱著美好的想像，落差出現時多問一句，就能少很多誤會。`,
        ],
    },
    uranus: {
        conj: (p, q, area) => [
            `${p}總能讓${q}${area}有新鮮感與驚喜，日子很少一成不變。`,
            `驚喜之外也給彼此可預期的安排，讓人放心。`,
        ],
        soft: (p, q, area) => [
            `${p}讓${q}${area}多了自由與新意，相處輕鬆不黏膩。`,
            `太輕鬆時，偶爾也確認一下彼此的心意。`,
        ],
        hard: (p, q, area) => [
            `${p}常打亂${q}${area}的節奏，也逼兩人跳出老套。`,
            `${p}臨時改變計畫時先說一聲，${q}就不會覺得被丟下。`,
        ],
    },
    saturn: {
        conj: (p, q, area) => [
            `${p}為${q}${area}帶來結構與穩定，是可以依靠的力量。`,
            `${p}的標準偶爾太嚴，多說一句肯定就好。`,
        ],
        soft: (p, q, area) => [
            `${p}用耐心撐住${q}${area}，是能一起走長路的力量。`,
            `穩定之餘，也留一點計畫外的輕鬆。`,
        ],
        hard: (p, q, area) => [
            `${p}對${q}${area}有要求，磨過之後會變成很牢的承諾。`,
            `${q}覺得被要求時，直接問清楚${p}真正在意的是什麼。`,
        ],
    },
    jupiter: {
        conj: (p, q, area) => [
            `${p}很會替${q}${area}打氣，${q}在${p}身邊更敢放手去做。`,
            `熱情一上來容易一起答應太多，重要的事先睡一晚再決定。`,
        ],
        soft: (p, q, area) => [
            `${p}的樂觀常讓${q}${area}更有底氣，兩人在一起像是運氣變好了。`,
            `順利時也記得一起踩點煞車，量力而為。`,
        ],
        hard: (p, q, area) => [
            `${p}把${q}${area}的格局撐大，常帶${q}看見更多可能。`,
            `${p}的鼓勵有時給得太滿，${q}可以說出自己真實的步調。`,
        ],
    },
};

const ACTOR_ORDER: SynastryPointKey[] = [
    'northNode',
    'chiron',
    'pluto',
    'neptune',
    'uranus',
    'saturn',
    'jupiter',
];

/** The angle between two points, in plain words (for the parenthetical chart basis). */
const ANGLE_PLAIN: Record<AspectType, string> = {
    conjunction: '疊在一起',
    trine: '順向呼應',
    sextile: '輕快呼應',
    square: '互相拉扯',
    opposition: '兩端對望',
};

// ---------------------------------------------------------------------------
// Sign-coloured wording. The commonest contacts are not written as fixed sentences: they are
// composed from how each planet behaves in its sign, so a water Moon with a fire Mars reads
// differently from an earth Moon with an air Mars. Indexed 0 = 牡羊 … 11 = 雙魚.
// ---------------------------------------------------------------------------

type Twelve = readonly [
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
];

/** Noun phrases that attach right after a name: 「甲」+「敢衝敢闖的性子」. */
const SIGN_DESC: Partial<Record<SynastryPointKey, Twelve>> = {
    sun: [
        '敢衝敢闖的性子',
        '穩穩前進的步調',
        '好奇多變的腦袋',
        '顧家念舊的心',
        '想發光的熱情',
        '凡事做到好的認真',
        '重和諧的體貼',
        '認定就到底的執著',
        '嚮往遠方的樂觀',
        '一步步往上爬的決心',
        '不按牌理的獨立',
        '柔軟又愛做夢的心',
    ],
    moon: [
        '說來就來的情緒',
        '需要安穩的心',
        '靠聊天消化的心情',
        '渴望被照顧的心',
        '想被捧在手心的感受',
        '需要秩序感的情緒',
        '怕衝突、愛和平的心',
        '深藏不露的情感',
        '需要自由呼吸的心情',
        '習慣自己扛的情緒',
        '需要一點距離的心',
        '容易被觸動的心',
    ],
    venus: [
        '直接熱烈的愛',
        '細水長流的溫柔',
        '愛聊愛玩的心意',
        '把人照顧好的愛',
        '大方寵人的愛',
        '藏在細節裡的心意',
        '浪漫講究的愛',
        '全心投入的愛',
        '自在不黏人的愛',
        '說到做到的愛',
        '像朋友一樣的愛',
        '無條件付出的溫柔',
    ],
    mars: [
        '說做就做的衝勁',
        '慢而堅持的耐力',
        '靠嘴巴推進的行動力',
        '護短的保護欲',
        '想贏的好勝心',
        '講求效率的執行力',
        '先顧全局的行動',
        '一出手就到底的狠勁',
        '說走就走的豪爽',
        '有計畫的拚勁',
        '不走老路的行動',
        '跟著感覺走的行動',
    ],
    mercury: [
        '想到就說的直率',
        '想清楚才開口的穩重',
        '轉得飛快的腦袋',
        '帶著感情的說話方式',
        '很會說故事的口才',
        '條理分明的思路',
        '會看兩邊的判斷',
        '一針見血的洞察',
        '天馬行空的想法',
        '重結論的務實',
        '與眾不同的觀點',
        '靠直覺的理解',
    ],
};

/** Second phrasings for the same signs, used when a phrase was already said in an earlier card. */
const SIGN_DESC_ALT: Partial<Record<SynastryPointKey, Twelve>> = {
    sun: [
        '一往直前的勇氣',
        '踏實可靠的本性',
        '愛探索的好奇心',
        '重感情的溫厚',
        '大方耀眼的自信',
        '細心務實的態度',
        '優雅的分寸感',
        '深沉的意志',
        '愛自由的開朗',
        '沉穩的企圖心',
        '特立獨行的想法',
        '善感的浪漫',
    ],
    moon: [
        '急性子的心情',
        '慢熱的安全感',
        '多變的心思',
        '戀家的柔軟',
        '想被看見的心',
        '容易操心的感受',
        '需要和諧的心情',
        '愛恨分明的情緒',
        '樂天的心情',
        '內斂的情感',
        '冷靜的情緒',
        '敏感的心思',
    ],
    venus: [
        '來得快的心動',
        '重陪伴的感情',
        '輕鬆有趣的喜歡',
        '溫柔顧家的情意',
        '熱烈的寵愛',
        '貼心的照顧',
        '講究氣氛的浪漫',
        '濃烈的深情',
        '開朗大方的喜歡',
        '穩重長情的愛',
        '尊重空間的愛',
        '夢幻的溫柔',
    ],
    mars: [
        '直衝的火力',
        '不動如山的韌性',
        '靈活的應變',
        '顧家的拚勁',
        '帶頭的氣勢',
        '一絲不苟的做事方式',
        '講道理的行動',
        '不輕易放手的堅持',
        '冒險的膽量',
        '耐操的實幹',
        '特立獨行的做法',
        '隨和的行動',
    ],
    mercury: [
        '心直口快的個性',
        '慢條斯理的思考',
        '機靈的口才',
        '貼心的說法',
        '有自信的表達',
        '細膩的分析',
        '圓融的說法',
        '深入的思考',
        '豪邁的說話方式',
        '踏實的判斷',
        '跳躍的思考',
        '感性的表達',
    ],
};

/**
 * The 禮物 card's own phrasings for the same signs, so the closing card never repeats a phrase
 * the sections already used (and never needs a refer-back to get around it).
 */
const SIGN_DESC_GIFT: Partial<Record<SynastryPointKey, Twelve>> = {
    sun: [
        '敢做第一個的膽子',
        '不慌不忙的定力',
        '什麼都想試的好奇',
        '把人放在心上的溫情',
        '閃閃發亮的自信',
        '把細節顧好的用心',
        '讓人舒服的分寸',
        '專一到底的認真',
        '往外闖的熱忱',
        '肯吃苦的毅力',
        '有自己一套的獨立',
        '容易心軟的善良',
    ],
    moon: [
        '藏不住的心情',
        '要慢慢暖起來的心',
        '需要說出口的情緒',
        '需要被抱著的心',
        '需要被肯定的心',
        '需要秩序的安全感',
        '想被溫柔對待的心',
        '只對信任的人打開的心',
        '不想被綁住的心情',
        '不輕易示弱的心',
        '需要空間的感受',
        '像海綿一樣的感受',
    ],
    venus: [
        '說愛就愛的直接',
        '用陪伴表達的喜歡',
        '靠聊天拉近的感情',
        '把家顧好的心意',
        '捨得給的大方',
        '記得小事的體貼',
        '懂得營造氣氛的浪漫',
        '一旦愛上就很深的感情',
        '輕鬆自在的喜歡',
        '慢慢累積的承諾',
        '給人空間的喜歡',
        '願意為人付出的心',
    ],
    mars: [
        '一點就燃的行動',
        '慢慢磨的韌勁',
        '邊說邊做的機動',
        '為家人拚的力氣',
        '不服輸的志氣',
        '把事做到好的勤快',
        '先商量再動手的習慣',
        '咬住不放的意志',
        '想走就走的灑脫',
        '按部就班的努力',
        '別出心裁的做法',
        '順勢而為的柔軟',
    ],
    mercury: [
        '有話直說的爽快',
        '一字一句的踏實',
        '一點就通的反應',
        '溫柔的說話方式',
        '有感染力的表達',
        '面面俱到的思考',
        '講求公平的判斷',
        '看穿表面的眼光',
        '天南地北的話題',
        '說到做到的務實',
        '別人想不到的點子',
        '充滿畫面的想像',
    ],
};

/** Slower planets by element (火 土 風 水). */
const ELEMENT_DESC: Partial<Record<SynastryPointKey, readonly [string, string, string, string]>> = {
    jupiter: ['熱情的鼓勵', '實在的支持', '開闊的眼界', '溫暖的包容'],
    saturn: ['直接的要求', '踏實的責任感', '講道理的規矩', '默默扛起的責任'],
    uranus: ['衝出框架的新鮮感', '慢慢改變的韌性', '天外飛來的點子', '難以預料的感受'],
    neptune: ['浪漫的熱望', '溫柔的理想', '飄逸的想像', '深深的共感'],
    pluto: ['強烈的意志', '沉住氣的掌控力', '看透人心的眼光', '深沉的影響力'],
    northNode: ['想闖的方向', '想扎根的方向', '想學習的方向', '想交心的方向'],
    chiron: ['不敢衝的舊傷', '不安穩的舊傷', '怕被誤解的舊傷', '怕被丟下的舊傷'],
};

function descOf(p: AstroPartner, key: SynastryPointKey, forGift = false): string {
    if (key === 'asc') return '給人的第一印象';
    if (!bodyOf(p, key)) return `的${AREA[key]}`;
    const sign = signOf(p, key);
    const bySign = (forGift && SIGN_DESC_GIFT[key]) || SIGN_DESC[key];
    if (bySign) return bySign[sign];
    const byElement = ELEMENT_DESC[key];
    return byElement ? byElement[elementOf(sign)] : AREA[key];
}

/** A deterministic hash of both charts (all longitudes), for choosing between phrasings. */
function pairHash(a: AstroPartner, b: AstroPartner, salt: number): number {
    let h = 2166136261 ^ salt;
    for (const p of [a, b])
        for (const body of p.chart.bodies) {
            h ^= Math.round(body.longitude * 10);
            h = Math.imul(h, 16777619) >>> 0;
        }
    h ^= h >>> 13;
    return Math.imul(h, 2246822519) >>> 0;
}

function pickHash<T>(list: readonly T[], a: AstroPartner, b: AstroPartner, salt: number): T {
    return list[pairHash(a, b, salt) % list.length];
}

/** p holds the first planet of the key, q the second; dp / dq are their sign phrases. */
type Composed = (p: string, q: string, dp: string, dq: string) => [string, string];

const COMPOSED: Record<string, Record<Family, readonly Composed[]>> = {
    [noteKey('sun', 'moon')]: {
        conj: [
            (p, q, dp, dq) => [
                `${p}${dp}與${q}${dq}疊在一起，兩人常有「就是你」的熟悉感。`,
                `角色容易固定成${p}帶頭，小事也可以偶爾換${q}作主。`,
            ],
            (p, q, dp, dq) => [
                `${q}${dq}本能地支持${p}${dp}，像早就認識一樣自然。`,
                `${p}往前衝時，也回頭聽聽${q}心裡的聲音。`,
            ],
        ],
        soft: [
            (p, q, dp, dq) => [
                `${p}${dp}，正好被${q}${dq}穩穩接住，一個往前、一個給家的感覺。`,
                `順到不太需要講，${q}也記得把自己的需要說出口。`,
            ],
            (p, q, dp, dq) => [
                `${q}${dq}在${p}${dp}旁邊特別安心，兩人很自然地互相成全。`,
                `偶爾問一句「最近你真正需要的是什麼」，${p}和${q}會更貼近。`,
            ],
        ],
        hard: [
            (p, q, dp, dq) => [
                `${p}${dp}和${q}${dq}常互相拉扯，卻也逼兩人把生活過得更完整。`,
                `${p}衝得快時，先回頭照顧${q}${dq}，拉扯就成了互相照顧。`,
            ],
            (p, q, dp, dq) => [
                `${q}${dq}提醒${p}生活不只有目標，${p}${dp}則帶${q}走出舒適圈。`,
                `重要決定前，${p}先問${q}「這對你的心情有什麼影響」。`,
            ],
        ],
    },
    [noteKey('moon', 'mars')]: {
        conj: [
            (p, q, dp, dq) => [
                `${q}${dq}一下就能點燃${p}${dp}，熱情來得又快又真。`,
                `${q}說話時放慢一點，${p}${dp}會更接得住。`,
            ],
            (p, q, dp, dq) => [
                `${p}${dp}和${q}${dq}貼得很近，${q}的保護欲讓${p}覺得被護著。`,
                `${q}出手前先問一句，${p}會覺得被尊重。`,
            ],
        ],
        soft: [
            (p, q, dp, dq) => [
                `${q}${dq}會護著${p}${dp}，${p}也懂得怎麼讓${q}慢下來。`,
                `和好得快，也記得事後聊聊${p}真正卡住的地方。`,
            ],
            (p, q, dp, dq) => [
                `${p}${dp}遇上${q}${dq}，鬧彆扭很快就能和好，相處有溫度也有彈性。`,
                `${q}火氣上來時，${p}一句「我在」比講道理更有用。`,
            ],
        ],
        hard: [
            (p, q, dp, dq) => [
                `${q}${dq}常讓${p}${dp}敢把話說出來，兩人很少假裝沒事。`,
                `${q}急著解決時，先等${p}${dp}被安撫，再談對錯。`,
            ],
            (p, q, dp, dq) => [
                `${p}${dp}碰上${q}${dq}，火花不小，卻也讓兩人更認真看待彼此。`,
                `約好一句暫停暗號，${q}聽到就先停，${p}也說好什麼時候回來談。`,
            ],
        ],
    },
    [noteKey('venus', 'mars')]: {
        conj: [
            (p, q, dp, dq) => [
                `${q}${dq}直接撞上${p}${dp}，化學反應一開始就很明顯。`,
                `火花之外，也聊聊${p}和${q}各自的界線。`,
            ],
            (p, q, dp, dq) => [
                `${q}會主動靠近，${p}${dp}也很享受被${q}${dq}追著跑。`,
                `${p}偶爾也主動一次，${q}會很驚喜。`,
            ],
        ],
        soft: [
            (p, q, dp, dq) => [
                `${q}${dq}遇上${p}${dp}，一個主動、一個回應，心動很自然。`,
                `偶爾換個約會方式，讓${p}${dp}一直有新鮮感。`,
            ],
            (p, q, dp, dq) => [
                `${p}${dp}很吃${q}${dq}這一套，兩人的熱度穩定又自在。`,
                `${q}安排驚喜時，也問問${p}最近想要什麼。`,
            ],
        ],
        hard: [
            (p, q, dp, dq) => [
                `${p}${dp}和${q}${dq}節奏不同，正是這份落差讓吸引力一直都在。`,
                `${q}來得快、${p}想慢慢來；把想要的說出口，比等對方猜有效。`,
            ],
            (p, q, dp, dq) => [
                `${q}${dq}和${p}${dp}之間有種讓人在意的張力，心動不容易淡。`,
                `${p}想被怎麼對待，直接告訴${q}，別讓${q}${dq}亂猜。`,
            ],
        ],
    },
    [noteKey('moon', 'venus')]: {
        conj: [
            (p, q, dp, dq) => [
                `${q}${dq}正好落在${p}${dp}上，是家常感最強的組合之一。`,
                `${q}習慣當給的一方，${p}也可以問一句「那你呢？」。`,
            ],
            (p, q, dp, dq) => [
                `${p}${dp}在${q}${dq}裡被溫柔接住，相處柔和又暖。`,
                `${q}付出太多時，${p}也主動照顧回去。`,
            ],
        ],
        soft: [
            (p, q, dp, dq) => [
                `${q}${dq}自然知道怎麼讓${p}${dp}放鬆，一杯熱茶、一個擁抱就夠。`,
                `碰上錢、家人這類硬話題，${p}和${q}先約好時間再談。`,
            ],
            (p, q, dp, dq) => [
                `${p}${dp}遇上${q}${dq}，關係的氣氛柔和又溫暖。`,
                `${p}也把感謝說出口，讓${q}知道自己的用心被看見。`,
            ],
        ],
        hard: [
            (p, q, dp, dq) => [
                `${q}的心意一直都在，只要摸清${p}${dp}要什麼，就最懂怎麼疼${p}。`,
                `${q}${dq}送出的，不一定是${p}要的；直接說「今天我想要的是……」。`,
            ],
            (p, q, dp, dq) => [
                `${p}${dp}和${q}${dq}表達愛的方式不同，對準之後格外甜。`,
                `${p}心情不好時，先告訴${q}要的是陪伴還是禮物。`,
            ],
        ],
    },
    [noteKey('sun', 'venus')]: {
        conj: [
            (p, q, dp, dq) => [
                `${q}${dq}真心欣賞${p}${dp}，${p}在${q}面前很容易發光。`,
                `寵得多，也讓${q}放心說出小小的不滿。`,
            ],
            (p, q, dp, dq) => [
                `${p}${dp}和${q}${dq}一拍即合，兩人一起出現總帶著甜味。`,
                `${p}也記得回寵${q}，別只當被寵的一方。`,
            ],
        ],
        soft: [
            (p, q, dp, dq) => [
                `${p}${dp}正是${q}${dq}最喜歡的樣子，相處甜而不膩。`,
                `${p}和${q}氣氛太好時，小問題容易被擱著，趁心情好聊開。`,
            ],
            (p, q, dp, dq) => [
                `${q}常主動稱讚${p}，${p}${dp}在${q}${dq}裡被好好疼著。`,
                `${p}也回送一份心意，讓${q}知道被看見。`,
            ],
        ],
        hard: [
            (p, q, dp, dq) => [
                `${q}欣賞${p}，而品味的落差常把${p}${dp}帶去沒試過的地方。`,
                `${q}${dq}希望${p}多些浪漫時，換成邀請，就不像要求改變。`,
            ],
            (p, q, dp, dq) => [
                `${p}${dp}和${q}${dq}的品味各有一套，輪流照對方的方式過更豐富。`,
                `意見不同時，${p}和${q}今年你安排、明年我安排。`,
            ],
        ],
    },
};

/** Composed gift phrases for the same contacts (any family). */
const COMPOSED_GIFT: Record<
    string,
    readonly ((p: string, q: string, dp: string, dq: string) => string)[]
> = {
    [noteKey('sun', 'moon')]: [
        (p, q, dp, dq) => `${p}${dp}有了${q}${dq}當歸處`,
        (p, q, dp, dq) => `${q}${dq}在${p}${dp}身邊找到了方向`,
        (p, q, dp, dq) => `${p}${dp}和${q}${dq}一前一後，走得又遠又穩`,
    ],
    [noteKey('moon', 'mars')]: [
        (p, q, dp, dq) => `${q}${dq}守著${p}${dp}，關係裡有熱度也有保護`,
        (p, q, dp, dq) => `${p}${dp}給了${q}${dq}一個可以放下武裝的地方`,
        (p, q, dp, dq) => `${q}${dq}一出手，${p}${dp}就覺得有人撐腰`,
    ],
    [noteKey('venus', 'mars')]: [
        (p, q, dp, dq) => `${q}${dq}和${p}${dp}一來一往，心動一直沒有退燒`,
        (p, q, dp, dq) => `${p}${dp}總能被${q}${dq}看見、追上`,
        (p, q, dp, dq) => `${q}${dq}點燃了${p}${dp}，兩人之間始終有火花`,
    ],
    [noteKey('moon', 'venus')]: [
        (p, q, dp, dq) => `${q}${dq}懂得怎麼照顧${p}${dp}`,
        (p, q, dp, dq) => `${p}${dp}在${q}${dq}裡被溫柔地照顧著`,
        (p, q, dp, dq) => `${q}${dq}剛好是${p}${dp}最需要的那種疼`,
    ],
    [noteKey('sun', 'venus')]: [
        (p, q, dp, dq) => `${q}${dq}看見了${p}${dp}最可愛的地方`,
        (p, q, dp, dq) => `${p}${dp}在${q}${dq}眼裡閃閃發亮`,
        (p, q, dp, dq) => `${q}${dq}讓${p}${dp}更敢做自己`,
    ],
};

/** Oriented composed note for an aspect, or null when the pair has no composed table. */
function composedNote(
    x: InterAspect,
    a: AstroPartner,
    b: AstroPartner,
    which: 'note',
): [string, string, string] | null;
function composedNote(
    x: InterAspect,
    a: AstroPartner,
    b: AstroPartner,
    which: 'gift',
): string | null;
function composedNote(
    x: InterAspect,
    a: AstroPartner,
    b: AstroPartner,
    which: 'note' | 'gift',
): [string, string, string] | string | null {
    const forward = COMPOSED[noteKey(x.a, x.b)] !== undefined;
    const key = forward ? noteKey(x.a, x.b) : noteKey(x.b, x.a);
    if (!COMPOSED[key]) return null;
    const [p, q, kp, kq] = forward ? [a, b, x.a, x.b] : [b, a, x.b, x.a];
    const dp = descOf(p, kp, which === 'gift');
    const dq = descOf(q, kq, which === 'gift');
    if (which === 'gift') return pickHash(COMPOSED_GIFT[key], a, b, 7)(p.name, q.name, dp, dq);
    const fam = familyOf(x.type);
    const list = COMPOSED[key][fam];
    const i = pairHash(a, b, 3) % list.length;
    return [...list[i](p.name, q.name, dp, dq), `pair:${key}:${fam}`];
}

/**
 * [strength, growth point, source id] for an aspect, with the roles of the two people spelled
 * out. The source id names the template, so two contacts from the same template are never both
 * written.
 */
function aspectNote(x: InterAspect, a: AstroPartner, b: AstroPartner): [string, string, string] {
    const composed = composedNote(x, a, b, 'note');
    if (composed) return composed;
    const fam = familyOf(x.type);
    const direct = PAIR_NOTES[noteKey(x.a, x.b)];
    if (direct) return [...direct[fam](a.name, b.name), `pair:${noteKey(x.a, x.b)}:${fam}`];
    const flipped = PAIR_NOTES[noteKey(x.b, x.a)];
    if (flipped) return [...flipped[fam](b.name, a.name), `pair:${noteKey(x.b, x.a)}:${fam}`];
    const actor = ACTOR_ORDER.find((k) => x.a === k || x.b === k);
    if (actor) {
        const notes = ACTOR_NOTES[actor]!;
        const pair =
            x.a === actor
                ? notes[fam](a.name, b.name, descOf(b, x.b))
                : notes[fam](b.name, a.name, descOf(a, x.a));
        return [...pair, `actor:${actor}:${fam}`];
    }
    return [
        `${a.name}${descOf(a, x.a)}和${b.name}${descOf(b, x.b)}${fam === 'hard' ? '常常互相推一把' : '彼此順得來'}。`,
        `多說一句自己的感受，默契會更穩。`,
        `generic:${fam}`,
    ];
}

function functionOf(k: SynastryPointKey): string {
    return k === 'asc' ? '外在形象' : BODY_FUNCTION[k];
}

/** How the house owner (q) feels it, as an everyday scene. p = whose planet. */
const HOUSE_SCENE: Record<number, Phrase> = {
    1: (p, q) => `讓${q}在${p}身邊更看見自己，${p}的一句肯定對${q}特別有分量`,
    2: (p, q) => `牽動${q}的金錢觀與安全感，一起花錢、存錢、討論東西值不值得時，常能互相啟發`,
    3: (p, q) => `表現在每天的訊息、聊天與短程出門，${p}讓${q}想多說話、多學新東西`,
    4: (p, q) => `觸動${q}對家的感覺，一起煮飯、窩在家、見家人時最明顯，也是兩人建立共同習慣的地方`,
    5: (p, q) => `點亮${q}的玩心與戀愛感，約會、出遊、一起玩樂時最有火花`,
    6: (p, q) => `落進${q}的日常作息，誰洗碗、幾點睡、怎麼分工，兩人會慢慢找到默契`,
    7: (p, q) => `讓${q}把${p}看成「伴侶的樣子」，一對一的承諾與合作是重點`,
    8: (p, q) => `觸及${q}的親密、信任與共同財務，關係容易變深，信任需要用心慢慢養`,
    9: (p, q) => `打開${q}的視野，一起旅行、上課、聊人生觀時最投契`,
    10: (p, q) => `影響${q}的事業與社會形象，${p}常是${q}往前走的推手`,
    11: (p, q) => `讓${q}把${p}當成朋友與隊友，一起經營朋友圈或共同的理想`,
    12: (p, q) => `觸及${q}不輕易示人的一面，連結很深，有些感受要慢慢說才說得清`,
};

function item(term: string, field: string, meaning: string): MeaningItem {
    return { term, field, meaning };
}

function caveatLine(a: AstroPartner, b: AstroPartner): string {
    const unknown = [a, b].filter((p) => p.chart.timeUnknown).map((p) => p.name);
    return unknown.length > 0
        ? `${unknown.join('、')}的出生時間不確定，不列入月亮、上升與宮位相關的比對。`
        : '';
}

function elementOf(sign: number): number {
    return sign % 4;
}

function bodyOf(p: AstroPartner, key: AstroBodyKey) {
    return p.chart.bodies.find((x) => x.key === key);
}

/** "月亮在巨蟹" — or, with an unknown birth time, a hedge when the Moon sits near a sign edge. */
function moonLabel(p: AstroPartner): { text: string; sign: number } | null {
    const m = bodyOf(p, 'moon');
    if (!m) return null;
    if (!p.chart.timeUnknown) return { text: `月亮在${m.signName}`, sign: m.sign };
    // Time unknown → the chart uses noon; the Moon moves ~6–7.5° either way within the day.
    const deg = m.degree + m.minute / 60;
    if (deg < 7.5)
        return {
            text: `月亮可能在${SIGN_NAMES[(m.sign + 11) % 12]}或${m.signName}（出生時間不確定）`,
            sign: m.sign,
        };
    if (deg > 22.5)
        return {
            text: `月亮可能在${m.signName}或${SIGN_NAMES[(m.sign + 1) % 12]}（出生時間不確定）`,
            sign: m.sign,
        };
    return { text: `月亮大致在${m.signName}（出生時間不確定，以當天位置推估）`, sign: m.sign };
}

// ---------------------------------------------------------------------------
// Fit signal — a conservative flag for pairs that are genuinely hard going.
// ---------------------------------------------------------------------------
// Only the core relationship points count (Sun, Moon, Venus, Mars, ASC on both sides). A pair is
// flagged only when all of these hold:
//   - at least 3 tense (square / opposition) core contacts,
//   - at most 1 harmonious (trine / sextile) core contact,
//   - no bonding contact: no harmonious aspect or conjunction between Sun–Moon, Venus–Mars or Moon–Venus,
//   - and either a hard Saturn aspect to a core point, or at least 5 tense core contacts.
// Everyone else gets the default strengths-first tone.

const CORE = new Set<SynastryPointKey>(['sun', 'moon', 'venus', 'mars', 'asc']);
const BOND_PAIRS = new Set([
    pairId('sun', 'moon'),
    pairId('venus', 'mars'),
    pairId('moon', 'venus'),
]);

export interface AstroFit {
    difficult: boolean;
    /** Tense aspects between core points. */
    coreTense: number;
    /** Harmonious aspects between core points. */
    coreSoft: number;
    /** Hard Saturn aspects to a core point. */
    saturnHard: number;
    /** A harmonious aspect or conjunction between Sun–Moon, Venus–Mars or Moon–Venus. */
    bond: boolean;
}

export function astroFit(syn: AstroSynastry): AstroFit {
    const core = syn.aspects.filter((s) => CORE.has(s.a) && CORE.has(s.b));
    const coreTense = core.filter((s) => familyOf(s.type) === 'hard').length;
    const coreSoft = core.filter((s) => familyOf(s.type) === 'soft').length;
    const saturnHard = syn.aspects.filter(
        (s) =>
            familyOf(s.type) === 'hard' &&
            ((s.a === 'saturn' && CORE.has(s.b)) || (s.b === 'saturn' && CORE.has(s.a))),
    ).length;
    const bond = core.some((s) => BOND_PAIRS.has(pairId(s.a, s.b)) && familyOf(s.type) !== 'hard');
    const difficult =
        coreTense >= 3 && coreSoft <= 1 && !bond && (saturnHard >= 1 || coreTense >= 5);
    return { difficult, coreTense, coreSoft, saturnHard, bond };
}

// ---------------------------------------------------------------------------
// 這段關係的禮物 — what is most precious, built from this pair's own data.
// ---------------------------------------------------------------------------

/**
 * What a contact gives the two of them, regardless of family; p/q as in PAIR_NOTES and dp/dq the
 * sign phrases of their planets, so the same contact reads differently for different signs. The
 * five commonest contacts are in COMPOSED_GIFT.
 */
type GiftPhrase = (p: string, q: string, dp: string, dq: string) => string;

const GIFT: Record<string, GiftPhrase> = {
    [noteKey('sun', 'sun')]: (p, q, dp, dq) =>
        `${p}${dp}和${q}${dq}彼此照見，都在對方身上看見想成為的樣子`,
    [noteKey('moon', 'moon')]: (p, q, dp, dq) => `${p}${dp}和${q}${dq}節奏相通，回到家就能放鬆`,
    [noteKey('venus', 'venus')]: (p, q, dp, dq) => `${p}${dp}和${q}${dq}彼此加分，日子越過越有味道`,
    [noteKey('sun', 'mars')]: (p, q, dp, dq) =>
        `${q}${dq}推著${p}${dp}往前，兩人是能把事做成的隊友`,
    [noteKey('asc', 'sun')]: (p, q, _dp, dq) => `${q}${dq}讓${p}整個人亮了起來，兩人走在一起很有光`,
    [noteKey('asc', 'moon')]: (p, q, _dp, dq) =>
        `${q}${dq}在${p}身邊很快就能放鬆，像回到熟悉的地方`,
    [noteKey('asc', 'venus')]: (p, q, _dp, dq) => `${q}${dq}一見到${p}就被吸引，好感來得自然`,
    [noteKey('mercury', 'mercury')]: (p, q, dp, dq) => `${p}${dp}碰上${q}${dq}，常激出新的點子`,
    [noteKey('mercury', 'moon')]: (p, q, dp, dq) =>
        `${p}${dp}說得進${q}${dq}裡，${q}心煩時知道可以找誰`,
    [noteKey('mercury', 'venus')]: (p, q, dp, dq) => `${p}${dp}讓${q}${dq}被聽見，聊天就有戀愛感`,
    [noteKey('mercury', 'mars')]: (p, q, dp, dq) =>
        `${p}${dp}出主意、${q}${dq}去實現，點子很少只停在嘴上`,
    [noteKey('mercury', 'sun')]: (p, q, dp, dq) => `${p}${dp}最懂${q}${dq}，是${q}難得的知音`,
    [noteKey('mars', 'mars')]: (p, q, dp, dq) => `${p}${dp}和${q}${dq}並肩，是能一起扛事的搭檔`,
    [noteKey('saturn', 'sun')]: (p, q, dp, dq) => `${p}${dp}給了${q}${dq}一個可以靠的地方`,
    [noteKey('saturn', 'moon')]: (p, q, dp, dq) => `${p}${dp}讓${q}${dq}知道「有人會一直在」`,
    [noteKey('saturn', 'mercury')]: (p, q, dp, dq) => `${p}${dp}讓${q}${dq}落地成真`,
    [noteKey('saturn', 'venus')]: (p, q, dp, dq) => `${p}${dp}守著${q}${dq}，兩人之間有難得的忠誠`,
    [noteKey('saturn', 'mars')]: (p, q, dp, dq) => `${q}${dq}加上${p}${dp}，能把事情做得又快又穩`,
    [noteKey('saturn', 'asc')]: (p, q, dp) => `${p}${dp}讓${q}覺得可靠，是遇到事會想找的人`,
};

function giftOf(s: InterAspect, a: AstroPartner, b: AstroPartner): string | null {
    const composed = composedNote(s, a, b, 'gift');
    if (composed) return composed;
    // Orient to the table key: p holds the first planet of the key, q the second.
    const forward = GIFT[noteKey(s.a, s.b)] !== undefined;
    const key = forward ? noteKey(s.a, s.b) : noteKey(s.b, s.a);
    const phrase = GIFT[key] as GiftPhrase | undefined;
    if (!phrase) return null;
    const [p, q, kp, kq] = forward ? [a, b, s.a, s.b] : [b, a, s.b, s.a];
    return phrase(p.name, q.name, descOf(p, kp, true), descOf(q, kq, true));
}

const ELEMENT_NAMES = ['火', '土', '風', '水'];

/** What the two Sun elements give each other. */
function elementGift(a: AstroPartner, b: AstroPartner): string | null {
    const sa = bodyOf(a, 'sun');
    const sb = bodyOf(b, 'sun');
    if (!sa || !sb) return null;
    const ea = elementOf(sa.sign);
    const eb = elementOf(sb.sign);
    const basis =
        ea === eb
            ? `（兩人的太陽同屬${ELEMENT_NAMES[ea]}象）`
            : `（${a.name}的太陽屬${ELEMENT_NAMES[ea]}象、${b.name}的屬${ELEMENT_NAMES[eb]}象）`;
    if (ea === eb) return `兩人骨子裡看重的東西很像，很多事不用解釋，對方就懂${basis}`;
    const pair = [ea, eb].sort().join('|');
    if (pair === '0|2' || pair === '1|3')
        return `兩人的本性天生互相助長，${pair === '0|2' ? '一個給點子、一個給熱度，在一起總是越聊越有勁' : '一個給踏實、一個給溫度，能一起把日子過得安穩又暖'}${basis}`;
    return `兩人各自帶來對方身上沒有的東西，在一起時，生活的樣貌比一個人時完整${basis}`;
}

/** What a clearly difficult pair needs, from its tense core / Saturn contacts; lower = said first. */
function needOf(s: InterAspect): [number, string] {
    const has = (k: SynastryPointKey) => s.a === k || s.b === k;
    if (pairId(s.a, s.b) === pairId('sun', 'moon')) return [0, '追目標時也照顧對方的心情'];
    if (has('venus')) return [1, '把想要的愛說清楚而不靠猜'];
    if (has('moon')) return [2, '情緒上來時先停一下再談'];
    if (has('saturn')) return [3, '把期待說成肯定而不是糾正'];
    if (has('mars') || pairId(s.a, s.b) === pairId('sun', 'sun')) return [4, '把較勁變成合作'];
    if (has('asc')) return [5, '多給彼此認識的時間'];
    return [6, '多一點耐心與明確的溝通'];
}

/** The temperament mix of the two planets behind a gift, by their elements; key "i|j", i <= j. */
const GIFT_FLAVOR: Record<string, Phrase> = {
    '0|0': () => '兩股熱度疊在一起，做什麼都起勁',
    '1|1': () => '兩份踏實放在一起，日子穩得像一座山',
    '2|2': () => '兩個腦袋一起轉，永遠有新鮮話題',
    '3|3': () => '兩顆敏感的心互相映照，懂得特別深',
    '0|1': (f, e) => `${f}敢衝、${e}穩得住，剛好互補`,
    '0|2': (f, a) => `${f}點火、${a}搧風，想法很快就能動起來`,
    '0|3': (f, w) => `${f}給熱度、${w}給溫柔，冷暖剛剛好`,
    '1|2': (e, a) => `${a}出主意、${e}顧現實，計畫很能落地`,
    '1|3': (e, w) => `${e}給依靠、${w}給體貼，安穩裡有溫度`,
    '2|3': (a, w) => `${a}講道理、${w}懂人心，兩人看事情格外周全`,
};

interface Gift {
    text: string;
    aspect: InterAspect;
}

function giftItem(
    a: AstroPartner,
    b: AstroPartner,
    syn: AstroSynastry,
    fit: AstroFit,
): MeaningItem {
    const sentences: string[] = [];
    // Bonding pairs first, then other core contacts, then the rest; soft before conjunction; tighter first.
    const rank = (s: InterAspect) =>
        BOND_PAIRS.has(pairId(s.a, s.b)) ? 0 : CORE.has(s.a) && CORE.has(s.b) ? 1 : 2;
    const warm = syn.aspects
        .filter((s) => familyOf(s.type) !== 'hard')
        .sort(
            (x, y) =>
                rank(x) - rank(y) ||
                Number(familyOf(x.type) === 'conj') - Number(familyOf(y.type) === 'conj') ||
                x.orb - y.orb,
        );
    const seen = new Set<string>();
    const gifts: Gift[] = [];
    for (const s of warm) {
        const text = giftOf(s, a, b);
        if (text && !seen.has(text)) {
            seen.add(text);
            gifts.push({ text, aspect: s });
        }
    }
    // The temperament mix of the two planets behind a gift; no fixed opening frame.
    const flavor = (g: Gift) => {
        const ea = elementOf(signOf(a, g.aspect.a));
        const eb = elementOf(signOf(b, g.aspect.b));
        return ea <= eb
            ? GIFT_FLAVOR[`${ea}|${eb}`](a.name, b.name)
            : GIFT_FLAVOR[`${eb}|${ea}`](b.name, a.name);
    };

    const giftBasis = (g: Gift) =>
        `（${a.name}的${POINT_NAMES[g.aspect.a]}與${b.name}的${POINT_NAMES[g.aspect.b]}${ANGLE_PLAIN[g.aspect.type]}）`;
    const flavorBasis = (g: Gift) =>
        `（${a.name}的${POINT_NAMES[g.aspect.a]}屬${ELEMENT_NAMES[elementOf(signOf(a, g.aspect.a))]}象、${b.name}的${POINT_NAMES[g.aspect.b]}屬${ELEMENT_NAMES[elementOf(signOf(b, g.aspect.b))]}象）`;

    if (fit.difficult) {
        const tense = syn.aspects.filter(
            (s) =>
                familyOf(s.type) === 'hard' &&
                ((CORE.has(s.a) && CORE.has(s.b)) || s.a === 'saturn' || s.b === 'saturn'),
        );
        const needs = [
            ...new Set(
                tense
                    .map(needOf)
                    .sort((x, y) => x[0] - y[0])
                    .map((n) => n[1]),
            ),
        ].slice(0, 3);
        sentences.push(
            `坦白說，要讓這段關係走得好，${a.name}和${b.name}需要${needs.map((n) => `「${n}」`).join('、')}，而且要持續練習；這比多數伴侶多花心力，但做得到。`,
        );
        const first = gifts[0]
            ? `${gifts[0].text}${giftBasis(gifts[0])}`
            : warm[0]
              ? `兩人在${bothFunctions(warm[0])}上有天生的默契（${a.name}的${POINT_NAMES[warm[0].a]}與${b.name}的${POINT_NAMES[warm[0].b]}${ANGLE_PLAIN[warm[0].type]}）`
              : null;
        if (first) sentences.push(`這是兩人之間真實的好：${first}。`);
        const el = elementGift(a, b);
        if (el) sentences.push(`${el}。`);
        return item(
            '這段關係的課題與禮物',
            '誠實說出這段關係需要的功課，也記下兩人之間真實的好。',
            sentences.join('\n'),
        );
    }

    if (gifts[0]) sentences.push(`${gifts[0].text}${giftBasis(gifts[0])}。`);
    else {
        // Nothing easy among the named pairs: the tightest contact is still a gift, earned together.
        const tight = syn.aspects.map((s) => giftOf(s, a, b)).find((g): g is string => g !== null);
        if (tight) sentences.push(`這份連結要一起磨才拿得到，卻很真實：${tight}。`);
    }
    // Second line: another gift, or else the temperament mix behind the first one.
    if (gifts[1]) sentences.push(`${gifts[1].text}${giftBasis(gifts[1])}。`);
    else if (gifts[0]) sentences.push(`${flavor(gifts[0])}${flavorBasis(gifts[0])}。`);
    else {
        const el = elementGift(a, b);
        if (el) sentences.push(`${el}。`);
    }
    if (sentences.length === 0)
        sentences.push(
            `${a.name}和${b.name}之間的影響溫和，關係的樣子會由兩人親手寫成，這本身就是一份自由。`,
        );
    return item(
        '這段關係的禮物',
        '從兩人最順的互動、行星所在的星座與元素，整理這段關係最珍貴的地方。',
        sentences.join('\n'),
    );
}

function bothFunctions(s: InterAspect): string {
    return s.a === s.b ? `雙方的${functionOf(s.a)}` : `${functionOf(s.a)}與${functionOf(s.b)}`;
}

/** Axis contacts: p = planet holder, q = the person whose angle it touches → [strength, growth]. */
const AXIS_NOTES: Record<
    Exclude<AxisKey, 'asc'>,
    (p: string, q: string, role: string) => [string, string]
> = {
    dsc: (p, q, role) => [
        `${q}很容易把${p}${role}看成理想伴侶的樣子，兩人一對一相處特別有感。`,
        `理想的投射之外，也看見${p}本來的樣子。`,
    ],
    mc: (p, q, role) => [
        `${p}${role}推著${q}的事業與人生方向，像是${q}往前走的推手。`,
        `${p}的期待別變成壓力，讓${q}自己決定節奏。`,
    ],
    ic: (p, q, role) => [
        `${p}${role}碰到${q}心裡對家的感覺，在一起有種回到根的踏實。`,
        `熟悉感強，也容易牽動早年家庭的情緒，慢慢說開就好。`,
    ],
};

/** What each angle stands for in its owner's life (for the slower points on an angle). */
const AXIS_AREA: Record<AxisKey, string> = {
    asc: '形象',
    dsc: '伴侶觀',
    mc: '人生方向',
    ic: '內心的根',
};

/** Saturn / Node / Pluto / Chiron on an angle: p = planet holder, q = angle owner. */
const SLOW_AXIS_NOTES: Partial<
    Record<AstroBodyKey, (p: string, q: string, area: string) => [string, string]>
> = {
    saturn: (p, q, area) => [
        `${p}在${q}的${area}裡是一股穩定的力量，讓${q}覺得這個人可以託付。`,
        `${p}的認真有時像壓力，${q}可以直接說出需要的鬆緊。`,
    ],
    northNode: (p, q, area) => [
        `${q}在${area}上的樣子，正好指向${p}想成長的方向，像一面引路的鏡子。`,
        `${p}可以多留意${q}身上吸引自己的地方，那常是自己的下一步。`,
    ],
    pluto: (p, q, area) => [
        `${p}對${q}的${area}有很深的影響，兩人在一起都會被改變。`,
        `影響越深，越要尊重${q}自己做決定的空間。`,
    ],
    chiron: (p, q, area) => [
        `${p}會碰到${q}在${area}上的敏感處，也帶來被療癒的機會。`,
        `碰到敏感處時，先停下來問問對方的感受。`,
    ],
};

/** Growth point per house overlay; p = planet holder, q = house owner. */
const HOUSE_GROW: Record<number, Phrase> = {
    1: (p, q) => `${p}的影響很直接，給${q}建議時用分享代替要求。`,
    2: () => `一起花錢前先講好各自的底線。`,
    3: () => `訊息太密時，也允許彼此偶爾晚回。`,
    4: () => `回到家的放鬆裡，也留意彼此的情緒有沒有被看見。`,
    5: () => `玩樂之外，也一起經營平淡的日常。`,
    6: () => `分工時講清楚標準，免得一方默默做太多。`,
    7: (p, q) => `${q}對${p}的期待，可以直接拿出來討論。`,
    8: () => `信任需要時間，別急著要對方全部攤開。`,
    9: () => `觀念不同時，把它當成旅途中的新風景。`,
    10: (p, q) => `${p}的建議別變成評分，讓${q}自己做主。`,
    11: () => `朋友圈之外，也保留只屬於兩人的時間。`,
    12: () => `沒說出口的感受，要慢慢練習說清楚。`,
};

const HOUSE_SHORT: Record<number, string> = {
    1: '自我',
    2: '金錢',
    3: '溝通',
    4: '家庭',
    5: '戀愛',
    6: '日常',
    7: '伴侶',
    8: '親密',
    9: '視野',
    10: '事業',
    11: '朋友',
    12: '潛意識',
};

interface ContactText {
    plus: string;
    grow: string;
    /** Plain-language chart basis, shown in parentheses. */
    basis: string;
    /** Which template the sentences came from (see aspectNote). */
    source: string;
}

function holders(from: PartnerKey, a: AstroPartner, b: AstroPartner): [AstroPartner, AstroPartner] {
    return from === 'a' ? [a, b] : [b, a];
}

function contactText(c: WeightedContact, a: AstroPartner, b: AstroPartner): ContactText {
    if (c.kind === 'aspect') {
        const x = c.aspect;
        const [plus, grow, source] = aspectNote(x, a, b);
        return {
            plus,
            grow,
            source,
            basis: `${a.name}的${POINT_NAMES[x.a]}與${b.name}的${POINT_NAMES[x.b]}${ANGLE_PLAIN[x.type]}`,
        };
    }
    const [src, dst] = holders(c.from, a, b);
    if (c.kind === 'axis') {
        const basis = `${src.name}的${BODY_NAMES[c.body]}貼近${dst.name}的${AXIS_NAMES[c.axis]}`;
        const slow = SLOW_AXIS_NOTES[c.body];
        if (slow) {
            const [plus, grow] = slow(src.name, dst.name, AXIS_AREA[c.axis]);
            return { plus, grow, basis, source: `slowAxis:${c.body}` };
        }
        if (c.axis === 'asc') {
            // PAIR_NOTES asc entries: p = ASC holder, q = the planet holder.
            const note = PAIR_NOTES[noteKey('asc', c.body)];
            const [plus, grow] = note
                ? note.conj(dst.name, src.name)
                : ([
                      `${src.name}${descOf(src, c.body)}直接打在${dst.name}給人的第一印象上，${dst.name}在${src.name}身邊更像自己。`,
                      `影響很直接，${src.name}給意見時留一點空間。`,
                  ] as [string, string]);
            return { plus, grow, basis, source: note ? `pair:asc>${c.body}:conj` : 'axis:asc' };
        }
        const [plus, grow] = AXIS_NOTES[c.axis](src.name, dst.name, descOf(src, c.body));
        return { plus, grow, basis, source: `axis:${c.axis}` };
    }
    // The planet's sign colours the overlay: 「甲說做就做的衝勁」點亮乙的玩心….
    const plus = `${src.name}${descOf(src, c.body)}${HOUSE_SCENE[c.house](src.name, dst.name)}`;
    return {
        plus: `${plus}。`,
        grow: HOUSE_GROW[c.house](src.name, dst.name),
        source: `house:${c.house}`,
        basis: `${src.name}的${BODY_NAMES[c.body]}落入${dst.name}的${HOUSE_SHORT[c.house]}宮`,
    };
}

// ---------------------------------------------------------------------------
// Length-limited composition (準則 §4B: hook ≤ 20, paragraphs ≤ 80, scene ≤ 60, advice ≤ 50 字)
// ---------------------------------------------------------------------------

export const LIMITS = { hook: 20, paragraph: 80, scene: 60, advice: 50 } as const;

/** Trim to `max` characters at the last clause break, ending with 。 (never mid-word). */
export function clampZh(text: string, max: number): string {
    const t = text.trim();
    if (t.length <= max) return t;
    const head = t.slice(0, max);
    for (const marks of ['。！？', '；', '，：、']) {
        let cut = -1;
        for (const m of marks) cut = Math.max(cut, head.lastIndexOf(m));
        if (cut >= max / 3) return `${head.slice(0, cut)}。`;
    }
    return `${t.slice(0, max - 1)}。`;
}

function stripEnd(s: string): string {
    return s.replace(/[。！？；，]+$/, '');
}

/** A sentence followed by its chart basis in parentheses, within the paragraph limit. */
function withBasis(
    prefix: string,
    sentence: string,
    basis: string,
    max: number = LIMITS.paragraph,
): string {
    const tail = `（${basis}）。`;
    const room = max - prefix.length - tail.length;
    if (room < 12) return clampZh(`${prefix}${sentence}`, max);
    return `${prefix}${stripEnd(clampZh(sentence, room + 1))}${tail}`;
}

// ---------------------------------------------------------------------------
// Section copy, per theme. Each section owns its own words so the five never echo each other.
// ---------------------------------------------------------------------------

/**
 * Section copy. Every field has variants; `pickBy` chooses one from the pair's own data (the signs
 * of the planets behind the section's lead contact and how tight it is), so two pairs that share a
 * theme still read differently.
 */
interface ThemeCopy {
    hook: readonly string[];
    scene: readonly string[];
    advice: readonly string[];
}

const HIGHLIGHT: Record<ThemeId, ThemeCopy> = {
    spark: {
        hook: [
            '一靠近，空氣就熱起來',
            '有你在，日子就有火花',
            '你一笑，我就想跟著出發',
            '火花不是偶然，是日常',
        ],
        scene: [
            '臨時起意的約會、一起出門的路上，你們很自然就玩開了，旁人也看得出這份火花。',
            '一起看演唱會、衝去夜市排隊時，兩人的興奮會互相傳染，越玩越起勁。',
            '週末臨時決定去海邊，兩人收拾背包只花十分鐘。',
        ],
        advice: [
            '每個月安排一次沒做過的約會，讓熱度有新的柴火。',
            '把一起挑戰的小目標寫下來，例如一起跑完一場路跑。',
            '偶爾讓對方安排一次驚喜行程，自己只負責出席。',
        ],
    },
    care: {
        hook: ['在你身邊，心就安靜下來', '有你在的地方，就是家'],
        scene: [
            '累了一天回到家，一起吃頓飯、窩在沙發上，不必多說話就覺得被接住。',
            '颱風天窩在家煮一鍋湯、追一部劇，是你們最滿足的時刻。',
        ],
        advice: [
            '把對方為你做的小事說出來，一句謝謝就能讓暖意加倍。',
            '固定一個只屬於兩人的家常儀式，例如週末一起煮早餐。',
        ],
    },
    admire: {
        hook: ['在你眼裡，我剛好很好', '你看我的眼神，讓我更喜歡自己'],
        scene: [
            '朋友聚會時，你們常默默替對方說好話，一起出現就帶著甜味。',
            '一人換了新髮型，另一人總是第一個發現、第一個稱讚。',
        ],
        advice: [
            '具體稱讚對方今天做得好的一件事，讓欣賞被聽見。',
            '每週挑一件對方做得漂亮的事，當面說出來。',
        ],
    },
    mirror: {
        hook: ['你往前走，我替你點燈', '你的目標，也是我的事', '站在一起，就更像自己'],
        scene: [
            '一人談起新計畫，另一人會本能地想怎麼幫忙，兩人一起把日子往前推。',
            '一人準備面試或比賽時，另一人會默默把後勤打理好。',
            '一人上台表現時，台下最用力鼓掌的一定是另一人。',
        ],
        advice: [
            '每季一起回顧彼此的目標，替對方記下一件已經做到的事。',
            '重要的決定前，先問對方「這件事你最在意的是什麼」。',
            '每年替對方寫一張「今年你最棒的三件事」。',
        ],
    },
    mind: {
        hook: ['話匣子一開，就關不起來', '跟你說話，從來不無聊', '兩個腦袋，比一個好用'],
        scene: [
            '從晚餐聊到深夜、從新聞聊到夢想，你們的對話很少冷場。',
            '一起看完電影，回家路上的討論常比電影本身還精彩。',
            '一起玩桌遊或解謎時，兩人的配合常讓朋友嘖嘖稱奇。',
        ],
        advice: [
            '把聊出來的好點子挑一個真的去做，讓默契有成果。',
            '一起開一本共同筆記，記下兩人想做的事。',
            '每月一起讀一本書或看一部紀錄片，再互相交換心得。',
        ],
    },
    bond: {
        hook: ['說好的事，就會做到', '靠得住，是你們的浪漫'],
        scene: [
            '遇到搬家、換工作這種大事，兩人會一起排步驟，一件件扛過去。',
            '說好的紀念日、答應的接送，兩人都記得牢牢的。',
        ],
        advice: [
            '替兩人訂一個一年後想完成的共同目標。',
            '每年一起檢查一次存款與計畫，讓可靠看得見。',
        ],
    },
    depth: {
        hook: [
            '一眼就看見彼此的深處',
            '你懂我沒說出口的那一半',
            '在你面前，不必假裝',
            '你懂我，比我自己還早',
        ],
        scene: [
            '深夜談心時，你們聊得比跟任何人都深，常有被看透卻不害怕的感覺。',
            '一人不舒服時，另一人往往不用問就察覺到了。',
            '一起經歷過低潮後，兩人之間多了一種旁人看不懂的默契。',
        ],
        advice: [
            '固定留一段不被打擾的時間，只談心裡話。',
            '偶爾一起寫信給一年後的彼此，留住此刻的心意。',
            '把彼此最難忘的一段對話記下來，偶爾拿出來回味。',
        ],
    },
    freedom: {
        hook: ['和你在一起，世界變大了', '跟你在一起，每天都不一樣'],
        scene: [
            '說走就走的小旅行、沒試過的新店，你們一起嘗鮮時最有活力。',
            '一人突發奇想要去學衝浪，另一人的第一反應是「好啊，一起」。',
        ],
        advice: [
            '把「一起嘗試新事物」排進每月行程，別讓日子變成慣性。',
            '每季挑一個兩人都沒去過的地方走走。',
        ],
    },
    expand: {
        hook: ['有你打氣，膽子變大了', '你讓我相信自己做得到', '跟你在一起，好運都變多了'],
        scene: [
            '其中一人想報名課程或轉換跑道時，另一人常是第一個說「去吧」的人。',
            '一起計畫出國或進修時，兩人越聊越有信心。',
            '一人說出新點子，另一人馬上幫忙想怎麼做大。',
        ],
        advice: [
            '每年一起訂一個想挑戰的新目標，互相當啦啦隊。',
            '把對方的好消息分享給朋友，讓鼓勵被更多人看見。',
            '把兩人一起完成的好事寫成清單，貼在冰箱上。',
        ],
    },
};

/** 磨合: `turn` says how the 主軸's bright side flips while adjusting. */
const FRICTION: Record<ThemeId, ThemeCopy & { turn: readonly string[] }> = {
    spark: {
        hook: ['熱度太高，也會燙到彼此', '火花和火氣，常是同一把火', '越在乎，聲音越大'],
        turn: [
            '一方想立刻解決、一方還在氣頭上，小事也可能越吵越大',
            '兩人都有脾氣時，誰也不想先低頭',
            '熱情一轉身，就成了互不相讓',
        ],
        scene: [
            '討論到一半語氣變衝，一人想吵完、一人想走開，牆就在這時築起來。',
            '開車迷路、排隊太久這種小事，都可能點燃一場拌嘴。',
            '一人在意的小細節被另一人忽略，語氣就突然變硬。',
        ],
        advice: [
            '約好一句暫停暗號，喊出來就各自冷靜十分鐘。',
            '吵架時先坐下來，站著講話火氣更容易上來。',
            '火氣上來時先喝口水，數到十再開口。',
        ],
    },
    care: {
        hook: ['太在乎，反而怕說出口', '越在意，越容易受傷'],
        turn: [
            '在意的程度不同步時，一方覺得被冷落、一方覺得被盯緊',
            '一方的照顧，另一方可能感覺像管束',
        ],
        scene: [
            '一人晚回訊息，另一人開始胡思亂想，見面時氣氛就悶了下來。',
            '一人忙著加班，另一人做好的晚餐涼在桌上，委屈就說不出口。',
        ],
        advice: [
            '講好「忙的時候怎麼報平安」，讓在乎有固定的出口。',
            '把「你都不關心我」換成「我今天需要你陪」。',
        ],
    },
    admire: {
        hook: ['太想維持美好，反而不說', '笑著說沒事，心裡卻有事'],
        turn: [
            '小小的不滿被一句「沒關係」蓋過，累積久了才突然爆開',
            '怕對方失望，就把真實的想法藏起來',
        ],
        scene: [
            '表面上一切都好，心裡卻記著上次沒說完的話，距離就這樣拉開。',
            '一起挑禮物時明明不喜歡，卻笑著說「很好啊」。',
        ],
        advice: [
            '每週留十分鐘，各說一件希望對方調整的小事。',
            '約定一句「我有點不舒服」，說出口不必附理由。',
        ],
    },
    mirror: {
        hook: ['同路的人，也會搶方向盤', '都想對方好，卻各有想法', '太像的人，也會互相較勁'],
        turn: [
            '大方向一致，細節卻常卡在誰要配合誰',
            '一人往前衝時，另一人的步調常被忽略',
            '兩人都想當主角時，誰也不肯退一步',
        ],
        scene: [
            '決定週末行程或大筆花費時，一人想照計畫、一人想照感覺，空氣瞬間僵住。',
            '一人興奮宣布新決定，另一人卻覺得自己沒被問過。',
            '一起出門時，一人想照自己的步調，另一人卻覺得被拖著走。',
        ],
        advice: [
            '大事輪流做主，這次你決定、下次換我。',
            '做決定前留一天給對方想，別當場要答案。',
            '每次出遊各自挑一個行程，互相陪對方完成。',
        ],
    },
    mind: {
        hook: ['同一句話，聽成兩種意思', '說的和聽到的，常差一點', '話太多，也會說錯話'],
        turn: [
            '說者無心、聽者有意，訊息裡一個語氣就能誤會半天',
            '一人講重點、一人講感受，常常雞同鴨講',
            '反應太快時，話常比想法先出口',
        ],
        scene: [
            '文字訊息越回越短、越回越冷，其實只是兩人用的說法不一樣。',
            '一句「你決定就好」，一人聽成體貼，另一人聽成敷衍。',
            '一人隨口開的玩笑，另一人卻記了一整天。',
        ],
        advice: [
            '重要的事改用電話或見面談，別只靠文字。',
            '吵完後各自說一句「我剛剛真正想說的是……」。',
            '開玩笑前想一下，對方今天的心情適不適合。',
        ],
    },
    bond: {
        hook: ['承諾越重，越怕做不好', '在乎做到，也怕做不到'],
        turn: ['一方的標準像考卷，另一方開始擔心怎麼做都不及格', '責任感太強時，相處就少了輕鬆'],
        scene: [
            '一句「你應該」說出口，另一人就默默縮起來，不想再分享。',
            '計畫被打亂時，一人急著補救，另一人只想先喘口氣。',
        ],
        advice: [
            '把期待講成具體的小事，做到時當面說聲謝謝。',
            '每週留一個不排行程的晚上，什麼都不必做好。',
        ],
    },
    depth: {
        hook: [
            '太想抓緊，反而握痛',
            '愛得深，也容易抓得緊',
            '靠得太近，反而喘不過氣',
            '在乎，不等於要抓住',
        ],
        turn: [
            '在意到想掌握對方的一切，信任就容易變成試探',
            '情緒一深，就分不清是關心還是不安',
            '越懂彼此，越容易拿對方的弱點當武器',
        ],
        scene: [
            '查看行程、追問細節的時刻，另一人會本能地把心門關上。',
            '一人沉默不語，另一人就開始猜是不是自己做錯了什麼。',
            '爭執時一句戳到痛處的話，會讓兩人冷戰好幾天。',
        ],
        advice: [
            '說出自己害怕的是什麼，而不是去檢查對方。',
            '不安時先說「我有點慌」，而不是去質問。',
            '約定吵架時不提對方的舊傷和家人。',
        ],
    },
    freedom: {
        hook: ['自由很迷人，也讓人不安', '想要空間，也想要確定'],
        turn: [
            '一方需要空間、一方需要確定，計畫臨時改變時最容易起摩擦',
            '新鮮感來得快，安定感卻跟不上',
        ],
        scene: [
            '約好的事臨時取消、訊息突然變少，另一人的不安就冒出來。',
            '一人說想一個人出國走走，另一人心裡開始打鼓。',
        ],
        advice: [
            '再忙也留一個固定的聯絡時間，讓自由有個錨點。',
            '改變計畫前先說一聲，再自由也不突然。',
        ],
    },
    expand: {
        hook: ['想得很大，腳步要跟上', '夢想很大，也要算預算', '樂觀太多，也會失焦'],
        turn: [
            '一起畫大餅很開心，落實時才發現彼此的節奏不同',
            '一人說好時，另一人其實還沒準備好',
            '一人只看機會，另一人卻在擔心代價',
        ],
        scene: [
            '計畫講得熱烈，真正要付錢、排時間時，一人開始猶豫。',
            '答應了太多聚會和行程，週末反而累得沒時間相處。',
            '一人興奮地刷卡買了新東西，另一人看著帳單皺眉。',
        ],
        advice: [
            '每個大計畫先拆出第一步，做完再談下一步。',
            '答應新計畫前，先看看兩人的行事曆和存款。',
            '大額花費前約好「等三天再決定」。',
        ],
    },
};

const INTIMACY: Record<ThemeId, ThemeCopy> = {
    care: {
        hook: ['最軟的地方，交給對方', '脆弱的時候，有人接住', '被你照顧，是件幸福的事'],
        scene: [
            '生病或低潮時，一人自然靠過去照顧，另一人也願意放下逞強。',
            '深夜一通「我睡不著」的訊息，另一人就打了電話過來。',
            '一人加班晚歸，桌上總有另一人留下的一盞燈和熱湯。',
        ],
        advice: [
            '說出「我今天需要的是……」，讓照顧對準心意。',
            '低潮時直接說要擁抱、要安靜，還是要陪著說話。',
            '輪流當照顧的那一方，別讓一人總是付出。',
        ],
    },
    spark: {
        hook: ['親密裡帶著電流', '靠近的時候，心跳會加速', '一個眼神，就讓人心動'],
        scene: [
            '牽手、擁抱這些肢體接觸最能讓你們和好，也最容易重新點燃彼此。',
            '一個突然的擁抱，常比十句道歉更快讓兩人和好。',
            '分開幾天再見面時，兩人的思念會一下子湧上來。',
        ],
        advice: [
            '把身體的親近和心裡的話一起照顧，別只靠其中一種。',
            '每天至少一次好好的擁抱，再忙也不省略。',
            '偶爾安排只有兩人的小旅行，找回心動的感覺。',
        ],
    },
    admire: {
        hook: ['被溫柔看見，就敢靠近', '被珍惜的感覺，讓人敞開', '你的喜歡，讓我變得勇敢'],
        scene: [
            '收到對方記得你喜好的小禮物時，心會一下子軟下來。',
            '對方記得你隨口提過的小事時，你會突然很想靠近。',
            '一人緊張時，另一人一句「你很好」就讓心定下來。',
        ],
        advice: [
            '記下對方最近提過想要的東西，找個平常日送上。',
            '說出對方哪一個小動作最讓你心動。',
            '睡前說一件今天欣賞對方的小事。',
        ],
    },
    mirror: {
        hook: ['你的心事，我接得住', '說到一半，你就懂了'],
        scene: [
            '一人說起煩惱，另一人聽著聽著就懂了真正卡住的地方。',
            '一人在外受了委屈，回家看到對方的臉就鬆了一口氣。',
        ],
        advice: [
            '先問一句「要建議還是要陪伴」，再決定怎麼回應。',
            '聽對方說心事時，先別急著給答案。',
        ],
    },
    bond: {
        hook: ['信任慢慢來，來了就很牢', '慢慢靠近，才靠得長久'],
        scene: [
            '剛開始交心時會有點保留，等到一起扛過某個難關，距離忽然就近了。',
            '一起度過一段辛苦的日子後，兩人說話的方式都變柔軟了。',
        ],
        advice: ['別急著要對方掏心，給信任一點時間發芽。', '每完成一件一起努力的事，就慶祝一下。'],
    },
    mind: {
        hook: ['說得出口，就靠得更近', '話說開了，心也近了', '聊著聊著，心就靠近了'],
        scene: [
            '睡前的長談是你們最貼近的時刻，話說開了，心也跟著打開。',
            '一起散步時聊起小時候的事，常常聊到捨不得回家。',
            '一人分享了一段童年回憶，另一人聽完更懂了對方的反應。',
        ],
        advice: [
            '睡前放下手機十分鐘，聊聊今天最有感覺的一件事。',
            '輪流問對方一個沒問過的問題，認識會越來越深。',
            '每週問對方一次「最近有什麼讓你在意的事？」',
        ],
    },
    depth: {
        hook: ['靈魂層次的懂', '心底有條暗道相通', '你看得見我的心'],
        scene: [
            '有些感受不用說完，對方就接上了，像心底有條暗道相通。',
            '一首歌、一部電影，常讓兩人同時紅了眼眶。',
            '一人只是嘆了口氣，另一人就放下手邊的事坐過來。',
            '夜深人靜時，兩人常聊到彼此心裡最柔軟的地方。',
        ],
        advice: [
            '再懂彼此，也把重要的感受說出口，別只靠猜。',
            '感覺到對方不對勁時，直接問一句「你還好嗎」。',
            '偶爾一起回想剛認識的時候，說說當時心裡的感覺。',
        ],
    },
    expand: {
        hook: ['愛讓人變得更大方', '和你在一起，心變寬了'],
        scene: [
            '一人心情低落時，另一人總能找到讓人重新看見希望的角度。',
            '一人犯了錯，另一人總能笑著說「沒關係，下次會更好」。',
        ],
        advice: [
            '低潮時先陪著，等心情回穩再一起想下一步。',
            '把對方的鼓勵記在心上，也找機會回送一句。',
        ],
    },
    freedom: {
        hook: ['靠近，也保有自己', '黏在一起，也各自精彩'],
        scene: [
            '你們能各忙各的又不覺得疏遠，見面時反而更珍惜。',
            '一人去旅行時，另一人在家也過得自在，回來時有說不完的話。',
        ],
        advice: [
            '說一句「我需要空間，不是不愛你」，避免誤會。',
            '約好各自獨處的時間，也約好重聚的時間。',
        ],
    },
};

/** Saturn on a personal planet: p = the Saturn holder, q = the other → [scene, advice] variants. */
const SATURN_ON: Partial<Record<SynastryPointKey, readonly (readonly [Phrase, Phrase])[]>> = {
    sun: [
        [
            (p, q) => `${q}談起夢想時，${p}會先問「那第一步是什麼」，讓夢想有了骨架。`,
            (p) => `${p}多肯定對方已經做到的，再談還差什麼。`,
        ],
        [
            (p, q) => `${q}換工作、做大決定時，${p}是最先幫忙算風險的人。`,
            (p, q) => `${q}說清楚要的是支持還是建議，${p}就不必猜。`,
        ],
    ],
    moon: [
        [
            (p, q) => `${q}情緒低落時，${p}給的常是實際的安排，而不是一個擁抱。`,
            (p, q) => `${q}直接說「我現在需要被抱一下」，${p}就知道怎麼做。`,
        ],
        [
            (p, q) => `${q}想撒嬌時，${p}可能還在想明天的待辦事項。`,
            (p) => `${p}每天留五分鐘只陪伴、不解決問題。`,
        ],
    ],
    venus: [
        [
            (p, q) => `紀念日怎麼過，${p}考慮的是長久，${q}在意的是當下的心意。`,
            (p) => `把浪漫排進行事曆，${p}照表操課也是一種愛。`,
        ],
        [
            (p, q) => `${q}想要甜言蜜語時，${p}的愛常藏在默默付帳和接送裡。`,
            (p, q) => `${q}說出想聽的那句話，${p}練習說出口。`,
        ],
    ],
    mars: [
        [
            (p, q) => `${q}想馬上行動時，${p}會先踩煞車評估風險。`,
            (p, q) => `先講好哪些事${q}可以自己決定，其餘再一起商量。`,
        ],
        [
            (p, q) => `${q}一頭熱時，${p}一句「再想想」常讓氣氛冷下來。`,
            (p) => `${p}先說「好主意」，再一起看細節。`,
        ],
    ],
    mercury: [
        [
            (p, q) => `${q}隨口提的點子，${p}會認真追問細節與可行性。`,
            (p) => `${p}先說「這想法很有意思」，再談能不能做。`,
        ],
        [
            (p, q) => `${q}講得正起勁時，${p}一句糾正就可能讓話題中斷。`,
            (p, q) => `${p}先聽完${q}整段話，再提出自己的看法。`,
        ],
    ],
};

type LessonKey = 'saturn' | 'northNode' | 'pluto' | 'chiron' | 'none';

const LESSON: Record<LessonKey, ThemeCopy> = {
    saturn: {
        hook: [
            '這段關係，讓人學會負責',
            '一起長大，比一起快樂更難得',
            '承諾是你們共同的功課',
            '慢慢來，比較快',
            '把喜歡，練成長久',
        ],
        scene: [
            '面對錢、家人、未來規劃這些現實壓力時，你們會被逼著一起長大。',
            '談到買房、結婚或照顧家人時，兩人會發現彼此都很認真。',
            '其中一人遇到工作低潮時，另一人會陪著一步步把日子撐穩。',
        ],
        advice: [
            '每半年談一次未來規劃，把責任分得清清楚楚。',
            '把家務、開銷和照顧家人的分工寫下來，定期調整。',
            '壓力大的時候，先肯定對方已經做到的部分。',
        ],
    },
    northNode: {
        hook: [
            '像是來推彼此一把的人',
            '遇見你，人生轉了個彎',
            '你讓我看見下一步',
            '你的出現，是一份提醒',
        ],
        scene: [
            '在一起之後，常發現自己走上原本沒想過、卻更適合的路。',
            '對方隨口的一句建議，後來常變成改變人生的決定。',
            '回頭看認識前後的自己，兩人都覺得變了不少。',
        ],
        advice: [
            '把對方鼓勵你嘗試的事記下來，挑一件真的去做。',
            '每年一起回顧「因為你，我開始做的事」。',
            '對方推你一把時，先試一個月再決定要不要。',
        ],
    },
    pluto: {
        hook: [
            '在彼此身上看見真正的自己',
            '走過深水區，就更靠近',
            '這段關係會改變你們',
            '愛讓人重新認識自己',
        ],
        scene: [
            '某些爭執會碰到很深的舊傷，走過之後，兩人都像換了個人。',
            '一次深談後，其中一人說出了從沒跟別人說過的事。',
            '兩人在一起後，各自都放下了一些過去的執著。',
        ],
        advice: [
            '遇到觸及舊傷的話題，先停下來說「這讓我想起……」。',
            '情緒很深時，先約好只聽不評論。',
            '必要時一起找諮商師聊聊，這是投資不是失敗。',
        ],
    },
    chiron: {
        hook: ['舊傷在這裡，被溫柔接住', '傷口被看見，才會好', '你碰到的，也是我能好的地方'],
        scene: [
            '對方無心的一句話可能碰到痛處，也可能正是療癒的開始。',
            '說起過去的難過時，對方的沉默陪伴比安慰更有用。',
            '兩人都曾被某件事傷過，聊開之後反而更親近。',
        ],
        advice: [
            '願意說出舊傷的來由，對方才知道怎麼小心對待。',
            '碰到痛處時說一句「這裡我比較敏感」。',
            '慢慢說，不急著一次把過去講完。',
        ],
    },
    none: {
        hook: ['關係的樣子，由你們親手寫', '沒有劇本，只有選擇', '你們的課題是每天的小事'],
        scene: [
            '沒有太重的命定感，你們的課題多半來自每天的小選擇。',
            '少了命中注定的戲劇感，相處反而輕鬆自在。',
            '關係走向哪裡，大多取決於兩人怎麼安排生活。',
        ],
        advice: [
            '一起寫下這段關係最在乎的三件事，定期回頭看看。',
            '每年選一個兩人共同的新目標。',
            '遇到分岔路時，問問彼此想成為什麼樣的伴侶。',
        ],
    },
};

type DailyKey = 'soft' | 'hard' | 'house' | 'none';

const DAILY: Record<DailyKey, ThemeCopy> = {
    soft: {
        hook: [
            '連瑣事都能聊成樂趣',
            '生活小事，一說就通',
            '日常的頻率剛好對上',
            '你一句、我一句，事情就辦好了',
            '默契藏在每天的對話裡',
        ],
        scene: [
            '排家事、決定晚餐、規劃週末，你們三言兩語就能定案，很少為小事卡住。',
            '一起逛超市時，常常不用講就拿了對方想要的東西。',
            '傳訊息聊今天發生的事，是你們每天最期待的時刻。',
            '決定假日要去哪裡時，兩人常常一拍即合。',
            '一人提議、一人補充，連買家電都能很快做好決定。',
            '下班路上一通電話，就把晚餐和明天的行程都排好了。',
        ],
        advice: [
            '趁順的時候，把錢和家人這類硬話題也排進來談。',
            '溝通順暢時，順便約好吵架的規則。',
            '偶爾換個話題深聊，別只聊生活瑣事。',
            '把兩人的好溝通延伸到難開口的話題上。',
            '每週找一天一起規劃下週行程。',
            '把生活裡的小感謝說出口，默契會更深。',
            '一起訂一個月的共同小目標，例如每週運動兩次。',
        ],
    },
    hard: {
        hook: [
            '說法不同，不代表心意不同',
            '換個說法，就不必吵',
            '一樣的事，兩種講法',
            '溝通是你們的必修課',
            '想法不同，正好互補',
        ],
        scene: [
            '一人說「隨便」、一人當真，晚餐吃什麼都能僵持半天。',
            '同一件家事，一人覺得做完了，另一人覺得還沒做好。',
            '傳訊息時一個句點，就可能讓對方以為你生氣了。',
            '一人想先講結論，另一人想從頭說起，對話常卡在一半。',
            '規劃旅行時，一人要詳細行程，另一人只想隨興走。',
        ],
        advice: [
            '對話卡住時，先複述一次「你的意思是……嗎？」',
            '重要的事當面談，別在訊息裡吵架。',
            '先說「我想聽你講完」，再說自己的看法。',
            '說話前先講「我想表達的是……」，減少誤會。',
            '吵架時一次只談一件事，別翻舊帳。',
        ],
    },
    house: {
        hook: ['生活的節奏，慢慢磨成默契', '過日子的方式，一起找', '家裡的規則，兩人一起定'],
        scene: [
            '誰洗碗、幾點睡、週末要不要出門，這些小事是你們最常交換意見的地方。',
            '一人愛早起、一人愛晚睡，同住後才發現作息要對齊。',
            '買東西、記帳、整理房間，是兩人最常一起商量的事。',
        ],
        advice: [
            '把家務和作息寫成一張分工表，定期一起調整。',
            '每個月開一次「家庭會議」，十分鐘就好。',
            '各自保留一塊可以照自己習慣的小角落。',
        ],
    },
    none: {
        hook: ['平淡的日子，也能過出味道', '默契要一起慢慢攢', '日常是你們的練習場'],
        scene: [
            '日常互動沒有特別的火花或卡點，生活的默契要靠一起累積。',
            '兩人的生活節奏各有一套，要多花點時間互相認識。',
            '小事上很少爭執，但也要記得常常交流近況。',
        ],
        advice: [
            '固定一個兩人的小儀式，例如週日一起吃早午餐。',
            '每天睡前花五分鐘聊聊今天的一件事。',
            '一起做一件家事，順便聊聊天。',
        ],
    },
};

/** How the two argue, by the elements of their Mars signs (0 火 1 土 2 風 3 水); key "i|j", i <= j. */

const ARGUE: Record<string, readonly [Phrase, Phrase, Phrase]> = {
    '0|0': [
        () => '吵架時兩人都直來直往，來得快也去得快，很少隔夜。',
        () => '兩人脾氣都來得快，吵完通常一頓宵夜就和好。',
        () => '兩人吵架時音量都不小，但只要有一人先笑出來，氣就消了。',
    ],
    '1|1': [
        () => '兩人都不輕易動氣，真的卡住時，把爭點拆成具體條件最快鬆動。',
        () => '意見不同時兩人都很固執，誰也不想先讓，冷靜一晚再談最有效。',
        () => '兩人吵架很少大聲，比較常是各自悶著，誰先遞杯水誰就先破冰。',
    ],
    '2|2': [
        () => '意見不同多半靠講道理解決，很少冷戰，講完記得補一句關心。',
        () => '兩人吵架像辯論，邏輯都很清楚，但別忘了對方也有感受。',
        () => '吵架時兩人都想把話說贏，記得問一句「我們要解決的是什麼」。',
    ],
    '3|3': [
        () => '兩人都怕傷到對方，不舒服時可能都在等對方先開口。',
        () => '兩人受傷時都會先退回自己的殼裡，需要有人先遞出台階。',
        () => '兩人都容易把委屈往肚裡吞，寫張紙條有時比當面講更容易。',
    ],
    '0|1': [
        (f, e) => `吵架時${f}想當場說開，${e}想先消化，一快一慢其實很互補。`,
        (f, e) => `${f}的火氣來得快，${e}則慢慢累積，等${e}開口時通常已經忍很久了。`,
        (f, e) => `${f}要的是馬上有結論，${e}要的是想清楚再說，先約好討論的時間就不會僵。`,
    ],
    '0|2': [
        (f, a) => `吵架時${f}有熱度、${a}反應快，好處是講開就散，很少悶著。`,
        (f, a) => `${f}吵架靠氣勢，${a}吵架靠口才，吵完常常一起笑出來。`,
        (f, a) => `${a}會把吵架變成討論，${f}則需要先把情緒發洩完，順序對了就好談。`,
    ],
    '0|3': [
        (f, w) => `吵架時${f}想馬上談，${w}受傷時會先安靜，需要約好回來談的時間。`,
        (f, w) => `${f}說話直接，${w}聽了容易往心裡去，語氣放軟一點就差很多。`,
        (f, w) => `${w}需要先被安撫，${f}急著講道理只會讓${w}更想躲。`,
    ],
    '1|2': [
        (e, a) => `意見不同時，${a}負責把問題講清楚，${e}負責把結論落實。`,
        (e, a) => `${a}想把每個理由講清楚，${e}只想知道接下來怎麼做。`,
        (e, a) => `${e}吵架時話不多，${a}卻停不下來，留點沉默給${e}整理想法。`,
    ],
    '1|3': [
        () => '兩人都不愛正面衝突，小小的不舒服容易各自放著，要有人先溫柔地講白。',
        (e, w) => `${w}受委屈時會先沉默，${e}要主動問一句才會知道。`,
        (e, w) => `${e}習慣用行動道歉，${w}更想聽到一句「對不起，我懂你的難過」。`,
    ],
    '2|3': [
        (a, w) => `吵架時${a}講道理、${w}講感受，先承認感受再談理由就順了。`,
        (a, w) => `${a}吵架時越講越冷靜，${w}卻越聽越難過，先抱一下再談會好很多。`,
        (a, w) => `${w}需要時間消化情緒，${a}別急著追問「所以到底怎麼了」。`,
    ],
};

function argueLine(signA: number, signB: number, a: string, b: string): string {
    const ea = elementOf(signA);
    const eb = elementOf(signB);
    // Same element mix, different signs: the sign pair picks the variant.
    const v = (signA + signB) % 3;
    return ea <= eb ? ARGUE[`${ea}|${eb}`][v](a, b) : ARGUE[`${eb}|${ea}`][v](b, a);
}

const FIELDS: Record<SectionId, string> = {
    synastry_highlight: '從兩人最順的互動看你們在一起時的優勢（特別是太陽、金星、木星）。',
    synastry_friction: '從兩人互相拉扯的角度看容易卡住的地方（特別是火星、水星、天王星）。',
    synastry_intimacy:
        '從情感與愛的互動，以及落進對方家庭、親密、潛意識領域的行星，看你們怎麼靠近（月亮、金星，第 4／8／12 宮）。',
    synastry_lesson: '從責任與命運方向的接觸，看這段關係要一起學的事（土星、北交點）。',
    synastry_daily:
        '從說話方式的互動與落進對方日常、溝通領域的行星，看生活瑣事與吵架時怎麼說話（水星，第 3／6 宮）。',
};

// ---------------------------------------------------------------------------
// Report items
// ---------------------------------------------------------------------------

interface CardParts {
    hook: string;
    paragraphs: [string, string];
    scene: string;
    advice: string;
    /** Honest mode only, 磨合 only. */
    upfront?: string;
}

function card(id: SectionId, p: CardParts): MeaningItem {
    const lines = [
        ...(p.upfront ? ['【先說在前面】', clampZh(p.upfront, LIMITS.paragraph)] : []),
        '【解析】',
        clampZh(p.paragraphs[0], LIMITS.paragraph),
        clampZh(p.paragraphs[1], LIMITS.paragraph),
        '【相處場景】',
        clampZh(p.scene, LIMITS.scene),
        '【給兩人的建議】',
        clampZh(p.advice, LIMITS.advice),
    ];
    return {
        term: SECTION_TITLES[id],
        field: FIELDS[id],
        hook: clampHook(p.hook),
        meaning: lines.join('\n'),
    };
}

function clampHook(h: string): string {
    return h.length <= LIMITS.hook ? h : h.slice(0, LIMITS.hook);
}

interface Ctx {
    a: AstroPartner;
    b: AstroPartner;
    w: SynastryWeighting;
    fit: AstroFit;
    /** 互動主軸, strongest first. */
    axis: ThemeId[];
    /** Template sentences already written (source + plus/grow), so no section repeats another. */
    used: Set<string>;
}

interface Picked {
    c: WeightedContact;
    t: ContactText;
    text: string;
}

/**
 * Next unused contact of a section (preferring one of `prefer` theme), taking its strength
 * (`plus`) or growth (`grow`) sentence. Contacts whose sentence was already written are skipped.
 */
function take(
    ctx: Ctx,
    id: SectionId,
    which: 'plus' | 'grow',
    prefer?: (c: WeightedContact) => boolean,
    skip?: Picked,
): Picked | undefined {
    const list = ctx.w.sections[id]
        .filter((c) => c !== skip?.c)
        .map((c) => {
            const t = contactText(c, ctx.a, ctx.b);
            return { c, t, text: t[which] };
        })
        // Same template as the other paragraph of this card, or already written elsewhere: skip.
        .filter((x) => x.t.source !== skip?.t.source && !ctx.used.has(`${x.t.source}|${which}`));
    const hit = (prefer && list.find((x) => prefer(x.c))) || list[0];
    if (hit) ctx.used.add(`${hit.t.source}|${which}`);
    return hit;
}

/** The growth sentence of an already picked contact, if not written yet. */
function growOf(ctx: Ctx, p: Picked | undefined): string | null {
    if (!p || ctx.used.has(`${p.t.source}|grow`)) return null;
    ctx.used.add(`${p.t.source}|grow`);
    return p.t.grow;
}

const themeIs = (id: ThemeId | undefined) => (c: WeightedContact) => c.theme === id;

const CORE_KEYS = new Set<SynastryPointKey>(['sun', 'moon', 'venus', 'mars']);

/** A tense aspect between the core relationship points (used to lead 磨合 for a flagged pair). */
function isCoreTense(c: WeightedContact): boolean {
    return (
        c.kind === 'aspect' &&
        familyOf(c.aspect.type) === 'hard' &&
        CORE_KEYS.has(c.aspect.a) &&
        CORE_KEYS.has(c.aspect.b)
    );
}

function signOf(p: AstroPartner, key: SynastryPointKey): number {
    if (key === 'asc') return p.chart.angles?.asc.sign ?? 0;
    return bodyOf(p, key)?.sign ?? 0;
}

const ASPECT_INDEX: Record<AspectType, number> = {
    conjunction: 0,
    sextile: 1,
    square: 2,
    trine: 3,
    opposition: 4,
};
const AXIS_INDEX: Record<AxisKey, number> = { asc: 0, dsc: 1, mc: 2, ic: 3 };

/**
 * A deterministic number from the data behind a contact: the signs of the planets involved, who
 * holds them, the aspect type and how tight it is. Used to choose between copy variants, so that
 * two pairs sharing a contact or a theme do not get the same sentences.
 */
function seedOf(ctx: Ctx, c: WeightedContact | undefined, salt: number): number {
    const { a, b } = ctx;
    const tier = (orb: number) => (orb < 1 ? 0 : orb < 3 ? 1 : 2);
    let s: number;
    if (!c) s = signOf(a, 'sun') * 5 + signOf(b, 'sun') * 3 + signOf(a, 'venus');
    else if (c.kind === 'aspect')
        s =
            signOf(a, c.aspect.a) * 7 +
            signOf(b, c.aspect.b) * 3 +
            ASPECT_INDEX[c.aspect.type] * 2 +
            tier(c.aspect.orb);
    else {
        const [src, dst] = holders(c.from, a, b);
        s =
            signOf(src, c.body) * 5 +
            signOf(dst, 'sun') * 2 +
            (c.kind === 'axis' ? AXIS_INDEX[c.axis] + tier(c.orb) : c.house) +
            (c.from === 'a' ? 0 : 1);
    }
    // Mix in a hash of both charts so pairs sharing a contact still diverge.
    return (s * 31 + pairHash(a, b, salt)) >>> 0;
}

/** One variant of a list, mixing the seed differently for each field. */
function pickBy<T>(list: readonly T[], seed: number, field: number): T {
    // Integer hash so neighbouring seeds spread evenly over the variants.
    let h = (seed * 2654435761 + field * 40503) >>> 0;
    h = ((h ^ (h >>> 15)) * 2246822519) >>> 0;
    h = (h ^ (h >>> 13)) >>> 0;
    return list[h % list.length];
}

function copyFor(copy: ThemeCopy, seed: number) {
    return {
        hook: pickBy(copy.hook, seed, 0),
        scene: pickBy(copy.scene, seed, 1),
        advice: pickBy(copy.advice, seed, 2),
    };
}

// ---------------------------------------------------------------------------
// Hooks — composed from the elements of the two planets behind the section's lead contact and
// the section's theme: 「急性子遇上軟心腸，說法要對頻」. Each section has its own vocabulary.
// ---------------------------------------------------------------------------

type Four = readonly [string, string, string, string];

/** Per section, an image for each element (火 土 風 水). */
const HOOK_IMAGE: Record<SectionId, Four> = {
    synastry_highlight: ['火花', '大地', '微風', '流水'],
    synastry_friction: ['烈火', '岩石', '強風', '暗流'],
    synastry_intimacy: ['爐火', '老屋', '窗邊的風', '深海'],
    synastry_lesson: ['火種', '種子', '風向', '潮汐'],
    synastry_daily: ['急性子', '慢性子', '話匣子', '軟心腸'],
};

const HOOK_END: Record<SectionId, Record<string, string>> = {
    synastry_highlight: {
        spark: '越燒越旺',
        care: '暖到心裡',
        admire: '越看越順眼',
        mirror: '彼此照亮',
        mind: '話停不下來',
        bond: '穩穩同行',
        depth: '一眼看穿',
        freedom: '世界變大',
        expand: '一起長高',
    },
    synastry_friction: {
        spark: '容易擦槍走火',
        care: '在乎變牽掛',
        admire: '有話不說',
        mirror: '搶著掌舵',
        mind: '話會聽岔',
        bond: '期待變壓力',
        depth: '抓得太緊',
        freedom: '來去不定',
        expand: '腳步跟不上',
    },
    synastry_intimacy: {
        spark: '一碰就心跳',
        care: '安心靠岸',
        admire: '被好好珍惜',
        mirror: '心事有人接',
        mind: '話裡有溫度',
        bond: '慢慢交心',
        depth: '心底相通',
        freedom: '近而不黏',
        expand: '愛得大方',
    },
    synastry_lesson: {
        saturn: '學會承擔',
        northNode: '推著前進',
        pluto: '脫胎換骨',
        chiron: '舊傷癒合',
        none: '自己寫劇本',
    },
    synastry_daily: {
        soft: '三言兩語就定案',
        hard: '說法要對頻',
        house: '過日子要磨合',
        none: '默契慢慢攢',
    },
};

/** Elements of the two sides of a contact (A side first), or of the two Suns. */
function contactElements(ctx: Ctx, c: WeightedContact | undefined): [number, number] {
    const { a, b } = ctx;
    if (!c) return [elementOf(signOf(a, 'sun')), elementOf(signOf(b, 'sun'))];
    if (c.kind === 'aspect')
        return [elementOf(signOf(a, c.aspect.a)), elementOf(signOf(b, c.aspect.b))];
    const [src, dst] = holders(c.from, a, b);
    return [elementOf(signOf(src, c.body)), elementOf(signOf(dst, 'sun'))];
}

/** Per section, a one-word temperament for each element (火 土 風 水), to set up the scene. */
const SCENE_TRAIT: Record<SectionId, Four> = {
    synastry_highlight: ['熱情', '踏實', '機靈', '溫柔'],
    synastry_friction: ['性急', '固執', '嘴快', '敏感'],
    synastry_intimacy: ['直接', '慢熱', '愛聊', '細膩'],
    synastry_lesson: ['敢衝', '求穩', '求新', '念舊'],
    synastry_daily: ['手腳快', '按部就班', '話多', '心思細'],
};

/** 「甲性急、乙敏感：」 — who brings which temperament into the scene, from the lead contact. */
function scenePrefix(ctx: Ctx, id: SectionId, c: WeightedContact | undefined): string {
    const [ea, eb] = contactElements(ctx, c);
    const t = SCENE_TRAIT[id];
    return ea === eb ? `兩人都${t[ea]}：` : `${ctx.a.name}${t[ea]}、${ctx.b.name}${t[eb]}：`;
}

const ADVICE_VERB: Record<SectionId, string> = {
    synastry_highlight: '順著',
    synastry_friction: '顧及',
    synastry_intimacy: '珍惜',
    synastry_lesson: '看重',
    synastry_daily: '配合',
};

/** 「顧及乙護短的保護欲：」 — the advice is aimed at a personal planet of the lead contact. */
function advicePrefix(ctx: Ctx, id: SectionId, c: WeightedContact | undefined): string {
    const { a, b } = ctx;
    let who: AstroPartner = b;
    let key: SynastryPointKey = 'sun';
    if (c?.kind === 'aspect') {
        // Aim at a personal planet of the contact (B side first); slow planets make poor advice.
        if (SIGN_DESC[c.aspect.b]) key = c.aspect.b;
        else if (SIGN_DESC[c.aspect.a]) [who, key] = [a, c.aspect.a];
    } else if (c) [, who] = holders(c.from, a, b);
    return `${ADVICE_VERB[id]}${who.name}${descOf(who, key)}：`;
}

function composeHook(
    ctx: Ctx,
    id: SectionId,
    c: WeightedContact | undefined,
    endKey: string,
): string {
    const [ea, eb] = contactElements(ctx, c);
    const img = HOOK_IMAGE[id];
    const head = ea === eb ? `兩份${img[ea]}` : `${img[ea]}遇上${img[eb]}`;
    return `${head}，${HOOK_END[id][endKey]}`;
}

function highlightCard(ctx: Ctx): MeaningItem {
    const main = THEMES[ctx.axis[0]];
    const lead = take(ctx, 'synastry_highlight', 'plus', themeIs(ctx.axis[0]));
    const seed = seedOf(ctx, lead?.c, 1);
    const copy = copyFor(HIGHLIGHT[ctx.axis[0]], seed);
    const hook = composeHook(ctx, 'synastry_highlight', lead?.c, ctx.axis[0]);
    const intro = `「${main.light}」：`;
    const p1 = lead
        ? withBasis(intro, lead.text, lead.t.basis)
        : `${intro}兩人之間的順暢多來自日常的累積。`;
    const secondTheme = ctx.axis[1];
    const second = take(ctx, 'synastry_highlight', 'plus', themeIs(secondTheme), lead);
    // Name the second axis theme only when this contact really carries it.
    const alt =
        secondTheme && second?.c.theme === secondTheme
            ? `另一條主線是「${THEMES[secondTheme].light}」：`
            : '';
    const p2 = second
        ? withBasis(alt, second.text, second.t.basis)
        : (growOf(ctx, lead) ?? '其餘的互動比較溫和，留給兩人慢慢發掘彼此的好。');
    return card('synastry_highlight', {
        hook,
        paragraphs: [p1, p2],
        scene: `${scenePrefix(ctx, 'synastry_highlight', lead?.c)}${copy.scene}`,
        advice: `${advicePrefix(ctx, 'synastry_highlight', lead?.c)}${copy.advice}`,
    });
}

function frictionCard(ctx: Ctx): MeaningItem {
    const main = THEMES[ctx.axis[0]];
    // A flagged pair leads with its core tension; otherwise with the contact behind the 主軸.
    const lead = take(
        ctx,
        'synastry_friction',
        'grow',
        ctx.fit.difficult ? isCoreTense : themeIs(ctx.axis[0]),
    );
    const seed = seedOf(ctx, lead?.c, 2);
    const table = FRICTION[ctx.axis[0]];
    const copy = copyFor(table, seed);
    const hook = composeHook(ctx, 'synastry_friction', lead?.c, ctx.axis[0]);
    // No frame: the two drives (Mars signs), the 主軸 word and its flip side, then how it shows up.
    const drives =
        bodyOf(ctx.a, 'mars') && bodyOf(ctx.b, 'mars')
            ? `${ctx.a.name}${descOf(ctx.a, 'mars')}和${ctx.b.name}${descOf(ctx.b, 'mars')}之間，`
            : '';
    const p1 = `${drives}「${main.light}」的另一面是「${main.shadow}」：${pickBy(table.turn, seed, 4)}。`;
    const prefix = ctx.fit.difficult ? '這是比較吃力的一塊：' : '';
    const p2 = lead
        ? withBasis(prefix, lead.text, lead.t.basis)
        : '兩人之間直接的拉扯不多，要留意的反而是順到忘了把需要說出口。';
    const upfront = ctx.fit.difficult
        ? `坦白說，兩人的核心互動拉扯偏多（${ctx.fit.coreTense} 組互相拉扯、${ctx.fit.coreSoft} 組順暢），相處會比多數伴侶費力，以下請認真看待。`
        : undefined;
    return card('synastry_friction', {
        hook,
        paragraphs: [p1, p2],
        scene: `${scenePrefix(ctx, 'synastry_friction', lead?.c)}${copy.scene}`,
        advice: `${advicePrefix(ctx, 'synastry_friction', lead?.c)}${copy.advice}`,
        upfront,
    });
}

function intimacyCard(ctx: Ctx): MeaningItem {
    const lead = take(ctx, 'synastry_intimacy', 'plus');
    const copy = copyFor(INTIMACY[lead?.c.theme ?? 'care'], seedOf(ctx, lead?.c, 3));
    const hook = composeHook(ctx, 'synastry_intimacy', lead?.c, lead?.c.theme ?? 'care');
    const p1 = lead
        ? withBasis('', lead.text, lead.t.basis)
        : '兩人在情感上的直接連結不多，親密感要靠一次次真心的交談慢慢養大。';
    const second = take(ctx, 'synastry_intimacy', 'plus', undefined, lead);
    const p2 = second
        ? withBasis('', second.text, second.t.basis)
        : (growOf(ctx, lead) ?? '願意先開口的那一方，往往就是幫這段關係打開門的人。');
    return card('synastry_intimacy', {
        hook,
        paragraphs: [p1, p2],
        scene: `${scenePrefix(ctx, 'synastry_intimacy', lead?.c)}${copy.scene}`,
        advice: `${advicePrefix(ctx, 'synastry_intimacy', lead?.c)}${copy.advice}`,
    });
}

function lessonKey(c: WeightedContact | undefined): LessonKey {
    if (!c) return 'none';
    const keys: SynastryPointKey[] = c.kind === 'aspect' ? [c.aspect.a, c.aspect.b] : [c.body];
    for (const k of ['saturn', 'northNode', 'pluto', 'chiron'] as const)
        if (keys.includes(k)) return k;
    return 'saturn';
}

function saturnScene(
    ctx: Ctx,
    c: WeightedContact | undefined,
    seed: number,
): { scene: string; advice: string } | null {
    if (!c || c.kind !== 'aspect') return null;
    const x = c.aspect;
    const pair: [AstroPartner, AstroPartner, SynastryPointKey] | null =
        x.a === 'saturn' ? [ctx.a, ctx.b, x.b] : x.b === 'saturn' ? [ctx.b, ctx.a, x.a] : null;
    if (!pair) return null;
    const list = SATURN_ON[pair[2]];
    if (!list) return null;
    const [scene, advice] = pickBy(list, seed, 1);
    return { scene: scene(pair[0].name, pair[1].name), advice: advice(pair[0].name, pair[1].name) };
}

function lessonCard(ctx: Ctx): MeaningItem {
    const lead = take(ctx, 'synastry_lesson', 'plus');
    const seed = seedOf(ctx, lead?.c, 4);
    const hook = composeHook(ctx, 'synastry_lesson', lead?.c, lessonKey(lead?.c));
    // Saturn on a personal planet: the scene and advice name who brings the weight.
    const copy = {
        ...copyFor(LESSON[lessonKey(lead?.c)], seed),
        ...saturnScene(ctx, lead?.c, seed),
    };
    const p1 = lead
        ? withBasis('', lead.text, lead.t.basis)
        : '兩人之間沒有明顯的土星或命運軸線接觸，關係少了沉重的考驗，多了自己決定的自由。';
    const second = take(ctx, 'synastry_lesson', 'grow', undefined, lead);
    const p2 = second
        ? withBasis('', second.text, second.t.basis)
        : (growOf(ctx, lead) ?? '要走多遠，取決於兩人願不願意把喜歡變成每天的選擇。');
    return card('synastry_lesson', {
        hook,
        paragraphs: [p1, p2],
        scene: `${scenePrefix(ctx, 'synastry_lesson', lead?.c)}${copy.scene}`,
        advice: `${advicePrefix(ctx, 'synastry_lesson', lead?.c)}${copy.advice}`,
    });
}

function dailyKey(c: WeightedContact | undefined): DailyKey {
    if (!c) return 'none';
    if (c.kind !== 'aspect') return 'house';
    return familyOf(c.aspect.type) === 'hard' ? 'hard' : 'soft';
}

function dailyCard(ctx: Ctx): MeaningItem {
    const { a, b } = ctx;
    const lead = take(ctx, 'synastry_daily', 'plus', themeIs('mind'));
    const copy = copyFor(DAILY[dailyKey(lead?.c)], seedOf(ctx, lead?.c, 5));
    const hook = composeHook(ctx, 'synastry_daily', lead?.c, dailyKey(lead?.c));
    const p1 = lead
        ? withBasis('', lead.text, lead.t.basis)
        : '兩人的說話方式之間沒有特別強的牽動，溝通的默契要靠日常一點一滴對齊。';
    const marsA = bodyOf(a, 'mars');
    const marsB = bodyOf(b, 'mars');
    const argue = marsA && marsB ? argueLine(marsA.sign, marsB.sign, a.name, b.name) : null;
    const second = argue ? undefined : take(ctx, 'synastry_daily', 'plus', undefined, lead);
    const p2 = argue
        ? withBasis('', argue, `${a.name}與${b.name}的火星星座`)
        : second
          ? withBasis('', second.text, second.t.basis)
          : (growOf(ctx, lead) ?? '吵架時先說自己的感受，再談對方哪裡做錯，話會好聽很多。');
    return card('synastry_daily', {
        hook,
        paragraphs: [p1, p2],
        scene: `${scenePrefix(ctx, 'synastry_daily', lead?.c)}${copy.scene}`,
        advice: `${advicePrefix(ctx, 'synastry_daily', lead?.c)}${copy.advice}`,
    });
}

function contactLabel(c: WeightedContact, a: AstroPartner, b: AstroPartner): string {
    if (c.kind === 'aspect') {
        const x = c.aspect;
        return `${a.name}的${POINT_NAMES[x.a]} ${x.name} ${b.name}的${POINT_NAMES[x.b]}（容許度 ${x.orb.toFixed(1)}°）`;
    }
    const [src, dst] = holders(c.from, a, b);
    if (c.kind === 'axis')
        return `${src.name}的${BODY_NAMES[c.body]} 合 ${dst.name}的${AXIS_NAMES[c.axis]}（容許度 ${c.orb.toFixed(1)}°）`;
    return `${src.name}的${BODY_NAMES[c.body]} → ${dst.name}的第 ${c.house} 宮`;
}

function axisLine(axis: ThemeScore[]): string {
    return axis.map((t) => `${THEMES[t.id].label}（${t.score} 分）`).join('、');
}

function basisItem(ctx: Ctx): MeaningItem {
    const { a, b, w } = ctx;
    const lines = [`互動主軸：${axisLine(w.axis)}`];
    for (const id of SECTION_ORDER) {
        const list = w.sections[id];
        lines.push(`【${SECTION_TITLES[id]}】`);
        lines.push(
            ...(list.length > 0
                ? list.map((c) => `${contactLabel(c, a, b)}・${c.score} 分`)
                : ['（沒有足夠權重的接觸）']),
        );
    }
    const caveat = caveatLine(a, b);
    if (caveat) lines.push('【說明】', caveat);
    return {
        term: '星盤依據',
        field: '每個板塊採用的高權重接觸（分數 1–100），給想對照星盤的人參考。',
        meaning: lines.join('\n'),
    };
}

/** Every sign phrase a partner can be described with, with the planet it belongs to. */
function descPhrases(p: AstroPartner, forGift = false): [SynastryPointKey, string][] {
    const keys = Object.keys({ ...SIGN_DESC, ...ELEMENT_DESC }) as SynastryPointKey[];
    return keys.filter((k) => bodyOf(p, k as AstroBodyKey)).map((k) => [k, descOf(p, k, forGift)]);
}

/**
 * A later mention of a sign phrase, never naming the sign or planet: the second time the
 * alternate phrasing (「講求效率的執行力」 → 「一絲不苟的做事方式」), after that a plain refer-back
 * (「那份執行力」, then 「這份執行力」).
 */
function shortDesc(p: AstroPartner, key: SynastryPointKey, desc: string, mention: number): string {
    const body = bodyOf(p, key as AstroBodyKey);
    const alt = SIGN_DESC_ALT[key];
    if (mention === 1 && body && alt) return alt[body.sign];
    const tail = desc.split(/[的、]/).pop() ?? desc;
    const measure = tail === '心' || tail === '腦袋' ? '顆' : tail === '性子' ? '股' : '份';
    return `${mention <= 2 ? '那' : '這'}${measure}${tail}`;
}

/**
 * The same sign phrase must not come back in a later card (準則 §4A: no repeated adjectives
 * across sections): keep the first mention, shorten the rest.
 */
function dedupeDescriptors(items: MeaningItem[], partners: AstroPartner[], forGift = false): MeaningItem[] {
    const mentions = new Map<string, number>();
    return items.map((it) => {
        let meaning = it.meaning;
        for (const p of partners)
            for (const [key, d] of descPhrases(p, forGift)) {
                const full = `${p.name}${d}`;
                let idx = meaning.indexOf(full);
                while (idx >= 0) {
                    const n = mentions.get(full) ?? 0;
                    mentions.set(full, n + 1);
                    if (n === 0) {
                        idx = meaning.indexOf(full, idx + full.length);
                        continue;
                    }
                    // The gift has its own vocabulary: a repeat there is just a refer-back.
                    const short = `${p.name}${shortDesc(p, key, d, forGift ? n + 1 : n)}`;
                    meaning = meaning.slice(0, idx) + short + meaning.slice(idx + full.length);
                    idx = meaning.indexOf(full, idx + short.length);
                }
            }
        return { ...it, meaning };
    });
}

export function astroSynastryItems(
    a: AstroPartner,
    b: AstroPartner,
    syn: AstroSynastry,
): MeaningItem[] {
    const w = weighSynastry(a.chart, b.chart, syn);
    const ctx: Ctx = {
        a,
        b,
        w,
        fit: astroFit(syn),
        axis: w.axis.map((t) => t.id),
        used: new Set(),
    };
    const sections = [highlightCard(ctx), frictionCard(ctx), intimacyCard(ctx), lessonCard(ctx), dailyCard(ctx)];
    // The 禮物 card speaks with its own sign phrasings, so it is checked on its own.
    const [gift] = dedupeDescriptors([giftItem(a, b, syn, ctx.fit)], [a, b], true);
    return [...dedupeDescriptors(sections, [a, b]), gift, basisItem(ctx)];
}

// ---------------------------------------------------------------------------
// AI prompt
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------

function pos(p: AstroZodiacPos): string {
    return `${p.signName} ${formatDegMin(p.degree, p.minute)}`;
}

function chartBlock(p: AstroPartner): string {
    const c = p.chart;
    const bodies = c.bodies
        .filter((x) => !(c.timeUnknown && x.key === 'moon'))
        .map(
            (x) =>
                `- ${x.name}：${pos(x)}${x.house !== null ? `，第 ${x.house} 宮` : ''}${x.retrograde ? '（逆行）' : ''}`,
        )
        .join('\n');
    const asc =
        c.angles && !c.timeUnknown
            ? `- 上升：${pos(c.angles.asc)}；天頂：${pos(c.angles.mc)}`
            : '- 無上升與宮位資料';
    const moon = moonLabel(p);
    const moonNote = c.timeUnknown
        ? `\n- 出生時間不確定：未列入月亮相位${moon ? `；${moon.text.replace(/（[^）]*）$/, '')}，僅供參考` : ''}`
        : '';
    return `### ${p.name}
- 出生時刻（UTC）：${c.utc}；出生地：${c.placeName ?? '未提供'}${moonNote}
${asc}
${bodies}`;
}

const SECTION_FOCUS: Record<SectionId, string> = {
    synastry_highlight:
        '和諧角度（三分、六分、合相），特別是太陽、木星、金星的互動：兩人共同對外展現的氣場與合作潛力。',
    synastry_friction:
        '困難角度（四分、對分），特別是火星（衝突引爆點）、水星（溝通頻率落差）、天王星（突發變數與距離感）。',
    synastry_intimacy:
        '月亮與金星的跨盤互動，以及行星落入對方的第 4 宮（安全感）、第 8 宮（深度親密與信任）、第 12 宮（潛意識共鳴）。',
    synastry_lesson:
        '土星跨盤接觸（責任、考驗與現實限制）與北交點接觸（靈魂成長方向、彼此推一把的契機）。',
    synastry_daily:
        '水星跨盤相位與行星落入對方第 3／6 宮：日常瑣事、生活習慣，以及吵架時的溝通方式。',
};

export function buildAstroSynastryAiPrompt(
    a: AstroPartner,
    b: AstroPartner,
    syn: AstroSynastry,
): string {
    const fit = astroFit(syn);
    const w = weighSynastry(a.chart, b.chart, syn);
    const unknown = [a, b].filter((p) => p.chart.timeUnknown).map((p) => p.name);
    const timeRule =
        unknown.length > 0
            ? `\n- ${unknown.join('、')}的出生時間不確定：上升、四軸點與宮位不可用（已從資料中移除），月亮星座可能有誤差，涉及月亮的推論請標示為「可能」。`
            : '';
    const tone = fit.difficult
        ? `- 語氣：這組合盤被判定為明顯偏難（太陽、月亮、金星、火星與上升之間張力 ${fit.coreTense} 組、和諧 ${fit.coreSoft} 組${fit.saturnHard > 0 ? `，土星緊張接觸 ${fit.saturnHard} 組` : ''}，日月、金火、月金之間沒有順向連結）。請誠實、尊重地說明兩人確實比較不合：只在「兩人需磨合的地方」的 core_insight 開頭先坦白說明，挑戰的篇幅可以多於優點，並給具體可行的做法；其他板塊仍要指出兩人之間真實且值得珍惜的部分，不要硬湊正面。`
        : '- 語氣：以優點為主，優點與挑戰的篇幅大約 2:1；挑戰要寫成成長點，並附上一個可以實際做的小建議。避免嚴厲字眼（例如「衝突的熱點」「爆發」「情緒勒索」）。只有當資料明顯顯示兩人不合時才坦白說明，這組資料沒有被判定為不合。';
    const axis = w.axis
        .map(
            (t) =>
                `- ${THEMES[t.id].label}（權重合計 ${t.score}）：亮點面是「${THEMES[t.id].light}」，磨合面是「${THEMES[t.id].shadow}」`,
        )
        .join('\n');
    const sections = SECTION_ORDER.map((id, i) => {
        const list = w.sections[id];
        const rows =
            list.length > 0
                ? list.map((c) => `- ${contactLabel(c, a, b)}｜權重 ${c.score}`).join('\n')
                : '- （沒有足夠權重的接觸，請依互動主軸與整體盤面推論，並說明依據較少）';
        return `### ${i + 1}. ${SECTION_TITLES[id]}（section_id: ${id}）\n取材：${SECTION_FOCUS[id]}\n${rows}`;
    }).join('\n\n');
    const example = SECTION_ORDER.map(
        (id) =>
            `  {"section_id": "${id}", "section_title": "${SECTION_TITLES[id]}", "hook_quote": "…", "core_insight": "第一段\\n第二段", "key_dynamic": "…", "actionable_advice": "…"}`,
    ).join(',\n');

    return `請依下列兩人的西洋占星本命盤與比對盤（synastry）資料，用台灣繁體中文寫一份雙人合盤解析。資料已經過權重計算（每個跨盤接觸 1–100 分），每個板塊只列出分配給它的高權重接觸，請以這些為主要依據。

## 寫作規則
- 聚焦「${a.name}與${b.name}互動產生的化學反應」，嚴禁寫成兩份獨立的個人分析。
- 禁止條列式拼接：不要寫「${a.name}的太陽在XX，代表…；${b.name}的月亮在OO，代表…」這類句子，要把高權重配置融合成自然流暢的心理剖析。
- 去術語化：不要直接拋出「刑剋」「入廟」「容許度」「比較盤八宮」這類占星術語；先用白話的心理描述說明效果，只在句末括號內簡短附註星盤依據。
  - 錯誤示範：「A 的火星刑剋 B 的月亮，且 B 的土星落入 A 的七宮。」
  - 正確示範：「在情緒表達上，一方直來直往的行動力，有時會無意間刺傷另一方敏感的內心（源自於雙方行動力與安全感能量的碰撞）。」
- 需要指明是誰時直接用名字（${a.name}、${b.name}），不要用「他」「她」。
- 先讀「互動主軸」，它是五個板塊共同的脈絡：「一起時的亮點與發揮特色」與「兩人需磨合的地方」要互為表裡（例如吸引彼此的「自由感」，在磨合期往往會變成「缺乏安全感」）。
- 不重複：同一句話、同一個形容詞或句型不要在不同板塊重複出現；前面提過的特質，後面要轉成該板塊的具體生活場景。
${tone}
- 只用台灣繁體中文與台灣慣用語，不要出現簡體字或中國大陸用語，也不要翻譯腔。${timeRule}
- 這是星盤結構說明，不是緣分的判決；避免恐嚇或保證。

## 互動主軸
${axis}

## 各板塊的高權重接觸
${sections}

## 兩人星盤
${chartBlock(a)}

${chartBlock(b)}

## 輸出格式
只輸出一個 JSON 陣列，依序包含上面五個板塊，不要加任何其他文字或 Markdown。每個物件的欄位：
- section_id：照上面給的 id。
- section_title：照上面給的標題。
- hook_quote：一句點破這兩人關係核心的金句，20 字以內，要專屬這兩人，不要放之四海皆準。
- core_insight：主體解析，2 個短段落，用 \\n 分隔，每段 80 字以內。
- key_dynamic：具體相處場景（兩人最容易在什麼時刻感到心靈相通，或何時會築起防備），60 字以內。
- actionable_advice：一條給兩人的具體相處建議，50 字以內。
格式範例：
[
${example}
]`;
}
