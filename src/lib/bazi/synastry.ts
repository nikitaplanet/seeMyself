import type { MeaningItem } from '@/lib/ui/personMeaning';
import { STEM_HE, STEM_WX, tenGodOf, WX_GOD_GROUP } from './labels';
import type { BaziChart, BaziPillar, WuXing } from './types';

// 八字合婚／合盤 — pure logic, no React. Compares two computed BaziCharts:
//   - 日主 天干：五合、比和、相生、相剋，以及彼此的十神；
//   - 地支：兩盤各柱地支兩兩比對（六合、六沖、半合、相刑、相害、自刑），日支（夫妻宮）與年支（生肖）優先；
//     兩盤合起來才湊齊的三合局另外列出；
//   - 五行互補：一方的喜用五行是另一方的旺五行，或一方極弱的五行另一方很旺。
// A time pillar computed from an unknown birth time is left out of every comparison.

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
}

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
  const groups = new Set<string>();
  for (const ch of `${chart.xiShen}${chart.yongShen}`) {
    const g = GOD_GROUP_CHARS.find(([c]) => c === ch);
    if (g) groups.add(g[1]);
  }
  const table = WX_GOD_GROUP[chart.dayMasterWx];
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

  return {
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
  };
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
    personality: '正直、有原則，習慣扛責任，也有點固執',
    thinking: '先定方向和原則再行動，決定了就不太想改',
    conflict: '會講道理、守住立場，認定自己對時不容易先低頭，但不記仇',
    love: '用照顧和承擔表達愛，會替對方擋事、規劃未來，比較少甜言蜜語',
  },
  乙: {
    image: '花草藤蔓',
    personality: '柔軟有韌性，善於察言觀色，人緣好',
    thinking: '先看氣氛和人，習慣繞個彎找可行的路，常會問別人的意見',
    conflict: '不愛正面衝突，表面先讓一步，心裡會記著，需要被安撫',
    love: '在意陪伴與回應，喜歡依偎、被放在心上，一句貼心話會記很久',
  },
  丙: {
    image: '太陽',
    personality: '熱情直率、大方，喜歡帶動氣氛',
    thinking: '憑直覺和熱情很快做決定，想到就做，細節事後再補',
    conflict: '火氣來得快去得也快，當下就說出來，吵完很快就忘',
    love: '用行動和公開的方式表達愛，安排驚喜、出遊、大方介紹給朋友，也需要被欣賞',
  },
  丁: {
    image: '燭火',
    personality: '溫和細膩、心思深，外表平靜、內在很熱',
    thinking: '想得細，會顧及每個人的感受，反覆琢磨後才說出結論',
    conflict: '不舒服先放心裡，表面沒事，累積到某一刻才一次說出口，需要對方主動問',
    love: '用細心表達愛，記得對方的喜好、默默準備，渴望被「懂」多過被寵',
  },
  戊: {
    image: '高山',
    personality: '穩重可靠、包容力強，步調慢而守信',
    thinking: '重視穩定與可行性，不輕易改變，需要時間消化新的提議',
    conflict: '很能忍、少發作，習慣用沉默面對；真的生氣時像山一樣推不動',
    love: '用陪伴與承諾表達愛，一直都在、說到做到，把生活打理得穩穩的，但不太會製造浪漫',
  },
  己: {
    image: '田園沃土',
    personality: '謙和細心、很會照顧人，也容易想太多',
    thinking: '擅長規劃、顧全細節，會先想好各種後果，偶爾猶豫不決',
    conflict: '容易委屈求全，嘴上說沒關係，心裡默默記帳，之後才翻出舊事',
    love: '用照料生活表達愛，煮飯、記帳、把大小事安排好，希望這些付出被看見',
  },
  庚: {
    image: '刀斧鋼鐵',
    personality: '果斷剛直、重義氣、講效率',
    thinking: '直接抓重點、快刀斬亂麻，相信邏輯和結果',
    conflict: '說話直、不轉彎，習慣當場講清楚；吵起來話會很硬，但講完就算了',
    love: '用行動和保護表達愛，幫對方解決問題、替對方出頭，不擅長說軟話',
  },
  辛: {
    image: '珠玉',
    personality: '精緻敏銳、重品味與面子，追求完美',
    thinking: '標準高、在意細節和質感，一眼就看到哪裡不夠好',
    conflict: '對語氣和態度很敏感，生氣時話會變冷或變尖，需要被尊重地道歉',
    love: '重視儀式感與被珍惜的感覺，用心挑的禮物、好好打扮的約會、真誠的稱讚最打動',
  },
  壬: {
    image: '江河大海',
    personality: '聰明靈活、好奇心強，愛自由',
    thinking: '思路跳躍、點子多，喜歡幾個方案同時進行，不喜歡被限定',
    conflict: '不想吵就先離開現場或轉移話題，等情緒過了再談；被逼得太緊會想逃',
    love: '需要空間也需要新鮮感，一起旅行、探索、聊很深的話題，黏太緊反而會退後',
  },
  癸: {
    image: '雨露',
    personality: '溫柔敏感、直覺強、善解人意',
    thinking: '靠直覺和感受判斷，心裡想很多，有了答案也不一定說出口',
    conflict: '情緒比語言先到，受傷時會沉默或掉淚，需要時間和溫柔才肯說',
    love: '從被理解中感受愛，深夜談心、被溫柔對待，比禮物更重要',
  },
};

