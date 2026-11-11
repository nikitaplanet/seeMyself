import type { MeaningItem } from '@/lib/ui/personMeaning';
import {
  AUTHORITY_NAMES_ZH,
  CENTER_NAMES_ZH,
  CENTER_ORDER,
  CHANNEL_NAMES_ZH,
  DEFINITION_NAMES_ZH,
  TYPE_NAMES_ZH,
} from './constants';
import { analyzeGates } from './derive';
import { ALL_CHANNELS, analyzeGraph } from './graph';
import type {
  Activation,
  Authority,
  CenterId,
  Channel,
  ChartResult,
  Definition,
  HDType,
  Side,
} from './types';

// 雙人合盤（composite / connection chart）— pure logic, no React. The composite is simply the union
// of both people's activated gates; every channel that touches both people is classified into one
// of the four classic connection kinds:
//   電磁 electromagnetic — A has one gate, B the other: the channel only exists together.
//   友伴 companionship   — both have the full channel.
//   主導 dominance       — one has the full channel, the other has neither gate.
//   妥協 compromise      — one has the full channel, the other has exactly one of its gates.

export type PartnerKey = 'a' | 'b';

export type SynastryChannelKind = 'electromagnetic' | 'companionship' | 'dominance' | 'compromise';

export const SYNASTRY_CHANNEL_KINDS: readonly SynastryChannelKind[] = [
  'electromagnetic',
  'companionship',
  'dominance',
  'compromise',
];

export const SYNASTRY_CHANNEL_KIND_NAMES_ZH: Record<SynastryChannelKind, string> = {
  electromagnetic: '電磁通道',
  companionship: '友伴通道',
  dominance: '主導通道',
  compromise: '妥協通道',
};

export interface SynastryChannel {
  channel: Channel;
  kind: SynastryChannelKind;
  /** dominance / compromise: who has the full channel; null otherwise. */
  holder: PartnerKey | null;
  /** electromagnetic: the gate each person brings. */
  gateA: number | null;
  gateB: number | null;
}

export interface HdSynastry {
  gatesA: number[];
  gatesB: number[];
  channels: SynastryChannel[];
  composite: {
    gates: number[];
    channels: Channel[];
    definedCenters: CenterId[];
    type: HDType;
    strategy: string;
    authority: Authority;
    definition: Definition;
  };
  definedA: CenterId[];
  definedB: CenterId[];
  /** Defined in the composite but in neither person alone. */
  newCenters: CenterId[];
  /** Still undefined in the composite (open in both). */
  openCenters: CenterId[];
}

/** Classify one channel for the pair; null when it is not formed even together. */
export function classifyChannel(
  gatesA: ReadonlySet<number>,
  gatesB: ReadonlySet<number>,
  channel: Channel,
): Omit<SynastryChannel, 'channel'> | null {
  const [g1, g2] = channel.gates;
  const a1 = gatesA.has(g1);
  const a2 = gatesA.has(g2);
  const b1 = gatesB.has(g1);
  const b2 = gatesB.has(g2);
  const aFull = a1 && a2;
  const bFull = b1 && b2;
  const none = { gateA: null, gateB: null };

  if (aFull && bFull) return { kind: 'companionship', holder: null, ...none };
  if (aFull || bFull) {
    const holder: PartnerKey = aFull ? 'a' : 'b';
    const otherCount = aFull ? Number(b1) + Number(b2) : Number(a1) + Number(a2);
    return { kind: otherCount === 0 ? 'dominance' : 'compromise', holder, ...none };
  }
  // Neither has it alone: electromagnetic when each brings the opposite gate.
  if (a1 && b2) return { kind: 'electromagnetic', holder: null, gateA: g1, gateB: g2 };
  if (a2 && b1) return { kind: 'electromagnetic', holder: null, gateA: g2, gateB: g1 };
  return null;
}

function gateList(gates: Iterable<number>): number[] {
  return [...new Set(gates)].sort((x, y) => x - y);
}

export function analyzeHdSynastry(gatesA: Iterable<number>, gatesB: Iterable<number>): HdSynastry {
  const a = gateList(gatesA);
  const b = gateList(gatesB);
  const setA = new Set(a);
  const setB = new Set(b);

  const channels: SynastryChannel[] = [];
  for (const channel of ALL_CHANNELS) {
    const c = classifyChannel(setA, setB, channel);
    if (c) channels.push({ channel, ...c });
  }

  const union = gateList([...a, ...b]);
  const comp = analyzeGates(union);
  const definedA = analyzeGraph(a).definedCenters;
  const definedB = analyzeGraph(b).definedCenters;
  const alone = new Set<CenterId>([...definedA, ...definedB]);
  const compDefined = new Set(comp.graph.definedCenters);

  return {
    gatesA: a,
    gatesB: b,
    channels,
    composite: {
      gates: union,
      channels: comp.graph.channels,
      definedCenters: comp.graph.definedCenters,
      type: comp.type,
      strategy: comp.strategy,
      authority: comp.authority,
      definition: comp.definition,
    },
    definedA,
    definedB,
    newCenters: comp.graph.definedCenters.filter((c) => !alone.has(c)),
    openCenters: CENTER_ORDER.filter((c) => !compDefined.has(c)),
  };
}

/** Active gates of a computed chart (keys of activeGates). */
export function chartGates(chart: Pick<ChartResult, 'activeGates'>): number[] {
  return Object.keys(chart.activeGates)
    .map(Number)
    .sort((x, y) => x - y);
}

/**
 * BodyGraph input for the composite: person A is drawn in the personality colour, person B in the
 * design colour, gates both have get the striped "both" fill. Activations keep planet/gate/line,
 * only `side` is reused to mean the person.
 */
export function compositeGraphData(
  a: Pick<ChartResult, 'activations'>,
  b: Pick<ChartResult, 'activations'>,
  syn: HdSynastry,
): { activations: Activation[]; activeGates: Record<number, Side[]>; definedCenters: CenterId[] } {
  const activations: Activation[] = [
    ...a.activations.map((x) => ({ ...x, side: 'personality' as const })),
    ...b.activations.map((x) => ({ ...x, side: 'design' as const })),
  ];
  const activeGates: Record<number, Side[]> = {};
  const inA = new Set(syn.gatesA);
  const inB = new Set(syn.gatesB);
  for (const g of syn.composite.gates) {
    const sides: Side[] = [];
    if (inA.has(g)) sides.push('personality');
    if (inB.has(g)) sides.push('design');
    activeGates[g] = sides;
  }
  return { activations, activeGates, definedCenters: syn.composite.definedCenters };
}

// ---------------------------------------------------------------------------
// Report text
// ---------------------------------------------------------------------------

export interface HdPartner {
  name: string;
  chart: ChartResult;
}

function names(a: HdPartner, b: HdPartner, key: PartnerKey): [string, string] {
  return key === 'a' ? [a.name, b.name] : [b.name, a.name];
}

export function channelLabel(ch: Channel): string {
  const name = CHANNEL_NAMES_ZH[ch.id];
  return name ? `${ch.id} ${name}` : ch.id;
}

/** Short, person-neutral theme of each channel (the single-chart texts address 「你」). */
const CHANNEL_THEME: Record<string, string> = {
  '1-8': '把獨特的創意貢獻出來、被看見',
  '2-14': '方向感與資源驅力，知道往哪走也有力氣走',
  '3-60': '在限制中突破，帶來突變與新秩序',
  '4-63': '懷疑與求證，用邏輯把事情想通',
  '5-15': '節奏與習慣，生活的固定韻律',
  '6-59': '親密與界線，打開心防、靠近彼此',
  '7-31': '帶領與影響，誰站出來指方向',
  '9-52': '專注與定力，把一件事盯到完成',
  '10-20': '活出自己的樣子，當下怎麼做就是表達',
  '10-34': '用行動探索自己，順著信念去做',
  '10-57': '對生活形式的直覺，怎麼活才對',
  '11-56': '好奇、找意義，再把故事說出來',
  '12-22': '情緒帶動的表達與社交氛圍',
  '13-33': '傾聽、記得，再把過往經驗分享出來',
  '16-48': '技巧與深度，把才華練到精熟',
  '17-62': '組織意見、把細節說清楚',
  '18-58': '看見不完美、想把事情改善',
  '19-49': '需求與原則，關係裡的公平與歸屬',
  '20-34': '有能量就動，忙碌而有魅力的行動',
  '20-57': '當下的直覺立刻說出口',
  '21-45': '資源與管理，誰掌握物質與決定權',
  '23-43': '突然的洞見，以及把它說清楚',
  '24-61': '反覆思索，追問內在的奧祕',
  '25-51': '勇氣與衝擊，在突發狀況中保持中心',
  '26-44': '傳遞與說服，把對的東西帶給對的人',
  '27-50': '照顧與價值觀，誰該被守護',
  '28-38': '為意義奮鬥，在困境中堅持',
  '29-46': '全心投入，透過身體去經驗',
  '30-41': '慾望與期待，對新經驗的渴望',
  '32-54': '野心與轉化，一步步往上爬',
  '34-57': '直覺帶動的行動力，反應快',
  '35-36': '追求新經驗，在變化中學習',
  '37-40': '家與社群的契約，互相照顧與付出',
  '39-55': '情緒與精神的深度，激發真實的感受',
  '42-53': '開始與完成的循環，讓事情成熟',
  '47-64': '從混亂的畫面中慢慢領悟',
};

/** Short meaning of a channel for the report. */
export function channelShortMeaning(id: string): string {
  const theme = CHANNEL_THEME[id];
  return theme ? `${theme}。` : '';
}

/**
 * Where each channel shows up in a couple's everyday life (a noun phrase, framed per connection
 * kind by channelLine). Kept concrete so two channels never read alike.
 */
