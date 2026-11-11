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
  '3-60': '一段卡住很久的日子後突然大轉彎，像臨時決定換工作或搬家',
  '4-63': '一個丟出「為什麼會這樣？」、一個忍不住去找答案，能聊到半夜',
  '5-15': '幾點睡、幾點吃飯、週末固定去哪，這些生活節奏誰配合誰',
  '6-59': '牽手、擁抱、性與親密，以及什麼時候可以靠近、什麼時候要給空間',
  '7-31': '出遊誰排行程、聚會誰出主意，大家最後聽誰的',
  '9-52': '一起拼一件需要耐心的事，像規劃旅行細節、整理家裡的雜物',
  '10-20': '一句話、一個動作就是當下的自己，不必事先想好怎麼表現',
  '10-34': '各自忙著自己相信的事，沒空也不想被對方的計畫拉走',
  '10-57': '家裡怎麼擺、去哪裡住才舒服，憑直覺就知道「這樣才對」',
  '11-56': '旅行、看電影後聊心得，把經歷說成一個有意思的故事',
  '12-22': '心情好時說甜話、營造氣氛，心情不對時連一句話都不想講',
  '13-33': '一個人講過去的事、另一個人聽，把共同回憶整理成故事',
  '16-48': '一起練一項技能，或一方手把手教另一方怎麼做比較好',
  '17-62': '討論事情時誰的看法比較有條理、細節要不要講清楚',
  '18-58': '一眼看出家裡或對方哪裡可以更好，提醒聽起來像挑剔',
  '19-49': '誰照顧誰、需求有沒有被注意到，以及受不了時會不會直接「不要了」',
  '20-34': '一忙起來就停不下來，兩人一起動、一起趕行程',
  '20-57': '當下的直覺脫口而出，像走進餐廳就說「這裡不太對」',
  '21-45': '家裡的錢誰管、大筆開銷誰說了算',
  '23-43': '一方突然冒出新點子，另一方一時跟不上、聽不懂',
  '24-61': '睡前聊人生、宇宙這種沒有標準答案的問題，想了又想',
  '25-51': '一起做刺激的事、面對突發狀況，誰先衝、誰被嚇到',
  '26-44': '說服對方買東西、去一個地方，也很記得過去哪些做法吃過虧',
  '27-50': '照顧家人、煮飯給對方吃，以及什麼是「這個家該守住的」',
  '28-38': '一起撐過一段難熬的日子，為了覺得有意義的事咬牙堅持',
  '29-46': '說好就全心投入，像一起報名馬拉松、說走就走的旅行',
  '30-41': '對下一次旅行、下一個階段的想像與期待，期待落空時的失落',
  '32-54': '一起規劃未來、存錢買房、往上爬的野心',
  '34-57': '遇到危險或突發狀況時反應很快，下意識就保護對方',
  '35-36': '想嘗試新經驗、新餐廳新城市，興奮過後的情緒起伏',
  '37-40': '家務分工、付出與回報，以及「我做了這些、你也要記得」的默契',
  '39-55': '一方的情緒很容易挑起另一方的情緒，心情一起高一起低',
  '42-53': '開始一件事就想把它走完，像裝修、一起養寵物的每個階段',
  '47-64': '腦中一堆畫面理不清時，兩人一起回想、慢慢想通',
};

/** The one gate the non-holder brings in a compromise channel. */
function compromiseGate(sc: SynastryChannel, syn: HdSynastry): number | null {
  const own = sc.holder === 'a' ? syn.gatesB : syn.gatesA;
  return sc.channel.gates.find((g) => own.includes(g)) ?? null;
}

export const SYNASTRY_CHANNEL_KIND_FIELD: Record<SynastryChannelKind, string> = {
  electromagnetic: '一人有通道的一端閘門、另一人有另一端，只有兩人在一起時才接通的通道。',
  companionship: '兩人都各自擁有的完整通道，是共同的語言與相處的基本盤。',
  dominance: '只有一人擁有完整通道、另一人兩端閘門都沒有，由擁有的一方帶動。',
  compromise: '一人擁有完整通道、另一人只有其中一端閘門，是常見的摩擦點。',
};