/** 天干五合，各有古稱（見《三命通會．論天干相合》）。 */
const STEM_HE_NOTE: Record<string, string> = {
  甲己: '甲己合古稱「中正之合」，形容寬厚、重信用。甲木像大樹往上長，己土像田地托住樹根，一個有方向、一個給支撐，相處重實在、講道理，容易一起把生活經營穩。只是樹長在田裡久了，己常把甲的需要排在自己前面，甲也習慣被托著；己要留一塊只屬於自己的地，甲要記得問己想要什麼。',
  乙庚: '乙庚合古稱「仁義之合」，形容重情義、守承諾。庚金剛直、乙木柔韌，一剛一柔，彼此欣賞對方身上自己沒有的特質。合得緊時，乙容易為了配合庚而收起自己的意見，庚則不自覺地替乙做主；庚的直接要收一點力道，乙也要敢把不同意說出口。',
  丙辛: '丙辛合古稱「威制之合」。丙火像太陽、辛金像珠玉，陽光照在珠寶上格外耀眼，兩人在一起有光彩、在外人眼中很登對；「威制」兩字也點出誰說了算的拉扯：丙的光太強時辛會覺得被蓋過，辛挑剔太多時丙的熱情會退，各自保有舞台最重要。',
  丁壬: '丁壬合古書稱「淫慝之合」，也有人稱「仁壽之合」，意思是情感濃、吸引力強。丁火像燭光、壬水像江河，一個細膩一個開闊，很容易被對方的氣質打動、感情來得快。濃的另一面是容易黏得太緊、把彼此當成全世界，也容易憑一時情緒做決定；要細水長流，需要兩人一起建立信任與界線，各自保有朋友和生活。',
  戊癸: '戊癸合古稱「無情之合」，這裡的「無情」不是沒感情，而是重現實多過浪漫。戊土像高山、癸水像雨露，一個穩重、一個敏感，常被形容為心態有差距的組合：戊給得出安穩，癸讓戊的生活多了柔軟，一方照顧、一方依靠時很踏實；但角色固定太久，戊會覺得只剩責任，癸會覺得心事沒人接，相處需要多一點表達與溫度。',
};

/** 合而化：在一起久了，兩人都會往合化五行的特質靠，原本的個性也會被改變一些。 */
const HUA_NOTE: Record<WuXing, string> = {
  土: '合而化土，相處久了兩人都會變得更務實、更顧家，原本的衝勁或浪漫也可能被日常磨平',
  金: '合而化金，兩人在一起會更講原則、更果斷，但也可能一起變嚴肅，少了原本的柔軟',
  水: '合而化水，兩人在一起思路更靈活、話題更多，也更容易一起情緒起伏、想太多',
  木: '合而化木，兩人在一起很有往前長的動力，也容易把彼此的目標排得太滿、忘了停下來',
  火: '合而化火，兩人在一起熱情被點燃、行動力變強，也容易一起急、一起上火',
};

/** 相生：key 是「生方五行＋受生方五行」，G＝生方、R＝受生方。 */
const GEN_NOTE: Record<string, string> = {
  木火: '木生火，像柴添火：G的穩定與計畫，讓R更有熱情與舞台；但柴燒得快，G一直供應會被燒乾，R也可能習慣有人添柴，少了自己生火的能力',
  火土: '火生土，像陽光曬暖大地：G的熱情與鼓勵，讓R更有安全感、更踏實；只是R的回應常慢半拍，G容易覺得熱臉貼冷屁股，而總被G推著走的R，也少了自己發熱的機會',
  土金: '土生金，像山裡藏著礦：G的包容與耐心，讓R的能力被磨亮；但土包得太厚會把金埋住，G什麼都擔下來，R反而少了獨當一面的歷練，G也會默默覺得功勞沒被看見',
  金水: '金生水，像岩縫湧出泉水：G的原則與條理，讓R的想法更清楚、更有方向；但G的建議給太多，R會覺得在被上課，R一隨性，G又覺得白講了',
  水木: '水生木，像雨水灌溉樹苗：G的體貼與智慧，讓R安心成長；只是水澆太多樹根反而會爛，G給得太多又不說，自己會被掏空，R也可能被寵到少了扛事的力氣',
};

/** 相剋：key 是「剋方五行＋被剋方五行」，C＝剋方、D＝被剋方。 */
const CTRL_NOTE: Record<string, string> = {
  木土: '木剋土，像樹根抓住土地：C有主見、想帶方向，D可能覺得自己的節奏被打亂；但土沒有根會流失，C的推動也常讓慢熱的D真的動起來，把想了很久的事做成',
  土水: '土剋水，像堤防擋住水流：C想給規範和框架，D可能覺得情緒和自由被限制；有堤防的水卻不會氾濫，D漂浮不定時，C是讓D落地的那個人',
  水火: '水剋火，像水澆在火上：C冷靜理性，一句話就能讓D的熱情降溫，D常覺得掃興；可是D衝過頭、一時上火時，也只有C攔得住，不少衝動的決定因此免了',
  火金: '火剋金，像爐火煉金：C的熱情與要求能逼出D的潛力，D在C身邊成長得特別快；火候太猛時，D會覺得被逼太緊、怎麼做都不夠',
  金木: '金剋木，像斧頭修剪樹枝：C講效率與標準，常想幫D「修正」，D可能覺得被挑剔；可是修剪過的樹長得更直，D的很多想法經C一問，反而更成熟可行',
};

