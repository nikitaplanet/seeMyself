import type { MeaningItem } from '@/lib/ui/personMeaning';
import { STEM_HE, STEM_WX, tenGodOf, WX_GOD_GROUP } from './labels';
import { baziPairCards } from './synastryCards';
import type { BaziChart, BaziPillar, WuXing } from './types';

// 八字合婚／合盤 — pure logic, no React. Compares two computed BaziCharts:
//   - 日主 天干：五合、比和、相生、相剋，以及彼此的十神；
//   - 地支：兩盤各柱地支兩兩比對（六合、六沖、半合、相刑、相害、自刑），日支（夫妻宮）與年支（生肖）優先；
//     兩盤合起來才湊齊的三合局另外列出；
//   - 五行互補：一方的喜用五行是另一方的旺五行，或一方極弱的五行另一方很旺。
// A time pillar computed from an unknown birth time is left out of every comparison.
// Report order follows .claude/星盤開發準則.md §3B: 日主關係 → 亮點／磨合／內心與親密／生命課題（卡片）→
// 日常相處 → 吵架與冷戰／內耗與充電／權力／財運與共事／初見 vs 深交（卡片，見 synastryCards.ts）→
// 地支與五行的依據 → 禮物 → 相處建議。

const WX_ORDER: readonly WuXing[] = ['木', '火', '土', '金', '水'];

export type StemRelation = 'he' | 'same' | 'aGeneratesB' | 'bGeneratesA' | 'aControlsB' | 'bControlsA';

export function stemRelation(ganA: string, ganB: string): { kind: StemRelation; hua: WuXing | null } {
  const he = STEM_HE.find(([x, y]) => (x === ganA && y === ganB) || (x === ganB && y === ganA));
  if (he) return { kind: 'he', hua: he[2] as WuXing };
  const i = WX_ORDER.indexOf(STEM_WX[ganA]);
  const j = WX_ORDER.indexOf(STEM_WX[ganB]);
  if (i === j) return { kind: 'same', hua: null };
  if ((i + 1) % 5 === j) return { kind: 'aGeneratesB', hua: null };
  if ((j + 1) % 5 === i) return { kind: 'bGeneratesA', hua: null };
  if ((i + 2) % 5 === j) return { kind: 'aControlsB', hua: null };
  return { kind: 'bControlsA', hua: null };
}

export type BranchRelationKind = 'liuHe' | 'liuChong' | 'banHe' | 'xing' | 'hai' | 'ziXing';

export const BRANCH_RELATION_NAMES: Record<BranchRelationKind, string> = {
  liuHe: '六合',
  liuChong: '六沖',
  banHe: '半合',
  xing: '相刑',
  hai: '相害',
  ziXing: '自刑',
};

const LIU_HE = ['子丑', '寅亥', '卯戌', '辰酉', '巳申', '午未'];
const LIU_CHONG = ['子午', '丑未', '寅申', '卯酉', '辰戌', '巳亥'];
const HAI = ['子未', '丑午', '寅巳', '卯辰', '申亥', '酉戌'];
/** 寅巳申無恩之刑、丑戌未恃勢之刑、子卯無禮之刑。 */
const XING = ['寅巳', '巳申', '寅申', '丑戌', '戌未', '丑未', '子卯'];
const ZI_XING = new Set(['辰', '午', '酉', '亥']);
/** 三合局：生地、帝旺、墓庫。 */
export const SAN_HE: ReadonlyArray<{ branches: readonly [string, string, string]; wx: WuXing }> = [
  { branches: ['申', '子', '辰'], wx: '水' },
  { branches: ['亥', '卯', '未'], wx: '木' },
  { branches: ['寅', '午', '戌'], wx: '火' },
  { branches: ['巳', '酉', '丑'], wx: '金' },
];

function hasPair(list: readonly string[], x: string, y: string): boolean {
  return list.includes(`${x}${y}`) || list.includes(`${y}${x}`);
}

export interface BranchRelation {
  kind: BranchRelationKind;
  /** 半合: the element of the 三合局 it belongs to. */
  wx: WuXing | null;
}

/** Every classic relation between two earthly branches (a pair can have several, e.g. 寅申 沖＋刑). */
export function branchRelations(x: string, y: string): BranchRelation[] {
  const out: BranchRelation[] = [];
  if (x === y) {
    if (ZI_XING.has(x)) out.push({ kind: 'ziXing', wx: null });
    return out;
  }
  if (hasPair(LIU_HE, x, y)) out.push({ kind: 'liuHe', wx: null });
  if (hasPair(LIU_CHONG, x, y)) out.push({ kind: 'liuChong', wx: null });
  const san = SAN_HE.find((g) => g.branches.includes(x) && g.branches.includes(y));
  if (san) out.push({ kind: 'banHe', wx: san.wx });
  if (hasPair(XING, x, y)) out.push({ kind: 'xing', wx: null });
  if (hasPair(HAI, x, y)) out.push({ kind: 'hai', wx: null });
  return out;
}

export interface PillarPairRelation {
  pillarA: BaziPillar['key'];
  pillarB: BaziPillar['key'];
  zhiA: string;
  zhiB: string;
  relations: BranchRelation[];
}

export interface BaziSynastry {
  dayGanA: string;
  dayGanB: string;
  stem: { kind: StemRelation; hua: WuXing | null };
  /** What B's day stem is to A (A's ten-god view), and vice versa. */
  tenGodBForA: string;
  tenGodAForB: string;
  /** Pillar pairs with at least one relation; the 日支×日支 and 年支×年支 pairs come first. */
  branchPairs: PillarPairRelation[];
  dayPair: PillarPairRelation | null;
  yearPair: PillarPairRelation | null;
  /** 三合局 completed only by combining both charts (each contributes at least one branch). */
  sanHe: WuXing[];
  /** Elements A needs (喜／用神) that are strong in B, and vice versa. */
  bHelpsA: WuXing[];
  aHelpsB: WuXing[];
  /** A's weakest elements (≤ 5%) that B has plenty of (≥ 20%), and vice versa. */
  bFillsA: WuXing[];
  aFillsB: WuXing[];
  /** A's 忌神 elements that are strong in B (B's presence feeds what A should avoid), and vice versa. */
  bHurtsA: WuXing[];
  aHurtsB: WuXing[];
  fit: FitSignal;
}

/**
 * 保守的「明顯不合」訊號：只在困難因素明顯壓過緩和因素時才成立。
 * 困難：日柱天剋地沖 +3（否則日支沖 +2、日支刑 +1、日支害 +1）、其他各柱每個沖刑害 +0.5、
 *       一方的忌神是另一方的旺五行 每個方向 +1。
 * 緩和：日主五合 −2、日支六合／半合 −2、喜用互補 每個方向 −1、兩盤合成三合局 −1、其他各柱每個六合 −0.5。
 * 判定：分數 ≥ FIT_DIFFICULT_SCORE，且日支本身有沖或刑（夫妻宮受沖刑是合婚最重視的一項）。
 */
export interface FitSignal {
  difficult: boolean;
  score: number;
  /** 日柱天剋地沖（日干相剋＋日支六沖），合婚裡最被看重的不合條件。 */
  tianKeDiChong: boolean;
  /** Human-readable difficulty factors, most important first. */
  reasons: string[];
}

export const FIT_DIFFICULT_SCORE = 5;

function usablePillars(chart: BaziChart): BaziPillar[] {
  return chart.pillars.filter((p) => !(chart.timeUnknown && p.key === 'time'));
}

function dayGan(chart: BaziChart): string {
  return chart.pillars.find((p) => p.key === 'day')?.gan ?? chart.dayMaster.charAt(0);
}

const GOD_GROUP_CHARS: Array<[string, string]> = [
  ['比', '比劫'],
  ['劫', '比劫'],
  ['食', '食傷'],
  ['傷', '食傷'],
  ['財', '財星'],
  ['官', '官殺'],
  ['殺', '官殺'],
  ['印', '印梟'],
  ['梟', '印梟'],
];

/** 喜神＋用神 god groups (e.g. 「財官」「食傷」) → the five elements they stand for. */
export function usefulElements(chart: Pick<BaziChart, 'xiShen' | 'yongShen' | 'dayMasterWx'>): WuXing[] {
  return godGroupElements(`${chart.xiShen}${chart.yongShen}`, chart.dayMasterWx);
}

/** 忌神 god groups → elements. */
export function avoidElements(chart: Pick<BaziChart, 'jiShen' | 'dayMasterWx'>): WuXing[] {
  return godGroupElements(chart.jiShen ?? '', chart.dayMasterWx);
}

function godGroupElements(text: string, dayMasterWx: WuXing): WuXing[] {
  const groups = new Set<string>();
  for (const ch of text) {
    const g = GOD_GROUP_CHARS.find(([c]) => c === ch);
    if (g) groups.add(g[1]);
  }
  const table = WX_GOD_GROUP[dayMasterWx];
  if (!table) return [];
  return WX_ORDER.filter((wx) => groups.has(table[wx]));
}

function percentOf(chart: BaziChart, wx: WuXing): number {
  return chart.wuXing.find((s) => s.wx === wx)?.percent ?? 0;
}

const STRONG = 20;
const WEAK = 5;