const KIND_MEANING: Record<SynastryChannelKind, string> = {
  electromagnetic:
    '電磁通道是吸引力與火花的來源：在一起時會感覺「被接上了」，能做到各自做不到的事。同一條線也會帶來拉扯，因為兩邊都只握著一半，誰也無法單獨掌控；吸引時很強烈，吵架時也最容易卡在這裡。分開時那份感覺會消失，這是正常的。',
  companionship:
    '友伴通道是你們的共同基礎：在這些主題上彼此很容易懂、做法相近，相處起來輕鬆、像朋友。因為能量相同不需要互補，這裡比較少火花；它是信任與默契的底，不是激情的來源。',
  dominance:
    '主導通道裡，擁有的一方在這個主題上自然帶頭，另一方則從對方身上體驗、學習這股能量，常會覺得「跟他在一起才知道這是什麼感覺」。擁有的一方要留意別一直主導，另一方也別把這份經驗當成自己的而勉強去做。',
  compromise:
    '妥協通道是最常見的摩擦點：只有一端閘門的人總是要配合擁有完整通道的那個人的方式。只有一端的人容易覺得被牽著走、說不上話；擁有完整通道的人則可能覺得對方老是唱反調。把這些主題攤開來談、輪流決定，比默默配合更長久。',
};

const COMPOSITE_TYPE_NOTE: Record<HDType, string> = {
  generator:
    '兩人合起來薦骨被定義，關係本身有持續做事的動力；一起投入有回應的事，越做越有精神，硬撐沒感覺的事則會一起累。',
  manifestingGenerator:
    '兩人合起來是顯示生產者的能量：有持續力、也有把事情快速推出去的能力，一起做事節奏快。要留意一起跳步驟，換方向時記得向身邊的人說明。',
  manifestor:
    '兩人合起來有動力接到喉嚨、卻沒有薦骨：關係擅長發起與開局，但缺少長期的持續力。開了頭的事要規劃休息與分工，別一路衝到底。',
  projector:
    '兩人合起來仍沒有動力接到喉嚨、也沒有薦骨：這段關係的強項在彼此理解、看清方向，而不是一起拚體力。重大的事情等被邀請再一起投入，也要替兩人安排足夠的休息。',
  reflector:
    '兩人合起來仍沒有任何定義中心，非常罕見：關係像一面鏡子，深受環境與身邊的人影響。替兩人挑選舒服的居住與相處環境，比任何技巧都重要。',
};