const SAME_NOTE: Record<WuXing, string> = {
  木: '兩棵樹並排長，都有自己的方向，也都想往上爭取空間',
  火: '兩團火放在一起，熱鬧有勁，也容易一起上火',
  土: '兩座山相望，都穩、都可靠，但也都不愛改變',
  金: '兩把刀擺在一起，都講原則，硬碰硬時誰也不讓',
  水: '兩道水流匯在一起，懂彼此的心思，也容易一起想太多、一起情緒化',
};

const TEN_GOD_ROLE: Record<string, string> = {
  比肩: '像平起平坐的夥伴，價值觀相近，討論很快有共識，但遇到誰主導時都不太想讓',
  劫財: '像會競爭、也會分享的同伴，帶著一點較勁，資源和決定權要先講好',
  食神: '是讓人放鬆、想照顧與分享的對象，在一起氣氛輕鬆；太舒服時也容易一起懶散，該談的正事常被擱著',
  傷官: '會激發創意，也讓人想挑戰規矩，聊天越聊越有火花，也越聊越想爭辯',
  正財: '是讓人踏實、想好好經營的對象，會想一起規劃生活和未來；也因為太想經營好，容易把對方當成要管理的項目，少了點隨性',
  偏財: '帶來新鮮感與機會感，在一起比較敢冒險、臨時起意；新鮮感退去後，得靠刻意經營才不會淡',
  正官: '讓人變得自律、有責任感，被對方的穩定帶著走；也會太在意對方的評價，在對方面前不太敢放鬆',
  七殺: '帶來壓力與張力，也激發魄力，心動感強；被推得太緊時，會想反抗',
  正印: '像靠山一樣支持、包容，在一起有被接住的安全感；被照顧久了，可能變得依賴，或覺得對方管得有點多',
  偏印: '能給獨特的啟發，想法角度不同，不一定一下子就懂；有時也會覺得對方冷，猜不透在想什麼',
};

/** 十神在日常的具體畫面：s＝主體，o＝對方（o 是 s 的這個十神）。 */
const TEN_GOD_SCENE: Record<string, { decide: (s: string, o: string) => string; love: (s: string, o: string) => string }> = {
  比肩: {
    decide: (s, o) => `${o}是${s}的比肩：兩人想法接近，討論很快有共識，但遇到「這次聽誰的」時，${s}也不太想讓`,
    love: (s, o) => `${s}跟${o}在一起像好朋友一樣自在，愛是並肩一起做事，而不是被捧著；只是太像朋友時，${s}偶爾也想被寵一下，卻不好意思開口`,
  },
  劫財: {
    decide: (s, o) => `${o}是${s}的劫財：${o}常提出跟${s}不同的做法，帶點競爭意味，錢和決定權最好事先講清楚`,
    love: (s, o) => `${s}會被${o}的活力帶動，愛裡帶點較勁，一起運動、玩遊戲、比賽反而最親近；只是${o}表現得太亮眼時，${s}心裡也會悄悄比較`,
  },
  食神: {
    decide: (s, o) => `${o}是${s}的食神：在${o}面前${s}容易放鬆，想法自然說出口，一起討論事情氣氛輕鬆；但${s}也容易因為想讓${o}開心，該堅持的事順口就答應了`,
    love: (s, o) => `${s}的愛是想餵飽、照顧、逗${o}開心，一起吃頓好的、散個步就很滿足；照顧得太滿時，${s}會不自覺把${o}當小孩，${o}未必領情`,
  },
  傷官: {
    decide: (s, o) => `${o}是${s}的傷官：${o}會激發${s}的新點子，也讓${s}想挑戰既有的做法，討論常越聊越有創意，也越聊越想辯贏`,
    love: (s, o) => `${s}在${o}面前特別想表現、想被看見，愛裡有很多話想說，偶爾會說得太直、讓${o}接不住`,
  },
  正財: {
    decide: (s, o) => `${o}是${s}的正財：${s}覺得${o}很實在，做決定時會把${o}和兩人的生活一起算進去；反過來，${s}也會想掌握${o}的開銷和行程，${o}可能覺得被盯著`,
    love: (s, o) => `${s}的愛是穩定經營：準時回訊息、固定約會、為兩人的未來存錢，${o}給${s}踏實感；穩定久了容易變成例行公事，偶爾一次不按牌理的驚喜反而最難得`,
  },
  偏財: {
    decide: (s, o) => `${o}是${s}的偏財：${o}帶來新的機會和玩法，${s}跟${o}在一起比較敢冒險、臨時說走就走；也比較容易一時興起就花錢、答應，事後才發現沒算清楚`,
    love: (s, o) => `${s}被${o}的新鮮感吸引，愛的時候很大方，但需要不斷有新的共同體驗來保溫`,
  },
  正官: {
    decide: (s, o) => `${o}是${s}的正官：${s}在${o}面前會變得自律、守規矩，重大決定常想先聽${o}的意見；只是聽久了，${s}自己拿主意的底氣會變弱`,
    love: (s, o) => `${s}覺得${o}可靠、值得託付，愛裡帶著尊重；但被${o}糾正時，${s}也容易覺得自己不夠好`,
  },
  七殺: {
    decide: (s, o) => `${o}是${s}的七殺：${s}在${o}面前會繃緊神經、特別想表現，${o}一句話就能推${s}一把；但被${o}催促或直接替${s}做決定時，容易覺得被管`,
    love: (s, o) => `${s}對${o}有強烈的心動與張力，愛得很投入，也很需要${o}放軟語氣、留給${s}自己決定的空間`,
  },
  正印: {
    decide: (s, o) => `${o}是${s}的正印：${o}像${s}的靠山，${s}卡住時找${o}聊一聊就比較安心；但${o}的意見太好用，${s}可能還沒自己想清楚就先問了`,
    love: (s, o) => `${s}從${o}那裡感受到包容與照顧，愛是一種被接住的安全感；要留意別把${o}當成唯一的依靠`,
  },
  偏印: {
    decide: (s, o) => `${o}是${s}的偏印：${o}的想法常跟${s}不一樣、角度獨特，能點醒${s}，但不一定一下子聽得懂`,
    love: (s, o) => `${s}跟${o}之間有種心照不宣的默契，很多事不用多說；但${o}想獨處時，${s}要學著不多想`,
  },
};

