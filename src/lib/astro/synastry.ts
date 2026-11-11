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
    trine: '三分相不費力就順，反而要留意把默契當成理所當然。',
    sextile: '六分相是「有機會」的順：不推就不太會動，多一點主動安排，效果會放大。',
    square: '四分相的摩擦多半出現在日常小事上、反覆發生，磨合過後最能互相推動。',
    opposition: '對分相像照鏡子：在對方身上看到自己缺的那一面，既吸引也拉扯，重點是找平衡而不是分輸贏。',
};

/** p = holder of the first planet in the note key, q = holder of the second. */
type Phrase = (p: string, q: string) => string;

interface PairNote {
    theme: string;
    conj: Phrase;
    soft: Phrase;
    hard: Phrase;
}

function noteKey(x: SynastryPointKey, y: SynastryPointKey): string {
    return `${x}>${y}`;
}

const PAIR_NOTES: Record<string, PairNote> = {
    [noteKey('sun', 'moon')]: {
        theme: '日月相位是合盤最重要的一組，看一人的人生方向能不能被另一人的情緒接住',
        conj: (p, q) =>
            `${p}做自己的樣子，正好是${q}情緒上需要的；${q}會本能地支持${p}的目標，兩人常有「就是你」的熟悉感。留意角色固定成${p}帶頭、${q}配合，連選餐廳這種小事也可以偶爾交換。`,
        soft: (p, q) =>
            `${p}想做的事，${q}多半直覺地支持；${q}心情低落時，${p}在身邊本身就是安定。小心「一切都好」變成不再聊真正的需要。`,
        hard: (p, q) =>
            `${p}追求的方向常無意間踩到${q}的情緒需求——例如${p}忙著衝刺工作，${q}卻需要被陪伴。${q}容易覺得不被看見，${p}則覺得被情緒牽絆；可這股拉扯也讓兩人沒辦法對彼此敷衍：${q}提醒${p}生活不只有目標，${p}帶${q}走出習慣的舒適圈。起摩擦時先分清楚是眼前這件事，還是舊的敏感點。`,
    },
    [noteKey('sun', 'sun')]: {
        theme: '日日相位反映兩人的人生方向與自我表現是否同調',
        conj: () => '兩人的核心動力相近，興趣與目標常一致，像同一隊的隊友；也容易同時想當主角，分好各自發光的舞台。',
        soft: () =>
            '價值方向接近，各自做自己時能互相欣賞、不搶光，一起做計畫很少為大方向吵；只是看事情的角度太像，彼此的盲點也差不多，重大決定不妨聽聽圈外人的意見。',
        hard: () =>
            '兩人想要的人生步調或表現方式不同，容易出現「為什麼你不能像我這樣做」的較勁；換個角度，對方正好示範了你沒走過的那條路，把差異當成兩種做法，而不是對錯。',
    },
    [noteKey('moon', 'moon')]: {
        theme: '月月相位反映生活習慣與情緒節奏，關乎住在一起舒不舒服',
        conj: () =>
            '情緒反應幾乎同步，吃飯、睡覺、窩在家的習慣很容易合拍；一起低潮時也可能互相放大，需要有一人先穩住。',
        soft: () =>
            '生活節奏與情緒需求順得來，住在一起舒服，不用多解釋就知道對方今天累了；舒服久了容易一起窩著不動，難開口的事也默契地繞過去。',
        hard: () =>
            '安全感的來源不同：可能一人想談、一人想靜，一人要熱鬧、一人要獨處。不是誰比較難搞，而是要事先講好「我不舒服時希望你怎麼做」——被迫把需要說清楚的伴侶，往往比靠默契的更懂得照顧彼此。',
    },
    [noteKey('venus', 'mars')]: {
        theme: '金火相位是吸引力與性張力的來源',
        conj: (p, q) =>
            `${q}會主動靠近、追求，${p}很享受被追的感覺，化學反應一開始就很明顯；只靠火花時，容易略過對需求與界線的溝通。`,
        soft: (p, q) =>
            `${q}的主動讓${p}覺得受歡迎而不是被逼，${p}的回應也讓${q}更有動力，熱度穩定；記得持續製造新鮮感，別讓順變成平淡。`,
        hard: (p, q) =>
            `吸引力強，步調卻常對不上：${q}想要快、直接，${p}想被慢慢對待、用自己的方式表達愛。情趣容易變成爭執，把「我想要的是什麼」說出口，比期待對方猜到有效。`,
    },
    [noteKey('sun', 'venus')]: {
        theme: '日金相位帶來欣賞與好感，容易覺得對方可愛',
        conj: (p, q) =>
            `${q}真心欣賞${p}本來的樣子，${p}在${q}面前容易放鬆、發光；兩人很會互相寵，寵久了也可能只挑好聽的說，${q}對${p}的不滿反而說不出口。`,
        soft: (p, q) =>
            `${q}喜歡${p}的個性，常主動稱讚、送小禮物或安排約會，${p}也樂於回報，相處甜而不膩；氣氛太好時，兩人都不想當破壞氣氛的那個，小問題容易被擱著。`,
        hard: (p, q) =>
            `${q}的喜好與${p}的作風有落差，例如${q}希望${p}多浪漫、多打扮，${p}卻覺得被要求改變；欣賞仍在，品味的落差也常把${p}帶去本來不會嘗試的地方，前提是接受兩人本來就不同。`,
    },
    [noteKey('moon', 'venus')]: {
        theme: '月金相位帶來溫柔與照顧，相處有安全感',
        conj: (p, q) =>
            `${q}的溫柔正好落在${p}的情緒需求上，${p}被照顧得很安心，是家常感最強的組合之一；${q}習慣當給的一方，久了可能忘了說自己也需要被照顧。`,
        soft: (p, q) =>
            `${q}自然知道怎麼讓${p}心情變好，一杯熱茶、一個擁抱就夠，關係的氣氛柔和；柔和到碰上錢、家人這類硬話題時，兩人可能都想粉飾過去。`,
        hard: (p, q) =>
            `${q}表達愛的方式不一定是${p}當下需要的——${q}送禮或安排約會，${p}其實只想被聽心事。好感都在，只是需要對準；一旦摸清楚，${q}會是最懂得怎麼疼${p}的人。`,
    },
    [noteKey('venus', 'venus')]: {
        theme: '金金相位反映審美、喜好與愛的方式是否相近',
        conj: () =>
            '喜好很接近，選餐廳、佈置房間、休閒方式很容易一致，一起逛街是享受；也因為想要的東西一樣，一起花錢、一起放縱時沒人踩煞車。',
        soft: () => '審美與享受的方式彼此加分，常會介紹對方喜歡上新的東西；兩人都偏向享受當下，繳費、存錢這類不浪漫的事容易一拖再拖。',
        hard: () =>
            '對「浪漫」「好品味」的標準不同，一人重實用、一人重氣氛，可能為紀念日怎麼過意見不合；輪流照對方的方式來，生活的樣貌反而比單一品味豐富。',
    },
    [noteKey('sun', 'mars')]: {
        theme: '日火相位帶來行動上的推動，也可能互相較勁',
        conj: (p, q) => `${q}會強烈推動${p}去做，兩人一起行動時效率很高；也容易在誰主導上擦出火花。`,
        soft: (p, q) =>
            `${q}的行動力支持${p}的目標，像好隊友、運動夥伴，一起完成事情很有成就感；太會一起做事，也可能把相處過成專案，忘了留一點什麼都不做的時間。`,
        hard: (p, q) =>
            `${q}的衝勁容易被${p}感受為挑戰或批評，兩人容易爭誰對誰錯；較勁也會逼出彼此的實力，把競爭心放到共同對外的目標上。`,
    },
    [noteKey('moon', 'mars')]: {
        theme: '月火相位帶來熱度與情緒的激發，容易一點就燃',
        conj: (p, q) =>
            `${q}的直接會很快點燃${p}的情緒——熱情也好、受傷也好；${q}保護欲強，說話時放慢語氣，${p}會更接得住。`,
        soft: (p, q) =>
            `${q}會保護${p}，${p}也能安撫${q}的火氣；兩人吵完通常很快就和好，快到有時根本問題還沒談就先翻篇了。`,
        hard: (p, q) =>
            `容易出現「${q}一逼、${p}一縮」的循環：${q}急著解決，${p}需要先被安撫，越逼越退。這組的熱度也是真的，${q}的直接常讓${p}敢把壓著的情緒說出來；約好一句暫停暗號，例如「我需要慢一點」。`,
    },
    [noteKey('asc', 'sun')]: {
        theme: '太陽碰上升，關乎第一印象與外在形象',
        conj: (p, q) =>
            `第一眼就注意到彼此，${q}的個性很能照亮${p}給人的形象，走在一起很有存在感；只是${q}的光太強時，${p}在場面上容易變成配角。`,
        soft: (p, q) =>
            `見面就自在，${q}欣賞${p}待人處事的方式，${p}也覺得${q}很好相處；好相處不等於很了解，表面的順要花時間往深處走。`,
        hard: (p, q) =>
            `${q}的作風與${p}的表現方式不同，第一印象可能是「這人好強勢」或「跟我好不一樣」，熟了才會欣賞。`,
    },
    [noteKey('asc', 'moon')]: {
        theme: '月亮碰上升，關乎相處時放不放鬆',
        conj: (p, q) =>
            `${q}在${p}面前很快就放鬆，像認識很久的老朋友；${p}也很容易感受到${q}的情緒，${q}心情差時，${p}常跟著被影響。`,
        soft: (p, q) => `${p}待人的樣子讓${q}有安全感，一起出門、見朋友都很自然；自在久了，約會也容易變得隨便、少了用心。`,
        hard: (p, q) =>
            `${p}在外的表現不時讓${q}情緒不安，例如覺得${p}對別人太熱絡、對自己太冷淡，需要多說明；這份不安其實也說明${q}很把${p}放在心上。`,
    },
    [noteKey('asc', 'venus')]: {
        theme: '金星碰上升，關乎外在的吸引',
        conj: (p, q) =>
            `${q}一見${p}就有好感，覺得${p}的樣子很吸引人，常是一見鍾情的組合；外表的好感來得快，${q}愛不愛外表底下那個${p}，要相處後才知道。`,
        soft: (p, q) => `${q}欣賞${p}的外型與氣質，兩人在社交場合很搭；外在合拍容易讓人忽略內在的差異，那部分要慢慢磨。`,
        hard: (p, q) =>
            `好感中帶點品味的拉扯，${q}可能想幫${p}換穿搭、改習慣，${p}未必領情；有些建議其實真的適合${p}，聽不聽由${p}決定。`,
    },
    [noteKey('mercury', 'mercury')]: {
        theme: '水水相位看兩人說話與思考的頻率',
        conj: () => '說話節奏和想法很接近，玩笑一點就通；要小心只繞著熟悉的話題，偶爾聊點新的。',
        soft: () => '不用多解釋就懂對方的意思，討論常激發出兩人各自想不到的點子；太容易同意彼此，有時少了一個唱反調的聲音。',
        hard: () =>
            '同一句話，一人覺得講得很清楚，另一人卻聽成別的意思；可能一人要邊講邊想、一人要先安靜想完。思路不同也讓兩人一起想事情時更周全，卡住時先複述「你的意思是……嗎？」。',
    },
    [noteKey('mercury', 'moon')]: {
        theme: '水月相位看講道理與談感受能否接上',
        conj: (p, q) => `${p}的話很能說進${q}心裡，${q}的心情也常被${p}一語點破；被看得太透，${q}有時也會不舒服。`,
        soft: (p, q) => `${p}會用${q}聽得進去的方式講道理，${q}心煩時很願意找${p}聊；久了${q}可能太依賴${p}幫忙理清情緒。`,
        hard: (p, q) =>
            `${p}講道理時，${q}聽到的可能是批評或冷淡；${q}需要先被同理，再談解決。等情緒過了，${p}的冷靜分析往往正是${q}需要的。`,
    },
    [noteKey('mercury', 'venus')]: {
        theme: '水金相位讓聊天也有戀愛感',
        conj: (p, q) => `聊天就是約會，${p}說的話常讓${q}覺得被欣賞、很浪漫；甜話說得多，難開口的事反而一延再延。`,
        soft: (p, q) => `${p}很會說${q}愛聽的話，兩人有聊不完的共同喜好；聊喜好很順，聊到錢或分歧時要換個頻道。`,
        hard: (p, q) =>
            `${p}直白的說法，有時讓${q}覺得不夠溫柔；換個說法，意思不變，感受差很多。反過來看，${q}從${p}那裡聽到的多半是真話。`,
    },
    [noteKey('mercury', 'mars')]: {
        theme: '水火相位讓討論很有火力',
        conj: (p, q) => `討論熱烈，很容易從聊天變成辯論；${q}會把${p}的想法立刻拿去做。`,
        soft: (p, q) => `${q}會把${p}的點子付諸行動，是很好的執行搭檔；只是${q}動得快，${p}還沒想完就已經開工。`,
        hard: (p, q) =>
            `${q}容易把${p}的話聽成挑釁，口角變多；爭論也會把兩人的想法磨得更利，約好讓對方先講完再回應。`,
    },
    [noteKey('mercury', 'sun')]: {
        theme: '水日相位看誰最懂誰的想法',
        conj: (p, q) => `${p}很懂${q}在想什麼，常是${q}最好的討論對象；懂到有時會搶先替${q}下結論。`,
        soft: (p, q) => `${p}的想法常替${q}的目標補上關鍵的一塊；${q}習慣了被附和，${p}提出反對時可能一時聽不進去。`,
        hard: (p, q) =>
            `${p}隨口的看法，容易被${q}當成對自己的評論；但${p}的意見常點到${q}看不見的地方，說意見時先講出肯定的部分。`,
    },
    [noteKey('mars', 'mars')]: {
        theme: '火火相位看兩人做事與生氣的節奏',
        conj: () => '精力同步，一起運動、做事很有勁，也可能同時發火；吵架時先讓其中一人離開現場冷靜。',
        soft: () =>
            '行事步調合拍，分工合作順，一起搬家、裝修這類需要體力的事特別有效率；忙著做事時，談心的時間容易被擠掉。',
        hard: () =>
            '做事方法與節奏不同，一人要馬上、一人要照自己的方式，容易爭主導權；兩種做法其實各有長處，事前分好各自負責的範圍。',
    },
    // Saturn contacts: p = the Saturn person.
    [noteKey('saturn', 'sun')]: {
        theme: '土日相位帶來責任與長久感，土星一方像老師或靠山',
        conj: (p, q) => `${p}像${q}的靠山，給方向也給規矩；${q}因此更踏實，也可能覺得被管、做什麼都要過${p}這關。`,
        soft: (p, q) =>
            `${p}給${q}穩定的支持與實際建議，${q}在${p}身邊做事更有章法；穩定之餘少了點驚喜，${p}的建議偶爾也會聽起來像說教。`,
        hard: (p, q) =>
            `${p}不自覺地評估、糾正${q}，${q}覺得怎麼做都不夠好；這份壓力也常推著${q}真的長大，兩人都把這段關係當真。${p}多說肯定，${q}也問清楚具體的標準。`,
    },
    [noteKey('saturn', 'moon')]: {
        theme: '土月相位耐久，但情緒表達容易被壓抑',
        conj: (p, q) =>
            `關係很能走長，但${q}在${p}面前容易把情緒收起來，像孩子面對嚴格的大人，${p}未必察覺；用具體的方式約定「怎樣才算有陪伴」。`,
        soft: (p, q) =>
            `${p}讓${q}的情緒有可靠的依靠，${q}知道遇到事${p}一定在；只是${p}的照顧偏實際，${q}想要的軟話與擁抱得自己說出口。`,
        hard: (p, q) =>
            `${q}的情緒需求碰上${p}的現實考量，${q}覺得被冷處理，${p}覺得${q}情緒化；不好受，卻也是長久伴侶身上常見的組合——兩人都很認真看待彼此。先接住感受，再談該怎麼辦。`,
    },
    [noteKey('saturn', 'mercury')]: {
        theme: '土水相位影響兩人說話時的輕重',
        conj: (p, q) => `${p}會認真對待${q}的想法，也常糾正細節；${q}一開始欣賞${p}的成熟，久了可能不太敢隨口說。`,
        soft: (p, q) => `${p}幫${q}把想法整理成可行的計畫，兩人一起規劃很可靠；凡事有計畫，隨興的念頭也比較難冒出來。`,
        hard: (p, q) =>
            `${p}容易否定${q}的點子或糾正說法，${q}漸漸不想分享；不過經過${p}挑剔的點子通常更站得住，${p}先聽完再評估。`,
    },
    [noteKey('saturn', 'venus')]: {
        theme: '土金相位帶來忠誠與承諾，也可能覺得不夠浪漫',
        conj: (p, q) =>
            `關係有很強的承諾感，但${p}表達愛偏保守，${q}可能覺得被冷落；${p}偶爾做點不實用的浪漫小事。`,
        soft: (p, q) => `感情穩定、忠誠，${p}願意為${q}做長期打算，兩人很適合一起規劃未來；穩得太早，相處也可能提早變成老夫老妻。`,
        hard: (p, q) =>
            `${q}要的甜蜜，${p}給得慢又少；${p}覺得${q}要求太多，${q}覺得${p}不夠愛。這段感情不是一時興起，能撐過這種落差的，通常經得起考驗——把期待講成具體的小事。`,
    },
    [noteKey('saturn', 'mars')]: {
        theme: '土火相位是油門與煞車',
        conj: (p, q) => `${p}替${q}的衝勁踩煞車，有時是保護，有時讓${q}覺得綁手綁腳。`,
        soft: (p, q) => `${p}幫${q}的衝勁找到方向與節奏，兩人一起做事穩而有效率；只是太求穩，偶爾會錯過該衝的時機。`,
        hard: (p, q) =>
            `${p}想慢、${q}想衝，${q}覺得被限制，${p}覺得${q}太衝動，衝突容易卡住；磨合過後，${q}的衝勁加上${p}的耐性是很難得的組合。先講好底線，其他放手。`,
    },
    [noteKey('saturn', 'asc')]: {
        theme: '土星碰上升，影響在對方面前自不自在',
        conj: (p, q) => `${q}在${p}面前比較拘謹，覺得被看著、被評估；也因此覺得${p}可靠。`,
        soft: (p, q) => `${p}讓${q}覺得可靠穩重，是遇到事會想找的人；也因為敬重，${q}在${p}面前會想表現得好一點，不太放鬆。`,
        hard: (p, q) =>
            `${p}對${q}的言行舉止常有意見，${q}在${p}面前不太放得開；換個角度，會挑剔也代表${p}一直在注意${q}。`,
    },
};