const CHANNEL_SCENE: Record<string, string> = {
  '1-8': '佈置家裡、挑穿搭、一起做作品時，誰的品味被採用、被別人看見',
  '2-14': '決定錢花在哪、要不要搬家或換城市這類「往哪走」的大方向',
  '3-60': '平淡一陣子後一起迎來大轉彎，像決定換工作、搬家，替生活開出新局',
  '4-63': '一個丟出「為什麼會這樣？」、一個忍不住去找答案，能聊到半夜',
  '5-15': '幾點睡、幾點吃飯、週末固定去哪，這些生活節奏誰配合誰',
  '6-59': '牽手、擁抱、性與親密，以及什麼時候可以靠近、什麼時候要給空間',
  '7-31': '出遊誰排行程、聚會誰出主意，大家最後聽誰的',
  '9-52': '一起拼一件需要耐心的事，像規劃旅行細節、整理家裡的雜物',
  '10-20': '一句話、一個動作就是當下的自己，不必事先想好怎麼表現',
  '10-34': '各自忙著自己相信的事，也尊重、支持對方全心投入的計畫',
  '10-57': '家裡怎麼擺、去哪裡住才舒服，憑直覺就知道「這樣才對」',
  '11-56': '旅行、看電影後聊心得，把經歷說成一個有意思的故事',
  '12-22': '心情好時說甜話、營造氣氛，心情不對時連一句話都不想講',
  '13-33': '一個人講過去的事、另一個人聽，把共同回憶整理成故事',
  '16-48': '一起練一項技能，或一方手把手教另一方怎麼做比較好',
  '17-62': '討論事情時誰的看法比較有條理、細節要不要講清楚',
  '18-58': '一眼看出家裡或生活哪裡可以更好，一起動手把它修得更順',
  '19-49': '誰照顧誰、需求有沒有被注意到，以及在關係裡被公平對待的安心',
  '20-34': '一忙起來就停不下來，兩人一起動、一起趕行程',
  '20-57': '當下的直覺脫口而出，像走進餐廳就說「這裡不太對」',
  '21-45': '家裡的錢誰管、大筆開銷誰說了算',
  '23-43': '一方突然冒出新點子，另一方幫忙把它問清楚、說明白',
  '24-61': '睡前聊人生、宇宙這種沒有標準答案的問題，想了又想',
  '25-51': '一起做刺激的事、面對突發狀況，誰先衝、誰穩住場面',
  '26-44': '說服對方買東西、去一個地方，也很記得過去哪些做法吃過虧',
  '27-50': '照顧家人、煮飯給對方吃，以及什麼是「這個家該守住的」',
  '28-38': '一起撐過一段難熬的日子，為了覺得有意義的事咬牙堅持',
  '29-46': '說好就全心投入，像一起報名馬拉松、說走就走的旅行',
  '30-41': '對下一次旅行、下一個階段的想像與期待，光是規劃就讓人心動',
  '32-54': '一起規劃未來、存錢買房、往上爬的野心',
  '34-57': '遇到危險或突發狀況時反應很快，下意識就保護對方',
  '35-36': '想嘗試新經驗、新餐廳新城市，一起累積說不完的回憶',
  '37-40': '家務分工、付出與回報，以及「你做的我都記得」的默契',
  '39-55': '一方的情緒很容易挑起另一方的情緒，心情一起高一起低',
  '42-53': '開始一件事就想把它走完，像裝修、一起養寵物的每個階段',
  '47-64': '腦中一堆畫面理不清時，兩人一起回想、慢慢想通',
};

/**
 * The gentle growth point when BOTH people have the full channel (companionship): the same energy
 * doubled, phrased as an observation plus a doable tip.
 */
const CHANNEL_SHARED_TIP: Record<string, string> = {
  '1-8': '兩人都有鮮明的品味，偶爾輪流讓對方的想法當主角，作品會長出意想不到的樣子',
  '2-14': '方向一定下就能一起往前衝，每隔一陣子停下來問問「這條路還是我們想要的嗎？」，就走得更踏實',
  '3-60': '兩人都懂沉潛的滋味，等待轉機時互相打氣，別急著一起做太快的決定，轉彎會更漂亮',
  '4-63': '兩人都要先想通才安心，疑問浮上來時先把感受說出口，比一起推理到深夜更能安定彼此',
  '5-15': '節奏太合時生活容易變成例行公事，偶爾安排一件沒做過的小事，新鮮感就回來了',
  '6-59': '親密對你們來說很自然，也可以練習說出「今天我想要自己的空間」，靠近會更自在',
  '7-31': '兩人都很會出主意，事先說好「這次你帶、下次我帶」，就是一對默契十足的搭檔',
  '9-52': '兩人都能專注到忘我，記得替彼此留一點抬頭看看對方的時間',
  '10-20': '兩人都很做自己，偶爾為對方多想一步，這份自在會更溫暖',
  '10-34': '各自忙著自己相信的事時，每週留一段只屬於兩人的時間，就不會漸行漸遠',
  '10-57': '兩人的直覺常常一致，做大決定前一起看一眼現實的細節，就更穩',
  '11-56': '兩人的想法和故事都很多，挑一個最喜歡的點子真的去做，會成為很棒的共同回憶',
  '12-22': '心情好時一起熱絡，心情低時也許都不想開口，約好由先恢復的那個人遞出第一句話',
  '13-33': '兩人都很會聽，也別忘了把自己的心事說給對方聽，對方會很珍惜',
  '16-48': '兩人都追求做到好，多欣賞對方的進步、少一點比較，就是彼此最好的教練',
  '17-62': '兩人都說得出條理，討論時先找出彼此同意的部分，再談不同的地方',
  '18-58': '兩人都看得出哪裡可以更好，把這份眼光多用在生活上、少用在對方身上，會是最強的改造搭檔',
  '19-49': '兩人都很在意需求有沒有被照顧，感覺被忽略時直接說「我需要……」，比等對方猜更快',
  '20-34': '一起忙起來很有效率，記得在行程裡替關係本身也排一個位置',
  '20-57': '兩人都相信當下的直覺，重要的話說出口前先深呼吸一次，就更貼心',
  '21-45': '兩人都有管理的天分，把「誰管什麼」分清楚，就能各自發揮、互相信任',
  '23-43': '兩人都有自己的洞見，輪流當說的人與聽的人，靈感會加倍',
  '24-61': '兩人都能想得很深，想不出答案時一起出門走走，答案常在放下時出現',
  '25-51': '兩人都愛刺激、勇氣十足，冒險前一起確認安全，就能玩得盡興又安心',
  '26-44': '兩人都很會說服人，對彼此說話時少一點推銷、多一點真心，信任會更深',
  '27-50': '兩人都很會照顧人，也別忘了互相照顧，輪流當那個被寵的人',
  '28-38': '兩人都能咬牙撐過難關，偶爾一起問問「這件事還值得嗎？」，該放手時也放得下',
  '29-46': '兩人都是說好就投入的人，答應新的事之前先看看彼此的行程，就不會一起累過頭',
  '30-41': '兩人的期待常一起升高，把夢想拆成一步步可以做到的小事，就能一起享受實現的過程',
  '32-54': '兩人都有往上爬的動力，記得偶爾停下來慶祝已經走到的地方',
  '34-57': '兩人反應都快，事後花一分鐘對一下彼此的想法，默契會更好',
  '35-36': '兩人都愛新鮮，除了新體驗，也可以在熟悉的日常裡找小驚喜',
  '37-40': '兩人都重視付出與回報，偶爾不計較地多做一點，家裡的溫度會更高',
  '39-55': '兩人的情緒會一起起伏，約好低潮時由比較好的那個人先伸手，就能互相接住',
  '42-53': '兩人都想把開始的事做完，也練習在該停的時候一起說「到這裡就很好了」',
  '47-64': '兩人都容易被腦中的畫面纏著，約好一個做決定的期限，想法就能落地',
};

/** What is most precious about each channel between two people (used in the closing gift item). */
const CHANNEL_GIFT: Record<string, string> = {
  '1-8': '讓彼此的獨特被看見、被欣賞的感覺',
  '2-14': '一起知道往哪走、也有力氣走下去的篤定',
  '3-60': '在平凡日子裡一起開出新局的勇氣',
  '4-63': '一個發問、一個找答案，聊到半夜也不膩的知性火花',
  '5-15': '自然合拍的生活節奏，日常本身就是陪伴',
  '6-59': '打開心防、自在靠近彼此的親密',
  '7-31': '一起為身邊的人指出方向的影響力',
  '9-52': '能一起把一件事專心做到好的定力',
  '10-20': '在對方面前怎樣都可以、不用演的安心',
  '10-34': '各自活出信念、又被對方支持的自由',
  '10-57': '憑直覺就知道「這樣過才對」的生活品味',
  '11-56': '把經歷變成故事、一起找到意義的樂趣',
  '12-22': '心情對了就能說出動人話語的浪漫',
  '13-33': '一個說、一個記得，把共同回憶好好收藏的溫柔',
  '16-48': '互相切磋、一起把才華練到精熟的成就感',
  '17-62': '把想法說清楚、互相補足細節的默契',
  '18-58': '一起把生活修得更好的熱情',
  '19-49': '需求被看見、被照顧的歸屬感',
  '20-34': '一起動起來就停不下來的活力',
  '20-57': '當下的直覺一說出口就被懂的默契',
  '21-45': '一起把家打理得井井有條的踏實',
  '23-43': '突然的靈感有人聽懂、說得出口的痛快',
  '24-61': '一起思索人生大哉問的深度',
  '25-51': '一起面對突發狀況、互相壯膽的勇氣',
  '26-44': '把好東西帶給對方、也帶給身邊的人的熱心',
  '27-50': '互相照顧、守護彼此家人的溫暖',
  '28-38': '一起為有意義的事堅持下去的韌性',
  '29-46': '說好就全心投入、一起經歷的熱情',
  '30-41': '對下一段旅程共同的嚮往',
  '32-54': '一起規劃未來、一步步往上走的盼望',
  '34-57': '遇到狀況時下意識就保護對方的本能',
  '35-36': '一起嘗試新事物、累積說不完回憶的豐富',
  '37-40': '互相付出、說到做到的家的感覺',
  '39-55': '讓彼此真實感受被深深觸動的情感深度',
  '42-53': '一起把開始的事好好走完的成熟',
  '47-64': '一起把混亂的念頭慢慢想通的領悟',
};

/** The one gate the non-holder brings in a compromise channel. */
function compromiseGate(sc: SynastryChannel, syn: HdSynastry): number | null {
  const own = sc.holder === 'a' ? syn.gatesB : syn.gatesA;
  return sc.channel.gates.find((g) => own.includes(g)) ?? null;
}

export const SYNASTRY_CHANNEL_KIND_FIELD: Record<SynastryChannelKind, string> = {
  electromagnetic: '一人有通道的一端閘門、另一人有另一端，只有兩人在一起時才接通的通道。',
  companionship: '兩人都各自擁有的完整通道，是共同的語言與相處的基本盤。',
  dominance: '只有一人擁有完整通道、另一人兩端閘門都沒有，由擁有的一方帶動，另一方從中體驗。',
  compromise: '一人擁有完整通道、另一人只有其中一端閘門，是需要磨合的地方，也是最能向對方學習的地方。',
};