export function analyzeBaziSynastry(a: BaziChart, b: BaziChart): BaziSynastry {
  const ganA = dayGan(a);
  const ganB = dayGan(b);

  const order: BaziPillar['key'][] = ['day', 'year', 'month', 'time'];
  const pairs: PillarPairRelation[] = [];
  for (const pa of usablePillars(a)) {
    for (const pb of usablePillars(b)) {
      const relations = branchRelations(pa.zhi, pb.zhi);
      if (relations.length > 0)
        pairs.push({ pillarA: pa.key, pillarB: pb.key, zhiA: pa.zhi, zhiB: pb.zhi, relations });
    }
  }
  const rank = (p: PillarPairRelation) => {
    if (p.pillarA === 'day' && p.pillarB === 'day') return 0;
    if (p.pillarA === 'year' && p.pillarB === 'year') return 1;
    return 2 + order.indexOf(p.pillarA) * 4 + order.indexOf(p.pillarB);
  };
  pairs.sort((x, y) => rank(x) - rank(y));

  const zhiA = new Set(usablePillars(a).map((p) => p.zhi));
  const zhiB = new Set(usablePillars(b).map((p) => p.zhi));
  const sanHe = SAN_HE.filter((g) => {
    const all = g.branches.every((z) => zhiA.has(z) || zhiB.has(z));
    const aloneA = g.branches.every((z) => zhiA.has(z));
    const aloneB = g.branches.every((z) => zhiB.has(z));
    return all && !aloneA && !aloneB;
  }).map((g) => g.wx);

  const strong = (c: BaziChart) => WX_ORDER.filter((wx) => percentOf(c, wx) >= STRONG);
  const weak = (c: BaziChart) => WX_ORDER.filter((wx) => percentOf(c, wx) <= WEAK);

  const base = {
    dayGanA: ganA,
    dayGanB: ganB,
    stem: stemRelation(ganA, ganB),
    tenGodBForA: tenGodOf(ganA, ganB),
    tenGodAForB: tenGodOf(ganB, ganA),
    branchPairs: pairs,
    dayPair: pairs.find((p) => p.pillarA === 'day' && p.pillarB === 'day') ?? null,
    yearPair: pairs.find((p) => p.pillarA === 'year' && p.pillarB === 'year') ?? null,
    sanHe,
    bHelpsA: usefulElements(a).filter((wx) => strong(b).includes(wx)),
    aHelpsB: usefulElements(b).filter((wx) => strong(a).includes(wx)),
    bFillsA: weak(a).filter((wx) => percentOf(b, wx) >= STRONG),
    aFillsB: weak(b).filter((wx) => percentOf(a, wx) >= STRONG),
    bHurtsA: avoidElements(a).filter((wx) => strong(b).includes(wx)),
    aHurtsB: avoidElements(b).filter((wx) => strong(a).includes(wx)),
  };
  return { ...base, fit: fitSignal(base) };
}

const HARD: readonly BranchRelationKind[] = ['liuChong', 'xing', 'hai'];

export function fitSignal(s: Omit<BaziSynastry, 'fit'>): FitSignal {
  const reasons: string[] = [];
  let score = 0;
  const dayKinds = s.dayPair?.relations.map((r) => r.kind) ?? [];
  const dz = s.dayPair ? `${s.dayPair.zhiA}${s.dayPair.zhiB}` : '';
  const stemClash = s.stem.kind === 'aControlsB' || s.stem.kind === 'bControlsA';
  const tianKeDiChong = stemClash && dayKinds.includes('liuChong');
  if (tianKeDiChong) {
    score += 3;
    reasons.push(`日柱天剋地沖：日干${s.dayGanA}${s.dayGanB}相剋、日支${dz}六沖`);
  } else if (dayKinds.includes('liuChong')) {
    score += 2;
    reasons.push(`夫妻宮${dz}六沖`);
  }
  if (dayKinds.includes('xing')) {
    score += 1;
    reasons.push(`夫妻宮${dz}相刑`);
  }
  if (dayKinds.includes('hai')) {
    score += 1;
    reasons.push(`夫妻宮${dz}相害`);
  }
  const otherHard = s.branchPairs
    .filter((p) => p !== s.dayPair)
    .flatMap((p) => p.relations.filter((r) => HARD.includes(r.kind)));
  score += otherHard.length * 0.5;
  if (otherHard.length >= 2) reasons.push(`其他各柱另有 ${otherHard.length} 處沖刑害`);
  if (s.bHurtsA.length > 0 || s.aHurtsB.length > 0) {
    score += (s.bHurtsA.length > 0 ? 1 : 0) + (s.aHurtsB.length > 0 ? 1 : 0);
    reasons.push('一方的旺五行正是另一方的忌神');
  }

  if (s.stem.kind === 'he') score -= 2;
  if (dayKinds.includes('liuHe') || dayKinds.includes('banHe')) score -= 2;
  score -= (s.bHelpsA.length > 0 ? 1 : 0) + (s.aHelpsB.length > 0 ? 1 : 0);
  if (s.sanHe.length > 0) score -= 1;
  const otherHe = s.branchPairs.filter((p) => p !== s.dayPair).flatMap((p) => p.relations.filter((r) => r.kind === 'liuHe'));
  score -= otherHe.length * 0.5;

  const dayHard = dayKinds.includes('liuChong') || dayKinds.includes('xing');
  return { difficult: dayHard && score >= FIT_DIFFICULT_SCORE, score, tianKeDiChong, reasons };
}

// ---------------------------------------------------------------------------
// Report text
// ---------------------------------------------------------------------------

export interface BaziPartner {
  name: string;
  chart: BaziChart;
}

export const PILLAR_NAMES: Record<BaziPillar['key'], string> = {
  year: '年支',
  month: '月支',
  day: '日支',
  time: '時支',
};

/** 各柱在合婚裡對應的生活面向（年＝家庭與社交、月＝工作與成長環境、日＝夫妻宮、時＝未來與子女）。 */
const PILLAR_AREA: Record<BaziPillar['key'], string> = {
  year: '家庭與社交圈',
  month: '工作與做事方式',
  day: '親密相處',
  time: '未來規劃與子女',
};

const YANG_STEMS = new Set(['甲', '丙', '戊', '庚', '壬']);

/** 十天干的個性、思考、處理矛盾、感受愛的方式（取自天干意象：甲木大樹、乙木花草、丙火太陽…）。 */
interface StemProfile {
  image: string;
  personality: string;
  thinking: string;
  conflict: string;
  love: string;
}

const STEM_PROFILE: Record<string, StemProfile> = {
  甲: {
    image: '大樹',
    personality: '正直、有原則，習慣扛責任，認定的事會堅持到底',
    thinking: '先定方向和原則再行動，決定了就不太想改',
    conflict: '會講道理、守住立場，吵完不記仇，給點時間就會主動修復',
    love: '用照顧和承擔表達愛，會替對方擋事、規劃未來，比較少甜言蜜語',
  },
  乙: {
    image: '花草藤蔓',
    personality: '柔軟有韌性，善於察言觀色，人緣好',
    thinking: '先看氣氛和人，習慣繞個彎找可行的路，常會問別人的意見',
    conflict: '不愛正面衝突，習慣先讓一步，被溫柔安撫後很快就釋懷',
    love: '在意陪伴與回應，喜歡依偎、被放在心上，一句貼心話會記很久',
  },
  丙: {
    image: '太陽',
    personality: '熱情直率、大方，喜歡帶動氣氛',
    thinking: '憑直覺和熱情很快做決定，想到就做，細節事後再補',
    conflict: '火氣來得快去得也快，有話當下說，吵完很快就雨過天晴',
    love: '用行動和公開的方式表達愛，安排驚喜、出遊、大方介紹給朋友，也需要被欣賞',
  },
  丁: {
    image: '燭火',
    personality: '溫和細膩、心思深，外表平靜、內在很熱',
    thinking: '想得細，會顧及每個人的感受，反覆琢磨後才說出結論',
    conflict: '不舒服時先放心裡想清楚，對方主動問一句，就願意好好說出來',
    love: '用細心表達愛，記得對方的喜好、默默準備，渴望被「懂」多過被寵',
  },
  戊: {
    image: '高山',
    personality: '穩重可靠、包容力強，步調慢而守信',
    thinking: '重視穩定與可行性，不輕易改變，需要時間消化新的提議',
    conflict: '很能包容、少發作，需要一點沉澱的時間，想通了就穩如山',
    love: '用陪伴與承諾表達愛，一直都在、說到做到，把生活打理得穩穩的；浪漫不多，但每一份都是真的',
  },
  己: {
    image: '田園沃土',
    personality: '謙和細心、很會照顧人，凡事想得周到',
    thinking: '擅長規劃、顧全細節，會先想好各種後果，凡事有備案',
    conflict: '很體貼、常先顧對方的感受，被鼓勵說出真心話時，溝通最順',
    love: '用照料生活表達愛，煮飯、記帳、把大小事安排好，希望這些付出被看見',
  },
  庚: {
    image: '刀斧鋼鐵',
    personality: '果斷剛直、重義氣、講效率',
    thinking: '直接抓重點、快刀斬亂麻，相信邏輯和結果',
    conflict: '說話直、不轉彎，習慣當場講清楚，講完就算了，不會拖',
    love: '用行動和保護表達愛，幫對方解決問題、替對方出頭，不擅長說軟話',
  },
  辛: {
    image: '珠玉',
    personality: '精緻敏銳、重品味與面子，追求完美',
    thinking: '標準高、在意細節和質感，一眼就看到哪裡不夠好',
    conflict: '對語氣和態度很細膩，被尊重地對待時，很快就願意和好',
    love: '重視儀式感與被珍惜的感覺，用心挑的禮物、好好打扮的約會、真誠的稱讚最打動',
  },
  壬: {
    image: '江河大海',
    personality: '聰明靈活、好奇心強，愛自由',
    thinking: '思路跳躍、點子多，喜歡幾個方案同時進行，不喜歡被限定',
    conflict: '需要先離開現場讓情緒過去，冷靜後很能理性地談',
    love: '需要空間也需要新鮮感，一起旅行、探索、聊很深的話題，黏太緊反而會退後',
  },
  癸: {
    image: '雨露',
    personality: '溫柔敏感、直覺強、善解人意',
    thinking: '靠直覺和感受判斷，心裡想很多，有了答案也不一定說出口',
    conflict: '情緒比語言先到，給一點時間與溫柔，就會把心事說出來',
    love: '從被理解中感受愛，深夜談心、被溫柔對待，比禮物更重要',
  },
};

/** 天干五合，各有古稱（見《三命通會．論天干相合》）。先寫這一組最珍貴的地方，再給一個成長點。 */
const STEM_HE_NOTE: Record<string, string> = {
  甲己: '甲己合古稱「中正之合」，是五合裡最講信用、最寬厚的一組。甲木像大樹往上長，己土像田地穩穩托住樹根：一個給方向、一個給支撐，兩人做事踏實、說話算話，很容易一起把日子經營得安穩，旁人看了也放心。成長點在於讓支撐是雙向的：己也留一塊只屬於自己的地，甲多問一句己想要什麼，這份中正就會一直平衡。',
  乙庚: '乙庚合古稱「仁義之合」，重情義、守承諾。庚金剛直、乙木柔韌，一剛一柔，彼此欣賞的正是自己沒有的那一面：庚在乙身邊學會溫柔，乙在庚身邊多了底氣，認定了就會一起走很遠。可以試試讓庚說話收一點力道、乙大方說出不同的想法，這份情義會更長久。',
  丙辛: '丙辛合古稱「威制之合」。丙火像太陽、辛金像珠玉，陽光照在珠寶上格外耀眼：丙給辛溫暖與舞台，辛讓丙的熱情有了質感，兩人站在一起特別亮眼，是旁人眼中很登對的一對。「威制」也提醒兩人各有光芒，輪流當主角、彼此捧場，光彩就會加倍。',
  丁壬: '丁壬合古書稱「淫慝之合」，也有人稱「仁壽之合」，意思是情感濃、吸引力強。丁火像燭光、壬水像江河，一個細膩、一個開闊，很容易被對方的氣質打動，聊天能聊到深夜，心動感也比一般組合持久。感情濃時記得各自保有朋友和生活圈，不必黏得太緊，這份吸引就能細水長流。',
  戊癸: '戊癸合古稱「無情之合」，這裡的「無情」不是沒感情，而是重實際、不浮誇。戊土像高山、癸水像雨露：戊給得出安穩，癸讓戊的生活多了柔軟與細膩，一個撐住、一個滋潤，是很能一起過日子的組合。角色固定久了，可以偶爾交換：讓戊也被照顧、讓癸也當一次靠山，關係就會一直有溫度。',
};