/** What a slower planet does to a personal point, per aspect family (fallback for non-key pairs). */
const ACTOR: Partial<Record<SynastryPointKey, Record<Family, string>>> = {
    jupiter: {
        conj: '放大與鼓勵，也容易一起過度樂觀',
        soft: '帶來信心與好運，順得太輕鬆時反而少了檢討',
        hard: '鼓勵過了頭，容易過度承諾或放縱，卻也把彼此的格局撐大',
    },
    saturn: {
        conj: '帶來責任與結構，穩，但偏沉重',
        soft: '帶來穩定與耐心，代價是少一點彈性',
        hard: '帶來壓力與限制感，熬過來卻是很牢的承諾',
    },
    uranus: {
        conj: '帶來刺激與意外，新鮮也不穩',
        soft: '帶來新鮮與自由感，黏著度則偏低',
        hard: '帶來不穩定、忽冷忽熱，也逼兩人跳出老套',
    },
    neptune: {
        conj: '帶來浪漫與理想化，容易把對方看得太美',
        soft: '帶來溫柔的心靈共鳴，界線卻可能變模糊',
        hard: '容易看不清、誤會或失望，同時有種說不清的牽引',
    },
    pluto: {
        conj: '帶來深刻吸引與轉變，也夾著占有欲',
        soft: '帶來深度與互相改變的力量，仍要尊重彼此的界線',
        hard: '帶來掌控與執著的拉扯，也逼出最真實的自己',
    },
    northNode: {
        conj: '帶來命運感，像來推動人生方向，也可能讓人把關係看得過重',
        soft: '帶來順向的成長，只是不太會逼人改變',
        hard: '帶來方向上的拉扯，正好讓人看清自己真正想走的路',
    },
    chiron: {
        conj: '碰觸舊傷，也帶來療癒的機會',
        soft: '帶來溫和的療癒，但可能停在安慰、碰不到根源',
        hard: '容易碰到舊傷的痛處，願意談開就是療癒的起點',
    },
};