const KIND_MEANING: Record<SynastryChannelKind, string> = {
  electromagnetic:
    '電磁通道是吸引力與火花的來源：兩人各帶一半，合在一起才接通，在一起時會感覺「被接上了」，能做到各自做不到的事，這是很珍貴的化學反應。因為兩邊各握一半，意見不同時也會感受得特別強烈；當你們把它當成「我們一起的事」而不是「誰說了算」，這股拉力就會變成彼此靠近的力量。分開時那份感覺會淡一些，這是正常的。',
  companionship:
    '友伴通道是你們的共同基礎：在這些主題上彼此很容易懂、做法相近，相處起來輕鬆得像老朋友，信任與默契就從這裡長出來。因為兩人看事情的角度一樣，偶爾聽聽身邊朋友的意見，就能替這份默契多加一雙眼睛。',
  dominance:
    '主導通道裡，擁有的一方在這個主題上自然帶頭，另一方從對方身上體驗這股能量，常會說「跟你在一起，我才知道這是什麼感覺」，這是很實在的禮物，也讓帶頭的一方感覺被需要。可以試試偶爾交換角色，讓沒有的一方也帶一次，做得不一樣也沒關係，帶頭的人也能趁機休息。',
  compromise:
    '妥協通道是最能互相學習的地方：擁有完整通道的人帶來成熟的做法，只握著一半的人對這個主題特別敏感，常看得出對方習以為常、沒察覺的地方，兩種視角加起來，比任何一方單獨想得更周全。這裡需要一些磨合，當只有一端的人覺得插不上話時，攤開來談、輪流決定，這裡就會變成你們最互補的優勢。',
};

const COMPOSITE_TYPE_NOTE: Record<HDType, string> = {
  generator:
    '兩人合起來薦骨被定義，關係本身就有源源不絕的動力：一起投入有感覺的事，會越做越有精神，很能把生活經營得有聲有色。挑選兩人都真心想做的事，這份能量就不會被沒感覺的瑣事分走。',
  manifestingGenerator:
    '兩人合起來是顯示生產者的能量：有持續力、也有把事情快速推出去的行動力，一起做事節奏明快、點子很快就能落地。換方向時記得跟身邊的人說一聲，速度就會變成大家都跟得上的優勢。',
  manifestor:
    '兩人合起來有動力接到喉嚨：關係很擅長發起與開局，常一起把想法變成新的開始。開了頭的事可以事先規劃分工與休息，衝勁就能細水長流。',
  projector:
    '兩人合起來的強項在彼此理解、看清方向：你們很懂得看人、看局勢，一起討論時常能找到最有效率的做法。重大的事等被邀請再投入，也替兩人安排足夠的休息，智慧就能發揮得最好。',
  reflector:
    '兩人合起來仍沒有任何定義中心，非常罕見：關係像一面清澈的鏡子，對環境與彼此的狀態極度敏銳，在好的地方會一起發光。替兩人挑選舒服的居住與相處環境，就是對這段關係最好的照顧。',
};

const DEFINITION_COMPOSITE_NOTE: Record<Definition, string> = {
  none: '合盤沒有定義，關係彈性很大、能適應各種場合與人；替兩人找一個固定讓你們安心的地方，就能在變化裡保有穩定。',
  single: '合盤是一分人：兩人在一起時能量連成一片，常有「在一起很完整」的感覺，不太需要外人來接通。偶爾也敞開門接受朋友的邀約，這份完整會更有活力。',
  split: '合盤是二分人：兩人在一起還有兩塊能量等著被串起來，朋友、家人或喜歡的地方常能替你們搭橋；這讓關係保持流動，生活圈也更豐富。',
  tripleSplit: '合盤是三分人：關係裡有三塊各自獨立的能量，多元的生活圈會讓兩人更順；好處是兩人都保有不少各自的空間，相處起來不會黏得喘不過氣。',
  quadrupleSplit: '合盤是四分人：能量分散在好幾處，兩人很少被困在同一種模式裡，關係有很大的成長空間；多給彼此一點時間與外部的支持，步調就會慢慢對上。',
};

const TYPE_ORDER: readonly HDType[] = [
  'generator',
  'manifestingGenerator',
  'manifestor',
  'projector',
  'reflector',
];

/** Pair dynamics, keyed by the two types in TYPE_ORDER order. */
const TYPE_PAIR_NOTE: Record<string, string> = {
  'generator|generator':
    '兩個生產者在一起，耐力與持續力都強，很能一起把生活經營起來，做家事、運動、經營興趣都有說不完的勁。兩人都習慣等回應，可以試試多用是非題問對方「要不要……？」，很快就知道兩人是不是都有感覺；答應新的事前一起看看行程，就不會同時累過頭。',
  'generator|manifestingGenerator':
    '兩人都有薦骨動力，生活節奏旺盛。顯示生產者速度快、點子多，生產者喜歡一步一步把事做熟；快的一方開路、穩的一方收尾，是非常好用的分工。步調不同時，換方向前說一聲，穩的人就跟得上，快的人也不會覺得被拖住。',
  'generator|manifestor':
    '顯示者擅長點火開局，生產者回應之後能把事情持續做下去，是很互補的組合，一個起頭、一個讓它開花結果。顯示者行動前先告知，生產者誠實說出有沒有感覺，兩人的合作就會越來越順。',
  'generator|projector':
    '典型的「能量與引導」組合：投射者看得見生產者的力氣怎麼用最有效，生產者提供持續的動力，彼此都讓對方發揮得更好。可以試試讓生產者主動問「你覺得呢？」、投射者在被問時給建議；投射者也要照顧自己的休息，不必跟著對方的節奏硬撐。',
  'generator|reflector':
    '反映者會放大生產者的能量與狀態：生產者做得開心時，對方也跟著明亮，生產者也能從反映者身上看見關係真實的樣子。生產者給反映者足夠時間做決定，反映者把對這段關係的觀察分享出來，兩人會越來越懂彼此。',
  'manifestingGenerator|manifestingGenerator':
    '兩個顯示生產者在一起，火花多、進度快、什麼都想試，一起出發的冒險總是很精采。重要的事一起慢下來對一次細節，換方向時互相告知，速度就會成為你們共同的優勢。',
  'manifestingGenerator|manifestor':
    '兩人都能主動動起來，衝勁十足，一起行動時效率驚人。顯示者需要獨立發起的空間，顯示生產者需要先有回應再行動；互相告知計畫，就能並肩往前衝、又各自自在。',
  'manifestingGenerator|projector':
    '投射者能幫顯示生產者看見被跳過的步驟、找到更有效率的做法，顯示生產者則把想法快速落地，一個看得準、一個做得快。可以試試由顯示生產者主動邀請「幫我看看這樣好不好？」，投射者的建議就會被好好聽進去；投射者也不必追著對方的速度跑。',
  'manifestingGenerator|reflector':
    '顯示生產者的速度與能量會被反映者放大，反映者也能敏銳地察覺這段關係健不健康，是很好的指南針。兩人的時間感不同：一個今天就想定案，一個需要更長的時間確定；重要的事給反映者時間，反映者把感受說出來，快與慢就能互相成全。',
  'manifestor|manifestor':
    '兩個顯示者都很有主見、也很懂彼此需要自由，能各自開疆闢土又互相支援。事前互相告知一聲，就能把兩股開創的力量放在同一個方向上。',
  'manifestor|projector':
    '顯示者負責開局，投射者看清系統，能把衝出去的方向修得更準，是很有效率的搭配。顯示者記得主動告知，也可以主動邀請投射者給意見；投射者等被邀請再說，建議會被珍惜地聽進去。',
  'manifestor|reflector':
    '顯示者的發起力很強，反映者會被帶著體驗很多原本不會去碰的事，生活因此更寬廣；反映者也是很好的鏡子，能讓顯示者看見行動對周圍的影響。顯示者行動前先告知、給反映者時間消化，兩人都會很安心。',
  'projector|projector':
    '兩個投射者都擅長看人、看系統，很懂對方需要被看見、被認可，彼此是最好的知音。兩人都需要比別人多一點休息，一起做事時規劃好節奏，必要時找人分擔體力活；給建議前先問一句「想聽聽我的看法嗎？」，對方會更感受到你的用心。',
  'projector|reflector':
    '兩人都敏銳、都不靠蠻力，很能欣賞彼此細膩的觀察，相處起來安靜而深刻。重要的事可以約好一個時間點一起確認，避免一直停在「再看看」；替兩人安排足夠的休息與好的環境，這份細膩就會成為關係最美的地方。',
  'reflector|reflector':
    '兩個反映者在一起非常罕見，兩人都像環境的鏡子，彼此狀態會互相映照，在好的環境裡能一起放大美好，這份同頻是很少人能體會的。共同挑選舒服的環境與圈子最重要；重大決定給彼此一整個月亮週期的時間，不必急。',
};

/** How the other person can best engage with someone of this type. */
const TYPE_PARTNER_TIP: Record<HDType, string> = {
  generator: '多用「要不要……？」這類是非題邀請對方回應，而不是直接下指令。',
  manifestingGenerator: '讓對方先回應再行動，欣賞那份速度，請對方在換方向時說一聲。',
  manifestor: '給對方自己發起的空間，不必處處要求報備；可以約定「行動前先跟我說一下」。',
  projector: '看見對方、主動問「你覺得呢？」；也記得對方需要比你更多的休息。',
  reflector: '帶對方去讓人舒服的地方，留意對方在什麼環境、和哪些人在一起時最明亮。',
};

type DecisionPace = 'wave' | 'instant' | 'voice' | 'cycle';

const AUTHORITY_PACE: Record<Authority, DecisionPace> = {
  emotional: 'wave',
  sacral: 'instant',
  splenic: 'instant',
  egoManifested: 'voice',
  egoProjected: 'voice',
  selfProjected: 'voice',
  mental: 'voice',
  lunar: 'cycle',
};

const PACE_ORDER: readonly DecisionPace[] = ['instant', 'voice', 'wave', 'cycle'];

/** How far apart the two people's decision pace is (0 = same pace, 3 = instant vs lunar). */
function paceGap(a: HdPartner, b: HdPartner): number {
  return Math.abs(
    PACE_ORDER.indexOf(AUTHORITY_PACE[a.chart.authority]) - PACE_ORDER.indexOf(AUTHORITY_PACE[b.chart.authority]),
  );
}

