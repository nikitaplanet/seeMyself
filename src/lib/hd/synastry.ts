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
  reflector: '給他時間與好的環境，重大的事不要逼他當下決定。',
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

function item(term: string, field: string, meaning: string): MeaningItem {
  return { term, field, meaning };
}

function centerList(cs: readonly CenterId[]): string {
  return cs.map((c) => CENTER_NAMES_ZH[c]).join('、');
}

function channelLine(sc: SynastryChannel, a: HdPartner, b: HdPartner): string {
  const label = channelLabel(sc.channel);
  const meaning = channelShortMeaning(sc.channel.id);
  let who = '';
  if (sc.kind === 'electromagnetic') {
    who = `（${a.name} 閘門 ${sc.gateA} × ${b.name} 閘門 ${sc.gateB}）`;
  } else if (sc.holder) {
    const [holder] = names(a, b, sc.holder);
    who = `（${holder}擁有）`;
  }
  return `${label}${who}：${meaning}`;
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
        ? [KIND_MEANING[kind], ...list.map((c) => channelLine(c, a, b))]
        : [EMPTY_KIND[kind](a, b)];
    items.push(item(SYNASTRY_CHANNEL_KIND_NAMES_ZH[kind], SYNASTRY_CHANNEL_KIND_FIELD[kind], lines.join('\n')));
  }

  const centerLines: string[] = [];
  if (syn.newCenters.length > 0) {
    centerLines.push(
      `只有兩人在一起時才被定義：${centerList(syn.newCenters)}。這些是單獨時都沒有、在一起才出現的穩定感，常是「跟你在一起時特別……」的來源；分開後這份感覺會淡掉。`,
    );
  } else {
    centerLines.push('沒有「只有在一起才被定義」的中心，兩人合盤的定義中心都來自各自原本就有的部分。');
  }
  if (syn.openCenters.length > 0) {
    centerLines.push(
      `兩人都開放的中心：${centerList(syn.openCenters)}。這些主題兩個人都容易受環境與他人影響，在一起時也可能一起被放大；遇到相關的壓力時，提醒彼此先分辨那是不是自己的。`,
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
        `和${a.name}相處：${TYPE_PARTNER_TIP[a.chart.type]}（策略：${a.chart.strategy}）`,
        `和${b.name}相處：${TYPE_PARTNER_TIP[b.chart.type]}（策略：${b.chart.strategy}）`,
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
        `支持${a.name}做決定：${AUTHORITY_PARTNER_TIP[a.chart.authority]}`,
        `支持${b.name}做決定：${AUTHORITY_PARTNER_TIP[b.chart.authority]}`,
      ].join('\n'),
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
      `珍惜 ${em.map((c) => c.channel.id).join('、')} 帶來的火花，一起做需要這些能力的事；吵架卡住時，也先想想是不是這幾條線在拉扯。`,
    );
  }
  if (compromise.length > 0) {
    const first = compromise[0];
    const [holder, other] = names(a, b, first.holder ?? 'a');
    lines.push(
      `在 ${compromise.map((c) => c.channel.id).join('、')} 相關的主題上，有完整通道的一方（例如 ${first.channel.id} 的${holder}）放慢一點，讓${other}也有決定權。`,
    );
  }
  if (dominance.length > 0) {
    lines.push(
      `${dominance.map((c) => c.channel.id).join('、')} 是單方帶領的主題：帶的人當成分享，學的人當成體驗，不必互相比較。`,
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
  lines.push('各自依自己的策略與權威做決定，再把結果告訴對方；合盤是互相補位，不是要變成同一個人。');
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

## 兩人資料
${partnerBlock(a)}

${partnerBlock(b)}

## 合盤
- 合盤類型：${TYPE_NAMES_ZH[comp.type]}；定義：${DEFINITION_NAMES_ZH[comp.definition]}
- 合盤已定義中心：${centerList(comp.definedCenters) || '無'}
- 只有在一起才被定義的中心：${centerList(syn.newCenters) || '無'}
- 兩人都開放的中心：${centerList(syn.openCenters) || '無'}
${kindLines}

請先給一段關係總覽，再依「吸引與火花（電磁通道）」「默契與共同基礎」「摩擦點與如何協調」「合作分工與一起做決定」分段說明，最後給兩人各 3 條相處提醒。`;
}
