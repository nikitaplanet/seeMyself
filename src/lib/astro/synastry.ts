import type { PartnerKey } from '@/lib/hd/synastry';
import type { MeaningItem } from '@/lib/ui/personMeaning';
import { ASPECT_ANGLES, ASPECT_NAMES, ASPECT_ORBS, BODY_NAMES, formatDegMin, SIGN_NAMES } from './labels';
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
// Copy is written per planet pair and per aspect family (合 / 和諧 / 張力), with the two people's
// roles spelled out (whose Moon, whose Mars), so two different contacts never read the same.

export interface AstroPartner {
    name: string;
    chart: AstroChart;
}

type Family = 'conj' | 'soft' | 'hard';

function familyOf(type: AspectType): Family {
    if (type === 'conjunction') return 'conj';
    return type === 'trine' || type === 'sextile' ? 'soft' : 'hard';
}

/** One short nuance per aspect, appended after the pair-specific note. */
const ASPECT_NUANCE: Record<AspectType, string> = {
    conjunction: '',
    trine: '三分相是天生的順，兩人不用費力就站在同一邊；偶爾把這份默契說出口，它會更穩。',
    sextile: '六分相是「一推就動」的順：只要多一點主動安排，好處會一路放大。',
    square: '四分相的磨合多半落在日常小事上，每磨順一次，兩人就更懂得怎麼互相推一把。',
    opposition: '對分相像照鏡子：在對方身上看到自己缺的那一面，吸引力由此而來；找到平衡點，兩人就能互相補位。',
};

/** For a clearly difficult pair (see astroFit): the tense nuances, said more plainly. */
const DIFFICULT_NUANCE: Partial<Record<AspectType, string>> = {
    square: '四分相的摩擦多半出現在日常小事上、而且會反覆發生，需要兩人有意識地練習才會變順。',
    opposition: '對分相像照鏡子，既吸引也拉扯，容易各執一端；重點是找平衡，而不是分輸贏。',
};

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

/** What a slower planet does to a personal point, per aspect family (fallback for non-key pairs). */
const ACTOR: Partial<Record<SynastryPointKey, Record<Family, string>>> = {
    jupiter: {
        conj: '放大與鼓勵，讓人更有信心；偶爾一起冷靜評估一下就好',
        soft: '帶來信心與好運，是很溫暖的支持',
        hard: '把彼此的格局撐大，記得承諾前先量力而為',
    },
    saturn: {
        conj: '帶來責任與結構，給人可以依靠的穩定',
        soft: '帶來穩定與耐心，是能一起走長路的力量',
        hard: '帶來一些要求，一起走過之後是很牢的承諾',
    },
    uranus: {
        conj: '帶來刺激與驚喜，生活多了新鮮感；也給彼此保留一點自由',
        soft: '帶來新鮮與自由感，相處輕鬆不黏膩',
        hard: '帶來意外與變化，也帶兩人跳出老套；多一點彈性就能享受它',
    },
    neptune: {
        conj: '帶來浪漫與心靈的共鳴；也記得看見彼此真實的樣子',
        soft: '帶來溫柔的心靈共鳴，常有說不出的懂',
        hard: '帶來一種說不清的牽引，遇到誤會時多問一句就能澄清',
    },
    pluto: {
        conj: '帶來深刻的吸引與轉變，也記得尊重彼此的空間',
        soft: '帶來深度與互相改變的力量，關係會越走越深',
        hard: '逼出彼此最真實的自己，放下掌控、多一點信任就能走得更深',
    },
    northNode: {
        conj: '帶來命運感，像來推動彼此的人生方向',
        soft: '帶來順向的成長，相處中自然往好的方向走',
        hard: '帶來方向上的思考，正好讓人看清自己真正想走的路',
    },
    chiron: {
        conj: '碰觸舊傷，也帶來療癒的機會',
        soft: '帶來溫和的療癒，讓人覺得被接住',
        hard: '可能碰到舊傷，願意談開就是療癒的起點',
    },
};

const FAMILY_TONE: Record<Family, string> = {
    conj: '融在一起，存在感很強，彼此的影響很直接',
    soft: '彼此順得來，不費力就互相支持',
    hard: '有些摩擦，也互相推動成長',
};

function functionOf(k: SynastryPointKey): string {
    return k === 'asc' ? '外在形象' : BODY_FUNCTION[k];
}

/** Pair-specific note: who does what to whom, in this aspect family. */
function aspectNote(
    x: InterAspect,
    a: AstroPartner,
    b: AstroPartner,
    difficult = false,
): { theme: string; text: string } {
    const fam = familyOf(x.type);
    const direct = PAIR_NOTES[noteKey(x.a, x.b)];
    const flipped = PAIR_NOTES[noteKey(x.b, x.a)];
    const note = direct ?? flipped;
    if (note) {
        const [plus, grow] = direct ? direct[fam](a.name, b.name) : flipped[fam](b.name, a.name);
        // A clearly difficult pair: tense contacts lead with the work, then what is still real.
        const text = difficult && fam === 'hard' ? `這是兩人比較吃力的地方：${grow}${plus}` : `${plus}${grow}`;
        return { theme: note.theme, text };
    }
    const actA = ACTOR[x.a];
    const actB = ACTOR[x.b];
    if (actA && !actB)
        return { theme: '', text: `${a.name}的${POINT_NAMES[x.a]}對${b.name}的${functionOf(x.b)}${actA[fam]}` };
    if (actB && !actA)
        return { theme: '', text: `${b.name}的${POINT_NAMES[x.b]}對${a.name}的${functionOf(x.a)}${actB[fam]}` };
    return { theme: '', text: `${a.name}的${functionOf(x.a)}與${b.name}的${functionOf(x.b)}${FAMILY_TONE[fam]}` };
}

function aspectHead(x: InterAspect, a: AstroPartner, b: AstroPartner): string {
    return `${a.name}的${POINT_NAMES[x.a]} ${x.name} ${b.name}的${POINT_NAMES[x.b]}（容許度 ${x.orb.toFixed(1)}°）`;
}