const DEFINITION_COMPOSITE_NOTE: Record<Definition, string> = {
  none: '合盤沒有定義，關係很隨環境起伏。',
  single: '合盤是一分人：兩人在一起時能量連成一片，常有「在一起很完整」的感覺，不太需要外人來接通。',
  split: '合盤是二分人：兩人在一起仍有兩塊沒接上的能量，常需要朋友、家人或特定環境來搭橋；這不是缺點，只是這段關係需要和外界保持流動。',
  tripleSplit: '合盤是三分人：關係裡有三塊彼此分開的能量，需要更多人與場合來串起來，生活圈多元會讓兩人更順。',
  quadrupleSplit: '合盤是四分人：能量非常分散，彼此的步調需要時間磨合，給關係多一點空間與外部支持。',
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
    '兩個生產者在一起，做事的耐力與持續力都強，很能一起把生活經營起來。彼此都在等回應，常會變成誰都不先開口；多用是非題問對方，很快就知道兩人是不是都有感覺。留意兩人一起答應太多事，同時累到挫折。',
  'generator|manifestingGenerator':
    '兩人都有薦骨動力，生活節奏旺盛。顯示生產者速度快、會跳步驟，生產者則喜歡一步一步做熟；快的一方開路、穩的一方收尾，分工最順。快的人換方向前說一聲，穩的人就不會覺得被丟下。',
  'generator|manifestor':
    '顯示者擅長點火開局，生產者回應之後能把事情持續做下去，是很互補的組合。顯示者記得行動前先告知，生產者則要誠實回應：沒有感覺的事不要被拉著做，否則會累積挫折，顯示者也會遇到阻力。',
  'generator|projector':
    '典型的「能量與引導」組合：投射者看得見生產者的力氣怎麼用最有效，生產者提供持續的動力。關鍵是投射者等被問了再給建議、生產者用薦骨回應那份建議。投射者沒有持續的能量，別跟著對方的節奏硬撐，休息是必要的。',
  'generator|reflector':
    '反映者會放大生產者的能量與狀態：生產者做得開心時，對方也跟著明亮；生產者挫折時，對方也會感受得很深。生產者給反映者足夠時間做決定，不要催；反映者也可以把對這段關係的觀察告訴對方。',
  'manifestingGenerator|manifestingGenerator':
    '兩個顯示生產者在一起，火花多、進度快、什麼都想試。最容易一起跳步驟、互相打斷，或各自衝向不同方向。重要的事慢下來對一次細節，換方向時互相告知，就能把速度變成共同的優勢。',
  'manifestingGenerator|manifestor':
    '兩人都能主動動起來，衝勁很大，也最容易各衝各的。顯示者需要獨立發起的空間，顯示生產者需要先有回應再行動；互相告知計畫是這段關係最好的潤滑劑。',
  'manifestingGenerator|projector':
    '投射者能幫顯示生產者看見被跳過的步驟、找到更有效率的做法，顯示生產者則把想法快速落地。投射者的建議等被邀請再說，顯示生產者也要願意停下來聽；投射者別試圖跟上對方的速度。',
  'manifestingGenerator|reflector':
    '顯示生產者的速度與能量會被反映者放大，反映者也能敏銳地察覺這段關係健不健康。顯示生產者放慢腳步、不要催對方做決定；反映者需要自己的環境與時間，把感受說出來會讓對方更懂你。',
  'manifestor|manifestor':
    '兩個顯示者都習慣自己決定、不愛被控制。尊重彼此獨立的空間、事前互相告知，就能各自開疆闢土又互相支援；若都不說就動，很容易兩邊都憤怒。',
  'manifestor|projector':
    '顯示者負責開局，投射者看清系統，能把衝出去的方向修得更準。顯示者記得主動告知，也可以主動邀請投射者給意見；投射者等被邀請再說，建議會被聽進去。',
  'manifestor|reflector':
    '顯示者的發起力很強，反映者會深刻感受這股衝擊。顯示者行動前先告知，給反映者時間消化；反映者是很好的鏡子，能讓顯示者看見行動對周圍造成的影響。',
  'projector|projector':
    '兩個投射者都擅長看人、看系統，很懂對方需要被看見、被認可。兩人都沒有持續的薦骨動力，一起做事時要規劃休息，必要時找其他人分擔體力活；彼此給建議前，先確認對方想不想聽。',
  'projector|reflector':
    '兩人都敏銳、都不靠蠻力，很能欣賞彼此細膩的觀察。投射者給反映者時間、不急著下結論；反映者能讓投射者知道這段關係與環境健不健康。生活上要替兩人安排足夠的休息與好的環境。',
  'reflector|reflector':
    '兩個反映者在一起非常罕見，兩人都像環境的鏡子，彼此狀態會互相映照。共同挑選舒服的環境與圈子最重要；重大決定給彼此一整個月亮週期的時間，不必急。',
};

/** How the other person can best engage with someone of this type. */
const TYPE_PARTNER_TIP: Record<HDType, string> = {
  generator: '多用「要不要……？」這類是非題問他，給他回應的機會，而不是直接下指令。',
  manifestingGenerator: '讓他先回應再行動，接受他的速度，請他在換方向時告訴你一聲。',
  manifestor: '給他自己發起的空間，不要處處要求報備；你可以請他「行動前先跟我說一下」。',
  projector: '看見他、主動問他的看法；別把他當成無限的勞力，他需要比你更多的休息。',
  reflector: '帶他去讓他舒服的地方，留意他在什麼環境、和哪些人在一起時最明亮。',
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

const AUTHORITY_PARTNER_TIP: Record<Authority, string> = {
  emotional: '給他時間等情緒波過去，重要的事別逼他當下答覆，「睡一晚再說」很正常。',
  sacral: '用是非題問他，聽他當下的「嗯／嗯嗯」，不必要求他講出理由。',
  splenic: '相信他當下的第一個直覺，那份「不太對」通常只出現一次，不要說服他忽略。',
  egoManifested: '問他「你真的想要嗎？」，讓他說出自己的意願；他真心答應的事才守得住。',
  egoProjected: '當他的傾聽者，讓他把「我想要什麼」說出口，而不是替他決定。',
  selfProjected: '單純聽他說，不急著給建議；他在說的過程裡會聽見自己的方向。',
  mental: '陪他聊、陪他換個環境想，他的答案會在對話中慢慢成形。',
  lunar: '給他大約一個月的時間，讓他在不同日子裡感覺同一件事。',
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
      return '兩人都需要等情緒沉澱，最怕在情緒高點或低點一起做決定；吵架時先各自冷靜，隔天再談。';
    if (pa === 'instant')
      return '兩人都是當下就知道，做決定很快、很爽快；也因此要留意一起衝動，重大的事多確認一次彼此當下的身體反應。';
    if (pa === 'voice')
      return '兩人都要把話說出來才知道自己怎麼想，彼此是很好的傾聽者；記得是「聽對方說」，不是替對方下結論。';
    return '兩人都需要很長的時間沉澱，重大決定別急，一起給彼此一個月的時間。';
  }
  const order: DecisionPace[] = ['instant', 'voice', 'wave', 'cycle'];
  const [fast, slow] =
    order.indexOf(pa) < order.indexOf(pb) ? [a, b] : [b, a];
  return `${fast.name}${PACE_LABEL[AUTHORITY_PACE[fast.chart.authority]]}，${slow.name}${PACE_LABEL[AUTHORITY_PACE[slow.chart.authority]]}：步調不同時，快的一方容易催、慢的一方容易覺得被逼。約定好重要的事「${slow.name}可以晚點回覆」，${fast.name}也不必等到對方確定才說出自己的直覺。`;
}