const AUTHORITY_PARTNER_TIP: Record<Authority, string> = {
  emotional: '給對方時間等情緒波過去，重要的事不必當下答覆，「睡一晚再說」很正常。',
  sacral: '用是非題問對方，聽當下那聲「嗯／嗯嗯」，不必要求講出理由。',
  splenic: '相信對方當下的第一個直覺，那份「不太對」通常只出現一次，值得被尊重。',
  egoManifested: '問一句「你真的想要嗎？」，讓對方說出自己的意願；真心答應的事最守得住。',
  egoProjected: '當對方的傾聽者，讓對方把「我想要什麼」說出口，而不是替對方決定。',
  selfProjected: '單純聽對方說，不急著給建議；說著說著，對方就會聽見自己的方向。',
  mental: '陪對方聊、陪對方換個環境想，答案會在對話中慢慢成形。',
  lunar: '給對方大約一個月的時間，在不同日子裡感覺同一件事。',
};

const PACE_LABEL: Record<DecisionPace, string> = {
  wave: '需要等情緒沉澱',
  instant: '當下就知道',
  voice: '要說出來才清楚',
  cycle: '需要一整個月亮週期',
};

function pairKey(x: HDType, y: HDType): string {
  const [p, q] = [x, y].sort((m, n) => TYPE_ORDER.indexOf(m) - TYPE_ORDER.indexOf(n));
  return `${p}|${q}`;
}

function paceNote(a: HdPartner, b: HdPartner): string {
  const pa = AUTHORITY_PACE[a.chart.authority];
  const pb = AUTHORITY_PACE[b.chart.authority];
  if (pa === pb) {
    if (pa === 'wave')
      return '兩人都需要等情緒沉澱，所以很懂「讓我想一下」不是推託，從不逼對方當下表態，這份體貼很難得。情緒正高或正低時，約好隔天再談，決定會更清楚。';
    if (pa === 'instant')
      return '兩人都是當下就知道，做決定又快又爽快，很少拖泥帶水。重大的事多確認一次彼此當下的身體反應，就能快得又準又安心。';
    if (pa === 'voice')
      return '兩人都要把話說出來才知道自己怎麼想，彼此是很好的傾聽者，常在聊天裡一起找到答案。可以試試輪流當說的人，一個說完、另一個再說，兩人都會被好好聽見。';
    return '兩人都需要很長的時間沉澱，不會互相催，決定一旦成形通常很周全。重大決定一起給彼此一個月，到期時約好一起做決定，就不會一直懸著。';
  }
  const [fast, slow] = PACE_ORDER.indexOf(pa) < PACE_ORDER.indexOf(pb) ? [a, b] : [b, a];
  return `${fast.name}${PACE_LABEL[AUTHORITY_PACE[fast.chart.authority]]}，${slow.name}${PACE_LABEL[AUTHORITY_PACE[slow.chart.authority]]}：一個先給出第一反應、一個補上沉澱後的判斷，兩種用在同一件事上，決定會比各自做更周全。可以約好重要的事「${slow.name}可以晚點回覆」，${fast.name}也放心先說出自己的直覺，快與慢就會變成互補。`;
}

/** What a center feels like when it is defined only by the two of you together. */
const CENTER_NEW: Record<CenterId, string> = {
  head: '一起時常冒出一連串想搞懂的問題，對什麼都充滿好奇，是很棒的靈感夥伴；夜深了記得把問題留到明天。',
  ajna: '一起討論時想法特別清晰，容易得出共同的結論；偶爾也聽聽外人的意見，兩人的看法會更完整。',
  throat: '在一起話變多，也比較敢把想做的事說出口、推出去；挑幾件最重要的承諾好好完成，成就感會很大。',
  g: '一起時「我們要往哪走、我們是怎樣的兩個人」特別清楚，彼此就是對方的方向感；分開時有點茫然是正常的。',
  heart: '一起時比較有底氣做承諾，也敢談錢與彼此的價值；答應大事前一起評估一下能力，就能說到做到。',
  spleen: '在一起時身體放鬆、有安全感，生病或疲累時特別想待在對方身邊，這份安心很珍貴；分開時也記得照顧自己。',
  solarPlexus: '兩人一起才有的情緒波，感受比單獨時更濃：甜的時候更甜，低潮時互相陪伴、等它過去就好。',
  sacral: '在一起時精力變多，做家事、出門、玩樂都比較有勁；記得替這份活力留一點休息的時間。',
  root: '一起時推進的動力變大，常一起把事情有效率地完成；做完後也一起好好放鬆、獎勵自己。',
};

/** What it looks like in daily life when both people are open in a center. */
const CENTER_OPEN_BOTH: Record<CenterId, string> = {
  head: '兩人都不固執於某種想法，對新鮮的靈感很敞開；被外界的問題推著想時，提醒彼此「這不一定是我們要煩惱的」。',
  ajna: '兩人都能接受很多觀點，討論起來不太爭誰對、很有包容力；需要定案時，約好由誰拍板就好。',
  throat: '兩人都很會配合場合調整說話方式，社交時很有彈性；聊天時輪流當主角，彼此都會被聽見。',
  g: '兩人很能一起適應新地方，換對環境就像替關係充電；一起挑選讓兩人都喜歡的居住與相處環境。',
  heart: '兩人都不會硬拗，看得出誰真的累了，很懂得體諒；提醒彼此不必證明什麼，你們本來就很好。',
  spleen: '兩人對彼此的身體狀況都很敏感，對方不舒服常第一個發現；也可以互相鼓勵，放下不再適合的舊習慣。',
  solarPlexus: '這份敏感讓你們很能體會彼此的感受；聚會回來覺得心累時，一起安靜休息一下，就能把外面的情緒放下。',
  sacral: '兩人不會互相逼對方一定要拚，相處很寬容；行程表上記得一起留一天空白，好好休息。',
  root: '壓力不大時兩人都能過得很悠閒；遇到截止日期時互相提醒慢下來，一件一件做就好。',
};

function item(term: string, field: string, meaning: string): MeaningItem {
  return { term, field, meaning };
}

function centerList(cs: readonly CenterId[]): string {
  return cs.map((c) => CENTER_NAMES_ZH[c]).join('、');
}

/** One closing line per holder for dominance / compromise, instead of repeating it per channel. */
function holderSummary(kind: SynastryChannelKind, list: SynastryChannel[], a: HdPartner, b: HdPartner): string[] {
  if (kind !== 'dominance' && kind !== 'compromise') return [];
  const out: string[] = [];
  if (kind === 'dominance') {
    const parts = (['a', 'b'] as const)
      .map((key) => ({ key, held: list.filter((c) => c.holder === key).map((c) => c.channel.id) }))
      .filter((x) => x.held.length > 0);
    if (parts.length === 2) {
      const [pa, pb] = parts.map((x) => `${names(a, b, x.key)[0]}帶起 ${x.held.join('、')}`);
      out.push(`${pa}，${pb}：兩人各自在對方身邊體驗到自己沒有的能量，帶頭的位置有來有往，彼此都是對方的老師。偶爾也試著自己帶一次對方擅長的事，會更懂對方平常的付出。`);
      return out;
    }
  }
  for (const key of ['a', 'b'] as const) {
    const held = list.filter((c) => c.holder === key).map((c) => c.channel.id);
    if (held.length === 0) continue;
    const [holder, other] = names(a, b, key);
    out.push(
      kind === 'dominance'
        ? `${held.join('、')}：由${holder}帶起，${other}在${holder}身邊才體驗到這股能量，不必勉強自己做得一樣，好好享受就是最好的回應；${holder}累了時說一聲，${other}也能幫忙分擔。`
        : out.length === 0
          ? `${held.join('、')}：${holder}握著完整的線，做法成熟可靠；${other}手上那一端，正好看得見${holder}習慣成自然的地方。${holder}可以試試放慢一點、問問${other}的想法，往往會多出一個自己想不到的做法。`
          : `${held.join('、')}：反過來由${holder}握著完整的線，輪到${other}帶來另一個角度，正好是${holder}練習彈性的機會；輪流做主，兩人都學得到東西。`,
    );
  }
  return out;
}

function channelLine(sc: SynastryChannel, a: HdPartner, b: HdPartner, syn: HdSynastry, index = 0): string {
  const label = channelLabel(sc.channel);
  const meaning = channelShortMeaning(sc.channel.id);
  const scene = CHANNEL_SCENE[sc.channel.id];
  if (sc.kind === 'electromagnetic') {
    const head = `${label}（${a.name} 閘門 ${sc.gateA} × ${b.name} 閘門 ${sc.gateB}）：${meaning}`;
    return scene ? `${head}放進生活裡，就是${scene}。` : head;
  }
  if (sc.kind === 'companionship') {
    const head = `${label}（兩人都有）：${meaning}`;
    const tip = CHANNEL_SHARED_TIP[sc.channel.id];
    if (!scene || !tip) return head;
    // Rotate the framing so a list of companionship channels doesn't read like a template.
    switch (index % 3) {
      case 0:
        return `${head}例如${scene}，兩人做法相近、不必多解釋，是很省力的默契。可以留意的小地方：${tip}。`;
      case 1:
        return `${head}這件事上兩人幾乎不用溝通就同步（例如${scene}），相處起來特別輕鬆；${tip}。`;
      default:
        return `${head}這是你們最自在的地方之一，例如${scene}。給這份自在一個小提醒：${tip}。`;
    }
  }
  const [holder, other] = names(a, b, sc.holder ?? 'a');
  if (sc.kind === 'dominance') {
    const head = `${label}（${holder}擁有）：${meaning}`;
    return scene ? `${head}例如${scene}。` : head;
  }
  const g = compromiseGate(sc, syn);
  const head = `${label}（${holder}完整、${other}只有閘門 ${g ?? '一端'}）：${meaning}`;
  return scene ? `${head}例如${scene}。` : head;
}

// ---------------------------------------------------------------------------
// Fit signal — conservative: only structurally demanding pairs trigger it
// ---------------------------------------------------------------------------

/**
 * True only for a clearly demanding pair. All three must hold:
 *   1. no electromagnetic channel (no built-in attraction that exists only together);
 *   2. at least 3 compromise channels, outnumbering the companionship ones (many topics where one
 *      side has to adapt to the other, little shared ground);
 *   3. decision pace at least two steps apart (instant / voice / wave / lunar), e.g. sacral or
 *      splenic vs emotional, so even small decisions run on very different clocks.
 */