/** 合而化：在一起久了，兩人都會往合化五行的特質靠。 */
const HUA_NOTE: Record<WuXing, string> = {
  土: '合而化土，相處久了兩人都會變得更務實、更顧家，彼此是最穩的後盾；偶爾安排一點計畫外的浪漫，日子就不會只剩例行公事',
  金: '合而化金，兩人在一起更有原則、更果斷，一起做決定特別有效率；記得在效率之外留點撒嬌和玩笑的空間',
  水: '合而化水，兩人在一起思路更靈活、話題聊不完，心意也特別相通；情緒起伏時先散個步再談，就能把敏感變成體貼',
  木: '合而化木，兩人在一起很有往前長的動力，常常一起變成更好的人；目標排滿時記得留白，讓關係也有休息的時候',
  火: '合而化火，兩人在一起熱情被點燃、行動力大增，什麼事都想一起做；著急時先深呼吸，這股火就會是暖而不是燙',
};

/** 相生：key 是「生方五行＋受生方五行」，G＝生方、R＝受生方。 */
const GEN_NOTE: Record<string, string> = {
  木火: '木生火，像柴添火：G的穩定與計畫，讓R更有熱情與舞台，R的光也照亮了G的生活，兩人在一起常常越聊越有勁。可以試試讓R偶爾也為G張羅一次，這份支持就會雙向流動、越燒越旺',
  火土: '火生土，像陽光曬暖大地：G的熱情與鼓勵，讓R更有安全感、更踏實，R的穩重也給了G一個可以安心回來的地方。R的回應有時慢半拍，多說一句「謝謝」，G的熱情就會一直被接住',
  土金: '土生金，像山裡藏著礦：G的包容與耐心，讓R的能力被一點一點磨亮，R的成就裡常有G的一份功勞。G可以放手讓R獨當一面，R也記得把功勞分給G，兩人都會更有成就感',
  金水: '金生水，像岩縫湧出泉水：G的原則與條理，讓R的想法更清楚、更有方向，R的靈活也常讓G看見規則之外的可能。G給建議前先問R想不想聽，這份引導就會被當成禮物',
  水木: '水生木，像雨水灌溉樹苗：G的體貼與智慧，讓R安心成長，R長大後的枝葉也會替G遮陰。G記得也照顧自己、把需要說出口，R也試著主動扛一些事，這份滋養就能長長久久',
};

/** 相剋：key 是「剋方五行＋被剋方五行」，C＝剋方、D＝被剋方。 */
const CTRL_NOTE: Record<string, string> = {
  木土: '木剋土，像樹根抓住土地：C有主見、能帶方向，常讓慢熱的D真的動起來，把想了很久的事做成；D的穩定也讓C的衝勁有了落腳處。C推動時多配合D的節奏，D就會覺得是被陪著走，而不是被拉著走',
  土水: '土剋水，像堤防守住水流：D漂浮不定時，C是讓D落地、安心的那個人，D的靈活也讓C的生活多了變化。C給框架時留一點彈性，D就能感受到這是保護，而不是限制',
  水火: '水剋火，像水調和火勢：C冷靜理性，D一時上火時攔得住，不少衝動的決定因此免了；D的熱情也讓C的生活多了溫度。C想提醒前先肯定D的熱情，D就更聽得進去',
  火金: '火剋金，像爐火煉金：C的熱情與期待能逼出D的潛力，D在C身邊成長得特別快，常做到自己都沒想過的事。火候記得調小一點，多說一句「已經很好了」，D就會越煉越亮',
  金木: '金剋木，像斧頭修剪樹枝：C講效率與標準，D的很多想法經C一問，反而更成熟可行，修剪過的樹也長得更直；D的創意則讓C的標準多了溫度。C提醒時先說D做得好的地方，D就會把修剪當成用心',
};

const SAME_NOTE: Record<WuXing, string> = {
  木: '兩棵樹並排長，方向一致、互相扶著往上，一起成長的感覺特別強',
  火: '兩團火放在一起，熱鬧有勁，走到哪都是氣氛最好的一對',
  土: '兩座山相望，都穩、都可靠，彼此是最放心的依靠',
  金: '兩把刀擺在一起，都講原則、重義氣，說到做到，彼此最信得過',
  水: '兩道水流匯在一起，最懂彼此的心思，很多話不用說就明白',
};

const TEN_GOD_ROLE: Record<string, string> = {
  比肩: '像平起平坐的夥伴，價值觀相近，討論很快有共識；遇到誰主導時輪流做主，默契會更好',
  劫財: '像會一起拚、也願意分享的同伴，彼此激勵、越比越進步；資源和決定權先講好，就能專心當隊友',
  食神: '是讓人放鬆、想照顧與分享的對象，在一起氣氛輕鬆、笑聲多；偶爾一起排一件正事，舒服之外也有前進',
  傷官: '會激發創意與表達欲，聊天越聊越有火花；爭辯時記得是在一起想點子，不是比輸贏',
  正財: '是讓人踏實、想好好經營的對象，會想一起規劃生活和未來；經營之餘保留一點隨性，關係更有呼吸感',
  偏財: '帶來新鮮感與機會感，在一起比較敢冒險、生活充滿驚喜；新鮮感淡了時，主動安排新體驗就能保溫',
  正官: '讓人變得自律、有責任感，被對方的穩定帶著成長；在對方面前也可以放心放鬆，不必時時表現',
  七殺: '帶來心動與張力，也激發魄力與勇氣；被推著走時說出自己的節奏，張力就會變成動力',
  正印: '像靠山一樣支持、包容，在一起有被接住的安全感；被照顧之餘也回頭照顧對方，這份安全感就是雙向的',
  偏印: '能給獨特的啟發，角度不同、常能點醒對方；一時聽不懂時多問一句，就能接住這份特別的智慧',
};

/** 十神在日常的具體畫面：s＝主體，o＝對方（o 是 s 的這個十神）。 */
const TEN_GOD_SCENE: Record<string, { decide: (s: string, o: string) => string; love: (s: string, o: string) => string }> = {
  比肩: {
    decide: (s, o) => `${o}是${s}的比肩：兩人想法接近，討論很快有共識，像有個可以並肩商量的夥伴；遇到「這次聽誰的」時，輪流做主最順`,
    love: (s, o) => `${s}跟${o}在一起像好朋友一樣自在，愛是並肩一起做事、一起面對問題；${s}偶爾想被寵一下時大方說出口，${o}會很樂意`,
  },
  劫財: {
    decide: (s, o) => `${o}是${s}的劫財：${o}常提出跟${s}不同的做法，兩人一來一往，常激盪出更好的方案；錢和決定權事先講好，合作會更順`,
    love: (s, o) => `${s}會被${o}的活力帶動，愛裡帶點較勁的玩心，一起運動、玩遊戲、比賽反而最親近；${o}表現亮眼時，${s}大方說聲「好厲害」，比較心就變成驕傲`,
  },
  食神: {
    decide: (s, o) => `${o}是${s}的食神：在${o}面前${s}容易放鬆，想法自然說出口，一起討論事情氣氛輕鬆；遇到該堅持的事，${s}可以溫和但清楚地說出立場`,
    love: (s, o) => `${s}的愛是想餵飽、照顧、逗${o}開心，一起吃頓好的、散個步就很滿足；照顧時也問問${o}想要什麼，心意會更對味`,
  },
  傷官: {
    decide: (s, o) => `${o}是${s}的傷官：${o}會激發${s}的新點子，讓${s}敢挑戰既有的做法，討論常越聊越有創意；聊到爭辯時，記得兩人是同一隊`,
    love: (s, o) => `${s}在${o}面前特別想表現、想被看見，愛裡有說不完的話，${o}常被逗得很開心；話說得太直時，換個柔軟的語氣就更動聽`,
  },
  正財: {
    decide: (s, o) => `${o}是${s}的正財：${s}覺得${o}很實在，做決定時會把${o}和兩人的生活一起算進去，是很願意負責的一方；多問${o}的意見而不是替${o}安排好，${o}會更有參與感`,
    love: (s, o) => `${s}的愛是穩定經營：準時回訊息、固定約會、為兩人的未來存錢，${o}給${s}滿滿的踏實感；偶爾一次不按牌理的驚喜，會讓這份穩定更甜`,
  },
  偏財: {
    decide: (s, o) => `${o}是${s}的偏財：${o}帶來新的機會和玩法，${s}跟${o}在一起更敢嘗試、說走就走；大一點的決定先睡一晚再拍板，就能玩得盡興又安心`,
    love: (s, o) => `${s}被${o}的新鮮感吸引，愛的時候很大方；兩人常一起去新地方、試新事物，感情就會一直保溫`,
  },
  正官: {
    decide: (s, o) => `${o}是${s}的正官：${s}在${o}面前會變得自律、有擔當，重大決定常想先聽${o}的意見，${o}是${s}很信任的參謀；${s}也可以多相信自己的判斷`,
    love: (s, o) => `${s}覺得${o}可靠、值得託付，愛裡帶著尊重與欣賞；${o}多給一些肯定，${s}會更有自信地愛`,
  },
  七殺: {
    decide: (s, o) => `${o}是${s}的七殺：${o}一句話就能推${s}一把，${s}在${o}身邊特別有魄力、敢做大決定；${o}催促時多留點空間讓${s}自己拍板，效果會更好`,
    love: (s, o) => `${s}對${o}有強烈的心動與張力，愛得很投入、很真；${o}放軟語氣時，${s}會更安心地靠近`,
  },
  正印: {
    decide: (s, o) => `${o}是${s}的正印：${o}像${s}的靠山，${s}卡住時找${o}聊一聊就安心多了；${s}先自己想一輪再找${o}，兩人的討論會更有收穫`,
    love: (s, o) => `${s}從${o}那裡感受到包容與照顧，愛是一種被接住的安全感；${s}也試著回頭照顧${o}，這份溫暖會越來越厚`,
  },
  偏印: {
    decide: (s, o) => `${o}是${s}的偏印：${o}的想法常跟${s}不一樣、角度獨特，常能點醒${s}；一時聽不懂時多問一句，常會挖到寶`,
    love: (s, o) => `${s}跟${o}之間有種心照不宣的默契，很多事不用多說；${o}想獨處時${s}給點空間，${o}回來時會更靠近`,
  },
};