/** What a center feels like when it is defined only by the two of you together. */
const CENTER_NEW: Record<CenterId, string> = {
  head: '一起時常冒出一連串想搞懂的問題，對什麼都好奇。',
  ajna: '一起討論時想法比較篤定，容易得出共同的結論。',
  throat: '在一起話變多，也比較敢把想做的事說出口、推出去。',
  g: '一起時「我們要往哪走、我們是怎樣的兩個人」特別清楚。',
  heart: '一起時比較有底氣做承諾，也敢談錢與彼此的價值。',
  spleen: '在一起時身體放鬆、有安全感，生病或疲累時特別想待在對方身邊。',
  solarPlexus: '兩人一起才有的情緒波，心情會一起起伏，感受也比單獨時濃。',
  sacral: '在一起時精力變多，做家事、出門、熬夜都比較有勁。',
  root: '一起時推進的壓力變大，常一起趕進度、想把事情做完。',
};

/** What it looks like in daily life when both people are open in a center. */
const CENTER_OPEN_BOTH: Record<CenterId, string> = {
  head: '兩人都容易被別人丟來的問題推著想，睡前一起煩惱「到底要不要」。',
  ajna: '兩人都能接受很多觀點，也容易一起拿不定主意，被長輩一說就動搖。',
  throat: '兩人都可能搶話，或冷場時急著找話題；聚會裡都想被聽見。',
  g: '住在哪、跟誰來往深深影響這段關係的感覺，換對環境就像換了一段關係。',
  heart: '兩人都容易想證明自己，吵架時變成比誰付出比較多；別輕易許下做不到的承諾。',
  spleen: '兩人都可能為了安全感死守不好的東西，例如舊習慣、不適合的工作，互相提醒放手。',
  solarPlexus: '兩人都容易吸收外面的情緒，聚會回來常一起心累；為了避免衝突也可能都不說。',
  sacral: '兩人都容易不知道何時該停，週末排滿、做到半夜才發現累壞了；行程表上直接留一天空白。',
  root: '兩人都容易被截止日期催著跑，越急越想一次把事情做完，記得一起慢下來。',
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
      out.push(`${pa}，${pb}：兩人各自在對方身邊體驗到自己沒有的能量，享受就好，不必勉強自己也做得一樣。`);
      return out;
    }
  }
  for (const key of ['a', 'b'] as const) {
    const held = list.filter((c) => c.holder === key).map((c) => c.channel.id);
    if (held.length === 0) continue;
    const [holder, other] = names(a, b, key);
    out.push(
      kind === 'dominance'
        ? `${held.join('、')}：由${holder}帶起，${other}在${holder}身邊才體驗到，不必勉強自己也做得一樣。`
        : `${held.join('、')}：${other}只握著一半，常覺得得照${holder}的方式來、說不上話；${holder}放慢一點，問問${other}的想法。`,
    );
  }
  return out;
}