/** 兩人互為比肩或劫財（同五行日主）時，合成一句，避免兩行一模一樣。 */
const MUTUAL_SCENE: Record<string, { decide: string; love: string }> = {
  比肩: {
    decide: '兩人互為比肩：想法和做事標準很接近，討論很快有共識；但遇到「這次聽誰的」，兩個都不太想讓，輪流當決定的人最省力',
    love: '兩人互為比肩，相處像最好的朋友，愛是一起做喜歡的事、並肩面對問題，而不是誰照顧誰；但兩人都不習慣示弱，累的時候反而不知道怎麼開口討抱抱',
  },
  劫財: {
    decide: '兩人互為劫財：一陰一陽，做法常常不同又互不服輸，小到點餐、大到花錢都可能想爭主導權，事先講好誰負責哪一塊最重要',
    love: '兩人互為劫財，愛裡帶點較勁也帶點玩心，一起運動、打電動、比賽輸贏反而最親近；只是吃醋與比較心也要留意',
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
  子丑: '子丑合土，務實、顧家，相處像一起把日子過好，只是久了也容易只剩柴米油鹽',
  寅亥: '寅亥合木，互相扶持、一起成長；不過亥水生寅木，常是一方默默多出力',
  卯戌: '卯戌合火，熱情、浪漫，容易互相欣賞；熱度來得快，冷下來時落差也明顯',
  辰酉: '辰酉合金，講信用、重承諾，兩人認真起來時相處卻少了點輕鬆',
  巳申: '巳申合水，聰明投契，但合中帶刑，親近之餘也會較勁',
  午未: '午未合（日月之合），溫暖親近，最有「家」的感覺；親到不分彼此時，也容易忘了各自需要空間',
};

const CHONG_NOTE: Record<string, string> = {
  子午: '子水午火相沖，一冷一熱，情緒節奏不同；也正因為不同，一個能幫另一個降溫、一個能幫另一個加熱',
  丑未: '丑未兩土相沖，都固執，容易沖在生活習慣與家務分配；可是兩人都認真負責，吵開之後定下的規矩往往守得住',
  寅申: '寅木申金相沖，衝勁對上原則，容易在行動方向上拉扯；拉扯過的計畫通常更周全，吵完反而走得更快',
  卯酉: '卯木酉金相沖，一個重感受、一個重對錯；彼此逼著對方看見盲點，久了一個更講理、一個更體貼',
  辰戌: '辰戌兩土相沖，都想守住自己的地盤，容易在決定權上拉鋸；但沖開了也代表悶不住，問題不會被藏起來',
  巳亥: '巳火亥水相沖，一個想快、一個想再想想，計畫常被打亂；一快一慢也讓生活不無聊，新點子常在爭論裡冒出來',
};

/** 刑的三種古稱。 */
function xingNote(x: string, y: string): string {
  const s = `${x}${y}`;
  if (/^(子卯|卯子)$/.test(s)) return '子卯「無禮之刑」，太熟了說話少了分寸；反過來說，兩人在彼此面前完全不用裝';
  if (/[寅巳申]{2}/.test(s)) return '寅巳申「無恩之刑」，付出了卻覺得對方不領情；其實兩人都很願意為對方做事，只是做的不一定是對方要的';
  return '丑戌未「恃勢之刑」，都想照自己的方式，誰也不服誰；兩個都有主見，聯手對外時卻很有份量';
}

function orderedKey(table: Record<string, string>, x: string, y: string): string | undefined {
  return table[`${x}${y}`] ?? table[`${y}${x}`];
}

const HAI_NOTE: Record<string, string> = {
  子未: '子未相害，一方要情緒上的回應、一方給實際的照顧，心意常錯開；但兩種在乎都是真的，學會翻譯對方的表達方式就是加分',
  丑午: '丑午相害，一方慢熱、一方急躁，熱情常落空；慢的那個給了穩，急的那個給了動力，步調對上時正好互補',
  寅巳: '寅巳相害，兩人都有主見，好意容易變成干涉；這股想為對方好的心，改用問的而不是直接做，就會被接住',
  卯辰: '卯辰相害，一方敏感、一方大而化之，小事容易被放大；大而化之的那個，也常能幫敏感的那個鬆一口氣',
  申亥: '申亥相害，兩人都聰明，容易話中有話、互相猜；聊得開時，卻是最懂彼此言外之意的一對',
  酉戌: '酉戌相害，一方挑剔、一方固執，提醒容易被聽成不被尊重；一個抓細節、一個守底線，合作時正好補上對方的漏洞',
};

/** 各柱 × 各種地支關係在生活裡的具體畫面。 */
const PILLAR_SCENE: Record<BaziPillar['key'], Record<BranchRelationKind, string>> = {
  year: {
    liuHe: '和對方的家人、朋友容易處得來，聚會時不用擔心冷場',
    liuChong: '兩邊家庭的習慣或價值觀差很多，過年回哪邊、怎麼跟長輩相處，容易成為話題',
    banHe: '容易融入彼此的朋友圈，一起經營共同的社交生活；朋友圈重疊得多，鬧彆扭時也少了各自喘口氣的地方',
    xing: '和對方家人或朋友相處時，容易覺得被比較、被要求',
    hai: '對對方的家人或朋友有說不出口的不舒服，需要找機會坦白',
    ziXing: '兩人在家庭議題上有同樣的心結，容易一起鑽牛角尖',
  },
  month: {
    liuHe: '一起做事很有默契，分工自然，適合一起規劃旅行或布置住處',
    liuChong: '做事節奏不同，一個想先做再說、一個想先計畫好，一起辦事時容易急',
    banHe: '在工作和目標上能互相拉抬，適合一起存錢、進修或經營副業；目標一致時也容易一起衝過頭，忘了休息',
    xing: '一起做事時容易互相挑毛病，「誰的方法比較好」常成為爭點',
    hai: '對對方的工作方式或忙碌有累積的不滿，嘴上不說，臉上看得出來',
    ziXing: '兩人做事的盲點一樣，同一種錯可能一起犯',
  },
  day: {
    liuHe: '關起門來很自在，生活小事容易有默契',
    liuChong: '在家的作息、整潔、花錢習慣容易相反，同住時磨合期比較長',
    banHe: '私下相處像隊友，容易一起朝同一個生活目標努力；太像隊友時，浪漫和撒嬌反而被擠掉',
    xing: '私下相處容易在小事上較勁，語氣比內容更容易傷人',
    hai: '親密之中藏著沒說出口的委屈，要養成定期聊心事的習慣',
    ziXing: '兩人在親密關係裡有同樣的敏感點，容易互相放大',
  },
  time: {
    liuHe: '對未來的想像和教養觀接近，談到要不要生小孩、以後想住哪裡容易有共識',
    liuChong: '對未來的步調不同，例如何時買房、要不要生小孩、怎麼教小孩，容易意見分歧',
    banHe: '對長遠目標有共同方向，越往後越像一個團隊；方向太一致時，萬一其中一人想轉彎，另一個會很難接受',
    xing: '談到未來規劃或教養時，容易各自堅持自己的做法',
    hai: '對未來各有擔心卻沒說出口，需要把長期計畫攤開來談',
    ziXing: '對未來有同樣的焦慮，容易一起擔心',
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
      return `兩人日主同屬${wa}（${ga}、${gb}），${SAME_NOTE[wa]}。${pol ? '陰陽也相同，像照鏡子，連脾氣都很像；' : '一陰一陽，同中有異，一個外放、一個內斂；'}分工清楚、各有舞台會更順。`;
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
      return `${c}的${cg}${STEM_WX[cg]}剋${d}的${dg}${STEM_WX[dg]}，${note}。剋在八字裡也代表吸引（男命以所剋為財、為妻，女命以剋我者為官、為夫），這股張力常是心動的來源；拿捏在於${c}的要求有沒有留餘地。`;
    }
  }
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

  items.push(item('日常相處', '依兩人的日主個性、彼此的十神、夫妻宮與五行，描繪生活裡的具體畫面。', dailyLines(a, b, syn).join('\n')));

  const keyLines: string[] = [];
  const seen = new Set<string>();
  const dayZhiA = a.chart.pillars.find((p) => p.key === 'day')?.zhi;
  const dayZhiB = b.chart.pillars.find((p) => p.key === 'day')?.zhi;
  if (syn.dayPair) {
    keyLines.push(`日支是夫妻宮（配偶宮），最能反映兩人關起門來相處的感覺。${pairLine(syn.dayPair, a, b, seen)}`);
  } else if (dayZhiA && dayZhiB) {
    keyLines.push(
      `日支（夫妻宮）${dayZhiA} × ${dayZhiB}：沒有明顯的合沖刑害，親密相處的感覺比較平穩，好壞多靠日常經營。`,
    );
  }
  const yearZhiA = a.chart.pillars.find((p) => p.key === 'year')?.zhi;
  const yearZhiB = b.chart.pillars.find((p) => p.key === 'year')?.zhi;
  if (syn.yearPair) {
    keyLines.push(
      `年支是生肖（${a.chart.shengXiao} × ${b.chart.shengXiao}），反映原生家庭與兩家人的互動。${pairLine(syn.yearPair, a, b, seen)}`,
    );
  } else if (yearZhiA && yearZhiB) {
    keyLines.push(
      `生肖 ${a.chart.shengXiao}（${yearZhiA}）× ${b.chart.shengXiao}（${yearZhiB}）：沒有明顯的合沖刑害，兩邊家庭與社交圈不太互相牽動。`,
    );
  }
  items.push(item('夫妻宮與生肖', '日支（夫妻宮）與年支（生肖）的合沖刑害，合婚時最先看的兩組地支。', keyLines.join('\n')));

  const others = syn.branchPairs.filter((p) => p !== syn.dayPair && p !== syn.yearPair);
  const otherLines = others.map((p) => pairLine(p, a, b, seen));
  if (syn.sanHe.length > 0) {
    otherLines.push(
      `兩盤地支合起來湊成三合${syn.sanHe.map((wx) => `${wx}局`).join('、')}：這股${syn.sanHe.map((wx) => WX_GIVE[wx]).join('、')}的力量只有兩人在一起時才完整，是共同目標與合作的來源；反過來，這股力量要兩人都在場才發揮，一方缺席或冷戰時，另一方會特別覺得少了一塊。`,
    );
  }
  const unknown = [a, b].filter((p) => p.chart.timeUnknown).map((p) => p.name);
  items.push(
    item(
      '其他地支互動',
      '兩盤其餘各柱地支之間的六合、六沖、半合、刑、害；年柱看家庭與社交、月柱看工作與做事方式、時柱看未來與子女。',
      [
        otherLines.length > 0 ? otherLines.join('\n') : '其餘各柱地支之間沒有明顯的合沖刑害。',
        unknown.length > 0 ? `${unknown.join('、')}的出生時間不確定，時柱不列入比對。` : '',
      ]
        .filter(Boolean)
        .join('\n'),
    ),
  );

  const wxLines: string[] = [
    `${a.name}：${a.chart.wuXing.map((s) => `${s.wx}${s.percent}%`).join('、')}（${a.chart.strength}）`,
    `${b.name}：${b.chart.wuXing.map((s) => `${s.wx}${s.percent}%`).join('、')}（${b.chart.strength}）`,
  ];
  const helpLine = (need: string, give: string, list: WuXing[]) =>
    `${need}的喜用五行${list.join('、')}在${give}盤中很旺：${give}自然帶著${list.map((wx) => WX_GIVE[wx]).join('、')}，和${give}相處時，${need}常覺得${list.map((wx) => WX_FEEL[wx]).join('，也')}；不過這份感覺若全靠${give}供應，${give}狀態不好時，${need}也會跟著失衡。`;
  const fillLine = (lack: string, give: string, list: WuXing[]) =>
    `${lack}盤中極少的${list.join('、')}，${give}剛好很多：${list.map((wx) => WX_GIVE[wx]).join('、')}是${lack}比較陌生的面向，可以從${give}身上學到；陌生也意味著看不慣，${give}在這方面的習慣，${lack}起初可能覺得太過頭。`;
  if (syn.bHelpsA.length > 0) wxLines.push(helpLine(a.name, b.name, syn.bHelpsA));
  if (syn.aHelpsB.length > 0) wxLines.push(helpLine(b.name, a.name, syn.aHelpsB));
  if (syn.bFillsA.length > 0) wxLines.push(fillLine(a.name, b.name, syn.bFillsA));
  if (syn.aFillsB.length > 0) wxLines.push(fillLine(b.name, a.name, syn.aFillsB));
  if (syn.bHelpsA.length + syn.aHelpsB.length + syn.bFillsA.length + syn.aFillsB.length === 0) {
    const topA = dominantWx(a.chart);
    const topB = dominantWx(b.chart);
    wxLines.push(
      topA === topB
        ? `兩人最旺的都是${topA}，強項相近，一起時${WX_GIVE[topA]}會加倍，但同樣缺的部分也沒人補；彼此的支持比較多來自相處方式，而不是五行本身。`
        : `兩人的五行沒有明顯的喜用互補：${a.name}以${topA}為主、${b.name}以${topB}為主，各有擅長，彼此的支持比較多來自相處方式，而不是五行本身。`,
    );
  }
  items.push(item('五行互補', '一方需要（喜用神）或缺少的五行，是否正是另一方的旺五行。', wxLines.join('\n')));

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

  // 個性
  const yangA = YANG_STEMS.has(ga);
  const yangB = YANG_STEMS.has(gb);
  const polarity =
    yangA && yangB
      ? '兩人都是陽干，個性外放、主動，生活很少冷場，說走就走的事特別多；只是常常誰都想先出手，安排行程時兩個都想當主揪。'
      : !yangA && !yangB
        ? '兩人都是陰干，內斂細膩，很能察覺對方沒說出口的情緒，待在一起安靜也舒服；但也常都在等對方先表態，像兩個人都說「隨便」卻都有想法。'
        : `${yangA ? a.name : b.name}是陽干，比較主動外放；${yangA ? b.name : a.name}是陰干，比較內斂細膩，一推一收，出門時多半是${yangA ? a.name : b.name}拉著${yangA ? b.name : a.name}走：${yangA ? a.name : b.name}帶${yangA ? b.name : a.name}見識新地方，${yangA ? b.name : a.name}幫${yangA ? a.name : b.name}把步調放慢；但一個急的時候嫌對方慢，一個累的時候嫌對方吵。`;
  const twin = ga === gb;
  lines.push(
    twin
      ? `【個性】兩人都是${ga}${STEM_WX[ga]}（${pa.image}），${pa.personality}。同一種底色放在一起，很快就懂對方，也會在同樣的地方一起卡住。${polarity}`
      : `【個性】${a.name}是${ga}${STEM_WX[ga]}（${pa.image}），${pa.personality}；${b.name}是${gb}${STEM_WX[gb]}（${pb.image}），${pb.personality}。${polarity}`,
  );

  // 思考方式
  const mutual = syn.tenGodBForA && syn.tenGodBForA === syn.tenGodAForB ? MUTUAL_SCENE[syn.tenGodBForA] : undefined;
  const decide = mutual
    ? [mutual.decide]
    : [
        syn.tenGodBForA ? TEN_GOD_SCENE[syn.tenGodBForA]?.decide(a.name, b.name) : '',
        syn.tenGodAForB ? TEN_GOD_SCENE[syn.tenGodAForB]?.decide(b.name, a.name) : '',
      ].filter(Boolean);
  lines.push(`【思考方式】${twin ? `兩人都${pa.thinking}` : `${a.name}${pa.thinking}；${b.name}${pb.thinking}`}。${decide.join('。')}${decide.length ? '。' : ''}`);

  // 處理矛盾
  const conflict: string[] = [twin ? `兩人吵架時的反應很像：都${pa.conflict}。` : `${a.name}${pa.conflict}；${b.name}${pb.conflict}。`];
  conflict.push(dayConflictScene(a, b, syn));
  const sa = a.chart.strength;
  const sb = b.chart.strength;
  const strongWeak = (w: string, k: string) =>
    `${w}身旺、${k}身弱：亂的時候${w}拿得定主意、讓事情往前走，${k}也願意配合；但${w}容易主導話題，${k}可能先讓步、事後才覺得委屈，${w}要多留一點讓${k}說完的時間。`;
  if (sa === '身旺' && sb === '身旺')
    conflict.push('兩人都身旺，有話直說，問題不太會被冷戰埋起來；只是吵架時都想贏，可以先約好一個「暫停」的暗號。');
  else if (sa === '身弱' && sb === '身弱')
    conflict.push('兩人都身弱，很少正面起衝突，吵也吵不兇；只是容易都在等對方先開口，誰先說一句「我們談談」就贏了一半。');
  else if (sa === '身旺' && sb === '身弱') conflict.push(strongWeak(a.name, b.name));
  else if (sa === '身弱' && sb === '身旺') conflict.push(strongWeak(b.name, a.name));
  lines.push(`【處理矛盾】${conflict.join('')}`);

  // 感受親密及愛
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
  lines.push(`【感受親密及愛】${love.join('')}`);
  return lines;
}