/** 十神帶給對方的禮物：o 給 s 的東西（o 是 s 的這個十神）。 */
const TEN_GOD_GIFT: Record<string, (s: string, o: string) => string> = {
  比肩: (s, o) => `${o}讓${s}有了一個真正懂自己的夥伴`,
  劫財: (s, o) => `${o}讓${s}的生活多了活力，也多了一起拚的戰友`,
  食神: (s, o) => `${o}讓${s}卸下防備、自在地做自己`,
  傷官: (s, o) => `${o}點燃${s}的創意，讓${s}敢說、敢表現`,
  正財: (s, o) => `${o}給${s}踏實感，讓${s}想認真經營兩人的未來`,
  偏財: (s, o) => `${o}帶${s}走出舒適圈，看見生活的新可能`,
  正官: (s, o) => `${o}讓${s}變得更穩、更有擔當`,
  七殺: (s, o) => `${o}激發${s}的魄力，讓${s}成為更勇敢的自己`,
  正印: (s, o) => `${o}給${s}被接住的安全感`,
  偏印: (s, o) => `${o}給${s}與眾不同的視角，常一句話就點醒${s}`,
};

/** 兩人互為比肩或劫財（同五行日主）時，合成一句，避免兩行一模一樣。 */
const MUTUAL_SCENE: Record<string, { decide: string; love: string; gift: string }> = {
  比肩: {
    decide: '兩人互為比肩：想法和做事標準很接近，討論很快有共識，常常一個眼神就知道要怎麼做；遇到「這次聽誰的」，輪流當決定的人最省力',
    love: '兩人互為比肩，相處像最好的朋友，愛是一起做喜歡的事、並肩面對問題；兩人都不習慣示弱，累的時候可以約好一句暗號，例如「今天想被抱一下」',
    gift: '兩人互為比肩，彼此都是對方最懂自己的夥伴，不用解釋就被理解',
  },
  劫財: {
    decide: '兩人互為劫財：一陰一陽，做法常常不同，正好能從兩個角度看同一件事，互相激出更好的辦法；事先講好誰負責哪一塊，就能把較勁變成分工',
    love: '兩人互為劫財，愛裡帶點較勁也帶點玩心，一起運動、打電動、比賽輸贏反而最親近；吃醋時說出來、笑一笑，就是最好的情趣',
    gift: '兩人互為劫財，是會互相激勵、一起變強的戰友',
  },
};

/** 五行在相處中帶來的東西。 */
const WX_GIVE: Record<WuXing, string> = {
  木: '計畫、成長與鼓勵',
  火: '熱情、表達與行動力',
  土: '穩定、包容與承諾',
  金: '決斷、規則與條理',
  水: '思考、彈性與溝通',
};

/** 被補到這個五行時的感受。 */
const WX_FEEL: Record<WuXing, string> = {
  木: '被鼓勵往前走、有成長的動力',
  火: '心情被點亮、整個人有活力',
  土: '安定下來、有歸屬感',
  金: '思緒變清楚、做事有了條理',
  水: '心比較靜、想法變得靈活',
};

const LIU_HE_NOTE: Record<string, string> = {
  子丑: '子丑合土，務實又顧家，相處像一起把日子過好，彼此是最穩的依靠；偶爾安排點小驚喜，生活就不只柴米油鹽',
  寅亥: '寅亥合木，互相扶持、一起成長，在對方身邊會變成更好的自己；記得輪流當出力的那一方',
  卯戌: '卯戌合火，熱情、浪漫，很容易互相欣賞、彼此吸引；把熱度化成固定的小儀式，感情就能一直溫溫的',
  辰酉: '辰酉合金，講信用、重承諾，是說到做到、彼此最放心的一對；認真之餘多一點玩笑，相處會更輕鬆',
  巳申: '巳申合水，聰明投契，聊天很有火花；合中帶刑的那點較勁，也是彼此激勵的動力',
  午未: '午未合（日月之合），溫暖親近，最有「家」的感覺；親密之外各自保留一點空間，會更長久',
};

const CHONG_NOTE: Record<string, string> = {
  子午: '子水午火相沖，一冷一熱，正好一個能幫另一個降溫、一個能幫另一個加熱，生活不會無聊；節奏對不上時，先說出自己現在的狀態就好',
  丑未: '丑未兩土相沖，兩人都認真負責，把話說開後定下的規矩往往守得最好；生活習慣不同時，把家務和規則寫下來分工最省力',
  寅申: '寅木申金相沖，衝勁遇上原則，一起討論過的計畫通常更周全，走得也更快；方向不同時先各說各的理由，再一起選',
  卯酉: '卯木酉金相沖，一個重感受、一個重對錯，彼此幫對方看見盲點，久了一個更講理、一個更體貼；意見不同時先接住感受，再談對錯',
  辰戌: '辰戌兩土相沖，兩人都有擔當、都想守護這段關係，問題不會被藏起來；決定權先分好區塊，就不必拉鋸',
  巳亥: '巳火亥水相沖，一快一慢讓生活充滿新意，新點子常在討論裡冒出來；計畫被打亂時，留一點緩衝時間就好',
};

/** 刑的三種古稱（「」內是古稱，重複說明的判斷靠它）。 */
function xingNote(x: string, y: string): string {
  const s = `${x}${y}`;
  if (/^(子卯|卯子)$/.test(s)) return '子卯「無禮之刑」，兩人在彼此面前完全不用裝，是最真實的相處；說話時多一分分寸，親近就更舒服';
  if (/[寅巳申]{2}/.test(s)) return '寅巳申「無恩之刑」，兩人都很願意為對方付出；做之前先問對方需要什麼，心意就更容易被接住';
  return '丑戌未「恃勢之刑」，兩個都有主見，聯手對外時特別有份量；意見不同時輪流做主，就不必爭誰說了算';
}

function orderedKey(table: Record<string, string>, x: string, y: string): string | undefined {
  return table[`${x}${y}`] ?? table[`${y}${x}`];
}

const HAI_NOTE: Record<string, string> = {
  子未: '子未相害，一方給情緒上的回應、一方給實際的照顧，兩種在乎都是真的；學會翻譯對方的表達方式，就能收到加倍的愛',
  丑午: '丑午相害，慢的那個給了穩、急的那個給了動力，步調對上時正好互補；熱情一時沒被接住時，給對方一點時間',
  寅巳: '寅巳相害，兩人都很想為對方好、也都有主見；把「我來做」換成「需要幫忙嗎」，這份好意就會被接住',
  卯辰: '卯辰相害，大而化之的那個常能幫敏感的那個鬆一口氣，敏感的那個也讓對方更細心；在意的小事說出來，比放在心裡好',
  申亥: '申亥相害，兩人都聰明，是最懂彼此言外之意的一對；有話直說，就不必互相猜',
  酉戌: '酉戌相害，一個抓細節、一個守底線，合作時正好補上對方的漏洞；提醒時先肯定再建議，就會被聽成關心',
};

/** 各柱 × 各種地支關係在生活裡的具體畫面。 */
const PILLAR_SCENE: Record<BaziPillar['key'], Record<BranchRelationKind, string>> = {
  year: {
    liuHe: '和對方的家人、朋友容易處得來，聚會時氣氛熱絡，兩家人也容易喜歡彼此的另一半',
    liuChong: '兩邊家庭的習慣各有特色，能讓兩人看見不同的生活方式；過年回哪邊、怎麼跟長輩相處，提早商量就好',
    banHe: '容易融入彼此的朋友圈，一起經營共同的社交生活；偶爾各自和朋友聚聚，也保有喘口氣的空間',
    xing: '和對方家人或朋友相處時會特別在意表現，代表很重視這段關係；放輕鬆做自己，反而最得人緣',
    hai: '對對方的家人或朋友有些細微的感受，找個輕鬆的時機說出來，對方會更懂得怎麼支持',
    ziXing: '兩人在家庭議題上有相似的心事，最能體會彼此；一起聊開，就能互相打氣',
  },
  month: {
    liuHe: '一起做事很有默契，分工自然，適合一起規劃旅行或布置住處',
    liuChong: '做事節奏不同，一個先做再說、一個先計畫好，搭配起來既有效率又周全；開始前先講好節奏就好',
    banHe: '在工作和目標上能互相拉抬，適合一起存錢、進修或經營副業；衝刺時也記得一起休息',
    xing: '一起做事時都想做到最好，會互相提點；把「誰的方法好」換成「兩種一起試」，就能截長補短',
    hai: '對彼此的工作方式各有體會，偶爾聊聊對方最近的忙碌與辛苦，就能互相加油',
    ziXing: '兩人做事的習慣很像，最能理解彼此的辛苦；互相提醒，就能一起避開同樣的坑',
  },
  day: {
    liuHe: '關起門來很自在，生活小事容易有默契',
    liuChong: '在家的作息、整潔、花錢習慣各有一套，同住後能互相補位；磨合期稍長，把習慣講開就好',
    banHe: '私下相處像隊友，容易一起朝同一個生活目標努力；記得也留點時間浪漫和撒嬌',
    xing: '私下相處很真實、不設防，小事上的提點也是在乎；語氣溫柔一點，就更甜',
    hai: '親密之中有些心事需要被聽見，養成定期聊心事的習慣，感情會更深',
    ziXing: '兩人在親密關係裡有相似的敏感點，也最懂得怎麼照顧彼此的那一塊',
  },
  time: {
    liuHe: '對未來的想像和教養觀接近，談到要不要生小孩、以後想住哪裡容易有共識',
    liuChong: '對未來各有想法，能把長期計畫想得更全面；何時買房、要不要生小孩，攤開來談就能找到共識',
    banHe: '對長遠目標有共同方向，越往後越像一個團隊；有人想轉彎時，一起重新討論就好',
    xing: '談到未來規劃或教養都很有想法，兩種做法一起比較，常能找到更好的路',
    hai: '對未來各有放在心裡的擔心，把長期計畫攤開來談，就能變成一起準備',
    ziXing: '對未來有相似的在意，最能一起準備、互相安心',
  },
};