const FAMILY_TONE: Record<Family, string> = {
    conj: '融在一起，存在感很強，好的壞的都被放大',
    soft: '彼此順得來，不費力，也因此容易被當成理所當然',
    hard: '有摩擦，也互相推動',
};

function functionOf(k: SynastryPointKey): string {
    return k === 'asc' ? '外在形象' : BODY_FUNCTION[k];
}

/** Pair-specific note: who does what to whom, in this aspect family. */
function aspectNote(x: InterAspect, a: AstroPartner, b: AstroPartner): { theme: string; text: string } {
    const fam = familyOf(x.type);
    const direct = PAIR_NOTES[noteKey(x.a, x.b)];
    const flipped = PAIR_NOTES[noteKey(x.b, x.a)];
    if (direct) return { theme: direct.theme, text: direct[fam](a.name, b.name) };
    if (flipped) return { theme: flipped.theme, text: flipped[fam](b.name, a.name) };
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

function aspectLine(x: InterAspect, a: AstroPartner, b: AstroPartner, withNuance: boolean): string {
    const n = aspectNote(x, a, b);
    const nuance = withNuance ? ASPECT_NUANCE[x.type] : '';
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
    saturn: '的責任感與要求',
};

/** How the house owner (q) feels it, as an everyday scene. p = whose planet. */
const HOUSE_SCENE: Record<number, Phrase> = {
    1: (p, q) => `讓${q}在${p}身邊特別有自我意識，${p}的評價會直接影響${q}怎麼看自己`,
    2: (p, q) => `牽動${q}的金錢觀與安全感，常在一起花錢、存錢、討論東西值不值得時浮現`,
    3: (p, q) => `表現在每天的訊息、聊天與短程出門，${p}讓${q}想多說話、多學新東西，話多了，小口角也跟著多`,
    4: (p, q) => `觸動${q}對家的感覺，一起煮飯、窩在家、見家人時最明顯，也最容易碰到各自家裡帶來的習慣`,
    5: (p, q) => `點亮${q}的玩心與戀愛感，約會、出遊、一起玩樂時最有火花，回到柴米油鹽時這份輕鬆不一定跟得上`,
    6: (p, q) => `落進${q}的日常作息，誰洗碗、幾點睡、怎麼分工，都會互相牽動`,
    7: (p, q) => `讓${q}把${p}看成「伴侶的樣子」，一對一的承諾與合作是重點，期待也跟著變高`,
    8: (p, q) => `觸及${q}的親密、信任與共同財務，關係容易變深，也可能碰到掌控與信任議題`,
    9: (p, q) => `打開${q}的視野，一起旅行、上課、聊人生觀時最投契；觀念不同時，也可能變成各自說教`,
    10: (p, q) => `影響${q}的事業與社會形象，${p}可能是推手，也可能像評審`,
    11: (p, q) => `讓${q}把${p}當成朋友與隊友，一起經營朋友圈或共同的理想；友情感太重時，戀愛的心跳可能變淡`,
    12: (p, q) => `觸及${q}不輕易示人的一面，連結很深卻不容易說清楚，也可能有誤會或理想化`,
};

/** Classic combinations that deserve their own sentence. */
const OVERLAY_SPECIAL: Record<string, Phrase> = {
    'sun|7': (p, q) => `${q}很容易把${p}當成理想伴侶的形象，兩人走在一起就很像一對；只是${q}也可能把自己的期待投射在${p}身上`,
    'moon|4': (p, q) => `${p}讓${q}有「回到家」的感覺，兩人窩在家最療癒，也容易把對家人的舊期待帶進這段關係`,
    'moon|12': (p, q) => `${p}能感受到${q}沒說出口的情緒，連結深但不容易說清楚`,
    'venus|5': (p, q) => `${q}和${p}在一起特別有戀愛感，約會、禮物、浪漫小驚喜都很加分；不過戀愛感強，不代表過日子也一樣合拍`,
    'venus|7': (p, q) => `${q}容易把${p}視為理想伴侶，也很適合長期合作，相對地對${p}的期待會特別高`,
    'venus|8': (p, q) => `${p}的愛會碰到${q}最私密的一面，身體與情感的親密感都強，強到也可能牽出占有與不安`,
    'mars|1': (p, q) => `${p}的行動力直接刺激${q}，可能很有吸引力，也可能讓${q}覺得被挑戰`,
    'mars|5': (p, q) => `${p}讓${q}玩得盡興，熱情與性吸引明顯，也可能在玩樂中較勁`,
    'mars|7': (p, q) => `${p}在${q}的伴侶宮帶來推動也帶來爭執，常為「一起做事的方式」意見不同`,
    'mars|8': (p, q) => `${p}和${q}之間性吸引強，也可能在信任、金錢或掌控上起衝突`,
    'saturn|1': (p, q) => `${q}會覺得${p}在看著、評估自己，有安定感也有拘束感`,
    'saturn|4': (p, q) => `${p}對${q}的家務與家庭有要求，也可能成為${q}家中的支柱`,
    'saturn|5': (p, q) => `${p}讓${q}的玩樂和戀愛變得認真，好處是穩定，代價是少了一點輕鬆`,
    'saturn|7': (p, q) => `${q}容易把${p}視為適合承諾的對象，關係穩、責任明確，浪漫感則要另外經營`,
    'saturn|8': (p, q) => `${q}對${p}的親密與信任需要時間建立，${p}在共同財務或身體親密上比較謹慎；慢，但一旦建立就很牢`,
    'mercury|3': (p, q) => `兩人每天有聊不完的話，訊息往來很密，${p}常是${q}第一個想分享的人；密到偶爾會為了「怎麼這麼久才回」鬧彆扭`,
    'venus|3': (p, q) => `${p}的溫柔表現在日常對話裡，${q}覺得跟${p}聊天很舒服、很被欣賞，只是${p}也捨不得把不滿說重`,
    'saturn|3': (p, q) => `${p}會認真回應${q}說的話，也可能讓${q}說話前多想三秒`,
    'saturn|9': (p, q) => `${p}對${q}的信念與人生觀很認真，可能像老師，也可能讓${q}覺得被說教`,
    'saturn|10': (p, q) => `${p}對${q}的事業有實際的督促，像嚴格但可靠的教練`,
    'jupiter|7': (p, q) => `${p}讓${q}對這段關係充滿信心，覺得和${p}在一起運氣變好；樂觀之餘，該談的現實問題別一起跳過`,
};

/** Body-specific tail for the generic overlay line, so two planets in the same house read differently. */
const OVERLAY_TWIST: Record<string, string> = {
    sun: '；這一塊會成為兩人相處的焦點',
    moon: '；在這一塊彼此特別容易情緒共振，好心情和壞心情都會互相傳染',
    mercury: '；這一塊是兩人最常聊起的話題，也是最常爭辯的地方',
    venus: '；在這一塊相處起來特別甜，但也容易捨不得對彼此說重話',
    mars: '；熱度高，也容易在這一塊起摩擦',
    jupiter: '；這一塊會因為對方變得更寬、更樂觀，偶爾也樂觀過頭',
    saturn: '；在這一塊帶來要求與壓力，需要時間磨合，磨過之後會變得踏實可靠',
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
    '直接、衝勁足，習慣先做再說，要等待時容易不耐煩',
    '穩定可靠、重享受，不喜歡被催，改變需要時間',
    '好奇、反應快，需要新鮮話題，熱度來得快也散得快',
    '顧家、重感情，對親近的人很照顧，心情起伏時會縮回殼裡',
    '大方、溫暖，喜歡被看見與肯定，面子被碰到會很在意',
    '細心、要求品質，習慣把事情做好，也容易對自己和別人挑剔',
    '體貼、重公平，很在意關係和諧，為了不起衝突可能遲遲不表態',
    '深情、重信任，認定了就全心投入，受了傷不容易放下',
    '樂觀、愛自由，需要探索與意義，覺得被綁住時會想逃',
    '務實、有責任感，凡事有計畫，有時太嚴肅、放不下工作',
    '獨立、有主見，需要個人空間，情感上偶爾顯得疏離',
    '溫柔、共感強，容易被氣氛影響，人我界線也比較模糊',
];

const ASC_TRAIT: Twelve = [
    '直率、有活力，偶爾有點衝',
    '穩重、親切但慢熟',
    '機靈、好聊但不太好捉摸',
    '溫和、帶點保護色',
    '大方、存在感強，也有點高調',
    '細心、有點拘謹',
    '優雅、好相處，卻不太露真實想法',
    '沉穩、不容易看透',
    '開朗、坦率，有時直得過頭',
    '成熟、有點距離感',
    '特別、友善但保有距離',
    '溫柔、隨和，也有點捉摸不定',
];

const MERCURY_TRAIT: Twelve = [
    '想到就說，決定很快，偶爾話比想法跑得快',
    '慢慢想，想通了就不輕易改，結論可靠但難被說動',
    '邊聊邊想，喜歡比較各種選項，點子多、定案慢',
    '帶著感受與過去經驗判斷，善解人意，也容易把話往心裡放',
    '說話有自信，喜歡用故事說服人，不太喜歡被當眾糾正',
    '先分析細節、找出問題，思慮周到，有時被聽成挑剔',
    '多方衡量、懂得看雙方立場，不容易下結論',
    '看動機與底層原因，問話一針見血，也可能讓人覺得被審問',
    '先想大方向，視野寬，對細節較不耐煩',
    '重結論與可行性，務實，但對空想沒什麼耐心',
    '跳出框架，有自己的一套邏輯，有時聽不太進不同意見',
    '靠直覺與畫面思考，想像力豐富，講起來可能跳躍、不好跟上',
];

const MARS_TRAIT: Twelve = [
    '火氣來得快去得快，當場就要講，講完不記仇',
    '平常很有耐性，被逼到底才爆發，爆了之後很固執',
    '用言語反擊，吵架像辯論，好處是願意把話講開',
    '不直接說，容易生悶氣或冷處理，但很顧關係、不會把話說絕',
    '自尊被碰到就硬碰硬，吵完也大方，不小氣',
    '會挑具體的錯，越焦慮越嘮叨，但吵完會想實際改善',
    '先壓下不滿維持和平，累積到最後才爆；平常很願意妥協',
    '表面安靜、內心記很久，真吵開了卻很誠實、直指核心',
    '話直又衝，但很快就忘',
    '冷靜講規矩，用距離表達不滿，很少失控亂說話',
    '抽離講理，被逼急會乾脆走開，好處是很少惡言相向',
    '傾向退讓或逃避，委屈往心裡吞，卻也最能體諒對方的難處',
];

const MOON_REPAIR: Twelve = [
    '先動一動、發洩完再談',
    '一頓好吃的、一個擁抱這種身體上的安撫',
    '把事情好好聊開、說清楚',
    '被抱住、確認你還在',
    '一句「你對我很重要」的肯定',
    '具體的道歉與改進做法',
    '溫和的語氣與公平的解決方式',
    '完全的坦白，不能有隱瞞',
    '一點空間，再用輕鬆的方式和好',
    '自己消化的時間，之後看到你的行動',
    '被尊重的空間，不被情緒勒索',
    '溫柔的陪伴與被理解',
];

const VENUS_TRAIT: Twelve = [
    '用直接追求、熱烈表示來愛人，最喜歡被主動追，平淡期容易覺得無聊',
    '用陪伴、美食與實際照顧來愛人，需要穩定的身體親近，占有欲也不小',
    '用聊天、分享新鮮事來愛人，被聽懂就覺得被愛，碰上濃烈的情緒反而不知所措',
    '用照顧與家的感覺來愛人，需要被細心呵護，付出多了會默默期待回報',
    '用大方寵愛與讚美來愛人，需要被當成特別的人，被冷落時很受傷',
    '用行動與小細節來愛人，被記住小需要就很感動，不太擅長說甜話',
    '用浪漫的氛圍與體貼來愛人，需要被溫柔對待，為了和諧可能壓下自己的需要',
    '用全心投入與深度連結來愛人，需要百分之百的信任，也容易吃醋',
    '用一起探險、學習來愛人，需要自由與一起成長，被黏太緊會想退開',
    '用承諾與長期規劃來愛人，看重說到做到，浪漫的表達比較含蓄',
    '用朋友般的尊重來愛人，需要保有自己的空間，親密時偶爾顯得冷靜',
    '用浪漫付出與心靈相通來愛人，需要被溫柔理解，容易把對方理想化',
];

const MOON_SAFE: Twelve = [
    '能直接表達、不被壓抑',
    '規律的作息與熟悉的環境',
    '隨時能聊、能分享',
    '有家的感覺、被需要',
    '被欣賞、被放在心上',
    '生活井然有序',
    '關係和諧、沒有冷戰',
    '被完全信任、彼此忠誠',
    '有自由、對未來有希望',
    '掌控感與可預期的未來',
    '被尊重的獨立空間',
    '溫柔、不被批判的氛圍',
];

/** Scenes per element pair; key "i|j" with i <= j; phrase(p = element i holder, q = element j holder). */
type ElementScenes = Record<string, Phrase>;

const PERSONA_SCENE: ElementScenes = {
    '0|0': () => '兩人都是火象，熱情、行動快，決定吃什麼、去哪玩常常三秒定案；也因為都急，衝動花錢或衝動吵架時沒人踩煞車，同時想主導時記得輪流掌舵。',
    '1|1': () => '兩人都是土象，重實際、守承諾，存錢、規劃、照顧家都很合拍；日子容易太規律，偶爾安排一點計畫外的小冒險。',
    '2|2': () => '兩人都是風象，愛聊天、重朋友，一起看展、聽講座、跟朋友聚會都開心；兩人都習慣用腦袋處理感情，情緒真的上來時可能都想跳過，帳單、家務這些瑣事也容易聊著聊著就忘了。',
    '3|3': () => '兩人都是水象，感受細膩、重情義，常不必說就懂對方的心情；低落時容易一起往下沉，總要有人先開燈、拉對方出門走走。',
    '0|1': (f, e) =>
        `${f}是火象，想到就想出發；${e}是土象，要先確認預算和細節。一起安排旅行時，${f}丟點子、${e}負責落地最互補；${f}嫌${e}慢、${e}嫌${f}衝，就是該分工的訊號。`,
    '0|2': (f, a) =>
        `${f}是火象、${a}是風象，一個有衝勁、一個有點子，臨時報名活動、說走就走去夜市都很對味；要小心兩人都只顧開頭，沒人收尾。`,
    '0|3': (f, w) =>
        `${f}是火象，直接、熱烈；${w}是水象，敏感、重氛圍。${f}隨口一句玩笑，${w}可能放在心上好幾天；${f}學著看臉色、${w}學著直接說，熱情和溫柔就能互換。`,
    '1|2': (e, a) =>
        `${e}是土象，重實際；${a}是風象，重想法。週末${a}想去看新開的展覽，${e}想把家裡整理好——${a}帶來新鮮，${e}讓生活有底，可以一人決定一半的行程。`,
    '1|3': (e, w) =>
        `${e}是土象、${w}是水象，一個用行動照顧、一個用感受連結，很容易過出安穩的小日子；${e}別只做不說，${w}則把模糊的不安講具體。`,
    '2|3': (a, w) =>
        `${a}是風象，習慣用道理看事情；${w}是水象，先感覺再說。${w}心情不好時，${a}急著分析原因，${w}只想被抱一下——先問「你要建議還是要陪伴」，可以少很多誤會。磨合好了，${a}的冷靜是${w}情緒翻湧時的錨，${w}則讓${a}的生活多了溫度。`,
};

const THINK_SCENE: ElementScenes = {
    '0|0': () => '兩人的水星都是火象，想到就說、決定很快，討論常變成熱烈的腦力激盪；要留意誰都沒等對方講完。',
    '1|1': () => '兩人的水星都是土象，做決定要看數字與可行性，買大東西前會一起比價、看評價，很少衝動消費；缺點是對新點子都偏保守。',
    '2|2': () => '兩人的水星都是風象，能從新聞一路聊到哲學，話題跳得很快；做決定時容易一直討論、遲遲不定案，給自己設個期限。',
    '3|3': () => '兩人的水星都是水象，判斷常靠直覺，很能聽懂彼此的弦外之音；吵架時也容易把語氣聽得比內容重。',
    '0|1': (f, e) =>
        `${f}的水星是火象，靠直覺很快做決定；${e}的水星是土象，要資料、要時間。像決定要不要搬家，${f}看一次就想簽約，${e}想再多看三間。${f}的直覺抓得住機會，${e}的謹慎避得開坑，先講好「什麼時候定案」，兩人都安心。`,
    '0|2': (f, a) =>
        `${f}的水星是火象、${a}的是風象，想法都轉得快，一起構想計畫很有火花；只是${f}想立刻做，${a}還想多比較幾個選項。`,
    '0|3': (f, w) =>
        `${f}的水星是火象，說話直接、重結論；${w}的是水象，說話繞著感受。${f}覺得「我只是講事實」，${w}聽到的卻是語氣。好的一面是${f}能幫猶豫的${w}下決定，${w}也常察覺${f}沒注意到的人情細節——重要的話題，${f}放慢一點，${w}直接點出真正在意的事。`,
    '1|2': (e, a) =>
        `${e}的水星是土象，要具體步驟；${a}的是風象，喜歡先討論各種可能。規劃旅行時，${a}列出十個景點，${e}會問「交通怎麼接」——把${a}的發想和${e}的篩選分成兩個步驟，就不會互相嫌棄。`,
    '1|3': (e, w) =>
        `${e}的水星是土象，靠事實與經驗判斷；${w}的是水象，靠直覺與感受。${w}說「我覺得這個人怪怪的」，${e}會想要理由——${w}的直覺常常準，${e}的查證則能避免誤判。`,
    '2|3': (a, w) =>
        `${a}的水星是風象，用邏輯與比較思考；${w}的是水象，先感覺對不對。討論時${a}容易覺得${w}不講理，${w}覺得${a}太冷——先說感受、再談方法，兩種思考都派得上用場。`,
};

const FIGHT_SCENE: ElementScenes = {
    '0|0': () => '兩人的火星都是火象，吵架來得快、聲音大，通常也很快過去；氣頭上的話比想像中傷人，先各自冷靜五分鐘再談。',
    '1|1': () => '兩人的火星都是土象，不輕易起衝突，但一旦堅持就都不讓步，可能僵上好幾天；把爭點拆成具體可交換的條件，比較容易鬆動。',
    '2|2': () => '兩人的火星都是風象，衝突多半是口頭辯論、比邏輯，很少冷戰；小心贏了道理、輸了感情，結論之後補一句關心。',
    '3|3': () => '兩人的火星都是水象，生氣時都不太直說，用冷處理或暗示表達不滿，常常兩人都在等對方先開口；好處是很少說出傷人的重話，約好「不舒服 24 小時內要說」就好。',
    '0|1': (f, e) =>
        `${f}的火星是火象，有氣當場發；${e}的是土象，先忍、忍到底才爆。常見的是${f}吵完就沒事了，${e}還在消化，幾天後才翻出來。一個敢把問題攤開、一個穩得住局面，其實互補——${f}給時間，${e}別累積。`,
    '0|2': (f, a) =>
        `${f}的火星是火象、${a}的是風象，吵架時${f}拉高情緒、${a}用嘴快反擊，容易越吵越熱；好處是講開就散，記得吵的是事情，不是人。`,
    '0|3': (f, w) =>
        `${f}的火星是火象，想當下吵完；${w}的是水象，受傷時會先縮回去。${f}越追問、${w}越沉默，${f}就更急。可是${f}願意面對問題，${w}聽得出話底下的委屈，兩人合起來能把架吵到真正的重點——${f}先降低音量，${w}說好什麼時候回來談。`,
    '1|2': (e, a) =>
        `${e}的火星是土象，處理衝突要具體的改法；${a}的是風象，習慣講道理、分析。${a}講了一大串，${e}只想知道「所以下次怎麼做」。${a}把問題說清楚，${e}把結論落實，分工對了反而有效率——吵完寫下一條具體約定，兩人都踏實。`,
    '1|3': (e, w) =>
        `${e}的火星是土象、${w}的是水象，都不愛正面衝突，平常日子很平靜，問題卻容易各自悶著：${e}用行動冷處理，${w}用情緒暗示。誰先把話講白，誰就幫了這段關係。`,
    '2|3': (a, w) =>
        `${a}的火星是風象，吵架時理性、甚至抽離；${w}的是水象，情緒很滿。${w}覺得${a}冷血，${a}覺得${w}不講理。其實${a}的冷靜能幫爭執降溫，${w}的感受則提醒${a}問題真正卡在哪——${a}先承認對方的感受，${w}再聽${a}的理由。`,
};

const LOVE_SCENE: ElementScenes = {
    '0|0': () => '兩人的金星都是火象，愛要熱烈、要表現，驚喜約會、說走就走的旅行最對味；熱度退了，記得主動再點燃。',
    '1|1': () => '兩人的金星都是土象，愛是陪伴與實際照顧，一起吃好吃的、把家佈置舒服就很幸福；平常少說甜言蜜語，偶爾說出口很加分。',
    '2|2': () => '兩人的金星都是風象，愛是聊得來、有新鮮感，一起逛書店、看展、跟朋友聚會就很開心；也留一些只屬於兩人的時間。',
    '3|3': () => '兩人的金星都是水象，愛是情感交融與被懂，一個眼神、一首歌就能心意相通；彼此都很需要確認感，別讓猜測取代詢問。',
    '0|1': (f, e) =>
        `${f}的金星是火象，愛是熱情與驚喜；${e}的是土象，愛是穩定與實際照顧。紀念日${f}想安排臨時出遊，${e}更想吃頓好的、收一份實用的禮物。${f}讓${e}的日子多了心跳，${e}讓${f}的熱情有地方落地，輪流照對方的方式過就好。`,
    '0|2': (f, a) =>
        `${f}的金星是火象、${a}的是風象，兩人都愛新鮮，一起探索新餐廳、新活動很有戀愛感；要留意少了慢下來、靜靜陪伴的時刻。`,
    '0|3': (f, w) =>
        `${f}的金星是火象，用熱烈的行動示愛；${w}的是水象，要的是情感上被懂。${f}想帶${w}去熱鬧的地方慶祝，${w}可能更想兩人安靜吃頓飯、聊聊心事。${f}的熱烈能把${w}從心事裡拉出來，${w}的細膩則讓${f}的愛多了深度，前提是別只用自己的方式給。`,
    '1|2': (e, a) =>
        `${e}的金星是土象，愛是陪伴與實際照顧；${a}的是風象，愛是聊天與新鮮感——週末${e}想在家煮飯，${a}想出門逛新地方。可以一週安排一次「${a}的出門日」、一次「${e}的在家日」——${a}帶${e}出門透氣，${e}讓${a}有個安穩的地方可以回來。`,
    '1|3': (e, w) =>
        `${e}的金星是土象，用做的表達愛（接送、煮飯、修東西）；${w}的是水象，用感受表達愛。兩人都很顧家，${e}記得把心意說出來，${w}也要看見${e}默默做的事。`,
    '2|3': (a, w) =>
        `${a}的金星是風象，愛需要空間與對話；${w}的是水象，愛需要親近與融合。${w}想每天黏在一起，${a}偶爾需要自己的時間——說清楚「我需要空間，不是不愛你」。這組的好處是互相補位：${w}讓${a}學會靠近，${a}讓${w}有呼吸的空間。`,
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

/** One-line daily tag for an aspect already explained under 重點相位, worded for the theme. */
function dailyAspectLines(
    syn: AstroSynastry,
    a: AstroPartner,
    b: AstroPartner,
    pairs: [SynastryPointKey, SynastryPointKey][],
    tag: Record<Family, string[]>,
): string[] {
    // Rotate through the variants so two aspects of the same family never get the same tag.
    const used: Record<Family, number> = { conj: 0, soft: 0, hard: 0 };
    return pairs.flatMap(([x, y]) =>
        findAspect(syn, x, y).map((s) => {
            const fam = familyOf(s.type);
            const text = tag[fam][used[fam]++ % tag[fam].length];
            const head = `・相位加碼：${a.name}的${POINT_NAMES[s.a]}${s.name}${b.name}的${POINT_NAMES[s.b]}——${text}`;
            // Key pairs are explained under 重點相位; others may not be listed, so say it here.
            if (s.key) return `${head}（說明見「重點相位」）。`;
            const n = aspectNote(s, a, b).text;
            return `${head}：${n}${n.endsWith('。') ? '' : '。'}`;
        }),
    );
}

export function dailyLifeLines(a: AstroPartner, b: AstroPartner, syn: AstroSynastry): string[] {
    const lines: string[] = [];
    const sunA = bodyOf(a, 'sun');
    const sunB = bodyOf(b, 'sun');

    // 個性
    if (sunA && sunB) {
        lines.push(
            `【個性】${a.name}太陽在${sunA.signName}：${SUN_TRAIT[sunA.sign]}；${b.name}太陽在${sunB.signName}：${SUN_TRAIT[sunB.sign]}。`,
            sceneFor(PERSONA_SCENE, sunA.sign, sunB.sign, a.name, b.name),
        );
    }
    const ascLine = (p: AstroPartner) =>
        p.chart.angles && !p.chart.timeUnknown
            ? `${p.name}上升${p.chart.angles.asc.signName}，初見面給人${ASC_TRAIT[p.chart.angles.asc.sign]}的感覺`
            : `${p.name}的出生時間不確定，上升無法判斷`;
    lines.push(`第一印象：${ascLine(a)}；${ascLine(b)}。`);

    // 思考方式
    const merA = bodyOf(a, 'mercury');
    const merB = bodyOf(b, 'mercury');
    if (merA && merB) {
        lines.push(
            `【思考方式】${a.name}水星在${merA.signName}：${MERCURY_TRAIT[merA.sign]}；${b.name}水星在${merB.signName}：${MERCURY_TRAIT[merB.sign]}。`,
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
                    conj: ['說話頻率很接近，也容易一起鑽進同一個想法', '一開口就有分量，聽得認真，也聽得緊繃'],
                    soft: ['討論起來順，是溝通的助力，偶爾也需要不同的聲音', '想法接得上，小心只聽到彼此想聽的'],
                    hard: ['說話時容易卡住，卻也逼兩人把話講得更清楚', '意見常撞在一起，撞完的結論通常比各想各的周全'],
                },
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
            `【處理矛盾】${a.name}火星在${marsA.signName}：${MARS_TRAIT[marsA.sign]}；${b.name}火星在${marsB.signName}：${MARS_TRAIT[marsB.sign]}。`,
            sceneFor(FIGHT_SCENE, marsA.sign, marsB.sign, a.name, b.name),
        );
        if (moonA && moonB)
            lines.push(
                `吵完之後：${a.name}${moonA.text}，需要${MOON_REPAIR[moonA.sign]}；${b.name}${moonB.text}，需要${MOON_REPAIR[moonB.sign]}。`,
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
                    conj: ['一碰就有火花，熱情和火氣出自同一處', '情緒來得又近又快，好的壞的都直接'],
                    soft: ['起衝突也比較容易和好，但別因此跳過根本的問題', '吵架有緩衝，和好不難，難的是記得把事情談完'],
                    hard: [
                        '這組是衝突的熱點，也是兩人最在意彼此的地方',
                        '同一件事容易反覆吵，每吵一次也更清楚對方的底線',
                        '一方覺得被壓、一方覺得被逼，撐過去的伴侶通常更懂得收放',
                    ],
                },
            ),
        );
    }

    // 感受親密及愛
    const venA = bodyOf(a, 'venus');
    const venB = bodyOf(b, 'venus');
    if (venA && venB) {
        lines.push(
            `【感受親密與愛】${a.name}金星在${venA.signName}，${VENUS_TRAIT[venA.sign]}；${b.name}金星在${venB.signName}，${VENUS_TRAIT[venB.sign]}。`,
            sceneFor(LOVE_SCENE, venA.sign, venB.sign, a.name, b.name),
        );
        if (moonA && moonB)
            lines.push(
                `讓人安心的來源：${a.name}${moonA.text}，安心來自${MOON_SAFE[moonA.sign]}；${b.name}${moonB.text}，安心來自${MOON_SAFE[moonB.sign]}。`,
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
                    conj: ['親密感很強，依賴也深', '靠得很近，近到需要留一點各自的空間'],
                    soft: ['讓親近變得自然，順到要記得持續用心', '溫度穩定，少了起伏，也少了一點心跳', '彼此照顧得順手，別忘了偶爾說出口'],
                    hard: ['愛的方式需要多對準，對準之後吸引力格外持久', '心意都在，只是常常送錯方向；拉扯本身也是吸引的一部分'],
                },
            ),
        );
    }
    return lines;
}