export function hdFitIsDifficult(a: HdPartner, b: HdPartner, syn: HdSynastry): boolean {
  const count = (k: SynastryChannelKind) => syn.channels.filter((c) => c.kind === k).length;
  const compromise = count('compromise');
  return count('electromagnetic') === 0 && compromise >= 3 && compromise > count('companionship') && paceGap(a, b) >= 2;
}

function fastSlow(a: HdPartner, b: HdPartner): [HdPartner, HdPartner] {
  const ia = PACE_ORDER.indexOf(AUTHORITY_PACE[a.chart.authority]);
  const ib = PACE_ORDER.indexOf(AUTHORITY_PACE[b.chart.authority]);
  return ia <= ib ? [a, b] : [b, a];
}

function difficultyLine(a: HdPartner, b: HdPartner, syn: HdSynastry): string[] {
  const n = syn.channels.filter((c) => c.kind === 'compromise').length;
  const [fast, slow] = fastSlow(a, b);
  return [
    `從結構上看，${a.name}和${b.name}是需要比較多經營的組合。兩人之間沒有電磁通道，少了天生「一碰就接上」的吸引；${n} 條妥協通道代表不少主題得靠一方配合另一方；${fast.name}${PACE_LABEL[AUTHORITY_PACE[fast.chart.authority]]}、${slow.name}${PACE_LABEL[AUTHORITY_PACE[slow.chart.authority]]}，連小事的決定步調都差很多。`,
    '這不代表不能在一起，而是兩人都要有意識地多溝通、多體諒，日常的摩擦會比一般伴侶多，需要真的花力氣處理，關係才會走得舒服。',
  ];
}

// ---------------------------------------------------------------------------
// 日常相處 — four everyday themes built from each person's own chart
// ---------------------------------------------------------------------------

/** Conscious (personality) line of the profile, as an everyday habit. */
const LINE_HABIT: Record<number, string> = {
  1: '做決定前要先查清楚，去新餐廳也會先看評價',
  2: '需要一個人放空的時間，被一直叫出門會累',
  3: '寧可先試試看，搞砸了也當成學到一課',
  4: '很重視熟朋友圈，新事物多半透過朋友認識',
  5: '常是朋友有麻煩時第一個被找的人，背著的期待比表面上多',
  6: '習慣先站遠一點觀察，看清楚了才投入',
};

/** What each conscious line brings to the pair, and where it tends to rub. */
const LINE_GIFT: Record<number, string> = {
  1: '會替兩人把功課做足，大決定前總有人先查好資料',
  2: '獨處充完電後，常帶出讓人意外的天分與點子',
  3: '敢先試，常帶著兩人踩進新的經驗',
  4: '把朋友圈帶進生活，身邊總有人可以互相照應',
  5: '遇到麻煩時扛得住，也想得出實際的解法',
  6: '看事情看得遠，常是比較穩、能給客觀意見的那個',
};

const LINE_RUB: Record<number, string> = {
  1: '還沒查清楚、遲遲不想動',
  2: '想獨處時剛好被打擾',
  3: '常常改主意、說試就試',
  4: '把朋友的事排得比較前面',
  5: '被誤會時習慣默默退開',
  6: '還在觀察、不急著全心投入',
};

const TYPE_HABIT: Record<HDType, string> = {
  generator: '有感覺的事會一頭栽進去，沒感覺的事就提不起勁',
  manifestingGenerator: '常同時開好幾件事，點子一個接一個',
  manifestor: '想到就自己去做，不太習慣先問人',
  projector: '很會看人，常一眼看出對方卡在哪裡',
  reflector: '每天的狀態都不太一樣，很受當天的環境與身邊的人影響',
};

/** After-work energy: sacral defined → still has fuel; throat-only → talk first; else quiet. */
function eveningMode(p: HdPartner): 'active' | 'talk' | 'quiet' {
  const d = p.chart.definedCenters;
  if (d.includes('sacral')) return 'active';
  if (d.includes('throat')) return 'talk';
  return 'quiet';
}

type EveningMode = 'active' | 'talk' | 'quiet';

const EVENING_TEXT: Record<EveningMode, string> = {
  active: '還有力氣，想出門走走或動手做點事',
  talk: '想先把今天發生的事講出來才放鬆',
  quiet: '電量見底，想先安靜躺一下再說話',
};

/** Both people in the same after-work mode: what fits, and the small thing to watch. */
const EVENING_SAME: Record<EveningMode, string> = {
  active: '說走就走很合拍，記得互相提醒別玩到超出體力',
  talk: '話題總是聊不完，輪流當聽的那個，兩人都會很盡興',
  quiet: '安靜待著也不尷尬、很舒服；睡前留五分鐘聊聊今天，就不會錯過彼此的心事',
};

/** Two different after-work modes (sorted key): how they can help each other. */
const EVENING_MIX: Record<string, string> = {
  'active|talk': '其實一起散步最剛好，一個邊走邊動、一個邊走邊講',
  'active|quiet': '一個能把對方拉出門透透氣，一個讓對方學會停下來',
  'quiet|talk': '想說的人有人安靜陪著，想靜的人也不必硬找話題',
};

/** How each authority plays out on a small everyday question. */
const AUTHORITY_SCENE: Record<Authority, string> = {
  emotional: '被問「週末要不要去花蓮？」會先說「我想一下」，心情走過一輪、隔天的答案才準',
  sacral: '被問「晚餐吃拉麵好嗎？」喉嚨會先冒出「嗯！」或「嗯……」，要講出理由反而講不出來',
  splenic: '走進一間要租的房子，第一秒就知道「不太對」，那一下比事後分析可靠',
  egoManifested: '說出「我要」的事就會做到，真心想要的事最有力量',
  egoProjected: '要把「我到底想不想要」說給信任的人聽，才聽得出自己的意願',
  selfProjected: '邊講邊想，講著講著自己就聽出方向，旁人不必急著給答案',
  mental: '換個地方、跟幾個人聊過，答案才會浮出來，悶在家裡想只會打轉',
  lunar: '大事要花大約一個月，在不同日子感覺同一件事，今天說好不代表定案',
};

const AJNA_STYLE = {
  defined: '腦中有一套固定的思路，討論時會照自己的邏輯走',
  open: '能理解各種看法，需要多一點時間才確定',
};

/** Not-self signal of each type, and how it tends to show when someone is running on empty. */
const TYPE_NOT_SELF: Record<HDType, string> = {
  generator: '挫折感：嘴上說好、心裡卻越來越悶',
  manifestingGenerator: '挫折或不耐：急著打斷、想直接跳到結論',
  manifestor: '憤怒：突然安靜下來，或自己先做了決定',
  projector: '苦澀：覺得說了沒被聽見，語氣變得尖銳',
  reflector: '失望：整個人少了光彩，提不起勁',
};

/** What makes each type feel loved, as a concrete gesture. */
const TYPE_LOVE: Record<HDType, string> = {
  generator: '一起做事就是愛，一起煮飯、運動、整理房間，提議被熱情回應時最有感',
  manifestingGenerator: '被允許有自己的速度，臨時起意的點子有人跟、不被嫌三分鐘熱度',
  manifestor: '被信任、有空間，說「我要去做……」時對方回一句「好，加油」就很暖',
  projector: '被看見與被請教，自己說過的話被記得、被主動問「你覺得呢？」比禮物更有感',
  reflector: '待在對的環境裡被陪伴，一起去喜歡的地方、不被催著回答',
};

/** What each type gives the other person (closing gift item). */
const TYPE_GIVE: Record<HDType, string> = {
  generator: '穩定持續的力氣',
  manifestingGenerator: '把想法快速落地的行動力',
  manifestor: '敢於開局的勇氣',
  projector: '看清方向的眼光',
  reflector: '照見關係真實樣貌的敏銳',
};

/** Centers defined only together, as the gift they bring (closing gift item). */
const CENTER_GIFT: Record<CenterId, string> = {
  head: '源源不絕的好奇心',
  ajna: '一起想事情時特別清晰的思路',
  throat: '敢說、敢表達的勇氣',
  g: '「我們要往哪走」的方向感',
  heart: '做承諾的底氣',
  spleen: '身體放鬆的安全感',
  solarPlexus: '特別濃的情感',
  sacral: '用不完的活力',
  root: '把事情推進的動力',
};

/** Closing sentence of the gift item, by composite type. */
const COMPOSITE_GIFT: Record<HDType, string> = {
  generator: '合起來的薦骨動力，讓你們能把喜歡的日子一天一天親手過出來。',
  manifestingGenerator: '合起來又快又有持續力，只要方向對了，你們想做的事很少做不成。',
  manifestor: '合起來最擅長開創，很多「我們來試試看」都會從你們這裡開始。',
  projector: '合起來最擅長看懂彼此，這份被理解的感覺，是很多人一輩子都在找的。',
  reflector: '合起來像一面鏡子，能一起把好的環境、好的人映照得更美。',
};

/** Channels that most directly carry closeness, in priority order, with their intimacy scene. */
const INTIMACY_SCENE: [string, string][] = [
  ['6-59', '身體上的靠近，像牽手、擁抱、性，以及什麼時候想親近、什麼時候想要自己的空間'],
  ['39-55', '情緒上的撩動，一句話就能讓對方心頭一熱，感受濃烈而真實'],
  ['12-22', '浪漫的氣氛，心情對了會說很動人的話'],
  ['19-49', '需求被照顧的感覺，像有人記得你愛吃什麼、天冷時遞來外套'],
  ['37-40', '付出與回報的約定，像我煮飯你洗碗，約定被遵守就安心'],
  ['30-41', '共同的期待，一起想像下一趟旅行、下一個階段，光是規劃就心動'],
  ['27-50', '照顧與守護，像生病時煮一碗粥、把對方的家人也當自己人'],
  ['35-36', '新鮮的體驗，一起去沒去過的地方，情緒跟著體驗起伏'],
  ['29-46', '全心的投入，答應了就陪到底，一起流汗、一起經歷'],
  ['5-15', '共同的節奏，一起吃早餐、固定的散步時間，習慣本身就是陪伴'],
  ['13-33', '傾聽與記得，一個說、一個記住，對方記得你講過的事就覺得被愛'],
  ['10-20', '做自己被接受的安心，不用演，在對方面前怎樣都可以'],
];