function dayConflictScene(a: BaziPartner, b: BaziPartner, syn: BaziSynastry): string {
  const zA = a.chart.pillars.find((p) => p.key === 'day')?.zhi ?? '';
  const zB = b.chart.pillars.find((p) => p.key === 'day')?.zhi ?? '';
  const kinds = syn.dayPair?.relations.map((r) => r.kind) ?? [];
  if (kinds.includes('liuChong'))
    return `夫妻宮${zA}${zB}相沖：在家裡的步調剛好相反（作息、整潔、花錢節奏），一件小事就可能當場吵開；沖得快也和得快，先各自冷靜十分鐘再談最有效。`;
  if (kinds.includes('xing'))
    return `夫妻宮${zA}${zB}相刑：摩擦多半出在語氣和「怎麼又這樣」的小事上；換個角度看，敢在對方面前挑毛病，也代表兩人彼此不設防。對事不對人、別翻舊帳最重要。`;
  if (kinds.includes('hai'))
    return `夫妻宮${zA}${zB}相害：不滿容易悶著不說，或從別的事情側面冒出來，對方常不知道哪裡惹到了；好在悶著多半是不想傷對方，定期問一句「最近有沒有哪裡不舒服」，就能把顧慮變成體貼。`;
  if (kinds.includes('ziXing'))
    return `夫妻宮同為${zA}自刑：兩人會在同一件事上一樣固執、一樣敏感，吵起來像照鏡子；也因為一樣，冷靜下來後最能體諒對方為什麼卡住，誰先察覺誰就先緩下來。`;
  if (kinds.includes('liuHe'))
    return `夫妻宮${zA}${zB}六合：吵完容易和好，常常一個擁抱就過去；也要留意別為了和氣，把真正的問題略過。`;
  if (kinds.includes('banHe'))
    return `夫妻宮${zA}${zB}半合：意見不同時容易回到共同目標，吵著吵著就變成一起想辦法；只是太快跳到「怎麼解決」，心裡的情緒可能還沒被聽見。`;
  return `夫妻宮${zA}${zB}沒有合沖刑害：衝突不太會被生活環境放大，但也少了吵完一抱就好的天然黏性，好壞主要看兩人說話的習慣。`;
}