export function astroSynastryItems(a: AstroPartner, b: AstroPartner, syn: AstroSynastry): MeaningItem[] {
    const items: MeaningItem[] = [];
    const caveat = caveatLine(a, b);
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
                          return aspectLine(x, a, b, first);
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
            shown.length > 0 ? shown.map((x) => aspectLine(x, a, b, false)).join('\n') : '其餘行星之間沒有主要相位。',
        ),
    );

    const total = syn.harmonious + syn.tense + syn.conjunctions;
    const balance =
        total === 0
            ? '兩盤之間幾乎沒有主要相位，彼此的影響比較溫和，少了天生的火花，也少了天生的摩擦，關係的樣子更多取決於兩人怎麼經營。'
            : syn.harmonious > syn.tense * 1.5
              ? '和諧相位明顯較多，相處起來順、少摩擦；要留意太舒服而缺少推動，偶爾一起挑戰新事物。'
              : syn.tense > syn.harmonious * 1.5
                ? '張力相位較多，火花與摩擦都明顯；這種組合很有成長的力量，但需要更多溝通與包容。'
                : '和諧與張力相位大致平衡，既有默契也有互相推動的力量；也代表關係會有順的時期與卡的時期，兩種都正常。';
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
            '從太陽、上升看個性，水星看思考方式，火星與月亮看怎麼吵架與和好，金星與月亮看怎麼感受愛。以下是生活中可能出現的場景。',
            [...dailyLifeLines(a, b, syn), caveat].filter(Boolean).join('\n'),
        ),
    );

    items.push(item('相處建議', '依相位與宮位整理的提醒。', adviceLines(a, b, syn).join('\n')));
    return items;
}