function intimacyLine(a: HdPartner, b: HdPartner, syn: HdSynastry): string {
  for (const [id, scene] of INTIMACY_SCENE) {
    const sc = syn.channels.find((c) => c.channel.id === id);
    if (!sc) continue;
    const label = channelLabel(sc.channel);
    if (sc.kind === 'electromagnetic')
      return `${label} 在你們之間才接通（${a.name}閘門 ${sc.gateA}、${b.name}閘門 ${sc.gateB}），牽動的是${scene}；這份親密只在兩人一起時出現，是你們很珍貴的吸引力，分開時特別想念也很自然。偶爾鬧彆扭時，先在這裡給對方一點溫柔，常常就能和好。`;
    if (sc.kind === 'companionship')
      return `兩人都有 ${label}，在${scene}這件事上，你們表達愛的方式很像，不用多解釋就懂；熟悉久了，偶爾換個方式給對方驚喜，心動感就會回來。`;
    const [holder, other] = names(a, b, sc.holder ?? 'a');
    if (sc.kind === 'dominance')
      return `${label} 只有${holder}有，牽動的是${scene}；多半由${holder}主動帶起，${other}常是在對方身上第一次體會到這種親密，這份帶領很迷人。${other}偶爾也主動靠近一次，${holder}會很感動。`;
    return `${label} 由${holder}擁有完整的線、${other}有其中一端，牽動的是${scene}；兩人在這裡的感受都很細膩，${holder}放慢一點、問一句「這樣你舒服嗎？」，親密就會越來越貼合。`;
  }
  if (syn.newCenters.includes('solarPlexus'))
    return '兩人單獨時情緒中心都開放，在一起才接上情緒：相處時感受特別濃、特別有戀愛感；分開幾天淡一點也很正常，不代表感情變了。';
  return '兩人之間沒有直接牽動親密的通道，靠近感多半來自日常的陪伴與小習慣，細水長流、很少大起大落；刻意安排兩人的約會時間，會讓這份安穩更有溫度。';
}

function conflictLines(a: HdPartner, b: HdPartner, syn: HdSynastry, difficult: boolean): string[] {
  const lines: string[] = [];
  const spA = a.chart.definedCenters.includes('solarPlexus');
  const spB = b.chart.definedCenters.includes('solarPlexus');
  if (spA && spB) {
    lines.push('兩人都有自己的情緒波，都懂心情需要時間過去，吵完不會逼對方馬上講清楚，這份默契讓和好變得容易。可以約好「心情低的人先說一聲」，大事等兩人都平靜再談。');
  } else if (spA || spB) {
    const [wave, open] = spA ? [a.name, b.name] : [b.name, a.name];
    lines.push(
      `${wave}有情緒波、${open}的情緒中心開放：${open}常比${wave}自己更早察覺情緒要變了，是很貼心的天線，提早給一點空間就能避開一場爭執。${wave}低落時，${open}可以提醒自己「這是對方的情緒，不是我做錯了什麼」，${wave}也不必在低點時急著講清楚。`,
    );
  } else if (syn.composite.definedCenters.includes('solarPlexus')) {
    lines.push('兩人各自的情緒中心都開放，在一起才接上情緒波：意見不同時來得快、去得也快，兩人都不太記仇，分開冷靜一下就好；重大決定留到心平氣和時再做。');
  } else {
    lines.push('兩人的情緒中心都開放，家裡氣氛通常平和、很少大吵，相處起來很舒服。因為都不喜歡衝突，可以約好固定時間把小事講開，不讓它們悄悄累積。');
  }

  const hA = a.chart.definedCenters.includes('heart');
  const hB = b.chart.definedCenters.includes('heart');
  if (hA !== hB) {
    const [firm, proving] = hA ? [a.name, b.name] : [b.name, a.name];
    lines.push(`${firm}的意志力中心有定義、${proving}開放：${firm}答應的事多半守得住，是關係裡可靠的支柱；${proving}有時會想證明自己做了多少，${firm}一句「我知道你很努力」就是最好的安心丸。`);
  }

  lines.push(
    a.chart.type === b.chart.type
      ? `兩人狀態不對時的訊號一樣，都是${TYPE_NOT_SELF[a.chart.type]}；正因為很熟悉這種感覺，誰先察覺誰就喊個暫停，休息一下再回來。`
      : `需要休息的小訊號：${a.name}會出現${TYPE_NOT_SELF[a.chart.type]}；${b.name}則會出現${TYPE_NOT_SELF[b.chart.type]}。看到訊號時先停一下、給個擁抱，比爭對錯有用。`,
  );

  const intimacyIds = new Set(INTIMACY_SCENE.map(([id]) => id));
  const compromises = syn.channels.filter((c) => c.kind === 'compromise');
  const comp = compromises.find((c) => !intimacyIds.has(c.channel.id)) ?? compromises[0];
  if (comp) {
    const [holder, other] = names(a, b, comp.holder ?? 'a');
    const scene = CHANNEL_SCENE[comp.channel.id];
    lines.push(
      `最需要多溝通的題目在 ${channelLabel(comp.channel)}${scene ? `，也就是${scene}` : ''}：${holder}在這裡很有一套，${other}的不同意見也常是${holder}漏看的那一塊；輪流決定，既公平又更周全。`,
    );
  }
  if (difficult) {
    lines.push(
      '因為妥協通道多、步調又不同，日常摩擦會比一般伴侶頻繁：同一類事情反覆意見不合時，不要每次都由同一個人讓步，否則讓步的人會越來越累、越來越不想說；把常起爭執的題目列下來，一題一題約定分工，比每次當下硬吵更有用。',
    );
  }
  return lines;
}

function dailyLines(a: HdPartner, b: HdPartner, syn: HdSynastry, difficult = false): string[] {
  const sameType = a.chart.type === b.chart.type;
  const la = a.chart.profile.personality;
  const lb = b.chart.profile.personality;
  const ea = eveningMode(a);
  const eb = eveningMode(b);
  const evening =
    ea === eb
      ? `下班回家兩人都${EVENING_TEXT[ea]}，${EVENING_SAME[ea]}`
      : `下班回家${a.name}${EVENING_TEXT[ea]}，${b.name}則${EVENING_TEXT[eb]}。${EVENING_MIX[[ea, eb].sort().join('|')] ?? ''}。剛進門時先說一句「給我十分鐘」，兩種節奏就能接得很順`;
  const lineMix =
    la === lb
      ? `兩人都${LINE_GIFT[la] ?? ''}，在這點上特別有共鳴。偶爾兩人都${LINE_RUB[la] ?? ''}時，互相體諒一下就好`
      : `${a.name}${LINE_GIFT[la] ?? ''}，${b.name}則${LINE_GIFT[lb] ?? ''}，兩種長處放在一起非常好用。當${a.name}${LINE_RUB[la] ?? ''}，或${b.name}${LINE_RUB[lb] ?? ''}時，多一點體諒，就是互相補位的時候`;
  const habits: string[] = sameType
    ? la === lb
      ? [`兩人都是${TYPE_NAMES_ZH[a.chart.type]}，都${TYPE_HABIT[a.chart.type]}。`, `人生角色也同樣${LINE_HABIT[la] ?? ''}，像照鏡子一樣，很容易懂對方。`]
      : [`兩人都是${TYPE_NAMES_ZH[a.chart.type]}，都${TYPE_HABIT[a.chart.type]}。`, `不同的是${a.name}${LINE_HABIT[la] ?? ''}，${b.name}則${LINE_HABIT[lb] ?? ''}。`]
    : [`${a.name}${TYPE_HABIT[a.chart.type]}，${LINE_HABIT[la] ?? ''}。`, `${b.name}${TYPE_HABIT[b.chart.type]}，${LINE_HABIT[lb] ?? ''}。`];
  const personality = ['【個性】', ...habits, `${lineMix}。`, `${evening}。`];

  const ajA = a.chart.definedCenters.includes('ajna');
  const ajB = b.chart.definedCenters.includes('ajna');
  const decideMix = (() => {
    if (paceGap(a, b) === 0)
      return '方法不同、快慢卻相近，很少因為誰在等誰而鬧彆扭；想說服對方時，用對方習慣的方式問問看，會更有默契';
    const [fast, slow] = fastSlow(a, b);
    return `${fast.name}常幫兩人打破「到底要不要」的僵局，${slow.name}則攔得住太衝的決定，兩人一起決定會更穩；連晚餐吃什麼這種小事，也可以讓${fast.name}先提議、${slow.name}慢慢點頭`;
  })();
  const decide: string[] =
    a.chart.authority === b.chart.authority
      ? [
          `兩人都是${AUTHORITY_NAMES_ZH[a.chart.authority]}，${AUTHORITY_SCENE[a.chart.authority]}。`,
          '做決定的方式一樣，彼此很能體諒，也可以互相提醒照著自己的權威走。',
        ]
      : [`${a.name}${AUTHORITY_SCENE[a.chart.authority]}。`, `${b.name}則${AUTHORITY_SCENE[b.chart.authority]}。`, `${decideMix}。`];
  const mind =
    ajA === ajB
      ? ajA
        ? '兩人腦中都有一套清楚的思路，聊起事情很有內容、都說得出道理；意見不同時，先聽完對方的推理再回應，常會得到更好的結論'
        : `兩人平時都${AJNA_STYLE.open}：聊天時很能聽進對方的觀點、不太爭誰對；需要結論時，約好「這次誰拍板」就很有效率`
      : (() => {
          const [fixed, flex] = ajA ? [a.name, b.name] : [b.name, a.name];
          return `${fixed}${AJNA_STYLE.defined}，${flex}${AJNA_STYLE.open}；一個給結構、一個給彈性，一起想事情時很互補。討論後給${flex}一點時間消化再定案，兩人都會更安心`;
        })();
  const thinking = ['【思考方式】', ...decide, `${mind}。`];

  const conflict = ['【處理矛盾】', ...conflictLines(a, b, syn, difficult)];

  const love = [
    '【感受親密與愛】',
    ...(sameType
      ? [`兩人感覺被愛的方式很像，都是${TYPE_LOVE[a.chart.type]}；很容易給到對方想要的，記得輪流主動，愛就會一直流動。`]
      : [
          `${a.name}感覺被愛的方式是${TYPE_LOVE[a.chart.type]}；${b.name}則是${TYPE_LOVE[b.chart.type]}。`,
          '兩種愛的語言不同，正好能讓彼此學到另一種表達；試著用對方喜歡的方式去愛，對方會接收得更清楚。',
        ]),
    intimacyLine(a, b, syn),
  ];

  const out = [...personality, ...thinking, ...conflict, ...love];
  return difficult ? ['【先說在前面】', ...difficultyLine(a, b, syn), ...out] : out;
}