function aspectLine(x: InterAspect, a: AstroPartner, b: AstroPartner, withNuance: boolean, difficult = false): string {
    const n = aspectNote(x, a, b, difficult);
    const nuance = withNuance ? ((difficult && DIFFICULT_NUANCE[x.type]) || ASPECT_NUANCE[x.type]) : '';
    return `${aspectHead(x, a, b)}：${n.theme ? `${n.theme}。` : ''}${n.text}${n.text.endsWith('。') ? '' : '。'}${nuance}`;
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

/** What the visiting planet brings (src = whose planet). */
const OVERLAY_ROLE: Record<string, string> = {
    sun: '的存在感',
    moon: '的情緒與照顧',
    mercury: '的話題與想法',
    venus: '的好感與溫柔',
    mars: '的熱情與衝勁',
    jupiter: '的鼓勵與樂觀',
    saturn: '的責任感與穩定',
};

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

/** Classic combinations that deserve their own sentence. */
const OVERLAY_SPECIAL: Record<string, Phrase> = {
    'sun|7': (p, q) => `${q}很容易把${p}當成理想伴侶的形象，兩人走在一起就很像一對；也記得看見${p}本來的樣子`,
    'moon|4': (p, q) => `${p}讓${q}有「回到家」的感覺，兩人窩在家最療癒`,
    'moon|12': (p, q) => `${p}能感受到${q}沒說出口的情緒，是很深的默契`,
    'venus|5': (p, q) => `${q}和${p}在一起特別有戀愛感，約會、禮物、浪漫小驚喜都很加分`,
    'venus|7': (p, q) => `${q}容易把${p}視為理想伴侶，也很適合長期合作`,
    'venus|8': (p, q) => `${p}的愛會碰到${q}最私密的一面，身體與情感的親密感都強，多給彼此安心感就更穩`,
    'mars|1': (p, q) => `${p}的行動力直接帶動${q}，很有吸引力，也常激勵${q}去嘗試`,
    'mars|5': (p, q) => `${p}讓${q}玩得盡興，熱情與吸引力都很明顯`,
    'mars|7': (p, q) => `${p}在${q}的伴侶宮帶來推動力，兩人一起做事很有勁，事前講好分工就更順`,
    'mars|8': (p, q) => `${p}和${q}之間吸引力強，信任與共同財務多溝通，就能讓這份熱度更安穩`,
    'saturn|1': (p, q) => `${q}會覺得${p}很可靠、讓人安定，偶爾也希望${p}放鬆一點`,
    'saturn|4': (p, q) => `${p}可能成為${q}家中的支柱，對家務與家庭也有自己的標準`,
    'saturn|5': (p, q) => `${p}讓${q}的玩樂和戀愛變得認真而穩定，偶爾也一起單純地玩`,
    'saturn|7': (p, q) => `${q}容易把${p}視為適合承諾的對象，關係穩、責任明確，浪漫可以另外安排`,
    'saturn|8': (p, q) => `${q}對${p}的親密與信任需要時間建立；慢，但一旦建立就很牢`,
    'mercury|3': (p, q) => `兩人每天有聊不完的話，訊息往來很密，${p}常是${q}第一個想分享的人`,
    'venus|3': (p, q) => `${p}的溫柔表現在日常對話裡，${q}覺得跟${p}聊天很舒服、很被欣賞`,
    'saturn|3': (p, q) => `${p}會認真回應${q}說的話，讓${q}覺得被好好聽見`,
    'saturn|9': (p, q) => `${p}對${q}的信念與人生觀很認真，像一位可靠的老師`,
    'saturn|10': (p, q) => `${p}對${q}的事業有實際的督促，像嚴格但可靠的教練`,
    'jupiter|7': (p, q) => `${p}讓${q}對這段關係充滿信心，覺得和${p}在一起運氣變好`,
};

/** Body-specific tail for the generic overlay line, so two planets in the same house read differently. */
const OVERLAY_TWIST: Record<string, string> = {
    sun: '；這一塊會成為兩人相處的亮點',
    moon: '；在這一塊彼此特別容易情緒共振，好心情會互相傳染',
    mercury: '；這一塊是兩人最常聊起、也最聊得起勁的話題',
    venus: '；在這一塊相處起來特別甜',
    mars: '；熱度高，這一塊做起事來很有勁',
    jupiter: '；這一塊會因為對方變得更寬、更樂觀',
    saturn: '；在這一塊需要一點時間磨合，磨過之後會變得踏實可靠',
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

// ---------------------------------------------------------------------------
// 日常相處 — per-sign / per-element tables (index 0 = 牡羊 … 11 = 雙魚; elements 0 火 1 土 2 風 3 水)
// ---------------------------------------------------------------------------

type Twelve = readonly [string, string, string, string, string, string, string, string, string, string, string, string];

const SUN_TRAIT: Twelve = [
    '直接、有衝勁，想到就去做，是身邊人的發動機；等待時會有點心急',
    '穩定可靠、懂得享受生活，給人踏實感；改變需要多一點時間',
    '好奇、反應快，總帶來新鮮話題，熱度來得快，需要常保新意',
    '顧家、重感情，對親近的人照顧得無微不至，心情起伏時需要一點安全的角落',
    '大方、溫暖，像小太陽，喜歡被看見與肯定',
    '細心、要求品質，能把事情做得漂亮，對自己有時也要求得太多',
    '體貼、重公平，很會照顧關係的和諧，表態前習慣多想一想',
    '深情、重信任，認定了就全心投入，給的愛很深',
    '樂觀、愛自由，帶人看見更大的世界，需要探索與意義',
    '務實、有責任感，說到做到、很能託付，偶爾需要被提醒放鬆',
    '獨立、有主見，常有別人想不到的觀點，需要個人空間',
    '溫柔、共感強，很能體會別人的感受，也需要照顧好自己的界線',
];

const ASC_TRAIT: Twelve = [
    '直率、有活力',
    '穩重、親切，越熟越溫暖',
    '機靈、好聊',
    '溫和、讓人安心',
    '大方、有存在感',
    '細心、得體',
    '優雅、好相處',
    '沉穩、有深度',
    '開朗、坦率',
    '成熟、可靠',
    '特別、友善',
    '溫柔、隨和',
];

const MERCURY_TRAIT: Twelve = [
    '想到就說，決定很快，很能帶動討論',
    '慢慢想，想通了就很篤定，結論可靠',
    '邊聊邊想，點子多、角度廣，定案需要一點時間',
    '帶著感受與經驗判斷，善解人意，話會放在心上',
    '說話有自信，很會用故事打動人',
    '分析細節、找出問題，思慮周到，是很好的把關者',
    '多方衡量、懂得看雙方立場，判斷公道',
    '看動機與底層原因，一針見血，很能看穿問題核心',
    '先想大方向，視野寬，細節可以交給搭檔',
    '重結論與可行性，務實，讓想法真正落地',
    '跳出框架，有自己的一套邏輯，常有獨到見解',
    '靠直覺與畫面思考，想像力豐富，說起來像在畫畫',
];

const MARS_TRAIT: Twelve = [
    '有話當場說開，說完就過去，不記仇',
    '很有耐性、不輕易動氣，真的在意時會堅持到底',
    '習慣用說的處理，願意把話講開，吵架也像在溝通',
    '很顧關係、不會把話說絕，不舒服時會先安靜下來',
    '坦蕩、有骨氣，吵完也大方，不小氣',
    '會指出具體問題，事後很願意實際改善',
    '很願意妥協、維持和平，不滿要記得早點說',
    '平時沉得住氣，真談開時非常誠實、直指核心',
    '直來直往，很快就雨過天晴',
    '冷靜、講規矩，很少失控說重話',
    '理性講理，需要時會先離開一下冷靜，很少說傷人的話',
    '很能體諒對方的難處，容易把委屈先吞下，需要被邀請說出來',
];

const MOON_REPAIR: Twelve = [
    '先動一動、把情緒消化完再談',
    '一頓好吃的、一個擁抱這種身體上的安撫',
    '把事情好好聊開、說清楚',
    '被抱住、確認你還在',
    '一句「你對我很重要」的肯定',
    '具體的道歉與改進做法',
    '溫和的語氣與公平的解決方式',
    '完全的坦白與真心話',
    '一點空間，再用輕鬆的方式和好',
    '自己消化的時間，之後看到你的行動',
    '被尊重的空間，以及平靜的對話',
    '溫柔的陪伴與被理解',
];

const VENUS_TRAIT: Twelve = [
    '用直接追求、熱烈表示來愛人，最喜歡被主動追，需要一點新鮮與挑戰',
    '用陪伴、美食與實際照顧來愛人，需要穩定的身體親近與安全感',
    '用聊天、分享新鮮事來愛人，被聽懂就覺得被愛',
    '用照顧與家的感覺來愛人，需要被細心呵護',
    '用大方寵愛與讚美來愛人，需要被當成特別的人',
    '用行動與小細節來愛人，被記住小需要就很感動',
    '用浪漫的氛圍與體貼來愛人，需要被溫柔對待',
    '用全心投入與深度連結來愛人，需要百分之百的信任',
    '用一起探險、學習來愛人，需要自由與一起成長',
    '用承諾與長期規劃來愛人，看重說到做到，表達含蓄卻很可靠',
    '用朋友般的尊重來愛人，需要保有自己的空間',
    '用浪漫付出與心靈相通來愛人，需要被溫柔理解',
];

const MOON_SAFE: Twelve = [
    '能直接表達、不被壓抑',
    '規律的作息與熟悉的環境',
    '隨時能聊、能分享',
    '有家的感覺、被需要',
    '被欣賞、被放在心上',
    '生活井然有序',
    '關係和諧、氣氛溫和',
    '被完全信任、彼此忠誠',
    '有自由、對未來有希望',
    '掌控感與可預期的未來',
    '被尊重的獨立空間',
    '溫柔、不被批判的氛圍',
];

/** Scenes per element pair; key "i|j" with i <= j; phrase(p = element i holder, q = element j holder). */
type ElementScenes = Record<string, Phrase>;

const PERSONA_SCENE: ElementScenes = {
    '0|0': () =>
        '兩人都是火象，熱情、行動快，決定吃什麼、去哪玩常常三秒定案，在一起很少無聊；兩人都想帶頭時，輪流掌舵就好。',
    '1|1': () =>
        '兩人都是土象，重實際、守承諾，存錢、規劃、照顧家都很合拍，是能一起把日子過穩的組合；偶爾安排一點計畫外的小冒險，生活會更有滋味。',
    '2|2': () =>
        '兩人都是風象，愛聊天、重朋友，一起看展、聽講座、跟朋友聚會都開心，永遠有話可說；感受上來時，也試試停下來聊聊心裡的感覺。',
    '3|3': () =>
        '兩人都是水象，感受細膩、重情義，常不必說就懂對方的心情，是很深的心靈伴侶；低落時由狀態好的一方先拉對方出門走走。',
    '0|1': (f, e) =>
        `${f}是火象，想到就想出發；${e}是土象，會先確認預算和細節。一起安排旅行時，${f}丟點子、${e}負責落地，正好互補：${f}讓生活有冒險，${e}讓冒險有著落。節奏對不上時，就是該分工的訊號。`,
    '0|2': (f, a) =>
        `${f}是火象、${a}是風象，一個有衝勁、一個有點子，臨時報名活動、說走就走去夜市都很對味，在一起總有新鮮事；開了頭的事，記得一起收尾。`,
    '0|3': (f, w) =>
        `${f}是火象，直接、熱烈；${w}是水象，細膩、重氛圍。${f}的熱情能把${w}從心事裡拉出來，${w}的溫柔讓${f}學會慢下來感受。${f}說話時多看一眼${w}的表情，${w}有在意的事直接說，兩人就能互相成全。`,
    '1|2': (e, a) =>
        `${e}是土象，重實際；${a}是風象，重想法。${a}帶來新鮮的點子和視野，${e}讓生活有底、讓點子成真。週末一人想看展、一人想整理家裡時，一人決定一半的行程就好。`,
    '1|3': (e, w) =>
        `${e}是土象、${w}是水象，一個用行動照顧、一個用感受連結，很容易過出安穩又溫暖的小日子；${e}偶爾把心意說出口，${w}把不安講具體，默契會更深。`,
    '2|3': (a, w) =>
        `${a}是風象，習慣用道理看事情；${w}是水象，先感覺再說。磨合好了，${a}的冷靜是${w}情緒翻湧時的錨，${w}則讓${a}的生活多了溫度。${w}心情不好時，先問一句「你要建議還是要陪伴」，就能少很多誤會。`,
};

const THINK_SCENE: ElementScenes = {
    '0|0': () => '兩人的水星都是火象，想到就說、決定很快，討論常變成熱烈的腦力激盪；輪流把話說完，點子會更完整。',
    '1|1': () => '兩人的水星都是土象，做決定看數字與可行性，買大東西前會一起比價、看評價，很少後悔；新點子出現時，也給它一點機會。',
    '2|2': () => '兩人的水星都是風象，能從新聞一路聊到哲學，跟對方說話永遠不悶；做決定時給自己設個期限，就不會一直討論下去。',
    '3|3': () => '兩人的水星都是水象，判斷常靠直覺，很能聽懂彼此的弦外之音；意見不同時，記得多聽內容、少猜語氣。',
    '0|1': (f, e) =>
        `${f}的水星是火象，靠直覺很快做決定；${e}的水星是土象，要資料、要時間。${f}的直覺抓得住機會，${e}的謹慎避得開坑，像決定要不要搬家，一個看見可能、一個看見細節。先講好「什麼時候定案」，兩人都安心。`,
    '0|2': (f, a) =>
        `${f}的水星是火象、${a}的是風象，想法都轉得快，一起構想計畫很有火花；${f}想立刻做、${a}還想多比較時，先定個試做的小步驟。`,
    '0|3': (f, w) =>
        `${f}的水星是火象，說話直接、重結論；${w}的是水象，說話繞著感受。${f}能幫猶豫的${w}下決定，${w}也常察覺${f}沒注意到的人情細節，是很實用的互補。重要的話題，${f}放慢一點，${w}直接點出真正在意的事。`,
    '1|2': (e, a) =>
        `${e}的水星是土象，要具體步驟；${a}的是風象，喜歡先討論各種可能。規劃旅行時，${a}列出十個景點，${e}會問「交通怎麼接」——一個發想、一個篩選，合起來就是很好的計畫，分成兩個步驟來做就好。`,
    '1|3': (e, w) =>
        `${e}的水星是土象，靠事實與經驗判斷；${w}的是水象，靠直覺與感受。${w}的直覺常常很準，${e}的查證則能避免誤判，兩人一起看人、看事很少看走眼。`,
    '2|3': (a, w) =>
        `${a}的水星是風象，用邏輯與比較思考；${w}的是水象，先感覺對不對。一個看道理、一個看人心，兩種思考加起來特別周全；討論時先說感受、再談方法，就很順。`,
};

const FIGHT_SCENE: ElementScenes = {
    '0|0': () =>
        '兩人的火星都是火象，有話直說，鬧彆扭來得快去得也快，很少隔夜；情緒上來時先各自冷靜五分鐘，說出口的話會更溫柔。',
    '1|1': () =>
        '兩人的火星都是土象，都不輕易起衝突，相處平穩；真的意見不同時，把爭點拆成具體可交換的條件，很快就能鬆動。',
    '2|2': () =>
        '兩人的火星都是風象，意見不同時多半用說的、講道理，很少冷戰；講完道理後補一句關心，感情會更貼近。',
    '3|3': () =>
        '兩人的火星都是水象，都很顧及對方的感受，很少說出傷人的重話；不舒服時可能都在等對方先開口，約好「不舒服 24 小時內要說」就好。',
    '0|1': (f, e) =>
        `${f}的火星是火象，有話當場說；${e}的是土象，習慣先忍一忍。一個敢把問題攤開、一個穩得住局面，其實很互補。${f}說完就沒事時，給${e}一點消化的時間；${e}也試著早點說，別讓小事累積。`,
    '0|2': (f, a) =>
        `${f}的火星是火象、${a}的是風象，意見不同時一個有熱度、一個反應快，好處是講開就散，很少悶著；記得討論的是事情，不是人。`,
    '0|3': (f, w) =>
        `${f}的火星是火象，想當下說開；${w}的是水象，受傷時會先安靜下來。${f}願意面對問題，${w}聽得出話底下的委屈，兩人合起來能把事情談到真正的重點。${f}先降低音量，${w}說好什麼時候回來談，節奏就對上了。`,
    '1|2': (e, a) =>
        `${e}的火星是土象，處理分歧要具體的改法；${a}的是風象，習慣講道理、分析。${a}把問題說清楚，${e}把結論落實，分工對了反而很有效率；談完寫下一條具體約定，兩人都踏實。`,
    '1|3': (e, w) =>
        `${e}的火星是土象、${w}的是水象，都不愛正面衝突，平常日子很平靜、很少爭吵。小小的不舒服容易各自放著，誰先把話溫柔地講白，誰就幫了這段關係一把。`,
    '2|3': (a, w) =>
        `${a}的火星是風象，意見不同時很理性；${w}的是水象，感受很滿。${a}的冷靜能幫爭執降溫，${w}的感受則提醒${a}問題真正卡在哪。${a}先承認對方的感受，${w}再聽${a}的理由，就能一起找到出口。`,
};

const LOVE_SCENE: ElementScenes = {
    '0|0': () => '兩人的金星都是火象，愛要熱烈、要表現，驚喜約會、說走就走的旅行最對味，感情很有活力；熱度平穩時，輪流主動再點燃。',
    '1|1': () => '兩人的金星都是土象，愛是陪伴與實際照顧，一起吃好吃的、把家佈置舒服就很幸福；偶爾把甜話說出口，對方會很驚喜。',
    '2|2': () => '兩人的金星都是風象，愛是聊得來、有新鮮感，一起逛書店、看展、跟朋友聚會就很開心；也留一些只屬於兩人的時間。',
    '3|3': () => '兩人的金星都是水象，愛是情感交融與被懂，一個眼神、一首歌就能心意相通；想確認時直接問一句，比猜更安心。',
    '0|1': (f, e) =>
        `${f}的金星是火象，愛是熱情與驚喜；${e}的是土象，愛是穩定與實際照顧。${f}讓${e}的日子多了心跳，${e}讓${f}的熱情有地方落地。紀念日一個想臨時出遊、一個想吃頓好的時，輪流照對方的方式過就好。`,
    '0|2': (f, a) =>
        `${f}的金星是火象、${a}的是風象，兩人都愛新鮮，一起探索新餐廳、新活動很有戀愛感；偶爾也安排一個慢慢的、靜靜陪伴的晚上。`,
    '0|3': (f, w) =>
        `${f}的金星是火象，用熱烈的行動示愛；${w}的是水象，要的是情感上被懂。${f}的熱烈能把${w}從心事裡拉出來，${w}的細膩讓${f}的愛多了深度。${f}想去熱鬧的地方慶祝、${w}想安靜吃頓飯時，兩種都排進行程。`,
    '1|2': (e, a) =>
        `${e}的金星是土象，愛是陪伴與實際照顧；${a}的是風象，愛是聊天與新鮮感。${a}帶${e}出門透氣，${e}讓${a}有個安穩的地方可以回來。可以一週安排一次「${a}的出門日」、一次「${e}的在家日」。`,
    '1|3': (e, w) =>
        `${e}的金星是土象，用做的表達愛（接送、煮飯、修東西）；${w}的是水象，用感受表達愛。兩人都很顧家，是溫暖踏實的組合；${e}偶爾把心意說出來，${w}也記得看見${e}默默做的事。`,
    '2|3': (a, w) =>
        `${a}的金星是風象，愛需要空間與對話；${w}的是水象，愛需要親近與融合。這組很會互相補位：${w}讓${a}學會靠近，${a}讓${w}有呼吸的空間。需要獨處時說一句「我需要空間，不是不愛你」，就不會被誤會。`,
};

function elementOf(sign: number): number {
    return sign % 4;
}

function sceneFor(table: ElementScenes, signA: number, signB: number, a: string, b: string): string {
    const ea = elementOf(signA);
    const eb = elementOf(signB);
    return ea <= eb ? table[`${ea}|${eb}`](a, b) : table[`${eb}|${ea}`](b, a);
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
    if (deg < 7.5) return { text: `月亮可能在${SIGN_NAMES[(m.sign + 11) % 12]}或${m.signName}（出生時間不確定）`, sign: m.sign };
    if (deg > 22.5) return { text: `月亮可能在${m.signName}或${SIGN_NAMES[(m.sign + 1) % 12]}（出生時間不確定）`, sign: m.sign };
    return { text: `月亮大致在${m.signName}（出生時間不確定，以當天位置推估）`, sign: m.sign };
}

function findAspect(syn: AstroSynastry, x: SynastryPointKey, y: SynastryPointKey): InterAspect[] {
    return syn.aspects.filter((s) => pairId(s.a, s.b) === pairId(x, y));
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
const BOND_PAIRS = new Set([pairId('sun', 'moon'), pairId('venus', 'mars'), pairId('moon', 'venus')]);

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
    const difficult = coreTense >= 3 && coreSoft <= 1 && !bond && (saturnHard >= 1 || coreTense >= 5);
    return { difficult, coreTense, coreSoft, saturnHard, bond };
}

function difficultyLine(fit: AstroFit): string {
    const saturn = fit.saturnHard > 0 ? `，另有 ${fit.saturnHard} 組土星的緊張接觸` : '';
    return `【先說在前面】\n坦白說，這兩張盤在核心相位上比較不合：太陽、月亮、金星、火星與上升之間有 ${fit.coreTense} 組張力相位、只有 ${fit.coreSoft} 組和諧相位${saturn}，日月、金火、月金之間也沒有順向的連結。\n這代表兩人的生活節奏、表達愛與處理情緒的方式差異很大，相處會比多數伴侶更費力，以下的挑戰請認真看待。\n這不是判決，很多伴侶也是在這樣的盤上走出來的，前提是兩人都願意有意識地投入。`;
}

/** One-line daily tag for an aspect already explained under 重點相位, worded for the theme. */
function dailyAspectLines(
    syn: AstroSynastry,
    a: AstroPartner,
    b: AstroPartner,
    pairs: [SynastryPointKey, SynastryPointKey][],
    tag: Record<Family, string[]>,
    difficult: boolean,
): string[] {
    // Rotate through the variants so two aspects of the same family never get the same tag.
    const used: Record<Family, number> = { conj: 0, soft: 0, hard: 0 };
    return pairs.flatMap(([x, y]) =>
        findAspect(syn, x, y).flatMap((s) => {
            const fam = familyOf(s.type);
            const text = tag[fam][used[fam]++ % tag[fam].length];
            const head = `・相位加碼：${a.name}的${POINT_NAMES[s.a]}${s.name}${b.name}的${POINT_NAMES[s.b]}——${text}`;
            // Key pairs are explained under 重點相位; others may not be listed, so say it here.
            if (s.key) return [`${head}（說明見「重點相位」）。`];
            const n = aspectNote(s, a, b, difficult).text;
            return [`${head}。`, `${n}${n.endsWith('。') ? '' : '。'}`];
        }),
    );
}

export function dailyLifeLines(a: AstroPartner, b: AstroPartner, syn: AstroSynastry): string[] {
    const lines: string[] = [];
    const fit = astroFit(syn);
    const hard = fit.difficult;
    if (hard) lines.push(difficultyLine(fit));
    const sunA = bodyOf(a, 'sun');
    const sunB = bodyOf(b, 'sun');

    // 個性
    if (sunA && sunB) {
        lines.push(
            '【個性】',
            `${a.name}太陽在${sunA.signName}：${SUN_TRAIT[sunA.sign]}。`,
            `${b.name}太陽在${sunB.signName}：${SUN_TRAIT[sunB.sign]}。`,
            sceneFor(PERSONA_SCENE, sunA.sign, sunB.sign, a.name, b.name),
        );
    }
    const ascLine = (p: AstroPartner) =>
        p.chart.angles && !p.chart.timeUnknown
            ? `${p.name}上升${p.chart.angles.asc.signName}，初見面給人${ASC_TRAIT[p.chart.angles.asc.sign]}的感覺`
            : `${p.name}的出生時間不確定，上升無法判斷`;
    lines.push(`第一印象：${ascLine(a)}。`, `${ascLine(b)}。`);

    // 思考方式
    const merA = bodyOf(a, 'mercury');
    const merB = bodyOf(b, 'mercury');
    if (merA && merB) {
        lines.push(
            '【思考方式】',
            `${a.name}水星在${merA.signName}：${MERCURY_TRAIT[merA.sign]}。`,
            `${b.name}水星在${merB.signName}：${MERCURY_TRAIT[merB.sign]}。`,
            sceneFor(THINK_SCENE, merA.sign, merB.sign, a.name, b.name),
            ...dailyAspectLines(
                syn,
                a,
                b,
                [
                    ['mercury', 'mercury'],
                    ['mercury', 'saturn'],
                    ['mercury', 'mars'],
                ],
                {
                    conj: ['說話頻率很接近，一開口就接得上', '一開口就有分量，彼此都聽得很認真'],
                    soft: ['討論起來順，是溝通的一大助力', '想法接得上，常聊出新點子', '一個說、一個接，對話很少冷場'],
                    hard: [
                        '說話時偶爾卡住，也正好逼兩人把話講得更清楚',
                        '意見常不同，談完的結論通常比各想各的周全',
                        '想法常碰撞，碰出來的火花也常是好點子',
                    ],
                },
                hard,
            ),
        );
    }

    // 處理矛盾
    const marsA = bodyOf(a, 'mars');
    const marsB = bodyOf(b, 'mars');
    const moonA = moonLabel(a);
    const moonB = moonLabel(b);
    if (marsA && marsB) {
        lines.push(
            '【處理矛盾】',
            `${a.name}火星在${marsA.signName}：${MARS_TRAIT[marsA.sign]}。`,
            `${b.name}火星在${marsB.signName}：${MARS_TRAIT[marsB.sign]}。`,
            sceneFor(FIGHT_SCENE, marsA.sign, marsB.sign, a.name, b.name),
        );
        if (moonA && moonB)
            lines.push(
                `和好的鑰匙：${a.name}${moonA.text}，需要${MOON_REPAIR[moonA.sign]}。`,
                `${b.name}${moonB.text}，需要${MOON_REPAIR[moonB.sign]}。`,
            );
        lines.push(
            ...dailyAspectLines(
                syn,
                a,
                b,
                [
                    ['mars', 'mars'],
                    ['moon', 'mars'],
                    ['mars', 'saturn'],
                    ['moon', 'saturn'],
                ],
                {
                    conj: ['一碰就有火花，熱情和脾氣出自同一處', '情緒來得又近又快，好處是很少悶著'],
                    soft: ['意見不同時有緩衝，和好不難', '鬧彆扭也容易和好，和好後記得把事情談完'],
                    hard: [
                        '這裡最需要耐心，也是兩人最在意彼此的地方',
                        '同一件事可能反覆出現，每談開一次就更懂對方的底線',
                        '節奏不同時容易互相催促，慢慢磨合的伴侶通常更懂得收放',
                    ],
                },
                hard,
            ),
        );
    }

    // 感受親密及愛
    const venA = bodyOf(a, 'venus');
    const venB = bodyOf(b, 'venus');
    if (venA && venB) {
        lines.push(
            '【感受親密與愛】',
            `${a.name}金星在${venA.signName}，${VENUS_TRAIT[venA.sign]}。`,
            `${b.name}金星在${venB.signName}，${VENUS_TRAIT[venB.sign]}。`,
            sceneFor(LOVE_SCENE, venA.sign, venB.sign, a.name, b.name),
        );
        if (moonA && moonB)
            lines.push(
                `讓人安心的來源：${a.name}${moonA.text}，安心來自${MOON_SAFE[moonA.sign]}。`,
                `${b.name}${moonB.text}，安心來自${MOON_SAFE[moonB.sign]}。`,
            );
        lines.push(
            ...dailyAspectLines(
                syn,
                a,
                b,
                [
                    ['venus', 'mars'],
                    ['moon', 'venus'],
                    ['moon', 'moon'],
                    ['sun', 'moon'],
                    ['venus', 'saturn'],
                ],
                {
                    conj: ['親密感很強，彼此靠得很近', '靠得很近，也記得留一點各自的空間'],
                    soft: ['讓親近變得自然，是很溫暖的連結', '溫度穩定，相處讓人安心', '彼此照顧得順手，偶爾說出口會更甜'],
                    hard: ['愛的方式需要對準，對準之後吸引力格外持久', '心意都在，只是常送往不同方向；說清楚就能接住'],
                },
                hard,
            ),
        );
    }
    return lines;
}

// ---------------------------------------------------------------------------
// 這段關係的禮物 — what is most precious, built from this pair's own data.
// ---------------------------------------------------------------------------

/** What a contact gives the two of them, regardless of family. p/q as in PAIR_NOTES. */
const GIFT: Record<string, Phrase> = {
    [noteKey('sun', 'moon')]: (p, q) => `${p}的方向和${q}的心接得上，一個往前走，一個讓前進有家可回`,
    [noteKey('sun', 'sun')]: () => `兩人的人生方向能彼此照見，常在對方身上看見自己想成為的樣子`,
    [noteKey('moon', 'moon')]: () => `生活節奏裡那種不用說的懂，回到家就能放鬆`,
    [noteKey('venus', 'mars')]: (p, q) => `一份真實的吸引力，${q}的主動與${p}的回應讓心動一直都在`,
    [noteKey('sun', 'venus')]: (p, q) => `${q}真心欣賞${p}本來的樣子，在${q}眼裡，${p}很可愛`,
    [noteKey('moon', 'venus')]: (p, q) => `${q}知道怎麼疼${p}，${p}在這段關係裡被溫柔地照顧著`,
    [noteKey('venus', 'venus')]: () => `喜歡的東西彼此加分，能一起把日子過得有味道`,
    [noteKey('sun', 'mars')]: (p, q) => `${q}的行動力推著${p}的目標往前，兩人是能一起把事做成的隊友`,
    [noteKey('moon', 'mars')]: (p, q) => `${q}護著${p}，${p}也能讓${q}的火氣柔下來，關係很有溫度`,
    [noteKey('asc', 'sun')]: (p, q) => `${q}看得見${p}的好，兩人走在一起很有光`,
    [noteKey('asc', 'moon')]: (p, q) => `${q}在${p}身邊很快就能放鬆，像回到熟悉的地方`,
    [noteKey('asc', 'venus')]: (p, q) => `${q}對${p}有自然的好感，一見面就喜歡`,
    [noteKey('mercury', 'mercury')]: () => `聊得來，想法碰在一起常激出新的點子`,
    [noteKey('mercury', 'moon')]: (p, q) => `${p}的話說得進${q}心裡，${q}心煩時知道可以找誰`,
    [noteKey('mercury', 'venus')]: (p, q) => `${p}說的話讓${q}覺得被欣賞，聊天就有戀愛感`,
    [noteKey('mercury', 'mars')]: (p, q) => `${p}想、${q}做，點子在兩人手裡很少只停在嘴上`,
    [noteKey('mercury', 'sun')]: (p, q) => `${p}懂${q}在想什麼，是${q}難得的知音`,
    [noteKey('mars', 'mars')]: () => `並肩做事很有勁，是能一起扛事的搭檔`,
    [noteKey('saturn', 'sun')]: (p, q) => `${p}是${q}可以靠的人，${q}在${p}身邊越來越踏實`,
    [noteKey('saturn', 'moon')]: (p, q) => `${p}給${q}「有人會一直在」的安定，這份陪伴經得起時間`,
    [noteKey('saturn', 'mercury')]: (p, q) => `${p}認真對待${q}的想法，讓${q}的點子落地成真`,
    [noteKey('saturn', 'venus')]: (p) => `${p}的愛說到做到，兩人之間有難得的忠誠與承諾`,
    [noteKey('saturn', 'mars')]: (p, q) => `${q}的衝勁加上${p}的耐性，能把事情做得又快又穩`,
    [noteKey('saturn', 'asc')]: (p, q) => `${p}讓${q}覺得可靠，是遇到事會想找的人`,
};

function giftOf(s: InterAspect, a: AstroPartner, b: AstroPartner): string | null {
    const direct = GIFT[noteKey(s.a, s.b)];
    if (direct) return direct(a.name, b.name);
    const flipped = GIFT[noteKey(s.b, s.a)];
    return flipped ? flipped(b.name, a.name) : null;
}

const ELEMENT_NAMES = ['火', '土', '風', '水'];

/** What the two Sun elements give each other. */
function elementGift(a: AstroPartner, b: AstroPartner): string | null {
    const sa = bodyOf(a, 'sun');
    const sb = bodyOf(b, 'sun');
    if (!sa || !sb) return null;
    const ea = elementOf(sa.sign);
    const eb = elementOf(sb.sign);
    if (ea === eb)
        return `兩人的太陽同屬${ELEMENT_NAMES[ea]}象，看重的東西很像，很多事不用解釋，對方就懂`;
    const pair = [ea, eb].sort().join('|');
    if (pair === '0|2' || pair === '1|3')
        return `${a.name}的${ELEMENT_NAMES[ea]}象太陽與${b.name}的${ELEMENT_NAMES[eb]}象太陽天生互相助長，${pair === '0|2' ? '一個給點子、一個給熱度，在一起總是越聊越有勁' : '一個給踏實、一個給溫度，能一起把日子過得安穩又暖'}`;
    return `${a.name}是${ELEMENT_NAMES[ea]}象、${b.name}是${ELEMENT_NAMES[eb]}象，各自帶來對方身上沒有的東西，兩人在一起，生活的樣貌比一個人時完整`;
}

const GIFT_HOUSES = new Set([4, 5, 7]);
const GIFT_BODIES = new Set<AstroBodyKey>(['sun', 'moon', 'venus', 'jupiter']);

/** A warm house overlay (Sun / Moon / Venus / Jupiter in the 4th, 5th or 7th), if any. */
function overlayGift(a: AstroPartner, b: AstroPartner, syn: AstroSynastry): string | null {
    const o = syn.overlays.find((x) => GIFT_BODIES.has(x.body) && GIFT_HOUSES.has(x.house));
    if (!o) return null;
    const [src, dst] = o.from === 'a' ? [a, b] : [b, a];
    const special = OVERLAY_SPECIAL[`${o.body}|${o.house}`];
    const text = special
        ? special(src.name, dst.name)
        : `${src.name}${OVERLAY_ROLE[o.body]}${HOUSE_SCENE[o.house](src.name, dst.name)}`;
    return `${src.name}的${BODY_NAMES[o.body]}落在${dst.name}的第 ${o.house} 宮，${text}`;
}

/** What a clearly difficult pair needs, from its tense core / Saturn contacts; lower = said first. */
function needOf(s: InterAspect): [number, string] {
    const has = (k: SynastryPointKey) => s.a === k || s.b === k;
    if (pairId(s.a, s.b) === pairId('sun', 'moon')) return [0, '追目標時也照顧對方的心情'];
    if (has('venus')) return [1, '把想要的愛說清楚而不靠猜'];
    if (has('moon')) return [2, '情緒上來時先停一下再談'];
    if (has('saturn')) return [3, '土星一方多肯定、少糾正'];
    if (has('mars') || pairId(s.a, s.b) === pairId('sun', 'sun')) return [4, '把較勁變成合作'];
    if (has('asc')) return [5, '多給彼此認識的時間'];
    return [6, '多一點耐心與明確的溝通'];
}

function giftItem(a: AstroPartner, b: AstroPartner, syn: AstroSynastry, fit: AstroFit): MeaningItem {
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
    const gifts = [...new Set(warm.map((s) => giftOf(s, a, b)).filter((g): g is string => g !== null))];

    if (fit.difficult) {
        const tense = syn.aspects.filter(
            (s) =>
                familyOf(s.type) === 'hard' &&
                ((CORE.has(s.a) && CORE.has(s.b)) || s.a === 'saturn' || s.b === 'saturn'),
        );
        const needs = [...new Set(tense.map(needOf).sort((x, y) => x[0] - y[0]).map((n) => n[1]))].slice(0, 3);
        sentences.push(
            `坦白說，要讓這段關係走得好，${a.name}和${b.name}需要${needs.map((n) => `「${n}」`).join('、')}，而且要持續練習；這比多數伴侶多花心力，但做得到。`,
        );
        const first = gifts[0] ?? (warm[0] ? `${a.name}的${POINT_NAMES[warm[0].a]}與${b.name}的${POINT_NAMES[warm[0].b]}形成${warm[0].name}，在${bothFunctions(warm[0])}上有天生的默契` : null);
        if (first) sentences.push(`同時，你們之間也有真實而值得珍惜的東西：${first}。`);
        const el = elementGift(a, b);
        if (el) sentences.push(`${first ? '另外，' : '值得珍惜的是，'}${el}。`);
        return item(
            '這段關係的課題與禮物',
            '誠實說出這段關係需要的功課，也記下兩人之間真實的好。',
            sentences.join('\n'),
        );
    }

    if (gifts[0]) sentences.push(`${a.name}和${b.name}之間最珍貴的，是${gifts[0]}。`);
    else {
        // Nothing easy among the named pairs: the tightest contact is still a gift, earned together.
        const tight = syn.aspects.map((s) => giftOf(s, a, b)).find((g): g is string => g !== null);
        if (tight) sentences.push(`${a.name}和${b.name}之間最珍貴的，是一份要一起磨才拿得到、卻很真實的連結：${tight}。`);
    }
    if (gifts[1]) {
        if (sentences.length > 0) sentences[sentences.length - 1] += `還有，${gifts[1]}。`;
        else sentences.push(`${gifts[1]}。`);
    }
    const extra = overlayGift(a, b, syn) ?? (gifts[1] ? null : elementGift(a, b));
    if (extra) sentences.push(`${extra}。`);
    if (sentences.length < 2) {
        const el = elementGift(a, b);
        if (el && !sentences.includes(`${el}。`)) sentences.push(`${el}。`);
    }
    if (sentences.length === 0) sentences.push(`${a.name}和${b.name}之間的影響溫和，關係的樣子會由兩人親手寫成，這本身就是一份自由。`);
    return item('這段關係的禮物', '從兩人最順的相位、元素與宮位，整理這段關係最珍貴的地方。', sentences.slice(0, 3).join('\n'));
}

export function astroSynastryItems(a: AstroPartner, b: AstroPartner, syn: AstroSynastry): MeaningItem[] {
    const items: MeaningItem[] = [];
    const caveat = caveatLine(a, b);
    const fit = astroFit(syn);
    const key = syn.aspects.filter((x) => x.key);
    const rest = syn.aspects.filter((x) => !x.key);
    const seenTypes = new Set<AspectType>();

    items.push(
        item(
            '重點相位',
            '合盤最常看的幾組：日月、金火、月月、水水、日金、上升，以及土星與個人行星的接觸。',
            [
                ...(key.length > 0
                    ? key.map((x) => {
                          const first = !seenTypes.has(x.type);
                          seenTypes.add(x.type);
                          return aspectLine(x, a, b, first, fit.difficult);
                      })
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
                ? shown.map((x) => aspectLine(x, a, b, false, fit.difficult)).join('\n')
                : '其餘行星之間沒有主要相位。',
        ),
    );

    const total = syn.harmonious + syn.tense + syn.conjunctions;
    const balance = fit.difficult
        ? '張力相位集中在太陽、月亮、金星、火星這些最影響日常相處的點上，摩擦會比較明顯，也比較常出現；這組合需要兩人都願意多溝通、多體諒，才能把差異變成互相成長的力量。'
        : total === 0
          ? '兩盤之間幾乎沒有主要相位，彼此的影響溫和，關係的樣子更多由兩人親手經營，自由度很高。'
          : syn.harmonious > syn.tense * 1.5
            ? '和諧相位明顯較多，相處起來順、少摩擦，是很舒服的組合；偶爾一起挑戰新事物，會讓這份順更有活力。'
            : syn.tense > syn.harmonious * 1.5
              ? '張力相位較多，兩人之間有很強的火花與成長力量，彼此都會因對方而改變；多一點溝通與包容，這股力量就會往好的方向走。'
              : '和諧與張力相位大致平衡，既有默契，也有互相推動的力量；順的時候好好享受，卡的時候正是一起長大的機會。';
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
            ...list.map((o) => {
                const special = OVERLAY_SPECIAL[`${o.body}|${o.house}`];
                const text = special
                    ? special(src.name, dst.name)
                    : `${src.name}${OVERLAY_ROLE[o.body]}${HOUSE_SCENE[o.house](src.name, dst.name)}${OVERLAY_TWIST[o.body]}`;
                return `${KEY_HOUSES.has(o.house) ? '★ ' : ''}${BODY_NAMES[o.body]} → 第 ${o.house} 宮（${HOUSE_AREA[o.house]}）：${text}。`;
            }),
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

    items.push(
        item(
            '日常相處',
            '從太陽、上升看個性，水星看思考方式，火星與月亮看怎麼溝通分歧與和好，金星與月亮看怎麼感受愛。以下是生活中可能出現的場景。',
            [...dailyLifeLines(a, b, syn), caveat].filter(Boolean).join('\n'),
        ),
    );

    items.push(item('相處建議', '依相位與宮位整理的提醒。', adviceLines(a, b, syn, fit).join('\n')));
    items.push(giftItem(a, b, syn, fit));
    return items;
}

function bothFunctions(s: InterAspect): string {
    return s.a === s.b ? `雙方的${functionOf(s.a)}` : `${functionOf(s.a)}與${functionOf(s.b)}`;
}

function adviceLines(a: AstroPartner, b: AstroPartner, syn: AstroSynastry, fit: AstroFit): string[] {
    const lines: string[] = [];
    const fams = (x: SynastryPointKey, y: SynastryPointKey) => new Set(findAspect(syn, x, y).map((s) => familyOf(s.type)));

    if (fit.difficult)
        lines.push(
            '這組合盤需要比較多的經營，三個實際的做法：一、每週固定一次不滑手機的對話時間，把這週卡住的事說出來；二、事先約好吵架的規則（不翻舊帳、需要時可以喊暫停、24 小時內回來談）；三、如果同樣的問題反覆出現，考慮一起找伴侶諮商，這是投資，不是失敗。',
        );

    const easy = syn.aspects.filter((s) => s.type === 'trine' || s.type === 'sextile').slice(0, 1);
    for (const s of easy)
        lines.push(
            `最緊的和諧相位落在${a.name}的${POINT_NAMES[s.a]}與${b.name}的${POINT_NAMES[s.b]}（${s.name}），在${bothFunctions(s)}上有天生的默契，是兩人隨時可以回去充電的地方；偶爾說聲謝謝，讓對方知道你看見了。`,
        );
    const sm = fams('sun', 'moon');
    if (sm.has('hard'))
        lines.push('日月有張力，也正因如此兩人不會停在舒適圈裡；一人談目標時，另一人可能在等被關心，重要決定前先問一句「這對你的心情有什麼影響」。');
    else if (sm.size > 0) lines.push('日月有連結，彼此的核心需求很容易被看見，是很難得的基礎；把這份默契說出口，它會越來越深。');
    const vm = fams('venus', 'mars');
    if (vm.has('hard')) lines.push('金火有張力，吸引力強而持久；親密需求用說的，比賭氣或等對方猜更有效。');
    else if (vm.size > 0) lines.push('金火有連結，吸引力是這段關係的燃料；激情之外，也經營日常的小溫柔。');
    if (fams('moon', 'moon').has('hard'))
        lines.push('月亮之間節奏不同，同住前可以聊聊作息、整潔標準與「累的時候需要什麼」，講開的差異比沒講的默契更可靠。');
    if (fams('mercury', 'mercury').has('hard'))
        lines.push('水星之間思路不同，正好互相補漏；重要的事用「我聽到的是……對嗎？」確認一次就好。');
    const sat = syn.aspects.find((s) => s.key && (s.a === 'saturn' || s.b === 'saturn'));
    if (sat) {
        const satName = sat.a === 'saturn' ? a.name : b.name;
        const other = sat.a === 'saturn' ? b.name : a.name;
        lines.push(
            `有土星接觸（${satName}是土星的一方）：土星是長期關係的黏著劑，承諾感強、容易走得長久。${satName}多給肯定，${other}把感受說清楚，這份穩定就會變成兩人的靠山。`,
        );
    }
    const tight = syn.aspects.filter((s) => s.type === 'square' || s.type === 'opposition').slice(0, 1);
    for (const s of tight)
        lines.push(
            `${a.name}的${POINT_NAMES[s.a]}與${b.name}的${POINT_NAMES[s.b]}形成${s.name}，是兩人最緊的張力相位，牽動${bothFunctions(s)}；這裡最能刺激彼此成長，碰到相關話題時多給一點耐心，它就會變成你們的優勢。`,
        );
    lines.push(
        fit.difficult
            ? '合盤描述的是互動傾向，不是緣分的判決；比較不合的盤，代表需要更多有意識的努力，而不是注定走不下去。'
            : '合盤描述的是互動傾向，不是緣分的判決；你們已經擁有的默契值得珍惜，張力也可以透過理解變成成長。',
    );
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
    const moon = moonLabel(p);
    const moonNote = c.timeUnknown
        ? `\n- 出生時間不確定：未列入月亮相位${moon ? `；${moon.text.replace(/（[^）]*）$/, '')}，僅供參考` : ''}`
        : '';
    return `### ${p.name}
- 出生時刻（UTC）：${c.utc}；出生地：${c.placeName ?? '未提供'}${moonNote}
${asc}
${bodies}`;
}

export function buildAstroSynastryAiPrompt(a: AstroPartner, b: AstroPartner, syn: AstroSynastry): string {
    const fit = astroFit(syn);
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
    const unknown = [a, b].filter((p) => p.chart.timeUnknown).map((p) => p.name);
    const timeRule =
        unknown.length > 0
            ? `\n- ${unknown.join('、')}的出生時間不確定：上升與宮位不可用，月亮星座可能有誤差，涉及月亮的推論請標示為「可能」。`
            : '';

    return `請依下列兩人的西洋占星本命盤與比對盤（synastry）資料，用繁體中文（台灣用語）解讀兩人的關係。

解讀原則：
- 回歸黃道、地心座標；相位容許度：太陽／月亮 8°、行星 6°、交點／凱龍／上升 3°（取兩者較大者），已略過外行星彼此之間的同世代相位。
- 以日月、金火、月月、水水、上升與土星接觸為主軸，再看行星落入對方宮位。
- 每個相位都要依「哪兩顆星、誰的星、合／和諧／張力」具體說明，不要用同一段話套在不同相位上；土星接觸請說明土星一方與另一方各自的感受。${timeRule}
- 語氣以鼓勵、先講優點為主：每一段先寫兩人相處的優點與彼此給對方的珍貴之處，盡量具體（誰給了誰什麼、一個溫暖的生活畫面）；挑戰也要寫，但篇幅較短、語氣溫和，並當成成長點，附上可以實際做的小建議（例如「可以試試……」「當……時，……就能變成你們的優勢」）。優點與挑戰的篇幅大約 2:1。
- 避免嚴厲字眼（例如「衝突的熱點」「爆發」「冷處理」「情緒勒索」），在不失真的前提下改用溫和的說法；張力相位與土星接觸也要說出它帶來的吸引力、成長與承諾。${fit.difficult ? `\n- 注意：這組合盤的核心相位明顯偏向張力（太陽、月亮、金星、火星與上升之間張力 ${fit.coreTense} 組、和諧 ${fit.coreSoft} 組${fit.saturnHard > 0 ? `，土星緊張接觸 ${fit.saturnHard} 組` : ''}，日月、金火、月金之間沒有順向連結）。請誠實、尊重地說明兩人確實比較不合，挑戰的篇幅可以多於優點，並給具體可行的做法；仍要指出兩人之間真實且值得珍惜的部分，不要硬湊正面。` : ''}
- 這是星盤結構說明，不是緣分的判決；請給可對照生活的觀察與建議，避免恐嚇或保證。

## 兩人星盤
${chartBlock(a)}

${chartBlock(b)}

## 比對相位
${aspects}

## 宮位疊加
${overlays}

請先總覽兩人的吸引與互補，再依下列四個主題分段，每段都要比較兩人的差異，並各舉 2 個具體的日常場景（例如週末怎麼過、規劃旅行、吵架當下與吵完之後、紀念日怎麼過）。每段先寫兩人在這方面相處順利的優點，再用較短的篇幅寫可以一起成長的地方與小建議（優點約占三分之二）；請用自然的敘述，不要每段都套用「優點是…；缺點是…」的同一句型：
1. 個性：依兩人的太陽與上升星座（及元素），說明各自的性格與相處時的互補或摩擦。
2. 兩人思考方式：依水星星座與元素、水星之間及水星與土星／火星的相位，說明各自怎麼想事情、做決定，以及溝通時容易卡住的地方。
3. 處理矛盾的方法：依火星星座、火星與土星／月亮的相位，說明各自生氣與吵架的樣子；再依月亮星座說明吵完各自需要什麼才能和好。
4. 感受親密及愛的方式：依金星星座說明各自怎麼表達與接收愛，依月亮星座說明什麼讓各自安心，並參考金火、月金、月月、日月相位。
接著補充「成長課題」與「長期相處」，再給兩人各 3 條相處提醒；最後用 2–3 句寫「${fit.difficult ? '這段關係的課題與禮物' : '這段關係的禮物'}」：依兩人最緊的和諧相位、日月金星的接觸、元素互補或宮位疊加，說出兩人在一起最珍貴的地方${fit.difficult ? '，並誠實說明要讓這段關係走得好需要付出什麼' : ''}。`;
}