function bothFunctions(s: InterAspect): string {
    return s.a === s.b ? `雙方的${functionOf(s.a)}` : `${functionOf(s.a)}與${functionOf(s.b)}`;
}

function adviceLines(a: AstroPartner, b: AstroPartner, syn: AstroSynastry): string[] {
    const lines: string[] = [];
    const fams = (x: SynastryPointKey, y: SynastryPointKey) => new Set(findAspect(syn, x, y).map((s) => familyOf(s.type)));
    const sm = fams('sun', 'moon');
    if (sm.has('hard')) lines.push('日月有張力：一人談目標時，另一人可能在等被關心；這股拉扯也讓兩人不會停在舒適圈裡。重要決定前，先問一句「這對你的心情有什麼影響」。');
    else if (sm.size > 0) lines.push('日月有連結，彼此的核心需求容易被看見；越順越要記得說出口，別讓默契取代表達。');
    const vm = fams('venus', 'mars');
    if (vm.has('hard')) lines.push('金火有張力，吸引與摩擦是同一股能量；親密需求要用說的，不要用賭氣或冷淡表達。');
    else if (vm.size > 0) lines.push('金火有連結，吸引力是這段關係的燃料；激情之外，也經營日常的小溫柔。');
    if (fams('moon', 'moon').has('hard'))
        lines.push('月亮之間有張力，生活習慣與情緒反應不同；同住前先聊作息、整潔標準與「累的時候需要什麼」，講開的差異比沒講的默契更可靠。');
    if (fams('mercury', 'mercury').has('hard'))
        lines.push('水星之間有張力，同一句話容易聽成不同意思；重要的事用「我聽到的是……對嗎？」確認一次。對齊之後，兩種思路正好互相補漏。');
    const sat = syn.aspects.find((s) => s.key && (s.a === 'saturn' || s.b === 'saturn'));
    if (sat) {
        const satName = sat.a === 'saturn' ? a.name : b.name;
        const other = sat.a === 'saturn' ? b.name : a.name;
        lines.push(
            `有土星接觸（${satName}是土星的一方）：土星是長期關係的黏著劑，承諾感強、容易走得長久，也容易讓${other}覺得被要求。${satName}多給肯定，${other}把感受說清楚，不要用沉默表達不滿。`,
        );
    }
    const tight = syn.aspects.filter((s) => s.type === 'square' || s.type === 'opposition').slice(0, 1);
    for (const s of tight)
        lines.push(
            `${a.name}的${POINT_NAMES[s.a]}與${b.name}的${POINT_NAMES[s.b]}形成${s.name}，是兩人最緊的張力相位，牽動${bothFunctions(s)}；這裡最容易起摩擦，也最能刺激彼此成長，碰到這類話題時多給一點耐心。`,
        );
    const easy = syn.aspects.filter((s) => s.type === 'trine' || s.type === 'sextile').slice(0, 1);
    for (const s of easy)
        lines.push(
            `最緊的和諧相位落在${a.name}的${POINT_NAMES[s.a]}與${b.name}的${POINT_NAMES[s.b]}（${s.name}），在${bothFunctions(s)}上有天生的默契；正因為不費力，最容易被當成理所當然，偶爾說聲謝謝。`,
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
- 優點與挑戰要平衡：和諧相位也要點出可能的停滯、理所當然或缺少火花；張力相位也要點出吸引力、成長動力與讓關係有張力的好處；土星接觸同時說明承諾、穩定與壓力；同元素的組合也要提到兩人可能有相同的盲點。
- 這是星盤結構說明，不是緣分的判決；請給可對照生活的觀察與建議，避免恐嚇或保證，也不要只挑好聽的說。

## 兩人星盤
${chartBlock(a)}

${chartBlock(b)}

## 比對相位
${aspects}

## 宮位疊加
${overlays}

請先總覽兩人的吸引與互補，再依下列四個主題分段，每段都要比較兩人的差異，並各舉 2 個具體的日常場景（例如週末怎麼過、規劃旅行、吵架當下與吵完之後、紀念日怎麼過）。每段都要寫出兩人在這方面相處順利的優點與容易摩擦的挑戰，兩者篇幅大致相當；請用自然的敘述交織兩面，不要每段都套用「優點是…；缺點是…」的同一句型：
1. 個性：依兩人的太陽與上升星座（及元素），說明各自的性格與相處時的互補或摩擦。
2. 兩人思考方式：依水星星座與元素、水星之間及水星與土星／火星的相位，說明各自怎麼想事情、做決定，以及溝通時容易卡住的地方。
3. 處理矛盾的方法：依火星星座、火星與土星／月亮的相位，說明各自生氣與吵架的樣子；再依月亮星座說明吵完各自需要什麼才能和好。
4. 感受親密及愛的方式：依金星星座說明各自怎麼表達與接收愛，依月亮星座說明什麼讓各自安心，並參考金火、月金、月月、日月相位。
接著補充「張力與成長課題」與「長期相處」，最後給兩人各 3 條相處提醒。`;
}