/** Closing item: 2–3 sentences on what is most precious about this specific pair. */
function giftLines(a: HdPartner, b: HdPartner, syn: HdSynastry, difficult: boolean): string {
  const of = (k: SynastryChannelKind) => syn.channels.filter((c) => c.kind === k);
  const em = of('electromagnetic');
  const companions = of('companionship');
  const dominance = of('dominance');
  const compromise = of('compromise');
  const gift = (sc: SynastryChannel) => CHANNEL_GIFT[sc.channel.id] ?? channelShortMeaning(sc.channel.id).replace('。', '');
  const typeSentence =
    a.chart.type === b.chart.type
      ? `兩人都是${TYPE_NAMES_ZH[a.chart.type]}，都擁有${TYPE_GIVE[a.chart.type]}，彼此是最懂對方節奏的人。`
      : `${a.name}帶來${TYPE_GIVE[a.chart.type]}，${b.name}帶來${TYPE_GIVE[b.chart.type]}，這份互補讓兩人在一起時比各自更完整。`;

  const sentences: string[] = [];
  let usedType = false;
  if (difficult) {
    const [, slow] = fastSlow(a, b);
    sentences.push(
      `這段關係的課題，是兩人都願意多走一步：${compromise.length} 條妥協通道和不同的決定步調，代表很多事要靠刻意溝通、輪流讓步，並且尊重${slow.name}需要的時間，而不是自然就合拍。`,
    );
    const real = companions[0] ?? dominance[0] ?? compromise[0];
    if (real) sentences.push(`真實存在的禮物也很清楚：${channelLabel(real.channel)} 帶給你們${gift(real)}，${typeSentence.replace('。', '')}。`);
    else sentences.push(typeSentence);
    sentences.push('如果兩人都珍惜這些、願意投入經營，這段關係會教會你們很多一個人學不到的事；若努力後仍長期覺得很累，誠實面對這份感受也是對彼此的尊重。');
    return sentences.join('\n');
  }

  if (em.length >= 2) {
    sentences.push(
      `你們之間最珍貴的，是只在兩人一起時才接通的 ${channelLabel(em[0].channel)} 與 ${channelLabel(em[1].channel)}：${gift(em[0])}，還有${gift(em[1])}，都是${a.name}和${b.name}各帶一半、合起來才完整的。`,
    );
  } else if (em.length === 1) {
    sentences.push(
      `${channelLabel(em[0].channel)} 是只屬於你們的連結，${a.name}帶來閘門 ${em[0].gateA}、${b.name}帶來閘門 ${em[0].gateB}，合起來成了${gift(em[0])}。`,
    );
  } else if (companions.length > 0) {
    sentences.push(`你們共同擁有 ${channelLabel(companions[0].channel)}，${gift(companions[0])}，是兩人不必經營就有的默契。`);
  } else if (dominance.length > 0) {
    const [holder, other] = names(a, b, dominance[0].holder ?? 'a');
    sentences.push(`${holder}帶給${other}的 ${channelLabel(dominance[0].channel)}，讓${other}體會到${gift(dominance[0])}，這是只有在${holder}身邊才有的經驗。`);
  } else {
    sentences.push(typeSentence);
    usedType = true;
  }

  if (em.length > 0 && companions.length > 0) {
    sentences.push(`再加上兩人都有的 ${channelLabel(companions[0].channel)}，帶來${gift(companions[0])}，讓你們相處起來像老朋友一樣自在。`);
  } else if (syn.newCenters.length > 0) {
    sentences.push(`在一起時${centerList(syn.newCenters)}才被點亮，帶來${CENTER_GIFT[syn.newCenters[0]]}，這是你們單獨時都沒有的。`);
  } else if (!usedType) {
    sentences.push(typeSentence);
    usedType = true;
  }

  sentences.push(usedType ? COMPOSITE_GIFT[syn.composite.type] : typeSentence);
  return sentences.join('\n');
}

export function hdSynastryItems(a: HdPartner, b: HdPartner, syn: HdSynastry): MeaningItem[] {
  const comp = syn.composite;
  const byKind = (k: SynastryChannelKind) => syn.channels.filter((c) => c.kind === k);
  const difficult = hdFitIsDifficult(a, b, syn);
  const items: MeaningItem[] = [];

  items.push(
    item(
      '合盤總覽',
      '把兩人啟動的閘門合在一起看，這段關係「兩個人在一起時」的整體能量。',
      [
        `${a.name}是${TYPE_NAMES_ZH[a.chart.type]}（${AUTHORITY_NAMES_ZH[a.chart.authority]}），${b.name}是${TYPE_NAMES_ZH[b.chart.type]}（${AUTHORITY_NAMES_ZH[b.chart.authority]}）。`,
        `合盤：${TYPE_NAMES_ZH[comp.type]}、${DEFINITION_NAMES_ZH[comp.definition]}，已定義 ${comp.definedCenters.length} 個中心、${comp.channels.length} 條通道。`,
        COMPOSITE_TYPE_NOTE[comp.type],
        DEFINITION_COMPOSITE_NOTE[comp.definition],
      ].join('\n'),
    ),
  );

  for (const kind of SYNASTRY_CHANNEL_KINDS) {
    const list = byKind(kind);
    const lines =
      list.length > 0
        ? [KIND_MEANING[kind], ...list.map((c, i) => channelLine(c, a, b, syn, i)), ...holderSummary(kind, list, a, b)]
        : [EMPTY_KIND[kind](a, b)];
    items.push(item(SYNASTRY_CHANNEL_KIND_NAMES_ZH[kind], SYNASTRY_CHANNEL_KIND_FIELD[kind], lines.join('\n')));
  }

  const centerLines: string[] = [];
  if (syn.newCenters.length > 0) {
    centerLines.push(
      `只有兩人在一起時才被定義：${centerList(syn.newCenters)}。這些是單獨時都沒有、在一起才出現的穩定感，常是「跟你在一起時特別……」的來源，也是這段關係專屬的禮物：`,
      ...syn.newCenters.map((c) => `・${CENTER_NAMES_ZH[c]}：${CENTER_NEW[c]}`),
    );
  } else {
    centerLines.push('沒有「只有在一起才被定義」的中心，兩人合盤的定義中心都來自各自原本就有的部分：各自都很完整，分開時也不太會覺得少了什麼，相處起來獨立又自在。');
  }
  if (syn.openCenters.length > 0) {
    centerLines.push(
      `兩人都開放的中心：${centerList(syn.openCenters)}。這些主題兩人都很有彈性、能從身邊的人身上學，也容易一起被環境影響，選對環境就能放大優點：`,
      ...syn.openCenters.map((c) => `・${CENTER_NAMES_ZH[c]}：${CENTER_OPEN_BOTH[c]}`),
    );
  } else {
    centerLines.push('九個中心在合盤裡都被定義，關係本身很完整、很有自己的樣子；保留與朋友、環境的流動，會讓這份完整更有活力。');
  }
  items.push(
    item(
      '中心的變化',
      '合盤後新被定義的中心，以及兩人都仍開放的中心。',
      centerLines.join('\n'),
    ),
  );

  items.push(
    item(
      '類型互動',
      '兩人的類型與策略放在一起時，合作與相處的節奏。',
      [
        TYPE_PAIR_NOTE[pairKey(a.chart.type, b.chart.type)] ?? '',
        ...(a.chart.type === b.chart.type
          ? [`兩人都是${TYPE_NAMES_ZH[a.chart.type]}，互相對待時：${TYPE_PARTNER_TIP[a.chart.type]}（策略：${a.chart.strategy}）`]
          : [
              `和${a.name}相處：${TYPE_PARTNER_TIP[a.chart.type]}（策略：${a.chart.strategy}）`,
              `和${b.name}相處：${TYPE_PARTNER_TIP[b.chart.type]}（策略：${b.chart.strategy}）`,
            ]),
      ]
        .filter(Boolean)
        .join('\n'),
    ),
  );

  items.push(
    item(
      '一起做決定',
      '兩人的內在權威不同時，決定的速度與方式也會不同。',
      [
        paceNote(a, b),
        ...(a.chart.authority === b.chart.authority
          ? [`兩人都是${AUTHORITY_NAMES_ZH[a.chart.authority]}，互相支持時：${AUTHORITY_PARTNER_TIP[a.chart.authority]}`]
          : [
              `支持${a.name}做決定：${AUTHORITY_PARTNER_TIP[a.chart.authority]}`,
              `支持${b.name}做決定：${AUTHORITY_PARTNER_TIP[b.chart.authority]}`,
            ]),
      ].join('\n'),
    ),
  );

  items.push(
    item(
      '日常相處',
      '從兩人各自的類型、權威、人生角色與中心，看個性、思考、吵架與親密在生活裡的樣子。',
      dailyLines(a, b, syn, difficult).join('\n'),
    ),
  );

  items.push(
    difficult
      ? item('這段關係的課題與禮物', '誠實說出這對組合需要的功課，以及兩人之間真實而珍貴的部分。', giftLines(a, b, syn, true))
      : item('這段關係的禮物', '從兩人最強的連結，看這段關係最珍貴的地方。', giftLines(a, b, syn, false)),
  );

  items.push(item('相處建議', '依上面的通道與類型整理成幾條日常可做的提醒。', adviceLines(a, b, syn, difficult).join('\n')));

  return items;
}

const EMPTY_KIND: Record<SynastryChannelKind, (a: HdPartner, b: HdPartner) => string> = {
  electromagnetic: () =>
    '沒有電磁通道：兩人之間的吸引不靠「一碰就來電」的火花，而是更細水長流的方式，例如共同的默契、類型的互補與日常的陪伴；相處起來比較少強烈的拉扯，穩定而舒服。',
  companionship: () =>
    '沒有友伴通道：兩人各自擁有的通道都不相同，彼此帶給對方的多是新的體驗，生活因此更寬廣；多花一點時間理解對方的做法，也會發現盲點不重疊，一方看不見的，另一方常看得見。',
  dominance: () => '沒有主導通道：誰也不會在某個主題上單方面帶著對方走，兩人的關係比較平等，各自保有自己的步調。',
  compromise: () =>
    '沒有妥協通道：兩人之間少了典型的拉扯點，相處的摩擦很少來自通道結構，日常相對順暢；需要協調的地方多半在類型與決定步調上。',
};