/** 一組柱位落在哪個生活面向：同柱就是該柱；有一邊是日柱時，看另一柱如何牽動親密相處。 */
function scenePillar(p: PillarPairRelation): BaziPillar['key'] {
  if (p.pillarA === p.pillarB) return p.pillarA;
  if (p.pillarA === 'day') return p.pillarB;
  if (p.pillarB === 'day') return p.pillarA;
  return p.pillarA;
}

/** 同一份報告裡，同一種刑（或同一組支的合沖害）只完整說明一次，之後簡短帶過。 */
function repeatedNote(r: BranchRelation, x: string, y: string, seen: Set<string>): string | null {
  const key = r.kind === 'xing' ? (xingNote(x, y).match(/「(.+?)」/)?.[1] ?? 'xing') : `${r.kind}:${[x, y].sort().join('')}`;
  if (!seen.has(key)) {
    seen.add(key);
    return null;
  }
  if (r.kind === 'xing') return `又是「${key}」，特質同前面所述`;
  if (r.kind === 'ziXing') return `${x}${x}同支自刑，特質同前面所述`;
  return `${[x, y].join('')}${BRANCH_RELATION_NAMES[r.kind]}的特質同前面所述`;
}

function branchNote(r: BranchRelation, p: PillarPairRelation, seen: Set<string>): string {
  const { zhiA: x, zhiB: y } = p;
  const scene = PILLAR_SCENE[scenePillar(p)][r.kind];
  const again = r.kind === 'banHe' ? null : repeatedNote(r, x, y, seen);
  if (again) return `${again}，這裡落在：${scene}`;
  switch (r.kind) {
    case 'liuHe':
      return `${orderedKey(LIU_HE_NOTE, x, y) ?? '六合和合'}：${scene}`;
    case 'liuChong':
      return `${orderedKey(CHONG_NOTE, x, y) ?? '六沖'}：${scene}`;
    case 'banHe':
      return `同屬${r.wx}局，有共同的${r.wx ? WX_GIVE[r.wx] : '方向'}：${scene}`;
    case 'xing':
      return `${xingNote(x, y)}：${scene}`;
    case 'hai':
      return `${orderedKey(HAI_NOTE, x, y) ?? '相害代表暗中的不舒服'}：${scene}`;
    case 'ziXing':
      return `${x}${x}同支自刑，兩人卡在同樣的地方，也最能體會對方的難處：${scene}`;
  }
}

function relationText(r: BranchRelation, zhiA: string, zhiB: string): string {
  const name = BRANCH_RELATION_NAMES[r.kind];
  if (r.kind === 'banHe') return `${zhiA}${zhiB}半合（${r.wx}局）`;
  if (r.kind === 'ziXing') return `${zhiA}${zhiB}自刑`;
  return `${zhiA}${zhiB}${name}`;
}

function pairLine(p: PillarPairRelation, a: BaziPartner, b: BaziPartner, seen: Set<string>): string {
  const rels = p.relations.map((r) => relationText(r, p.zhiA, p.zhiB)).join('、');
  const where =
    p.pillarA === p.pillarB
      ? `落在兩人的${PILLAR_AREA[p.pillarA]}`
      : `牽動${a.name}的${PILLAR_AREA[p.pillarA]}、${b.name}的${PILLAR_AREA[p.pillarB]}`;
  const notes = p.relations.map((r) => branchNote(r, p, seen)).join('；');
  return `${a.name}${PILLAR_NAMES[p.pillarA]}${p.zhiA} × ${b.name}${PILLAR_NAMES[p.pillarB]}${p.zhiB}：${rels}，${where}。${notes}。`;
}
function fill(template: string, keys: Record<string, string>): string {
  return template.replace(/[GRCD]/g, (k) => keys[k] ?? k);
}

function stemText(a: BaziPartner, b: BaziPartner, syn: BaziSynastry): string {
  const ga = syn.dayGanA;
  const gb = syn.dayGanB;
  const wa = STEM_WX[ga];
  switch (syn.stem.kind) {
    case 'he': {
      const note = orderedKey(STEM_HE_NOTE, ga, gb) ?? '日主相合，彼此有天然的吸引與默契。';
      const hua = syn.stem.hua ? `${HUA_NOTE[syn.stem.hua]}。` : '';
      return `${a.name}的${ga}與${b.name}的${gb}天干五合（合化${syn.stem.hua}）：${note}${hua}`;
    }
    case 'same': {
      const pol = YANG_STEMS.has(ga) === YANG_STEMS.has(gb);
      return `兩人日主同屬${wa}（${ga}、${gb}），${SAME_NOTE[wa]}。${pol ? '陰陽也相同，像照鏡子，連脾氣都很像，最容易一眼看懂對方；' : '一陰一陽，同中有異，一個外放、一個內斂，正好互相補位；'}各自保有一塊舞台，相處會更順。`;
    }
    case 'aGeneratesB':
    case 'bGeneratesA': {
      const [g, r, gg, rg] = syn.stem.kind === 'aGeneratesB' ? [a.name, b.name, ga, gb] : [b.name, a.name, gb, ga];
      const note = fill(GEN_NOTE[`${STEM_WX[gg]}${STEM_WX[rg]}`] ?? '', { G: g, R: r });
      return `${g}的${gg}${STEM_WX[gg]}生${r}的${rg}${STEM_WX[rg]}，${note}。`;
    }
    case 'aControlsB':
    case 'bControlsA': {
      const [c, d, cg, dg] = syn.stem.kind === 'aControlsB' ? [a.name, b.name, ga, gb] : [b.name, a.name, gb, ga];
      const note = fill(CTRL_NOTE[`${STEM_WX[cg]}${STEM_WX[dg]}`] ?? '', { C: c, D: d });
      return `${c}的${cg}${STEM_WX[cg]}剋${d}的${dg}${STEM_WX[dg]}，${note}。剋在八字裡也代表吸引，這股張力常是心動的來源；${c}的要求留點餘地，就是最好的平衡。`;
    }
  }
}

/** 排盤套件的生肖可能是簡體字（U+732A），這裡統一成「豬」。 */
function twZodiac(x: string): string {
  return x.replace('\u732A', '豬');
}

function item(term: string, field: string, meaning: string): MeaningItem {
  return { term, field, meaning };
}

export function baziSynastryItems(a: BaziPartner, b: BaziPartner, syn: BaziSynastry): MeaningItem[] {
  const items: MeaningItem[] = [];

  items.push(
    item(
      '日主關係',
      '兩人的日干（自己）之間是相合、同類、相生或相剋，是合盤最核心的一層。',
      [
        stemText(a, b, syn),
        syn.tenGodBForA && syn.tenGodBForA === syn.tenGodAForB && TEN_GOD_ROLE[syn.tenGodBForA]
          ? `兩人的日干互為「${syn.tenGodBForA}」，${TEN_GOD_ROLE[syn.tenGodBForA]}。`
          : syn.tenGodBForA && TEN_GOD_ROLE[syn.tenGodBForA]
            ? `對${a.name}來說，${b.name}的日干是「${syn.tenGodBForA}」，${TEN_GOD_ROLE[syn.tenGodBForA]}。`
            : '',
        syn.tenGodAForB && syn.tenGodAForB !== syn.tenGodBForA && TEN_GOD_ROLE[syn.tenGodAForB]
          ? `對${b.name}來說，${a.name}的日干是「${syn.tenGodAForB}」，${TEN_GOD_ROLE[syn.tenGodAForB]}。`
          : '',
      ]
        .filter(Boolean)
        .join('\n'),
    ),
  );

  const cards = baziPairCards(a, b, syn);
  items.push(...cards.before);
  items.push(item('日常相處', '依兩人的日主個性、彼此的十神、夫妻宮與五行，描繪生活裡的具體畫面。', dailyLines(a, b, syn).join('\n')));
  items.push(...cards.after);

  const keyLines: string[] = [];
  const seen = new Set<string>();
  const dayZhiA = a.chart.pillars.find((p) => p.key === 'day')?.zhi;
  const dayZhiB = b.chart.pillars.find((p) => p.key === 'day')?.zhi;
  if (syn.dayPair) {
    keyLines.push(`日支是夫妻宮（配偶宮），最能反映兩人關起門來相處的感覺。${pairLine(syn.dayPair, a, b, seen)}`);
    if (syn.fit.difficult)
      keyLines.push(
        '坦白說，夫妻宮受沖刑在合婚裡是比較吃力的一項：同住後的作息、金錢、家務與說話方式，都需要比一般伴侶更早、更具體地談清楚，不能只靠感情撐著。',
      );
  } else if (dayZhiA && dayZhiB) {
    keyLines.push(
      `日支（夫妻宮）${dayZhiA} × ${dayZhiB}：沒有明顯的合沖刑害，親密相處平穩自在，溫度掌握在兩人的日常經營裡。`,
    );
  }
  const yearZhiA = a.chart.pillars.find((p) => p.key === 'year')?.zhi;
  const yearZhiB = b.chart.pillars.find((p) => p.key === 'year')?.zhi;
  if (syn.yearPair) {
    keyLines.push(
      `年支是生肖（${twZodiac(a.chart.shengXiao)} × ${twZodiac(b.chart.shengXiao)}），反映原生家庭與兩家人的互動。${pairLine(syn.yearPair, a, b, seen)}`,
    );
  } else if (yearZhiA && yearZhiB) {
    keyLines.push(
      `生肖 ${twZodiac(a.chart.shengXiao)}（${yearZhiA}）× ${twZodiac(b.chart.shengXiao)}（${yearZhiB}）：沒有明顯的合沖刑害，兩邊家庭與社交圈各自安好、不太互相牽動。`,
    );
  }
  items.push(item('夫妻宮與生肖', '日支（夫妻宮）與年支（生肖）的合沖刑害，合婚時最先看的兩組地支。', keyLines.join('\n')));

  const others = syn.branchPairs.filter((p) => p !== syn.dayPair && p !== syn.yearPair);
  const otherLines = others.map((p) => pairLine(p, a, b, seen));
  if (syn.sanHe.length > 0) {
    otherLines.push(
      `兩盤地支合起來湊成三合${syn.sanHe.map((wx) => `${wx}局`).join('、')}：這股${syn.sanHe.map((wx) => WX_GIVE[wx]).join('、')}的力量只有兩人在一起時才完整，是共同目標與合作的來源，也是這段關係獨有的力量；一方忙碌時，記得用小小的聯繫讓它不斷線。`,
    );
  }
  const unknown = [a, b].filter((p) => p.chart.timeUnknown).map((p) => p.name);
  items.push({
    ...item(
      '其他地支互動',
      '兩盤其餘各柱地支之間的六合、六沖、半合、刑、害（逐組列出的依據）；年柱看家庭與社交、月柱看工作與做事方式、時柱看未來與子女。',
      [
        otherLines.length > 0 ? otherLines.join('\n') : '其餘各柱地支之間沒有明顯的合沖刑害。',
        unknown.length > 0 ? `${unknown.join('、')}的出生時間不確定，時柱不列入比對。` : '',
      ]
        .filter(Boolean)
        .join('\n'),
    ),
    collapsed: true,
  });

  const wxLines: string[] = [
    `${a.name}：${a.chart.wuXing.map((s) => `${s.wx}${s.percent}%`).join('、')}（${a.chart.strength}）`,
    `${b.name}：${b.chart.wuXing.map((s) => `${s.wx}${s.percent}%`).join('、')}（${b.chart.strength}）`,
  ];
  const helpLine = (need: string, give: string, list: WuXing[]) =>
    `${need}的喜用五行${list.join('、')}在${give}盤中很旺：${give}自然帶著${list.map((wx) => WX_GIVE[wx]).join('、')}，和${give}相處時，${need}常覺得${list.map((wx) => WX_FEEL[wx]).join('，也')}，是很難得的互補；${need}也慢慢培養自己的這股力量，${give}累的時候就能換${need}撐著。`;
  const fillLine = (lack: string, give: string, list: WuXing[]) =>
    `${lack}盤中極少的${list.join('、')}，${give}剛好很多：${list.map((wx) => WX_GIVE[wx]).join('、')}是${lack}比較陌生的面向，${give}正好是最好的老師，能帶${lack}看見新的自己；起初不習慣時多點好奇、少點評判，就能學到最多。`;
  if (syn.bHelpsA.length > 0) wxLines.push(helpLine(a.name, b.name, syn.bHelpsA));
  if (syn.aHelpsB.length > 0) wxLines.push(helpLine(b.name, a.name, syn.aHelpsB));
  if (syn.bFillsA.length > 0) wxLines.push(fillLine(a.name, b.name, syn.bFillsA));
  if (syn.aFillsB.length > 0) wxLines.push(fillLine(b.name, a.name, syn.aFillsB));
  if (syn.bHelpsA.length + syn.aHelpsB.length + syn.bFillsA.length + syn.aFillsB.length === 0) {
    const topA = dominantWx(a.chart);
    const topB = dominantWx(b.chart);
    wxLines.push(
      topA === topB
        ? `兩人最旺的都是${topA}，強項相近，一起時${WX_GIVE[topA]}會加倍，是很有共識的組合；同樣少的部分可以一起從生活中補，彼此的支持多來自用心的相處。`
        : `兩人的五行沒有明顯的喜用互補：${a.name}以${topA}為主、${b.name}以${topB}為主，各有擅長、各有舞台，彼此的支持多來自用心的相處。`,
    );
  }
  items.push(item('五行互補', '一方需要（喜用神）或缺少的五行，是否正是另一方的旺五行。', wxLines.join('\n')));

  items.push(giftItem(a, b, syn));
  items.push(item('相處建議', '依日主、地支與五行整理的提醒。', adviceLines(a, b, syn).join('\n')));
  return items;
}