function channelLine(sc: SynastryChannel, a: HdPartner, b: HdPartner, syn: HdSynastry): string {
  const label = channelLabel(sc.channel);
  const meaning = channelShortMeaning(sc.channel.id);
  const scene = CHANNEL_SCENE[sc.channel.id];
  if (sc.kind === 'electromagnetic') {
    const head = `${label}（${a.name} 閘門 ${sc.gateA} × ${b.name} 閘門 ${sc.gateB}）：${meaning}`;
    return scene ? `${head}放進生活裡，就是${scene}。` : head;
  }
  if (sc.kind === 'companionship') {
    const head = `${label}（兩人都有）：${meaning}`;
    return scene ? `${head}像${scene}這類事，兩人做法相近、不太需要解釋。` : head;
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

const TYPE_HABIT: Record<HDType, string> = {
  generator: '有感覺的事會一頭栽進去，沒感覺的事拖著不想動',
  manifestingGenerator: '常同時開好幾件事，做到一半就跳到下一件',
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

const EVENING_TEXT: Record<'active' | 'talk' | 'quiet', string> = {
  active: '還有力氣，想出門走走或動手做點事',
  talk: '想先把今天發生的事講出來才放鬆',
  quiet: '電量見底，想先安靜躺一下再說話',
};

/** How each authority plays out on a small everyday question. */
const AUTHORITY_SCENE: Record<Authority, string> = {
  emotional: '被問「週末要不要去花蓮？」會先說「我想一下」，心情走過一輪、隔天的答案才準',
  sacral: '被問「晚餐吃拉麵好嗎？」喉嚨會先冒出「嗯！」或「嗯……」，要他講理由反而講不出來',
  splenic: '走進一間要租的房子，第一秒就知道「不太對」，那一下比事後分析可靠',
  egoManifested: '說出「我要」的事就會做到，被勉強答應的事撐不久',
  egoProjected: '要把「我到底想不想要」說給信任的人聽，才聽得出自己的意願',
  selfProjected: '邊講邊想，講著講著自己就聽出方向，旁人不必急著給答案',
  mental: '換個地方、跟幾個人聊過，答案才會浮出來，悶在家裡想只會打轉',
  lunar: '大事要花大約一個月，在不同日子感覺同一件事，今天說好不代表定案',
};

const AJNA_STYLE = {
  defined: '腦中有一套固定的思路，討論時會照自己的邏輯走',
  open: '能理解各種看法，但被要求「現在就確定」時會不安',
};

/** Not-self signal of each type, and how it tends to leak out in an argument. */
const TYPE_NOT_SELF: Record<HDType, string> = {
  generator: '挫折感：嘴上說好、做起來卻越來越悶',
  manifestingGenerator: '挫折或不耐：打斷對方，想直接跳到結論',
  manifestor: '憤怒：突然不講話或自己做決定，覺得被管',
  projector: '苦澀：覺得講了也沒人聽，話開始帶刺',
  reflector: '失望：整個人沒了光彩，對關係提不起勁',
};

/** What makes each type feel loved, as a concrete gesture. */
const TYPE_LOVE: Record<HDType, string> = {
  generator: '一起做事就是愛，一起煮飯、運動、整理房間，提議被熱情回應時最有感',
  manifestingGenerator: '被允許有自己的速度，臨時起意的點子有人跟、不被嫌三分鐘熱度',
  manifestor: '被信任、有空間，說「我要去做……」時對方回一句「好，加油」就很暖',
  projector: '被看見與被請教，對方記得他說過的話、主動問「你覺得呢？」比禮物更有感',
  reflector: '待在對的環境裡被陪伴，一起去他喜歡的地方、不催他回答',
};

/** Channels that most directly carry closeness, in priority order, with their intimacy scene. */
const INTIMACY_SCENE: [string, string][] = [
  ['6-59', '身體上的靠近，像牽手、擁抱、性，以及什麼時候想親近、什麼時候想要自己的空間'],
  ['39-55', '情緒上的撩動，一句話就能讓對方心頭一熱或一沉，感受強烈也起伏大'],
  ['12-22', '浪漫的氣氛，心情對了會說很動人的話，氣氛不對時寧可安靜'],
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
      return `${label}在你們之間才接通（${a.name}閘門 ${sc.gateA}、${b.name}閘門 ${sc.gateB}），牽動的是${scene}；這份親密只在兩人一起時出現，是很重要的吸引。`;
    if (sc.kind === 'companionship')
      return `兩人都有${label}，在${scene}這件事上，你們表達愛的方式很像，不用多解釋。`;
    const [holder, other] = names(a, b, sc.holder ?? 'a');
    if (sc.kind === 'dominance')
      return `${label}只有${holder}有，牽動的是${scene}；多半由${holder}主動帶起，${other}常是在對方身上第一次體會到這種親密。`;
    return `${label}由${holder}擁有完整的線、${other}只有一端，牽動的是${scene}；${other}有時會覺得親密的節奏由對方決定，${holder}記得問一句「這樣你舒服嗎？」。`;
  }
  if (syn.newCenters.includes('solarPlexus'))
    return '兩人單獨時情緒中心都開放，在一起才接上情緒：相處時感受特別濃，分開幾天就淡一點，這不代表感情變了。';
  return '兩人之間沒有直接牽動親密的通道，靠近感多半來自日常的陪伴與小習慣，刻意安排兩人時間會很有幫助。';
}

function conflictLines(a: HdPartner, b: HdPartner, syn: HdSynastry): string[] {
  const lines: string[] = [];
  const spA = a.chart.definedCenters.includes('solarPlexus');
  const spB = b.chart.definedCenters.includes('solarPlexus');
  if (spA && spB) {
    lines.push('兩人都有自己的情緒波，最容易在兩人剛好都在低點時吵起來；約好「心情低的人先說一聲」，大事等兩人都平靜再談。');
  } else if (spA || spB) {
    const [wave, open] = spA ? [a.name, b.name] : [b.name, a.name];
    lines.push(
      `${wave}有情緒波、${open}的情緒中心開放：${wave}心情低時，${open}會先感覺到，甚至比${wave}更不舒服，常急著把氣氛弄好或先認錯。${open}可以先離開現場一下，分清楚那是${wave}的情緒、不是自己做錯了什麼；${wave}則不必在低點時逼自己講清楚。`,
    );
  } else if (syn.composite.definedCenters.includes('solarPlexus')) {
    lines.push('兩人各自的情緒中心都開放，在一起才接上情緒波：吵架常像突然起火，分開冷靜一下就淡了，別在吵架當下做重大決定。');
  } else {
    lines.push('兩人的情緒中心都開放，都不太喜歡衝突，容易一起把不滿吞下去；約好固定時間把小事講開，比等到爆發好。');
  }

  const hA = a.chart.definedCenters.includes('heart');
  const hB = b.chart.definedCenters.includes('heart');
  if (hA !== hB) {
    const [firm, proving] = hA ? [a.name, b.name] : [b.name, a.name];
    lines.push(`${firm}的意志力中心有定義、${proving}開放：吵起來時${proving}容易急著列出自己做了多少，${firm}不太懂為什麼要比；${firm}一句「我知道你很努力」就能降溫。`);
  }

  lines.push(
    a.chart.type === b.chart.type
      ? `快要吵起來的訊號兩人一樣，都是${TYPE_NOT_SELF[a.chart.type]}；兩人很容易同時進入這個狀態，誰先察覺誰就先喊暫停。`
      : `快要吵起來的訊號：${a.name}會出現${TYPE_NOT_SELF[a.chart.type]}；${b.name}會出現${TYPE_NOT_SELF[b.chart.type]}。看到訊號先停一下，比爭對錯有用。`,
  );

  const intimacyIds = new Set(INTIMACY_SCENE.map(([id]) => id));
  const compromises = syn.channels.filter((c) => c.kind === 'compromise');
  const comp = compromises.find((c) => !intimacyIds.has(c.channel.id)) ?? compromises[0];
  if (comp) {
    const [holder, other] = names(a, b, comp.holder ?? 'a');
    const scene = CHANNEL_SCENE[comp.channel.id];
    lines.push(
      `最容易反覆卡住的題目在 ${channelLabel(comp.channel)}${scene ? `，也就是${scene}` : ''}：這件事上由${holder}拍板太多次，${other}就會累積不滿，輪流決定比較公平。`,
    );
  }
  return lines;
}

function dailyLines(a: HdPartner, b: HdPartner, syn: HdSynastry): string[] {
  const sameType = a.chart.type === b.chart.type;
  const la = a.chart.profile.personality;
  const lb = b.chart.profile.personality;
  const ea = eveningMode(a);
  const eb = eveningMode(b);
  const evening =
    ea === eb
      ? `下班回家兩人都${EVENING_TEXT[ea]}，步調很合`
      : `下班回家${a.name}${EVENING_TEXT[ea]}，${b.name}卻${EVENING_TEXT[eb]}；先說好「給我十分鐘」，就不會誤會對方冷淡或太黏`;
  const habits = sameType
    ? la === lb
      ? `兩人都是${TYPE_NAMES_ZH[a.chart.type]}，都${TYPE_HABIT[a.chart.type]}；人生角色也同樣${LINE_HABIT[la] ?? ''}，像照鏡子一樣，優點與盲點都會加倍`
      : `兩人都是${TYPE_NAMES_ZH[a.chart.type]}，都${TYPE_HABIT[a.chart.type]}；不同的是${a.name}${LINE_HABIT[la] ?? ''}，${b.name}則${LINE_HABIT[lb] ?? ''}`
    : `${a.name}${TYPE_HABIT[a.chart.type]}，也${LINE_HABIT[la] ?? ''}；${b.name}${TYPE_HABIT[b.chart.type]}，也${LINE_HABIT[lb] ?? ''}`;
  const personality = `個性：${habits}。${evening}。`;

  const ajA = a.chart.definedCenters.includes('ajna');
  const ajB = b.chart.definedCenters.includes('ajna');
  const decide =
    a.chart.authority === b.chart.authority
      ? `兩人都是${AUTHORITY_NAMES_ZH[a.chart.authority]}，${AUTHORITY_SCENE[a.chart.authority]}；做決定的方式一樣，彼此很能體諒，但也可能一起卡在同一個地方`
      : `${a.name}${AUTHORITY_SCENE[a.chart.authority]}；${b.name}則${AUTHORITY_SCENE[b.chart.authority]}`;
  const mind =
    ajA === ajB
      ? `兩人平時都${ajA ? AJNA_STYLE.defined : AJNA_STYLE.open}${ajA ? '，意見不同時容易各自堅持，先聽完對方的推理再回應' : '，討論常沒結論，約好「這次誰拍板」比較有效率'}`
      : (() => {
          const [fixed, flex] = ajA ? [a.name, b.name] : [b.name, a.name];
          return `${fixed}${AJNA_STYLE.defined}，${flex}${AJNA_STYLE.open}；討論時${flex}常被${fixed}說服，回頭又改念頭，${fixed}給${flex}一點時間消化再定案`;
        })();
  const thinking = `思考與決定：${decide}。${mind}。`;

  const conflict = `處理矛盾：${conflictLines(a, b, syn).join('')}`;

  const love = sameType
    ? `親密與愛：兩人感覺被愛的方式很像，都是${TYPE_LOVE[a.chart.type]}；記得主動為對方做，而不是都在等對方先做。${intimacyLine(a, b, syn)}`
    : `親密與愛：${a.name}感覺被愛的方式是${TYPE_LOVE[a.chart.type]}；${b.name}則是${TYPE_LOVE[b.chart.type]}。${intimacyLine(a, b, syn)}`;

  return [personality, thinking, conflict, love];
}

export function hdSynastryItems(a: HdPartner, b: HdPartner, syn: HdSynastry): MeaningItem[] {
  const comp = syn.composite;
  const byKind = (k: SynastryChannelKind) => syn.channels.filter((c) => c.kind === k);
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
        ? [KIND_MEANING[kind], ...list.map((c) => channelLine(c, a, b, syn)), ...holderSummary(kind, list, a, b)]
        : [EMPTY_KIND[kind](a, b)];
    items.push(item(SYNASTRY_CHANNEL_KIND_NAMES_ZH[kind], SYNASTRY_CHANNEL_KIND_FIELD[kind], lines.join('\n')));
  }

  const centerLines: string[] = [];
  if (syn.newCenters.length > 0) {
    centerLines.push(
      `只有兩人在一起時才被定義：${centerList(syn.newCenters)}。這些是單獨時都沒有、在一起才出現的穩定感，常是「跟你在一起時特別……」的來源；分開後這份感覺會淡掉。`,
      ...syn.newCenters.map((c) => `・${CENTER_NAMES_ZH[c]}：${CENTER_NEW[c]}`),
    );
  } else {
    centerLines.push('沒有「只有在一起才被定義」的中心，兩人合盤的定義中心都來自各自原本就有的部分。');
  }
  if (syn.openCenters.length > 0) {
    centerLines.push(
      `兩人都開放的中心：${centerList(syn.openCenters)}。這些主題兩個人都容易受環境與他人影響，在一起時也可能一起被放大：`,
      ...syn.openCenters.map((c) => `・${CENTER_NAMES_ZH[c]}：${CENTER_OPEN_BOTH[c]}`),
    );
  } else {
    centerLines.push('九個中心在合盤裡都被定義，關係本身很完整，但也比較不容易受外界調整，記得保留與朋友、環境的流動。');
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
      dailyLines(a, b, syn).join('\n'),
    ),
  );

  items.push(item('相處建議', '依上面的通道與類型整理成幾條日常可做的提醒。', adviceLines(a, b, syn).join('\n')));

  return items;
}