function adviceLines(a: BaziPartner, b: BaziPartner, syn: BaziSynastry): string[] {
  const lines: string[] = [];
  const withKind = (k: BranchRelationKind) => syn.branchPairs.filter((p) => p.relations.some((r) => r.kind === k));
  const where = (p: PillarPairRelation) =>
    `${a.name}${PILLAR_NAMES[p.pillarA]}${p.zhiA} × ${b.name}${PILLAR_NAMES[p.pillarB]}${p.zhiB}`;
  const more = (ps: PillarPairRelation[]) => (ps.length > 1 ? `（另有 ${ps.length - 1} 組）` : '');

  const chong = withKind('liuChong');
  if (chong.length > 0) {
    const p = chong[0];
    const tip: Record<BaziPillar['key'], string> = {
      year: '兩邊家庭的事先由各自的那一方出面溝通，兩人站在同一陣線',
      month: '一起辦事前先說好「先做再改」還是「先想清楚」，給彼此一點節奏上的緩衝',
      day: '同住後的作息、家務、花錢先列成清單講好，吵起來先停十分鐘再談',
      time: '買房、生養、退休這些長期計畫，每年找一天坐下來對一次',
    };
    lines.push(`最需要磨合的六沖在${where(p)}${more(chong)}：${tip[scenePillar(p)]}。這裡也是兩人最有火花的地方，磨合順了，就是互相推著前進的動力。`);
  }
  const xingHai = [...withKind('xing'), ...withKind('hai')];
  if (xingHai.length > 0) {
    const kinds = new Set(xingHai.flatMap((p) => p.relations.map((r) => r.kind)));
    lines.push(
      `${kinds.has('xing') ? '刑' : ''}${kinds.has('xing') && kinds.has('hai') ? '與' : ''}${kinds.has('hai') ? '害' : ''}出現在${where(xingHai[0])}${more(xingHai)}：${kinds.has('hai') ? '不舒服別悶著，用「我覺得…」開頭說出來' : '說話對事不對人，別用「怎麼老是」開頭'}。`,
    );
  }
  const he = [...withKind('liuHe'), ...withKind('banHe')];
  if (he.length > 0) {
    const p = he[0];
    const act: Record<BaziPillar['key'], string> = {
      year: '多一起參加彼此家人和朋友的聚會',
      month: '找一件能一起完成的事，例如規劃旅行、布置住處或一起學新東西',
      day: '保留固定的兩人時間，例如每週一次不看手機的晚餐',
      time: '一起寫下三年、十年後想過的生活',
    };
    lines.push(`默契最好的是${where(p)}${more(he)}：${act[scenePillar(p)]}，讓這份默契變成習慣；也別因為這裡合得來，就用這裡的甜把別處的問題蓋過去。`);
  }

  switch (syn.stem.kind) {
    case 'he':
      lines.push('日主相合，吸引力是天生的；別只靠「感覺對了」，也要把生活細節談清楚。');
      break;
    case 'same':
      lines.push('同類日主容易互相理解，也容易互不相讓；各自保留一塊說了算的領域，衝突會少很多。');
      break;
    case 'aGeneratesB':
    case 'bGeneratesA': {
      const [g, r] = syn.stem.kind === 'aGeneratesB' ? [a.name, b.name] : [b.name, a.name];
      lines.push(`${g}常是付出的一方，${r}記得表達感謝與回饋；${g}也要讓${r}自己扛一些事，給得太多反而讓${r}少了成長的機會。`);
      break;
    }
    case 'aControlsB':
    case 'bControlsA': {
      const [c, d] = syn.stem.kind === 'aControlsB' ? [a.name, b.name] : [b.name, a.name];
      lines.push(`${c}想幫忙時先問「需要建議還是只要聽」，${d}覺得被管時直接說出感受，比冷戰有效；${c}的要求若讓${d}真的進步了，也別吝於說出口。`);
      break;
    }
  }
  lines.push('合盤看的是互動傾向，不是合不合得來的判決；兩人的選擇與溝通比八字更重要。');
  return lines;
}