function dominantWx(chart: BaziChart): WuXing {
  return [...WX_ORDER].sort((x, y) => percentOf(chart, y) - percentOf(chart, x))[0];
}

function profileOf(gan: string): StemProfile | undefined {
  return STEM_PROFILE[gan];
}

/** 日常相處：個性、思考方式、處理矛盾、感受親密與愛，四段都由這對組合的資料組成。 */
function dailyLines(a: BaziPartner, b: BaziPartner, syn: BaziSynastry): string[] {
  const ga = syn.dayGanA;
  const gb = syn.dayGanB;
  const pa = profileOf(ga);
  const pb = profileOf(gb);
  if (!pa || !pb) return ['日主資料不完整，暫時無法描繪日常相處。'];
  const lines: string[] = [];
  if (syn.fit.difficult) lines.push(...difficultLine(a, b, syn));

  // 個性
  const yangA = YANG_STEMS.has(ga);
  const yangB = YANG_STEMS.has(gb);
  const polarity: string[] =
    yangA && yangB
      ? ['兩人個性都外放、主動，生活很少冷場，說走就走的事特別多，是很會一起玩的一對；安排行程時輪流當主揪，就更順。（日主同為陽干）']
      : !yangA && !yangB
        ? ['兩人都內斂細膩，很能察覺對方沒說出口的情緒，待在一起安靜也舒服；兩人都說「隨便」時，試試各自先說一個想法。（日主同為陰干）']
        : [
            `${yangA ? a.name : b.name}比較主動外放，${yangA ? b.name : a.name}比較內斂細膩，一推一收，出門時多半是${yangA ? a.name : b.name}拉著${yangA ? b.name : a.name}走：${yangA ? a.name : b.name}帶${yangA ? b.name : a.name}見識新地方，${yangA ? b.name : a.name}幫${yangA ? a.name : b.name}把步調放慢、看見沿路的風景。`,
            '步調不同時，互相說一聲「等等」或「走吧」就好。（日主一陽干、一陰干）',
          ];
  const twin = ga === gb;
  lines.push('【個性】');
  if (twin) {
    lines.push(`兩人都是${ga}${STEM_WX[ga]}（${pa.image}），${pa.personality}。`);
    lines.push('同一種底色放在一起，很快就懂對方，像遇見另一個自己；卡在同一個地方時，也最能互相打氣。');
  } else {
    lines.push(`${a.name}是${ga}${STEM_WX[ga]}（${pa.image}），${pa.personality}。`);
    lines.push(`${b.name}是${gb}${STEM_WX[gb]}（${pb.image}），${pb.personality}。`);
  }
  lines.push(...polarity);

  // 思考方式
  const mutual = syn.tenGodBForA && syn.tenGodBForA === syn.tenGodAForB ? MUTUAL_SCENE[syn.tenGodBForA] : undefined;
  const decide = mutual
    ? [mutual.decide]
    : [
        syn.tenGodBForA ? TEN_GOD_SCENE[syn.tenGodBForA]?.decide(a.name, b.name) : '',
        syn.tenGodAForB ? TEN_GOD_SCENE[syn.tenGodAForB]?.decide(b.name, a.name) : '',
      ].filter(Boolean);
  lines.push('【思考方式】');
  lines.push(`${twin ? `兩人都${pa.thinking}` : `${a.name}${pa.thinking}；${b.name}${pb.thinking}`}。`);
  for (const d of decide) lines.push(`${d}。`);

  // 處理矛盾
  lines.push('【處理矛盾】');
  const conflict: string[] = [twin ? `兩人吵架時的反應很像：都${pa.conflict}。` : `${a.name}${pa.conflict}；${b.name}${pb.conflict}。`];
  conflict.push(dayConflictScene(a, b, syn));
  const sa = a.chart.strength;
  const sb = b.chart.strength;
  const strongWeak = (w: string, k: string) =>
    `亂的時候${w}拿得定主意、讓事情往前走，${k}的細膩與配合讓事情更周全，是很好的搭檔；${w}多留一點時間聽${k}說完，${k}也大方說出想法，兩人就更有默契。（${w}身旺、${k}身弱）`;
  if (sa === '身旺' && sb === '身旺')
    conflict.push('兩人底氣都足，有話直說，問題不會被冷戰埋起來，很有一起解決事情的魄力；意見僵住時，可以先約好一個「暫停」的暗號。（兩人皆身旺）');
  else if (sa === '身弱' && sb === '身弱' && !syn.fit.difficult)
    conflict.push('兩人都溫和體貼，很少正面起衝突；誰先說一句「我們談談」，就能把體貼化成親近。（兩人皆身弱）');
  else if (sa === '身旺' && sb === '身弱') conflict.push(strongWeak(a.name, b.name));
  else if (sa === '身弱' && sb === '身旺') conflict.push(strongWeak(b.name, a.name));
  lines.push(...conflict.filter(Boolean));

  // 感受親密與愛
  lines.push('【感受親密與愛】');
  const love: string[] = [twin ? `兩人表達與感受愛的方式一樣：都${pa.love}。` : `${a.name}${pa.love}；${b.name}${pb.love}。`];
  const sceneA = mutual ? mutual.love : syn.tenGodBForA ? TEN_GOD_SCENE[syn.tenGodBForA]?.love(a.name, b.name) : '';
  const sceneB = mutual ? '' : syn.tenGodAForB ? TEN_GOD_SCENE[syn.tenGodAForB]?.love(b.name, a.name) : '';
  if (sceneA) love.push(`${sceneA}。`);
  if (sceneB) love.push(`${sceneB}。`);
  const feel = [
    syn.bHelpsA.length ? `${a.name}在${b.name}身邊時常覺得${syn.bHelpsA.map((wx) => WX_FEEL[wx]).join('、')}` : '',
    syn.aHelpsB.length ? `${b.name}在${a.name}身邊時常覺得${syn.aHelpsB.map((wx) => WX_FEEL[wx]).join('、')}` : '',
  ].filter(Boolean);
  if (feel.length) love.push(`${feel.join('；')}。`);
  lines.push(...love.filter(Boolean));
  return lines;
}

/** 明顯不合時，放在日常相處最前面的坦白說明。 */
function difficultLine(a: BaziPartner, b: BaziPartner, syn: BaziSynastry): string[] {
  const why = syn.fit.reasons.slice(0, 3).join('；');
  return [
    '【先說在前面】',
    `依合婚常用的看法，${a.name}和${b.name}這組命盤的困難因素明顯多於緩和因素（${why}）。這不代表一定走不下去，而是相處的摩擦會比多數伴侶來得頻繁、來得直接：生活步調、說話方式、在意的事常常對不上，光靠喜歡和忍耐容易累。`,
    '想走得長，需要兩人都願意把規則講清楚、把情緒說出口，並且在衝突時有固定的處理方式；下面每一段也會把需要特別用力的地方寫得更直白。',
  ];
}