function adviceLines(a: HdPartner, b: HdPartner, syn: HdSynastry, difficult = false): string[] {
  const lines: string[] = [];
  const em = syn.channels.filter((c) => c.kind === 'electromagnetic');
  const compromise = syn.channels.filter((c) => c.kind === 'compromise');
  const dominance = syn.channels.filter((c) => c.kind === 'dominance');
  if (em.length > 0) {
    lines.push(
      `好好珍惜 ${em.map((c) => channelLabel(c.channel)).join('、')} 帶來的火花，這是你們最有化學反應的地方；意見不同時，提醒彼此「我們各握一半，合起來才完整」。`,
    );
  }
  if (compromise.length > 0) {
    const first = compromise[0];
    const [holder, other] = names(a, b, first.holder ?? 'a');
    lines.push(
      `${compromise.map((c) => c.channel.id).join('、')} 這幾件事可以約定輪流做主：例如 ${first.channel.id} 這次照${holder}的方式，下次換${other}決定，事後一起看看哪種比較好，常會發現兩種都有可取之處。`,
    );
  }
  if (dominance.length > 0) {
    lines.push(
      `${dominance.map((c) => c.channel.id).join('、')} 是單方帶領的主題：好好享受對方帶來的體驗，也偶爾交換角色；分開一段時間後覺得那股能量淡了，很正常，不代表關係變淡。`,
    );
  }
  const companions = syn.channels.filter((c) => c.kind === 'companionship');
  if (companions.length > 0) {
    lines.push(
      `${companions.map((c) => c.channel.id).join('、')} 是你們不必經營就順的舒適區，盡情享受；碰到這些主題的重大決定時，偶爾問問朋友的意見，會看得更全面。`,
    );
  }
  if (syn.openCenters.includes('solarPlexus')) {
    lines.push('兩人的情緒中心都開放，很能體會彼此的感受；氣氛不對時先一起離開現場透透氣，再回來談。');
  } else if (syn.composite.definedCenters.includes('solarPlexus')) {
    lines.push('合盤的情緒中心被定義，關係有自己的情緒節奏；重要的話題挑兩人心情都平穩的時候聊。');
  }
  if (syn.newCenters.length > 0) {
    lines.push(
      `${centerList(syn.newCenters)}只在兩人一起時才穩定，是你們專屬的能量；分開一段時間後感覺不同是正常的，不必解讀成關係變了。`,
    );
  }
  if (difficult) {
    const [, slow] = fastSlow(a, b);
    lines.push(
      '每週固定一次「關係時間」，各說一件這週感謝對方的事、一件希望調整的事，把小摩擦在變大前處理掉。',
      `搬家、財務、婚姻或生小孩這類重大決定，照${slow.name}的步調來並約好期限，不在情緒或衝動中拍板。`,
      '如果反覆在同樣的事上覺得受傷，找信任的朋友或伴侶諮商師一起談，是很實際的投資，不代表失敗。',
    );
  }
  lines.push(
    a.chart.type === b.chart.type
      ? `兩人的策略都是「${a.chart.strategy}」，各自照著做、再把結果告訴對方；同類型也有不同的權威與人生角色，各自發光就好。`
      : `${a.name}照自己的策略（${a.chart.strategy}）、${b.name}照自己的策略（${b.chart.strategy}）各自做決定，再把結果分享給對方；合盤是互相補位，不必變成同一個人。`,
  );
  return lines;
}

// ---------------------------------------------------------------------------
// AI prompt
// ---------------------------------------------------------------------------

export interface HdPromptPartner extends HdPartner {
  timeUnknown: boolean;
}

function partnerBlock(p: HdPromptPartner): string {
  const c = p.chart;
  const time = p.timeUnknown ? '時間不確定（以當地 12:00 計算）' : c.input.time;
  return `### ${p.name}
- 出生：${c.input.date} ${time}（${c.input.timezone}）
- 類型：${TYPE_NAMES_ZH[c.type]}；策略：${c.strategy}
- 內在權威：${AUTHORITY_NAMES_ZH[c.authority]}
- 人生角色：${c.profile.personality}/${c.profile.design}；定義：${DEFINITION_NAMES_ZH[c.definition]}
- 已定義中心：${centerList(CENTER_ORDER.filter((x) => c.definedCenters.includes(x))) || '無'}
- 通道：${c.channels.map((ch) => ch.id).join('、') || '無'}
- 啟動閘門：${chartGates(c).join('、')}`;
}

function dailyHints(a: HdPartner, b: HdPartner): string {
  const flag = (p: HdPartner, c: CenterId) => (p.chart.definedCenters.includes(c) ? '有定義' : '開放');
  const one = (p: HdPartner) =>
    `- ${p.name}：非自己主題是${TYPE_NOT_SELF[p.chart.type].split('：')[0]}；情緒中心${flag(p, 'solarPlexus')}、意志力中心${flag(p, 'heart')}、薦骨${flag(p, 'sacral')}、喉嚨${flag(p, 'throat')}、邏輯中心${flag(p, 'ajna')}、頭腦${flag(p, 'head')}`;
  return `${one(a)}\n${one(b)}`;
}

export function buildHdSynastryAiPrompt(
  a: HdPromptPartner,
  b: HdPromptPartner,
  syn: HdSynastry,
): string {
  const comp = syn.composite;
  const difficult = hdFitIsDifficult(a, b, syn);
  const fitRule = difficult
    ? '- 注意：這對組合在結構上屬於需要較多經營的類型（沒有電磁通道、妥協通道多、決定步調差距大）。請不要硬湊正向的比例：誠實、尊重地說明相處上的困難，讓挑戰佔較多篇幅，並給具體可行的建議；同時也要說出兩人之間真實存在、值得珍惜的部分。'
    : '- 除非兩人的合盤結構真的很不合（例如沒有電磁通道、妥協通道很多、決定步調差距很大），否則維持上述以鼓勵為主的語氣；若真的很不合，請誠實說明，不要硬湊正向。';
  const fitGift = difficult ? '，並誠實說出兩人要讓這段關係走得好需要付出什麼（可改稱「這段關係的課題與禮物」）' : '';
  const kindLines = SYNASTRY_CHANNEL_KINDS.map((k) => {
    const list = syn.channels.filter((c) => c.kind === k);
    const body =
      list.length === 0
        ? '（無）'
        : list
            .map((c) => {
              if (c.kind === 'electromagnetic')
                return `${channelLabel(c.channel)}（${a.name} ${c.gateA} × ${b.name} ${c.gateB}）`;
              if (c.holder) return `${channelLabel(c.channel)}（${names(a, b, c.holder)[0]}擁有）`;
              return channelLabel(c.channel);
            })
            .join('、');
    return `- ${SYNASTRY_CHANNEL_KIND_NAMES_ZH[k]}：${body}`;
  }).join('\n');

  return `請依下列兩人的人類圖（Human Design）資料與合盤（connection chart）分析，用繁體中文解讀兩人的關係。

解讀原則：
- 以兩人的類型、策略、內在權威為主軸，說明兩人如何合作、如何相處、如何一起做決定。
- 合盤通道分四類：電磁（各有一端，在一起才接通，吸引與火花，意見不同時感受也最強烈）、友伴（兩人都有，共同基礎與默契，盲點也相近）、主導（只有一方有完整通道、另一方兩端都沒有：一方帶領、一方體驗，可以偶爾交換角色）、妥協（一方完整、另一方只有一端，需要磨合，也是最能互相學習與互補的地方）。每一類都先說它帶來的禮物，再說可以成長的地方。
- 這是能量結構說明，不是關係好壞的判決；請給可實踐的觀察與建議，避免恐嚇或保證。
- 語氣溫暖、以優點為先：每個主題先具體寫出兩人合得來、彼此給對方什麼、哪個生活場景很珍貴，再寫挑戰；挑戰要寫得簡短、溫和，框成成長點並附上可以馬上做的小建議（例如「可以試試…」「當…時，…就能變成你們的優勢」），避免嚴厲或負面的字眼。正向與挑戰的份量大約 2:1，但挑戰仍要誠實寫出來，不要只報喜；也不要每段都套用同一個句型，請自然地寫進場景裡。
${fitRule}
- 每個段落都要扣回這兩人的具體資料（類型、權威、人生角色、有定義／開放的中心、合盤通道），避免任何一對伴侶都適用的空泛句子。

## 兩人資料
${partnerBlock(a)}

${partnerBlock(b)}

## 合盤
- 合盤類型：${TYPE_NAMES_ZH[comp.type]}；定義：${DEFINITION_NAMES_ZH[comp.definition]}
- 合盤已定義中心：${centerList(comp.definedCenters) || '無'}
- 只有在一起才被定義的中心：${centerList(syn.newCenters) || '無'}
- 兩人都開放的中心：${centerList(syn.openCenters) || '無'}
${kindLines}

## 兩人的日常線索
${dailyHints(a, b)}

請先給一段關係總覽，再依「吸引與火花（電磁通道）」「默契與共同基礎」「摩擦點與如何協調」「合作分工與一起做決定」分段說明。
接著用「日常相處」一段，分四個主題各舉 2 個具體的生活場景（例如「下班回家${a.name}想先安靜、${b.name}想馬上聊今天的事」這種程度的細節），每個主題都先寫兩人在這方面相處順、彼此欣賞的地方（優點），再簡短寫出需要磨合的地方（成長點）與可以怎麼做：
1. 個性：兩人在生活習慣、精力分配上的差異（參考類型、人生角色、薦骨與喉嚨中心）。
2. 兩人思考方式：各自怎麼想事情、怎麼做決定，步調不同時怎麼配合（參考內在權威、頭腦與邏輯中心）。
3. 處理矛盾的方法：意見不同前的訊號、誰容易先退讓、怎麼和好（參考情緒中心、意志力中心、非自己主題與妥協通道）。
4. 感受親密及愛的方式：各自怎樣會覺得被愛、親密的節奏（參考與親密有關的通道，如 6-59、19-49、37-40、39-55、12-22）。
然後用 2–3 句寫「這段關係的禮物」：根據這兩人最強的連結（例如電磁通道、共同的定義、互補的類型），說出兩人在一起最珍貴的地方，必須扣回這兩人的資料${fitGift}。
最後給兩人各 3 條相處提醒，其中至少兩條是發揮兩人既有的優點，而不只是避開問題。`;
}