// ---------------------------------------------------------------------------
// AI prompt
// ---------------------------------------------------------------------------

function chartBlock(p: BaziPartner): string {
  const c = p.chart;
  const pillars = c.pillars
    .map((x) => `${x.label} ${x.gan}${x.zhi}${c.timeUnknown && x.key === 'time' ? '（時間不確定）' : ''}`)
    .join('、');
  return `### ${p.name}
- ${c.genderLabel}；生肖：${c.shengXiao}；陽曆：${c.solarLabel}
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
- 每種關係都有兩面：合有默契，也可能黏太緊、失去自我，合化後個性被對方改變；沖刑害有摩擦，也帶來火花、互相激發與成長；相生是支持，也可能變成耗損或溺愛；相剋是壓力，也可能是讓人成熟的約束；十神與喜用互補同理。請每一段都寫出優點與挑戰，份量大致相當，不報喜不報憂，也不要只講問題；措辭請自然變化，不要每段都套「優點是…缺點是…」的句型。
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
2. 日常相處，分四個主題，每個主題都要同時寫出這兩人相處順的地方與會摩擦的地方（優點與挑戰），並至少給 2 個具體的生活場景（例如週末怎麼安排、一起決定要不要買房、對方晚回訊息時、吵架後隔天早上）：
   - 個性：兩人各自的個性底色，以及放在一起時的化學反應。
   - 兩人思考方式：各自怎麼想事情、做決定，用十神說明誰影響誰（例如「${b.name}是${a.name}的${syn.tenGodBForA}」在決策上的表現）。
   - 處理矛盾的方法：各自吵架時的反應、夫妻宮的合沖刑害如何放大或緩和衝突、怎麼和好最有效。
   - 感受親密及愛的方式：各自怎麼表達愛、怎麼感受到被愛，以及容易錯過對方心意的地方。
3. 五行互補與生活建議：互補帶來什麼，以及過度依賴對方補位的代價。
4. 最後給兩人各 3 條相處提醒，具體到可以今天就做。`;
}