function dayConflictScene(a: BaziPartner, b: BaziPartner, syn: BaziSynastry): string {
  const zA = a.chart.pillars.find((p) => p.key === 'day')?.zhi ?? '';
  const zB = b.chart.pillars.find((p) => p.key === 'day')?.zhi ?? '';
  const kinds = syn.dayPair?.relations.map((r) => r.kind) ?? [];
  if (syn.fit.difficult && kinds.includes('liuChong'))
    return `夫妻宮${zA}${zB}相沖${kinds.includes('xing') ? '又相刑' : ''}，${syn.fit.tianKeDiChong ? '加上日干相剋（天剋地沖），' : ''}是這組命盤最吃力的地方：在家的作息、整潔、花錢節奏常常相反，一件小事就可能吵開，而且同樣的爭執容易反覆出現。好處是兩人都悶不住，問題不會被藏起來；做法上，建議約好「吵到一半先停二十分鐘」，把反覆出現的爭點寫下來逐條談定，必要時找信任的第三方一起聊。`;
  if (syn.fit.difficult && kinds.includes('xing'))
    return `夫妻宮${zA}${zB}相刑，是這組命盤最需要用力的地方：私下相處容易在語氣和小事上互相刺到，累積起來會傷感情。好處是兩人在彼此面前不設防；做法上，提醒對方時只說這一次的事、用「我希望…」開頭，並約好每週一次把心裡的不舒服說完。`;
  if (kinds.includes('liuChong'))
    return `夫妻宮${zA}${zB}相沖：兩人在家的步調不同，誰也悶不住，有事當下就說開，關係不會累積心結；沖得快也和得快，意見不同時先各自冷靜十分鐘再談，就能把直接變成坦誠。`;
  if (kinds.includes('xing'))
    return `夫妻宮${zA}${zB}相刑：兩人在彼此面前完全不設防，敢說真話；小事上的提點換成「我希望…」的說法，就能把在乎說得更動聽。`;
  if (kinds.includes('hai'))
    return `夫妻宮${zA}${zB}相害：兩人都不想傷對方，有時會把心事先放著；定期問一句「最近有沒有哪裡不舒服」，就能把顧慮變成體貼。`;
  if (kinds.includes('ziXing'))
    return `夫妻宮同為${zA}自刑：兩人在同一件事上一樣在意，冷靜下來後最能體諒對方為什麼卡住；誰先察覺，誰就先緩下來。`;
  if (kinds.includes('liuHe'))
    return `夫妻宮${zA}${zB}六合：吵完容易和好，常常一個擁抱就過去；和好後再花幾分鐘把真正的問題聊完，默契會更深。`;
  if (kinds.includes('banHe'))
    return `夫妻宮${zA}${zB}半合：意見不同時容易回到共同目標，吵著吵著就變成一起想辦法；先聽完對方的心情再談解法，會更貼心。`;
  return `夫妻宮${zA}${zB}沒有合沖刑害：衝突不太會被生活環境放大，相處的溫度掌握在兩人手裡，好好說話的習慣就是最好的黏著劑。`;
}

/** 六沖落在不同柱位時，它給這段關係的東西。 */
const CHONG_GIFT: Record<BaziPillar['key'], string> = {
  day: '在生活裡誰也悶不住、有話就說開，關係不會停滯',
  year: '能帶彼此認識截然不同的家庭與世界',
  month: '做事一快一穩，正好截長補短',
  time: '對未來各有想法，能一起把路想得更周全',
};

const SAME_GIFT: Record<WuXing, string> = {
  木: '是彼此一起往上長的同伴',
  火: '在一起就有熱度，彼此點亮',
  土: '是彼此最穩、最放心的依靠',
  金: '說到做到，彼此最信得過',
  水: '心意相通，很多話不用說就懂',
};

const HE_GIFT: Record<string, string> = {
  甲己: '古稱中正之合，給了這段關係一份難得的踏實與信任',
  乙庚: '古稱仁義之合，一剛一柔、彼此成全',
  丙辛: '一個溫暖、一個精緻，站在一起就彼此照亮',
  丁壬: '一份濃而深的吸引，聊得來，也放不下',
  戊癸: '一個撐住、一個滋潤，是能一起把日子過好的緣分',
};

/** 收尾：這對組合最珍貴的地方，全部由兩人的實際資料組成；明顯不合時改為「課題與禮物」。 */
function giftItem(a: BaziPartner, b: BaziPartner, syn: BaziSynastry): MeaningItem {
  const ga = syn.dayGanA;
  const gb = syn.dayGanB;
  let stem = '';
  switch (syn.stem.kind) {
    case 'he':
      stem = `${a.name}和${b.name}的日主${ga}${gb}相合，${orderedKey(HE_GIFT, ga, gb) ?? '天生有吸引與默契'}。`;
      break;
    case 'same':
      stem = `${a.name}和${b.name}日主同屬${STEM_WX[ga]}，${SAME_GIFT[STEM_WX[ga]]}。`;
      break;
    case 'aGeneratesB':
    case 'bGeneratesA': {
      const [g, r, gg] = syn.stem.kind === 'aGeneratesB' ? [a.name, b.name, ga] : [b.name, a.name, gb];
      stem = `${g}的${WX_GIVE[STEM_WX[gg]]}一直滋養著${r}，而${r}的成長，讓${g}的付出有了意義。`;
      break;
    }
    case 'aControlsB':
    case 'bControlsA': {
      const [c, d] = syn.stem.kind === 'aControlsB' ? [a.name, b.name] : [b.name, a.name];
      stem = `${c}能激發${d}的潛力，${d}也讓${c}學會柔軟，這股張力正是兩人一起成長的動力。`;
      break;
    }
  }

  const extras: string[] = [];
  const dayKinds = syn.dayPair?.relations.map((r) => r.kind) ?? [];
  if (syn.dayPair && (dayKinds.includes('liuHe') || dayKinds.includes('banHe')))
    extras.push(`夫妻宮${syn.dayPair.zhiA}${syn.dayPair.zhiB}相合，關起門來的自在與默契，是很多伴侶羨慕的。`);
  const give = (list: WuXing[]) => list.map((wx) => WX_GIVE[wx]).join('、');
  if (syn.bHelpsA.length > 0 && syn.aHelpsB.length > 0)
    extras.push(`更難得的是兩人互為喜用：${a.name}帶給${b.name}${give(syn.aHelpsB)}，${b.name}帶給${a.name}${give(syn.bHelpsA)}，彼此都是對方需要的那一塊。`);
  else if (syn.bHelpsA.length > 0)
    extras.push(`${b.name}身上旺盛的${syn.bHelpsA.join('、')}正是${a.name}的喜用，${b.name}的存在本身就是${a.name}最好的補給。`);
  else if (syn.aHelpsB.length > 0)
    extras.push(`${a.name}身上旺盛的${syn.aHelpsB.join('、')}正是${b.name}的喜用，有${a.name}在，${b.name}做什麼都更有底氣。`);
  if (syn.sanHe.length > 0)
    extras.push(`兩人的地支合起來湊成三合${syn.sanHe.map((wx) => `${wx}局`).join('、')}，有一股力量只有兩人在一起時才完整。`);
  const mutual = syn.tenGodBForA && syn.tenGodBForA === syn.tenGodAForB ? MUTUAL_SCENE[syn.tenGodBForA] : undefined;
  const gBA = TEN_GOD_GIFT[syn.tenGodBForA];
  const gAB = TEN_GOD_GIFT[syn.tenGodAForB];
  if (mutual) extras.push(`${mutual.gift}。`);
  else if (gBA && gAB) extras.push(`${gBA(a.name, b.name)}；${gAB(b.name, a.name)}。`);

  const chong = syn.branchPairs.find((p) => p.relations.some((r) => r.kind === 'liuChong'));
  const chongLine = chong
    ? `${chong.zhiA}${chong.zhiB}的沖看起來是挑戰，其實也代表兩人${CHONG_GIFT[scenePillar(chong)]}；每一次說開，都讓彼此更懂對方一點。`
    : '';

  if (syn.fit.difficult) {
    const real = extras[extras.length - 1] ?? '';
    const dz = syn.dayPair ? `${syn.dayPair.zhiA}${syn.dayPair.zhiB}` : '';
    const lesson = syn.fit.tianKeDiChong
      ? `日柱天剋地沖，${a.name}和${b.name}從個性到生活步調都容易對撞，夫妻宮${dz}更讓同住後的小事一再擦槍走火。`
      : `夫妻宮${dz}受沖刑，加上其他柱位的沖刑害，${a.name}和${b.name}在家裡的節奏與說話方式常常對不上。`;
    const hurt = syn.bHurtsA.length || syn.aHurtsB.length ? '五行上也有一方的強項正是另一方的忌神，狀態差時容易互相消耗。' : '';
    return item(
      '這段關係的課題與禮物',
      '這組命盤困難較多：坦白說明需要付出什麼，也記下兩人之間真實可貴的部分。',
      [
        `課題：${lesson}${hurt}`,
        `這組命盤要走得長，靠的不是緣分，而是兩人都願意長期練習：吵架時有固定的暫停與回來談的方式、生活規則寫清楚、不把一時的話當成定論。只有一方努力，會很快累垮。`,
        `禮物：${stem}${real}`,
        `願意一起面對這些課題的兩個人，換來的是比多數伴侶更深的了解與更真實的承諾。`,
      ].join('\n'),
    );
  }
  const paras = [stem, extras.slice(0, chongLine ? 1 : 2).join(''), chongLine].filter(Boolean);
  return item('這段關係的禮物', '從兩人的日主、十神、夫妻宮與五行裡，整理出這對組合最珍貴的地方。', paras.join('\n'));
}