const EMPTY_KIND: Record<SynastryChannelKind, (a: HdPartner, b: HdPartner) => string> = {
  electromagnetic: () =>
    '沒有電磁通道：兩人之間少了「一碰就接上」的強烈火花，吸引力更多來自其他層面，例如友伴通道帶來的默契或彼此開放中心的互相影響。',
  companionship: () => '沒有友伴通道：兩人各自擁有的通道都不相同，彼此帶給對方的多是新的體驗，需要多花一點時間理解對方的做法。',
  dominance: () => '沒有主導通道：誰也不會在某個主題上單方面帶著對方走。',
  compromise: () => '沒有妥協通道：兩人之間少了典型的拉扯點，相處的摩擦較少來自通道結構。',
};

function adviceLines(a: HdPartner, b: HdPartner, syn: HdSynastry): string[] {
  const lines: string[] = [];
  const em = syn.channels.filter((c) => c.kind === 'electromagnetic');
  const compromise = syn.channels.filter((c) => c.kind === 'compromise');
  const dominance = syn.channels.filter((c) => c.kind === 'dominance');
  if (em.length > 0) {
    lines.push(
      `珍惜 ${em.map((c) => channelLabel(c.channel)).join('、')} 帶來的火花，這是你們最有化學反應的地方；吵架卡住時，也先想想是不是這幾條線在拉扯。`,
    );
  }
  if (compromise.length > 0) {
    const first = compromise[0];
    const [holder, other] = names(a, b, first.holder ?? 'a');
    lines.push(
      `${compromise.map((c) => c.channel.id).join('、')} 這幾件事試著約定輪流做主：例如 ${first.channel.id} 這次照${holder}的方式，下次換${other}決定，事後再一起看哪種比較好。`,
    );
  }
  if (dominance.length > 0) {
    lines.push(
      `${dominance.map((c) => c.channel.id).join('、')} 是單方帶領的主題：分開一段時間後，沒有這條線的一方會覺得那股能量不見了，這很正常，不代表關係變淡。`,
    );
  }
  if (syn.openCenters.includes('solarPlexus')) {
    lines.push('兩人的情緒中心都開放，容易一起被外面的情緒影響；氣氛不對時先離開現場，再回來談。');
  } else if (syn.composite.definedCenters.includes('solarPlexus')) {
    lines.push('合盤的情緒中心被定義，關係有自己的情緒波；重要的話題避開情緒高低點。');
  }
  if (syn.newCenters.length > 0) {
    lines.push(
      `${centerList(syn.newCenters)}只在兩人一起時才穩定；分開一段時間後感覺不同是正常的，不必解讀成關係變了。`,
    );
  }
  lines.push(
    a.chart.type === b.chart.type
      ? `兩人的策略都是「${a.chart.strategy}」，各自照著做、再把結果告訴對方；同類型也有不同的權威與人生角色，不必變成同一個人。`
      : `${a.name}照自己的策略（${a.chart.strategy}）、${b.name}照自己的策略（${b.chart.strategy}）各自做決定，再把結果告訴對方；合盤是互相補位，不是要變成同一個人。`,
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
- 合盤通道分四類：電磁（各有一端，在一起才接通，吸引與火花）、友伴（兩人都有，共同基礎）、主導（只有一方有完整通道、另一方兩端都沒有）、妥協（一方完整、另一方只有一端，常見摩擦點）。
- 這是能量結構說明，不是關係好壞的判決；請給可實踐的觀察與建議，避免恐嚇或保證。
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
接著用「日常相處」一段，分四個主題各舉 2 個具體的生活場景（例如「下班回家${a.name}想先安靜、${b.name}想馬上聊今天的事」這種程度的細節），並說明兩人各自的感受與可以怎麼做：
1. 個性：兩人在生活習慣、精力分配上的差異（參考類型、人生角色、薦骨與喉嚨中心）。
2. 兩人思考方式：各自怎麼想事情、怎麼做決定，步調不同時怎麼配合（參考內在權威、頭腦與邏輯中心）。
3. 處理矛盾的方法：吵架前的訊號、誰容易先退讓或爆發、怎麼和好（參考情緒中心、意志力中心、非自己主題與妥協通道）。
4. 感受親密及愛的方式：各自怎樣會覺得被愛、親密的節奏（參考與親密有關的通道，如 6-59、19-49、37-40、39-55、12-22）。
最後給兩人各 3 條相處提醒。`;
}