function adviceLines(a: BaziPartner, b: BaziPartner, syn: BaziSynastry): string[] {
  const lines: string[] = [];
  const withKind = (k: BranchRelationKind) => syn.branchPairs.filter((p) => p.relations.some((r) => r.kind === k));
  const where = (p: PillarPairRelation) =>
    `${a.name}${PILLAR_NAMES[p.pillarA]}${p.zhiA} × ${b.name}${PILLAR_NAMES[p.pillarB]}${p.zhiB}`;
  const more = (ps: PillarPairRelation[]) => (ps.length > 1 ? `（另有 ${ps.length - 1} 組）` : '');

  const he = [...withKind('liuHe'), ...withKind('banHe')];
  if (he.length > 0) {
    const p = he[0];
    const act: Record<BaziPillar['key'], string> = {
      year: '多一起參加彼此家人和朋友的聚會',
      month: '找一件能一起完成的事，例如規劃旅行、布置住處或一起學新東西',
      day: '保留固定的兩人時間，例如每週一次不看手機的晚餐',
      time: '一起寫下三年、十年後想過的生活',
    };
    lines.push(`默契最好的是${where(p)}${more(he)}：${act[scenePillar(p)]}，讓這份默契變成習慣；這份甜也能陪兩人面對其他需要磨合的地方。`);
  }

  if (syn.fit.difficult) {
    lines.push(
      '這組命盤困難較多，建議比一般伴侶多做三件事：一、同住或論及婚嫁前，先把作息、家務、金錢分配和與家人的距離逐條談定並寫下來；二、約好吵架的規則（不翻舊帳、不在氣頭上做決定、暫停後一定回來談）；三、同樣的爭執反覆三次以上，就找信任的朋友或專業的伴侶諮商一起聊，不要只靠忍。',
    );
  }

  const chong = withKind('liuChong');
  if (chong.length > 0) {
    const p = chong[0];
    const tip: Record<BaziPillar['key'], string> = {
      year: '兩邊家庭的事先由各自的那一方出面溝通，兩人站在同一陣線',
      month: '一起辦事前先說好「先做再改」還是「先想清楚」，給彼此一點節奏上的緩衝',
      day: '同住後的作息、家務、花錢先列成清單講好，意見不同時先停十分鐘再談',
      time: '買房、生養、退休這些長期計畫，每年找一天坐下來對一次',
    };
    lines.push(`最有火花的是${where(p)}${more(chong)}的六沖：${tip[scenePillar(p)]}，磨合順了，就是互相推著前進的動力。`);
  }
  const xingHai = [...withKind('xing'), ...withKind('hai')];
  if (xingHai.length > 0) {
    const kinds = new Set(xingHai.flatMap((p) => p.relations.map((r) => r.kind)));
    lines.push(
      `${kinds.has('xing') ? '刑' : ''}${kinds.has('xing') && kinds.has('hai') ? '與' : ''}${kinds.has('hai') ? '害' : ''}出現在${where(xingHai[0])}${more(xingHai)}：${kinds.has('hai') ? '心裡有感受時，用「我覺得…」開頭說出來，對方會更懂' : '提醒時先說一句肯定，再說希望，對事不對人'}。`,
    );
  }

  switch (syn.stem.kind) {
    case 'he':
      lines.push('日主相合，吸引力是天生的；把這份默契也用在談生活細節上，會越過越順。');
      break;
    case 'same':
      lines.push('同類日主最能互相理解；各自保留一塊說了算的領域，兩人會是最有默契的隊友。');
      break;
    case 'aGeneratesB':
    case 'bGeneratesA': {
      const [g, r] = syn.stem.kind === 'aGeneratesB' ? [a.name, b.name] : [b.name, a.name];
      lines.push(`${g}常是付出的一方，${r}記得常說謝謝、也回饋一些；${g}偶爾讓${r}自己扛一些事，${r}會成長得更快。`);
      break;
    }
    case 'aControlsB':
    case 'bControlsA': {
      const [c, d] = syn.stem.kind === 'aControlsB' ? [a.name, b.name] : [b.name, a.name];
      lines.push(`${c}想幫忙時先問「需要建議還是只要聽」，${d}有感受時直接說出來；${c}的期待讓${d}進步時，也別吝於稱讚。`);
      break;
    }
  }
  lines.push('合盤看的是互動傾向，不是合不合得來的判決；兩人的選擇與溝通比八字更重要。');
  return lines;
}

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// AI prompt
// ---------------------------------------------------------------------------

function chartBlock(p: BaziPartner): string {
  const c = p.chart;
  const pillars = c.pillars
    .map((x) => `${x.label} ${x.gan}${x.zhi}${c.timeUnknown && x.key === 'time' ? '（時間不確定）' : ''}`)
    .join('、');
  return `### ${p.name}
- ${c.genderLabel}；生肖：${twZodiac(c.shengXiao)}；陽曆：${c.solarLabel}
- 四柱：${pillars}
- 日主：${c.dayMaster}（${c.strength}，${c.wangShuai}）；命格：${c.geJu}
- 五行：${c.wuXing.map((s) => `${s.wx}${s.percent}%`).join('、')}
- 喜神 ${c.xiShen}；用神 ${c.yongShen}；忌神 ${c.jiShen}`;
}

export function buildBaziSynastryAiPrompt(a: BaziPartner, b: BaziPartner, syn: BaziSynastry): string {
  const pairs =
    syn.branchPairs
      .map((p) => {
        const rels = p.relations.map((r) => relationText(r, p.zhiA, p.zhiB)).join('、');
        return `- ${a.name}${PILLAR_NAMES[p.pillarA]} × ${b.name}${PILLAR_NAMES[p.pillarB]}：${rels}`;
      })
      .join('\n') || '- （無明顯合沖刑害）';
  const dayRel = syn.dayPair
    ? syn.dayPair.relations.map((r) => relationText(r, syn.dayPair!.zhiA, syn.dayPair!.zhiB)).join('、')
    : '無明顯合沖刑害';
  const helps = [
    syn.bHelpsA.length ? `${b.name}旺${syn.bHelpsA.join('、')}，正是${a.name}的喜用` : '',
    syn.aHelpsB.length ? `${a.name}旺${syn.aHelpsB.join('、')}，正是${b.name}的喜用` : '',
  ]
    .filter(Boolean)
    .join('；') || '無明顯喜用互補';

  return `請依下列兩人的八字命盤，用繁體中文（台灣用語）做合盤（合婚）解讀。

解讀原則：
- 以兩人日主的生剋合化、彼此的十神、日支（夫妻宮）與年支（生肖）的合沖刑害為主軸，再看五行與喜用神是否互補。
- 年柱看原生家庭與社交圈、月柱看工作節奏與做事方式、日柱看私下相處、時柱看未來規劃與子女觀，請說明合沖落在哪個生活面向。
- 天干五合請說出這一組的特色（甲己中正、乙庚仁義、丙辛威制、丁壬情濃、戊癸重現實），不要只說「相合有默契」。
- 語氣以鼓勵、先講優點為主：每一段先寫這兩人在一起最珍貴的地方（彼此帶給對方什麼、一個具體溫暖的畫面），再用「成長點」的方式帶出需要磨合之處，並附上做得到的小技巧（例如「可以試試…」「當…時，…就能變成你們的優勢」）。正向與挑戰的份量大約 2:1；挑戰要寫，但簡短、溫和、具建設性，避免恐嚇或負面標籤。沖、刑、害等術語照用，但解釋要說出它帶來的火花與成長，以及怎麼化解。措辭請自然變化，不要每段都套同一個句型。${syn.fit.difficult ? `
- 注意：這組命盤的困難因素明顯多於緩和因素（${syn.fit.reasons.join('；')}）。請誠實、尊重地在開頭說明這組組合相處會比較吃力，不要硬湊正面；挑戰的份量可以多於優點，並給出具體可行的做法（例如吵架規則、同住前要談定的事、何時尋求第三方協助），最後仍點出兩人之間真實可貴的部分。` : ''}
- 這是命盤結構說明，不是合不合的判決；請給可實踐的相處建議，避免恐嚇或保證。
- 每個論點都要扣回這兩人的實際干支，避免放在任何一對都通用的句子。

## 兩人命盤
${chartBlock(a)}

${chartBlock(b)}

## 合盤摘要
- 日主：${syn.dayGanA} × ${syn.dayGanB}；對${a.name}而言${b.name}是「${syn.tenGodBForA}」，對${b.name}而言${a.name}是「${syn.tenGodAForB}」
- 日支（夫妻宮）：${dayRel}
- 喜用互補：${helps}
- 兩盤合成的三合局：${syn.sanHe.map((wx) => `${wx}局`).join('、') || '無'}
${pairs}

## 請依序回答
1. 總覽：兩人日主組合的特色（用天干意象說明，例如大樹與燭火）。
2. 一起時的亮點：兩人五行合起來最旺的氣場、最合拍的一組干支，在一起時最能發揮什麼。
3. 需要磨合的地方：亮點的另一面（例如吸引彼此的自由感，磨合期會變成缺乏安全感），以及最容易卡住的一組地支落在哪個生活面向。
4. 內心世界與親密：兩人日支（夫妻宮）各自藏著的需求、兩個日支之間的關係，怎麼讓彼此覺得被接住。
5. 關係的生命課題：用彼此的十神說明這段關係要各自學會的事。
6. 日常相處與溝通，分四個主題，每個主題先寫這兩人相處順、彼此欣賞的地方，再帶出一個成長點與具體小技巧，並至少給 2 個具體的生活場景（例如週末怎麼安排、一起決定要不要買房、對方晚回訊息時、吵架後隔天早上）：
   - 個性：兩人各自的個性底色，以及放在一起時的化學反應。
   - 兩人思考方式：各自怎麼想事情、做決定，用十神說明誰影響誰（例如「${b.name}是${a.name}的${syn.tenGodBForA}」在決策上的表現）。
   - 處理矛盾的方法：各自吵架時的反應、夫妻宮的合沖刑害如何放大或緩和衝突、怎麼和好最有效。
   - 感受親密及愛的方式：各自怎麼表達愛、怎麼感受到被愛，以及怎麼更準確地接住對方的心意。
7. 吵架與冷戰：各自的地雷、吵起來是熱吵還是冷戰、兩人各自的破冰方式。
8. 兩人內耗與充電：一方的旺五行是另一方的忌神（耗電）或喜用（充電）時的具體表現，以及兩人一起回血的方法。
9. 權力與主導權：依日主生剋、強弱與陰陽，說明誰比較常拿主意、有沒有隱性的失衡，怎麼保持對等。
10. 一起財運與共事：兩人的金錢觀（財星份量）、月柱的做事節奏，當室友、旅伴或合夥人時怎麼分工。
11. 初見印象與深交後的反轉：年柱看第一印象、日柱看熟了以後的真實相處，兩者的落差在哪裡。
12. 五行互補與生活建議：互補帶來什麼，以及怎麼讓這份補位雙向、長久。
13. ${syn.fit.difficult ? '這段關係的課題與禮物：坦白說出兩人要走下去需要付出什麼，再說出兩人之間真實可貴的部分' : '這段關係的禮物：用 2～3 句話，扣回這兩人的實際干支，說出兩人在一起最珍貴的地方'}。
14. 最後給兩人各 3 條相處提醒，具體到可以今天就做。

第 2～5、7～11 項請各用「一句 20 字內的金句、兩段各 80 字內的解析、一個 60 字內的相處場景、一條 50 字內做得到的建議」來寫；白話為主，術語只放在句尾括號當依據；前面主題說過的特質，後面要換成該主題的具體場景，不要重複同樣的形容詞。`;
}
