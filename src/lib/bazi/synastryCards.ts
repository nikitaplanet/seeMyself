import type { MeaningItem } from '@/lib/ui/personMeaning';
import { STEM_HE, STEM_WX } from './labels';
import type { BaziPartner, BaziSynastry, BranchRelationKind, PillarPairRelation } from './synastry';
import type { BaziChart, BaziPillar, WuXing } from './types';

// 八字合盤的主題卡片 — pure logic, no React. Follows .claude/星盤開發準則.md §3B, translated to
// what the two 八字 charts really give:
//   亮點＝兩人五行合計最旺的一項＋最合拍的一組地支；磨合＝同一項的另一面＋最卡的一組地支；
//   內心與親密＝兩人日支（配偶宮）主氣＋日支關係；生命課題＝日主互為對方的十神；
//   吵架與冷戰＝十神（地雷）＋日主五行（冷熱、破冰）；內耗與充電＝對方旺五行是忌神或喜用；
//   權力＝日主生剋＋強弱＋陰陽；財運與共事＝財星份量＋月支關係；初見 vs 深交＝年干 vs 日柱。
// Each card: hook ≤ 20 字, 【解析】 two paragraphs ≤ 80 字, 【相處場景】 ≤ 60 字,
// 【給兩人的建議】 ≤ 50 字 (with names up to three characters). Cards talk about the interaction,
// never address the reader as 「你」, and only turn blunt when `fit.difficult` is set.

export const BAZI_PAIR_LIMITS = { hook: 20, paragraph: 80, scene: 60, advice: 50 } as const;

type Group = '比劫' | '食傷' | '財星' | '官殺' | '印梟';

const GROUP_OF: Record<string, Group> = {
  比肩: '比劫',
  劫財: '比劫',
  食神: '食傷',
  傷官: '食傷',
  正財: '財星',
  偏財: '財星',
  正官: '官殺',
  七殺: '官殺',
  正印: '印梟',
  偏印: '印梟',
};

const WX_ORDER: readonly WuXing[] = ['木', '火', '土', '金', '水'];
const YANG_STEMS = new Set(['甲', '丙', '戊', '庚', '壬']);
const REL_NAME: Record<BranchRelationKind, string> = {
  liuHe: '六合',
  liuChong: '六沖',
  banHe: '半合',
  xing: '相刑',
  hai: '相害',
  ziXing: '自刑',
};
const PILLAR_ZHI: Record<BaziPillar['key'], string> = {
  year: '年支',
  month: '月支',
  day: '日支',
  time: '時支',
};

function card(
  term: string,
  field: string,
  hook: string,
  p1: string,
  p2: string,
  scene: string,
  advice: string,
): MeaningItem {
  return {
    term,
    field,
    hook,
    meaning: ['【解析】', p1, p2, '【相處場景】', scene, '【給兩人的建議】', advice]
      .filter(Boolean)
      .join('\n'),
  };
}

interface Ctx {
  a: BaziPartner;
  b: BaziPartner;
  syn: BaziSynastry;
  wa: WuXing;
  wb: WuXing;
  yangA: boolean;
  yangB: boolean;
  dayKinds: BranchRelationKind[];
  /** 兩人五行百分比相加後，最旺與最弱的一項。 */
  top: WuXing;
  low: WuXing;
  difficult: boolean;
}

function pillarOf(chart: BaziChart, key: BaziPillar['key']): BaziPillar | undefined {
  return chart.pillars.find((p) => p.key === key);
}

function pct(chart: BaziChart, wx: WuXing): number {
  return chart.wuXing.find((s) => s.wx === wx)?.percent ?? 0;
}

function groupPct(chart: BaziChart, g: Group): number {
  return chart.wuXing.filter((s) => s.gods === g).reduce((n, s) => n + s.percent, 0);
}

function buildCtx(a: BaziPartner, b: BaziPartner, syn: BaziSynastry): Ctx {
  const sum = (wx: WuXing) => pct(a.chart, wx) + pct(b.chart, wx);
  const sorted = [...WX_ORDER].sort((x, y) => sum(y) - sum(x));
  return {
    a,
    b,
    syn,
    wa: STEM_WX[syn.dayGanA] ?? a.chart.dayMasterWx,
    wb: STEM_WX[syn.dayGanB] ?? b.chart.dayMasterWx,
    yangA: YANG_STEMS.has(syn.dayGanA),
    yangB: YANG_STEMS.has(syn.dayGanB),
    dayKinds: syn.dayPair?.relations.map((r) => r.kind) ?? [],
    top: sorted[0],
    low: sorted[sorted.length - 1],
    difficult: syn.fit.difficult,
  };
}

function relText(p: PillarPairRelation, kinds?: readonly BranchRelationKind[]): string {
  const rels = p.relations.filter((r) => !kinds || kinds.includes(r.kind));
  const names = rels.map((r) => (r.kind === 'banHe' ? `半合${r.wx ?? ''}局` : REL_NAME[r.kind])).join('、');
  const where =
    p.pillarA === p.pillarB
      ? PILLAR_ZHI[p.pillarA]
      : `${PILLAR_ZHI[p.pillarA]}與${PILLAR_ZHI[p.pillarB]}`;
  return `${where}${p.zhiA}${p.zhiB}${names}`;
}

/** 一組柱位落在哪個生活面向：同柱就是該柱；有一邊是日柱時看另一柱。 */
function areaOf(p: PillarPairRelation): BaziPillar['key'] {
  if (p.pillarA === p.pillarB) return p.pillarA;
  if (p.pillarA === 'day') return p.pillarB;
  if (p.pillarB === 'day') return p.pillarA;
  return p.pillarA;
}

/** Who gives / controls in the day-stem relation: [主動方, 承接方]。 */
function stemRoles(c: Ctx): [string, string] {
  const k = c.syn.stem.kind;
  return k === 'aGeneratesB' || k === 'aControlsB' ? [c.a.name, c.b.name] : [c.b.name, c.a.name];
}

function stemBasis(c: Ctx): string {
  const { dayGanA: ga, dayGanB: gb, stem } = c.syn;
  switch (stem.kind) {
    case 'he':
      return `日主${ga}${gb}相合`;
    case 'same':
      return `日主同屬${c.wa}`;
    case 'aGeneratesB':
      return `日主${ga}${c.wa}生${gb}${c.wb}`;
    case 'bGeneratesA':
      return `日主${gb}${c.wb}生${ga}${c.wa}`;
    case 'aControlsB':
      return `日主${ga}${c.wa}剋${gb}${c.wb}`;
    case 'bControlsA':
      return `日主${gb}${c.wb}剋${ga}${c.wa}`;
  }
}

// ---------------------------------------------------------------------------
// 1. 一起時的亮點：合計最旺的五行（兩人合起來的氣場）＋最合拍的一組
// ---------------------------------------------------------------------------

const SHINE: Record<WuXing, { hook: string; p: string; scene: string; advice: string }> = {
  木: {
    hook: '在一起，就想一起變更好',
    p: '兩人湊在一起，話題很自然會轉到「接下來想做什麼」。一起學東西、訂計畫時最有勁，旁人看到的是很上進的一對。',
    scene: '週末一起逛書店或上課，回家路上已經在討論下一個想學的東西。',
    advice: '一起選一個半年內的小目標，每月檢查一次進度。',
  },
  火: {
    hook: '兩人一到，場子就熱了',
    p: '兩人湊在一起，場面就熱起來，笑聲多、行動也快。朋友聚會有這一對在，很少冷場。',
    scene: '臨時起意的小旅行，一個人提議，另一個五分鐘內就開始查車票。',
    advice: '每個月輪流安排一次對方沒去過的地方。',
  },
  土: {
    hook: '一對讓人放心的組合',
    p: '兩人湊在一起，給人一種很穩的感覺，說好的事都會做到。朋友有事相託時，常同時想到這兩個人。',
    scene: '一起去大賣場補貨、回家煮一桌菜，平凡的一天過得很滿足。',
    advice: '固定一個每週都做的兩人小習慣，例如週日早餐。',
  },
  金: {
    hook: '一起做事，又快又準',
    p: '兩人湊在一起，做事特別有效率，分工清楚、決定也快。一起處理麻煩事，是這一對的強項。',
    scene: '一起整理房子，半天就把拖了很久的角落清乾淨，還順便列好採買清單。',
    advice: '把兩人合作最順的一件事固定下來，交給這個組合處理。',
  },
  水: {
    hook: '話題永遠聊不完的兩個人',
    p: '兩人湊在一起，話題停不下來，一個起頭另一個就能接。兩人的點子加起來，比各自想的多很多。',
    scene: '睡前本來只想聊五分鐘，結果從工作聊到小時候，一看時間已經半夜。',
    advice: '每週留一晚不看螢幕，只聊天。',
  },
};

const SANHE_FORCE: Record<WuXing, string> = {
  木: '往前長的動力',
  火: '行動的熱度',
  土: '安定的力量',
  金: '決斷的力量',
  水: '靈活的點子',
};

const SHINE_AREA: Record<BaziPillar['key'], string> = {
  day: '私下相處是這段關係最順的地方：關起門來不必多解釋，生活小事很容易有默契。',
  year: '兩人的朋友圈和家人很容易接納彼此，一起出席聚會時特別自在，像本來就是一家人。',
  month: '一起做事是這一對的亮點：規劃旅行、搬家、辦活動，不用多講就知道誰負責哪一塊。',
  time: '兩人談起未來特別合拍，想過的生活、想去的地方常常不謀而合。',
};

const HE_KINDS: readonly BranchRelationKind[] = ['liuHe', 'banHe'];
const HARD_KINDS: readonly BranchRelationKind[] = ['liuChong', 'xing', 'hai', 'ziXing'];

function shine(c: Ctx): MeaningItem {
  const { syn } = c;
  const s = SHINE[c.top];
  const has = (p: PillarPairRelation, ks: readonly BranchRelationKind[]) =>
    p.relations.some((r) => ks.includes(r.kind));
  const dayHe = syn.dayPair && has(syn.dayPair, HE_KINDS) ? syn.dayPair : null;
  const otherHe =
    syn.branchPairs.find((p) => has(p, ['liuHe']) && !has(p, HARD_KINDS)) ??
    syn.branchPairs.find((p) => has(p, ['banHe']) && !has(p, HARD_KINDS));
  let p2: string;
  if (dayHe) {
    p2 = `${SHINE_AREA.day}（${relText(dayHe, HE_KINDS)}）`;
  } else if (syn.stem.kind === 'he') {
    p2 = `兩人之間有天生的吸引力，站在一起就像一組的。很多事不用商量，方向自然一致。（${stemBasis(c)}）`;
  } else if (syn.sanHe.length > 0) {
    const wx = syn.sanHe[0];
    p2 = `有一股${SANHE_FORCE[wx]}，要兩人都在場才完整。分開時各自都好，在一起才真正發揮出來。（兩盤地支合成三合${wx}局）`;
  } else if (otherHe) {
    p2 = `${SHINE_AREA[areaOf(otherHe)]}（${relText(otherHe, HE_KINDS)}）`;
  } else if (syn.stem.kind === 'same') {
    p2 = `兩人底色相近，欣賞的東西、看不慣的事都差不多。不必費力解釋自己，是這段關係最輕鬆的地方。（${stemBasis(c)}）`;
  } else if (syn.stem.kind === 'aGeneratesB' || syn.stem.kind === 'bGeneratesA') {
    const [g, r] = stemRoles(c);
    p2 = `${g}的付出${r}接得住，${r}的成長${g}也看得見。一個給、一個長，是這一對最自然的流動。（${stemBasis(c)}）`;
  } else {
    const [k, d] = stemRoles(c);
    p2 = `${k}看得到${d}的潛力，${d}也願意被推一把。兩人在一起，進步得比各自一個人快。（${stemBasis(c)}）`;
  }
  return card(
    '一起時的亮點',
    '依兩人五行加總後最旺的一項（合起來的氣場），以及兩盤之間最合拍的一組干支。',
    s.hook,
    `${s.p}（兩人合計${c.top}最旺）`,
    p2,
    s.scene,
    s.advice,
  );
}

// ---------------------------------------------------------------------------
// 2. 需要磨合的地方：亮點的另一面＋最容易卡住的一組地支（沒有時看合計最弱的五行）
// ---------------------------------------------------------------------------

const FLIP: Record<WuXing, string> = {
  木: '兩人都想往前，反而容易各衝各的，忘了問對方跟不跟得上。計畫排太滿時，關係會變得像在趕進度。',
  火: '熱得快的另一面是急：一個不耐煩，另一個馬上跟著上火。興頭上答應的事，事後容易沒人收尾。',
  土: '穩定的另一面是不想變：兩人都習慣照舊，該談的事容易一拖再拖。日子過得安穩，卻少了點新鮮。',
  金: '效率高的另一面是太講對錯：兩人都有標準，誰也不想先讓。就事論事久了，容易少了溫柔的話。',
  水: '想法多的另一面是定不下來：聊得很盡興，真正要做決定時，卻互相等對方開口。',
};

interface Friction {
  hook: string;
  p: string;
  scene: string;
  advice: string;
}

const FRICTION_DAY: Record<'chong' | 'xing' | 'hai' | 'ziXing', Friction> = {
  chong: {
    hook: '住在一起，才是真正的考題',
    p: '在家的習慣是最需要對一對的地方：作息、整潔、花錢，各有一套做法。先講好規則，就不必每次重吵。',
    scene: '一個習慣東西用完就放著，另一個看到就想收；一個想早睡，另一個才正要開始。',
    advice: '把作息、家務、花錢各寫一條兩人都同意的規則，貼在家裡。',
  },
  xing: {
    hook: '話不重，語氣卻會刺人',
    p: '私下相處容易在語氣上互相刺到，說的人無心，聽的人卻記住了。提醒對方時，慢一點、軟一點。',
    scene: '一句「怎麼又這樣」說出口，原本的小事就變成在吵態度。',
    advice: '提醒對方時只說這一次的事，用「我希望」開頭。',
  },
  hai: {
    hook: '都怕傷到對方，反而悶著',
    p: '兩人都怕傷到對方，不舒服常先放在心裡，久了變成猜來猜去。小事當下說，比累積起來好。',
    scene: '一個以為對方不在意，另一個以為對方應該懂，兩人各自悶了一晚。',
    advice: '每週問一次「這週有沒有哪裡讓對方不舒服」，輪流回答。',
  },
  ziXing: {
    hook: '太像了，連卡關都同步',
    p: '兩人在意的點太像，一個卡住，另一個也跟著陷進去。有人先跳出來，才不會一起鑽牛角尖。',
    scene: '兩人同時為同一件事心煩，結果誰也沒力氣安慰誰。',
    advice: '約好誰先察覺兩人都卡住，誰就提議出門走十分鐘。',
  },
};

const FRICTION_DIFFICULT: Friction = {
  hook: '住在一起，是最硬的一關',
  p: '坦白說，同住是這段關係最吃力的部分：作息、花錢、家務的做法常常相反，同一件事容易反覆吵。',
  scene: '一個習慣東西用完就放著，另一個看到就想收；講過幾次，下個月又為同一件事吵。',
  advice: '同住前先把作息、家務、金錢逐條談定並寫下來，每月檢查一次。',
};

const FRICTION_AREA: Record<'year' | 'month' | 'time', Friction> = {
  year: {
    hook: '兩個人好，還要兩家人好',
    p: '雙方家人或朋友圈的習慣不太一樣，過節、聚會怎麼安排要多商量。各自先和自己那邊溝通最省力。',
    scene: '過年要回哪邊、待幾天，光是排行程就可能討論好幾輪。',
    advice: '兩邊家裡的事，由各自的那一方先出面溝通。',
  },
  month: {
    hook: '一個先做，一個先想',
    p: '做事的節奏不同：一個想先動手，一個想先計畫。一起辦事前，先講好這次照誰的方式。',
    scene: '出門旅行，一個想照表走完景點，另一個想睡到自然醒。',
    advice: '一起辦事前先說好：這次由誰主導，另一個人負責補位。',
  },
  time: {
    hook: '未來的畫面，要對一對',
    p: '對未來的想像不完全一樣，住哪裡、要不要小孩，各有想法。這些事越早攤開談越好。',
    scene: '聊到五年後想住哪裡，才發現兩人心裡的畫面不太一樣。',
    advice: '每年找一天，各自寫下五年後想過的生活，再交換看。',
  },
};

const FRICTION_LOW: Record<WuXing, Friction> = {
  木: {
    hook: '少了一個起頭的人',
    p: '兩人都比較缺主動規劃的那股勁，長期的事容易沒人起頭。約個時間專門談未來，會有幫助。',
    scene: '說了好幾次要一起規劃的旅行，到現在還停在「改天再說」。',
    advice: '這週就訂下一個日期，專門討論一件拖很久的計畫。',
  },
  火: {
    hook: '在乎，但都不太說',
    p: '兩人都不太會把熱情掛在嘴上，心裡有，卻少說出口。日子久了，容易覺得平淡。',
    scene: '紀念日快到了，兩人都想著「對方應該不在意」，結果就這樣過了。',
    advice: '每天對對方說一句具體的感謝或稱讚。',
  },
  土: {
    hook: '隨興久了，也會累',
    p: '兩人都不太擅長維持固定的節奏，生活容易隨興到有點亂。需要有人先把基本的規律撐起來。',
    scene: '晚餐吃什麼、幾點睡，每天都臨時決定，久了兩人都有點累。',
    advice: '先固定一件事：每天同一個時間一起吃一餐。',
  },
  金: {
    hook: '誰來做決定，常要推一下',
    p: '兩人都不太愛劃界線、做取捨，遇到要拒絕或決斷的事會互相推。輪流當做決定的人就好。',
    scene: '要不要答應朋友的邀約，兩人互問「覺得呢」，問了三輪還沒結論。',
    advice: '小事輪流做主：單週一個人決定，雙週換人。',
  },
  水: {
    hook: '都很直，少一個轉彎',
    p: '兩人都比較直線，碰到意見不同時不太會轉彎。多問一句「那對方怎麼想」，就有轉圜。',
    scene: '意見不同時，兩人各說各的，重複了幾次還在原地。',
    advice: '意見不同時，先複述一次對方的說法，再講自己的。',
  },
};

function friction(c: Ctx): MeaningItem {
  const { syn } = c;
  let f: Friction;
  let basis: string;
  const dayHard = (['liuChong', 'xing', 'hai', 'ziXing'] as const).find((k) => c.dayKinds.includes(k));
  const others = syn.branchPairs.filter((p) => p !== syn.dayPair && areaOf(p) !== 'day');
  const otherHard =
    others.find((p) => p.relations.some((r) => r.kind === 'liuChong')) ??
    others.find((p) => p.relations.some((r) => r.kind === 'xing' || r.kind === 'hai'));
  if (dayHard && syn.dayPair) {
    const key = dayHard === 'liuChong' ? 'chong' : dayHard;
    f = c.difficult && (key === 'chong' || key === 'xing') ? FRICTION_DIFFICULT : FRICTION_DAY[key];
    basis = relText(syn.dayPair, HARD_KINDS);
  } else if (otherHard) {
    f = FRICTION_AREA[areaOf(otherHard) as 'year' | 'month' | 'time'];
    basis = relText(otherHard, HARD_KINDS);
  } else {
    f = FRICTION_LOW[c.low];
    basis = `地支無明顯沖刑害，兩人合計${c.low}最弱`;
  }
  return card(
    '需要磨合的地方',
    '亮點的另一面，加上兩盤地支之間最容易卡住的一組；沒有明顯沖刑害時，看兩人合計最缺的五行。',
    f.hook,
    `${FLIP[c.top]}（兩人合計${c.top}最旺）`,
    `${f.p}（${basis}）`,
    f.scene,
    f.advice,
  );
}

// ---------------------------------------------------------------------------
// 3. 內心世界與親密：兩人日支（配偶宮）主氣的需求＋日支之間的關係
// ---------------------------------------------------------------------------

const NEED: Record<Group, { word: string; line: (n: string) => string; act: boolean }> = {
  比劫: { word: '並肩，被當成對等的夥伴', line: (n) => `${n}在親密裡要的是並肩，希望被當成對等的夥伴。`, act: true },
  食傷: { word: '自在，能放心說話、被逗笑', line: (n) => `${n}在親密裡要的是自在，能放心說話、被逗笑就滿足。`, act: false },
  財星: { word: '踏實，看得見的行動', line: (n) => `${n}在親密裡要的是踏實，看得見的行動比情話更有感。`, act: true },
  官殺: { word: '可靠，說到做到', line: (n) => `${n}在親密裡要的是可靠，對方說到做到才敢交出心。`, act: true },
  印梟: { word: '被懂，不必開口就被接住', line: (n) => `${n}在親密裡要的是被懂，不必開口就有人接住。`, act: false },
};

const INNER_REL: Record<BranchRelationKind, { hook: string; p: string }> = {
  liuHe: {
    hook: '不說話也舒服的安心感',
    p: '兩人的內心頻率很近，一個人的情緒，另一個很快就感覺到。待在一起不說話也舒服，是很深的安心感。',
  },
  banHe: {
    hook: '親密來自「我們是一隊」',
    p: '兩人內心想去的方向一致，談到重要的事很容易站在同一邊。親密感來自「我們是一隊的」。',
  },
  liuChong: {
    hook: '一個靠近時，一個正要空間',
    p: '兩人內在的節奏相反，一個想靠近時，另一個可能正需要空間。看懂這個時間差，就不會誤會成不在乎。',
  },
  xing: {
    hook: '最不設防，也最容易刺到',
    p: '兩人在彼此面前最不設防，也因此最容易碰到對方的痛處。親近和刺痛，常來自同一句真話。',
  },
  hai: {
    hook: '都在乎，只是說法對不上',
    p: '兩人都把在乎放在心裡，表達的方式卻對不上。一個給的，不一定是另一個認得出來的愛。',
  },
  ziXing: {
    hook: '太懂對方為什麼難過',
    p: '兩人的敏感點幾乎一樣，很懂對方為什麼難過。也因為太像，低潮時容易一起往下沉。',
  },
};

const INNER_ORDER: readonly BranchRelationKind[] = ['liuChong', 'xing', 'liuHe', 'banHe', 'hai', 'ziXing'];

function inner(c: Ctx): MeaningItem | null {
  const { a, b, syn } = c;
  const dayA = pillarOf(a.chart, 'day');
  const dayB = pillarOf(b.chart, 'day');
  const godA = dayA?.hidden[0]?.tenGod ?? '';
  const godB = dayB?.hidden[0]?.tenGod ?? '';
  const ga = GROUP_OF[godA];
  const gb = GROUP_OF[godB];
  if (!dayA || !dayB || !ga || !gb) return null;
  const p1 =
    ga === gb
      ? `兩人在親密裡要的東西一樣：${NEED[ga].word}。給的剛好是對方要的，很容易覺得被滿足。（日支${dayA.zhi}、${dayB.zhi}，同坐${godA === godB ? godA : `${godA}與${godB}`}）`
      : `${NEED[ga].line(a.name)}${NEED[gb].line(b.name)}（日支${dayA.zhi}坐${godA}、${dayB.zhi}坐${godB}）`;

  const kind = INNER_ORDER.find((k) => c.dayKinds.includes(k));
  let hook: string;
  let p2: string;
  if (kind && syn.dayPair) {
    const r = INNER_REL[kind];
    hook = r.hook;
    p2 =
      kind === 'liuChong' && c.difficult
        ? '兩人內在的節奏常常相反，一個想靠近時，另一個正想退開。這個落差不會自己消失，需要說出來。'
        : r.p;
    p2 = `${p2}（${relText(syn.dayPair)}）`;
  } else if (c.yangA && c.yangB) {
    hook = '喜歡就靠近，卻不太示弱';
    p2 = '兩人的內心都偏直接，喜歡就靠近、不舒服就說。親密感來得快，但都不太會主動示弱。（日主同為陽干，日支無合沖）';
  } else if (!c.yangA && !c.yangB) {
    hook = '在乎都藏在小動作裡';
    p2 = '兩人的內心都偏含蓄，在乎常藏在小動作裡。親密感是慢慢累積的，需要有人先開口。（日主同為陰干，日支無合沖）';
  } else {
    hook = '一個說出口，一個放心裡';
    p2 = '一個習慣把感受說出來，一個習慣放在心裡。說的人多等一下，藏的人多講一句，就對得上。（日主一陰一陽，日支無合沖）';
  }

  const actA = NEED[ga].act;
  const actB = NEED[gb].act;
  let scene: string;
  let advice: string;
  if (actA && actB) {
    scene = '兩人表達在乎的方式都是做事：幫忙處理麻煩、接送、把東西修好，很少說肉麻話。';
    advice = '每週各對對方說一件欣賞的事，把做的也說出口。';
  } else if (!actA && !actB) {
    scene = '兩人最親近的時刻是窩在一起聊天，從今天的小事聊到心裡的話。';
    advice = '除了聊天，每週替對方做一件實際的小事。';
  } else {
    const [act, feel] = actA ? [a.name, b.name] : [b.name, a.name];
    scene = `${act}默默把事情做好，${feel}想聽的卻是一句心裡話；兩種都是在乎。`;
    advice = `${act}每天說一句感受，${feel}把對方做的事說出來道謝。`;
  }
  return card(
    '內心世界與親密',
    '依兩人日支（代表伴侶與親密關係的位置）各自藏著的需求，以及這兩個日支之間的關係。',
    hook,
    p1,
    p2,
    scene,
    advice,
  );
}

// ---------------------------------------------------------------------------
// 4. 關係的生命課題：日主互為對方的十神（這段關係要彼此學會的事）
// ---------------------------------------------------------------------------

const LESSON: Record<string, { hook: string; line: (s: string, o: string) => string }> = {
  比肩: {
    hook: '在對方身上，看見自己',
    line: (s, o) => `${s}在${o}身上學的是合作：兩人一樣有主見，得練習不必每件事都自己說了算。`,
  },
  劫財: {
    hook: '把較勁，變成互相成就',
    line: (s, o) => `${s}在${o}身上學的是分享：資源、功勞和注意力，都要學著大方分出去。`,
  },
  食神: {
    hook: '學著放鬆，也學著認真',
    line: (s, o) => `${s}在${o}身上學的是放鬆：不必時時有用，也值得被喜歡。`,
  },
  傷官: {
    hook: '真話要說，也要說得好',
    line: (s, o) => `${s}在${o}身上學的是把話說好：真話要說，但要說得讓人聽得進去。`,
  },
  正財: {
    hook: '把喜歡，經營成承諾',
    line: (s, o) => `${s}在${o}身上學的是負責：把一時的喜歡，經營成長久的承諾。`,
  },
  偏財: {
    hook: '新鮮之外，還要留下來',
    line: (s, o) => `${s}在${o}身上學的是專注：新鮮感之外，還要留得下來。`,
  },
  正官: {
    hook: '自律，但不失去自己',
    line: (s, o) => `${s}在${o}身上學的是自律，同時不把對方的標準當成唯一的答案。`,
  },
  七殺: {
    hook: '有壓力，就說出口',
    line: (s, o) => `${s}在${o}身上學的是守住自己：有壓力時說出口，而不是硬吞。`,
  },
  正印: {
    hook: '被照顧，也要照顧回去',
    line: (s, o) => `${s}在${o}身上學的是接受照顧，也學著別只當被照顧的那個人。`,
  },
  偏印: {
    hook: '先聽完，再說懂不懂',
    line: (s, o) => `${s}在${o}身上學的是理解不同：對方的想法再特別，也先聽完。`,
  },
};

const LESSON_MUTUAL: Record<string, string> = {
  比肩: '兩人像照鏡子，優點一樣、固執的地方也一樣。這段關係的功課，是在對方身上看見自己，然後學著讓一步。',
  劫財: '兩人旗鼓相當，誰也不想輸。這段關係的功課，是把較勁變成互相成就，贏的時候記得拉對方一把。',
};

function lesson(c: Ctx): MeaningItem | null {
  const { a, b, syn } = c;
  const la = LESSON[syn.tenGodBForA];
  const lb = LESSON[syn.tenGodAForB];
  if (!la || !lb) return null;
  let p1: string;
  let p2: string;
  const mutual = syn.tenGodBForA === syn.tenGodAForB ? LESSON_MUTUAL[syn.tenGodBForA] : undefined;
  if (mutual) {
    p1 = `${mutual}（互為${syn.tenGodBForA}）`;
    const sa = a.chart.strength;
    const sb = b.chart.strength;
    p2 =
      sa === '身旺' && sb === '身旺'
        ? '兩人都很有力氣，僵住時誰也不退。先約好一個喊停的方式，硬碰硬就能變成各退一步。（兩人皆身旺）'
        : sa === '身弱' && sb === '身弱'
          ? '兩人都習慣體諒對方，反而容易沒人做決定。輪流拿主意，是這一對要練的事。（兩人皆身弱）'
          : `一個比較拿得定主意，另一個比較願意配合。久了要留意，別讓配合的那個人沒了聲音。（${a.name}${sa}、${b.name}${sb}）`;
  } else {
    p1 = `${la.line(a.name, b.name)}（${b.name}是${a.name}的${syn.tenGodBForA}）`;
    p2 = `${lb.line(b.name, a.name)}（${a.name}是${b.name}的${syn.tenGodAForB}）`;
  }
  let scene: string;
  let advice: string;
  switch (syn.stem.kind) {
    case 'he':
      scene = '剛開始什麼都好，日子久了才發現，有些事一直是其中一個人在讓。';
      advice = '每季問一次彼此：最近有沒有哪件事是勉強配合的。';
      break;
    case 'same':
      scene = '兩人為了同一件事各自堅持，吵到最後發現，其實想要的是一樣的。';
      advice = '意見僵住時，各自先說「我真正在意的是什麼」。';
      break;
    case 'aGeneratesB':
    case 'bGeneratesA': {
      const [g, r] = stemRoles(c);
      scene = `${g}習慣先替${r}想好、做好，${r}有時想自己來，卻不知道怎麼開口。`;
      advice = `${r}每週主動扛一件事，${g}練習不插手。`;
      break;
    }
    default: {
      const [k, d] = stemRoles(c);
      scene = `${k}一句「這樣比較好」，${d}聽起來像被糾正，氣氛就僵了。`;
      advice = `${k}給建議前先問要不要聽，${d}不舒服時當下說。`;
    }
  }
  return card(
    '關係的生命課題',
    '依兩人日主互為對方的哪一種角色（十神），看這段關係要彼此學會的事。',
    c.difficult ? '這段關係，是一門硬功課' : la.hook,
    p1,
    p2,
    scene,
    advice,
  );
}

// ---------------------------------------------------------------------------
// 6. 吵架與冷戰：十神＝各自的地雷；日主五行＝吵起來是熱是冷、怎麼破冰
// ---------------------------------------------------------------------------

const TRIGGER: Record<string, (s: string, o: string) => string> = {
  比肩: (s, o) => `${s}的地雷是被${o}搶著做決定。`,
  劫財: (s, o) => `${s}的地雷是覺得${o}在跟自己爭。`,
  食神: (s, o) => `${s}的地雷是好意被${o}當成理所當然。`,
  傷官: (s, o) => `${s}的地雷是話沒講完就被${o}打斷或否定。`,
  正財: (s, o) => `${s}的地雷是${o}答應的事沒做到。`,
  偏財: (s, o) => `${s}的地雷是被${o}管東管西、追問行蹤。`,
  正官: (s, o) => `${s}的地雷是被${o}當面指出哪裡做錯。`,
  七殺: (s, o) => `${s}的地雷是${o}用命令或催促的口氣說話。`,
  正印: (s, o) => `${s}的地雷是被${o}當成小孩，什麼都要管。`,
  偏印: (s, o) => `${s}的地雷是${o}突然冷下來、什麼都不說。`,
};

const TRIGGER_MUTUAL: Record<string, string> = {
  比肩: '兩人的地雷一樣：都受不了對方搶著做決定。吵起來是兩個人同時堅持，誰也不想先讓。',
  劫財: '兩人的地雷一樣：都受不了被對方比下去。吵起來容易變成比誰有理、誰付出多。',
};

/** 吵架時往外放（木火金）還是往內收（土水）。 */
const OUTWARD: Record<WuXing, boolean> = { 木: true, 火: true, 金: true, 土: false, 水: false };

const ICE: Record<WuXing, string> = {
  木: '要先聽到「這點有道理」',
  火: '要先得到一句軟話或擁抱',
  土: '要先有一段安靜的時間',
  金: '要先聽到重點和怎麼改',
  水: '要先離開現場喘口氣',
};

function fight(c: Ctx): MeaningItem | null {
  const { a, b, syn } = c;
  const ta = TRIGGER[syn.tenGodBForA];
  const tb = TRIGGER[syn.tenGodAForB];
  if (!ta || !tb) return null;
  const mutual = syn.tenGodBForA === syn.tenGodAForB ? TRIGGER_MUTUAL[syn.tenGodBForA] : undefined;
  const p1 = mutual
    ? `${mutual}（互為${syn.tenGodBForA}）`
    : `${ta(a.name, b.name)}${tb(b.name, a.name)}（${b.name}是${a.name}的${syn.tenGodBForA}，${a.name}是${b.name}的${syn.tenGodAForB}）`;
  const outA = OUTWARD[c.wa];
  const outB = OUTWARD[c.wb];
  const basis = `日主${syn.dayGanA}${c.wa}、${syn.dayGanB}${c.wb}`;
  let hook: string;
  let p2: string;
  let scene: string;
  if (outA && outB) {
    hook = '吵得快，和好也快';
    p2 = `兩人吵架都是當場來：聲音大、話也直，但火氣退得快。很少冷戰，怕的是氣頭上說出收不回的話。（${basis}）`;
    scene = '為了誰忘記訂位吵起來，十分鐘後兩人又一起找下一家餐廳。';
  } else if (!outA && !outB) {
    hook = '不吵，但會冷很久';
    p2 = `兩人不太會大吵，不舒服時各自安靜。表面沒事，冷戰卻可能拖好幾天，因為都在等對方先開口。（${basis}）`;
    scene = '晚餐時兩人都很客氣，話卻比平常少一半，彼此都知道有事。';
  } else {
    const [out, inn] = outA ? [a.name, b.name] : [b.name, a.name];
    hook = '一個追著談，一個先躲開';
    p2 = `${out}想當場講清楚，${inn}需要先躲起來想一想。一個追、一個退，越追越冷是最常見的僵局。（${basis}）`;
    scene = `${out}連傳三則訊息想談，${inn}已讀後過了兩小時才回一句「晚點說」。`;
  }
  if (c.difficult) {
    hook = '同一件事，容易一吵再吵';
    scene = '同一個爭執隔幾週又出現一次，兩人都覺得「不是講過了嗎」。';
  }
  const advice =
    c.wa === c.wb
      ? `破冰時記得：兩人都${ICE[c.wa]}。`
      : `破冰時記得：${a.name}${ICE[c.wa]}，${b.name}${ICE[c.wb]}。`;
  return card(
    '吵架與冷戰',
    '依兩人日主互為對方的角色（地雷在哪），與日主五行的脾氣（吵起來是熱是冷、怎麼破冰）。',
    hook,
    p1,
    p2,
    scene,
    advice,
  );
}

// ---------------------------------------------------------------------------
// 7. 兩人內耗與充電說明書：對方的旺五行是自己的忌神（耗電）或喜用（充電）
// ---------------------------------------------------------------------------

const WX_SHADOW: Record<WuXing, string> = {
  木: '停不下來的計畫和堅持',
  火: '急性子和大起大落的情緒',
  土: '固守習慣、不想改變的一面',
  金: '高標準和挑剔',
  水: '反覆的念頭和變來變去',
};

const WX_LIGHT: Record<WuXing, string> = {
  木: '行動力與方向感',
  火: '熱情與笑聲',
  土: '穩定與耐心',
  金: '條理與果斷',
  水: '彈性與體貼',
};

const DRAIN_SCENE: Record<WuXing, (g: string, r: string) => string> = {
  木: (g, r) => `${g}興沖沖地排滿週末行程，${r}只想在家躺一天。`,
  火: (g, r) => `${g}一急起來講話變快變大聲，${r}還沒聽懂就先累了。`,
  土: (g, r) => `${g}堅持照原本的方式來，${r}提了幾次想調整，都沒有下文。`,
  金: (g, r) => `${g}累的時候看什麼都想糾正，${r}覺得做什麼都不對。`,
  水: (g, r) => `${g}的計畫一天改了三次，${r}跟到後來不知道該準備什麼。`,
};

const JOINT_RECHARGE: Record<WuXing, { p: string; advice: string }> = {
  木: {
    p: '兩人一起回血的方式是往外走：爬山、逛公園、一起學新東西。有生長感的活動，能幫兩人同時補上電。',
    advice: '每月排一次半天的戶外行程，兩人一起去。',
  },
  火: {
    p: '兩人一起回血的方式是動起來：運動、曬太陽、和朋友熱鬧聚一場。身體暖了，氣氛也跟著回溫。',
    advice: '每週一起運動一次，流點汗再回家。',
  },
  土: {
    p: '兩人一起回血的方式是把日子過踏實：一起煮飯、整理家裡、早點睡。規律本身就是這一對的充電座。',
    advice: '挑一天晚上一起煮飯，吃完一起收拾。',
  },
  金: {
    p: '兩人一起回血的方式是一起收拾：清掉雜物、把拖著的事了結。空間和待辦都清爽了，心也鬆了。',
    advice: '每月一起清一個抽屜或一個角落。',
  },
  水: {
    p: '兩人一起回血的方式是安靜待著：泡湯、看海、各自看書卻坐在一起。不必說話，電就慢慢滿了。',
    advice: '每週留一晚不排事，兩人安靜待在一起。',
  },
};

function battery(c: Ctx): MeaningItem {
  const { a, b, syn } = c;
  const hurtA = syn.bHurtsA[0]; // B's strong element that A should avoid
  const hurtB = syn.aHurtsB[0];
  const helpA = syn.bHelpsA[0] ?? syn.bFillsA[0]; // B's strong element that A needs
  const helpB = syn.aHelpsB[0] ?? syn.aFillsB[0];

  let p1: string;
  let scene: string;
  if (hurtA && hurtB) {
    p1 = `兩人狀態差時容易互相耗：${b.name}的${WX_SHADOW[hurtA]}讓${a.name}累，${a.name}的${WX_SHADOW[hurtB]}也讓${b.name}累。（彼此的旺五行是對方的忌神）`;
    scene = '兩人都忙了一整週，週五晚上一個想抱怨、一個想安靜，結果誰也沒被安慰到。';
  } else if (hurtA || hurtB) {
    const [g, r, wx] = hurtA ? [b.name, a.name, hurtA] : [a.name, b.name, hurtB as WuXing];
    p1 = `${g}狀態不好時，${WX_SHADOW[wx]}會加重，${r}最容易被這一點耗到。這不是誰的錯，是兩人的電路剛好相衝。（${g}旺${wx}，為${r}的忌神）`;
    scene = DRAIN_SCENE[wx](g, r);
  } else {
    p1 = '兩人之間沒有明顯互相消耗的地方。真正耗電的多半是外面的事，被帶回家後才影響到彼此。（彼此的旺五行都不是對方的忌神）';
    scene = '其中一人下班帶著一身疲倦回家，另一個人的好心情也慢慢被拉低。';
  }

  let p2: string;
  if (helpA && helpB) {
    p2 = `兩人也互為補給：${a.name}的${WX_LIGHT[helpB]}讓${b.name}回血，${b.name}的${WX_LIGHT[helpA]}讓${a.name}回血。（彼此的旺五行是對方所需）`;
  } else if (helpA || helpB) {
    const [g, r, wx] = helpA ? [b.name, a.name, helpA] : [a.name, b.name, helpB as WuXing];
    p2 = `${g}身上的${WX_LIGHT[wx]}，正是${r}最需要的。${r}累的時候，待在${g}旁邊就會慢慢好起來。（${g}旺${wx}，為${r}所需）`;
  } else {
    p2 = `${JOINT_RECHARGE[c.low].p}（兩人合計${c.low}最弱）`;
  }

  const anyHurt = Boolean(hurtA || hurtB);
  const anyHelp = Boolean(helpA || helpB);
  const hook =
    anyHurt && anyHelp
      ? '會互相耗電，也會互相充電'
      : hurtA && hurtB
        ? '累的時候，別互相當出氣筒'
        : anyHurt
          ? '一個人的習慣，是另一個的耗電'
          : helpA && helpB
            ? '彼此就是對方的充電座'
            : anyHelp
              ? '待在一起，電就回來了'
              : '耗電在外面，充電在一起';
  const advice = anyHurt
    ? '回家先說自己今天剩幾成電，低於三成就先各自休息半小時。'
    : helpA && helpB
      ? '誰先發現對方沒電，就先放下手邊的事陪十分鐘。'
      : anyHelp
        ? `${helpA ? a.name : b.name}累的時候直接說「需要充電」，${helpA ? b.name : a.name}陪著就好。`
        : JOINT_RECHARGE[c.low].advice;
  return card(
    '兩人內耗與充電說明書',
    '依一方的旺五行是另一方的忌神還是喜用：前者容易互相消耗，後者是互相充電。',
    hook,
    p1,
    p2,
    scene,
    advice,
  );
}

// ---------------------------------------------------------------------------
// 8. 關係中的權力與主導權：日主生剋（誰影響誰）＋強弱＋陰陽
// ---------------------------------------------------------------------------

function power(c: Ctx): MeaningItem {
  const { a, b, syn } = c;
  const sa = a.chart.strength;
  const sb = b.chart.strength;
  let score = 0;
  if (syn.stem.kind === 'aControlsB') score += 2;
  if (syn.stem.kind === 'bControlsA') score -= 2;
  if (sa === '身旺' && sb !== '身旺') score += 1;
  if (sb === '身旺' && sa !== '身旺') score -= 1;
  if (sa === '身弱' && sb !== '身弱') score -= 1;
  if (sb === '身弱' && sa !== '身弱') score += 1;
  if (c.yangA && !c.yangB) score += 1;
  if (c.yangB && !c.yangA) score -= 1;
  const leader = score > 0 ? a.name : score < 0 ? b.name : null;
  const follower = score > 0 ? b.name : score < 0 ? a.name : null;

  let p1: string;
  switch (syn.stem.kind) {
    case 'aControlsB':
    case 'bControlsA': {
      const [k, d] = stemRoles(c);
      p1 =
        leader === k
          ? `表面上多半是${k}在拿主意，${d}也習慣先聽${k}怎麼說。${k}的影響力很直接，一句話就能改變${d}的決定。`
          : `${k}天生想帶方向，${d}卻不是會乖乖配合的人。主導權在兩人之間來回，誰準備得充分，誰說了算。`;
      break;
    }
    case 'aGeneratesB':
    case 'bGeneratesA': {
      const [g, r] = stemRoles(c);
      p1 =
        leader === r
          ? `${g}付出得多，真正做決定的卻常是${r}：${g}會先問${r}想要什麼，再去把事情辦好。`
          : `這段關係沒有明顯的上下，卻有一種隱性的主導：${g}付出多，話語權自然跟著多，${r}多半樂得被安排。`;
      break;
    }
    case 'he':
      p1 = '兩人的主導權像是輪流的，很少真的爭。誰對那件事比較有感覺，另一個自然就讓。';
      break;
    default:
      p1 = '兩人勢均力敵，誰也不習慣聽誰的。分開管不同的事沒問題，硬要共同決定一件事，就容易僵住。';
  }
  p1 = `${p1}（${stemBasis(c)}）`;

  let p2: string;
  if ((sa === '身旺' && sb === '身弱') || (sa === '身弱' && sb === '身旺')) {
    const [w, k] = sa === '身旺' ? [a.name, b.name] : [b.name, a.name];
    p2 = `${w}底氣足、決定下得快，${k}想得細但容易讓步。久了${k}的意見可能越說越少，這是要留意的失衡。（${w}身旺、${k}身弱）`;
  } else if (sa === '身旺' && sb === '身旺') {
    p2 = '兩人都有主見也都扛得起，誰都不需要被照顧。好處是對等，難處是都不肯先低頭。（兩人皆身旺）';
  } else if (sa === '身弱' && sb === '身弱') {
    p2 = '兩人都不愛強出頭，決定常是商量出來的。好處是尊重，難處是遇到大事時互相等對方開口。（兩人皆身弱）';
  } else if (c.yangA && c.yangB) {
    p2 = '兩人都習慣主動出手，動作快的那個常不知不覺就做了決定。事後補一句「這樣可以嗎」，對等感就在。（日主同為陽干）';
  } else if (!c.yangA && !c.yangB) {
    p2 = '兩人都不太直接下指令，主導常藏在「都可以」背後。真正有意見時，說出來比暗示有用。（日主同為陰干）';
  } else {
    const [yang, yin] = c.yangA ? [a.name, b.name] : [b.name, a.name];
    p2 = `${yang}習慣先開口、先行動，${yin}看似配合，其實用自己的方式把關。明的暗的各占一半。（${yang}陽干、${yin}陰干）`;
  }

  const control = syn.stem.kind === 'aControlsB' || syn.stem.kind === 'bControlsA';
  const even = syn.stem.kind === 'same' || (sa === '身旺' && sb === '身旺');
  const [ctrl, held] = control ? stemRoles(c) : ['', ''];
  const hook = leader
    ? control
      ? '一個帶方向，一個踩煞車'
      : '一個常開口，一個常說好'
    : control
      ? '一個想帶，一個不照單全收'
      : even
        ? '勢均力敵，誰也不讓誰'
        : '主導權，是輪流的';
  const scene =
    leader && follower
      ? `去哪吃、買哪一個，${leader}通常三秒就有答案，${follower}說「好啊」，偶爾其實有別的想法。`
      : control
        ? `${ctrl}提了一個方案，${held}不照單全收，兩人各改一輪，才定下最後的版本。`
        : even
          ? '訂旅館時兩人各看中一間，誰也說服不了誰，最後乾脆各住一晚。'
          : '兩人都說「都可以，看對方」，結果在路口站了五分鐘還沒決定往哪走。';
  const advice =
    leader && follower
      ? `${leader}做決定前先問還有沒有別的想法，${follower}練習先說自己的選項。`
      : control
        ? `大事由${ctrl}先提方案、${held}有否決權，小事誰在場誰決定。`
        : '把事情分區：家裡的事和對外的事各有一個人說了算，每半年互換。';
  return card(
    '關係中的權力與主導權',
    '依兩人日主的生剋（誰影響誰）、各自的強弱與陰陽，看誰比較常拿主意。',
    hook,
    p1,
    p2,
    scene,
    advice,
  );
}

// ---------------------------------------------------------------------------
// 9. 一起財運與共事潛力：兩人財星份量＋月支（做事方式）的關係＋對方是不是自己的財星
// ---------------------------------------------------------------------------

type MoneyLevel = 'h' | 'm' | 'l';

function moneyLevel(chart: BaziChart): MoneyLevel {
  const p = groupPct(chart, '財星');
  return p >= 25 ? 'h' : p <= 10 ? 'l' : 'm';
}

const MONEY_SAME: Record<MoneyLevel, { hook: string; p: string; scene: string; advice: string }> = {
  h: {
    hook: '兩個人都看得到機會',
    p: '兩人對錢都很有感，也都看得到機會，一起理財或做副業很有話聊。要留意的是兩人一起心動時，沒有人喊停。',
    scene: '看到一個投資或團購的機會，兩人越討論越興奮，當晚就想下單。',
    advice: '超過約定金額的支出，要兩人都同意，而且隔一天再決定。',
  },
  m: {
    hook: '可以放心合開帳戶的兩人',
    p: '兩人的金錢觀都算務實，賺多少、花多少心裡有數。一起管錢不太會有大爭執，是能合開帳戶的組合。',
    scene: '一起逛家具店，兩人會各自拿出手機比價，再決定要不要買。',
    advice: '每月花二十分鐘一起看帳，順便訂下個月的一個小目標。',
  },
  l: {
    hook: '錢是拿來把日子過好的',
    p: '兩人都不太被錢綁住，花在體驗和喜歡的事上很乾脆。日子過得開心，但需要有人記得存錢這件事。',
    scene: '月底才發現這個月外食和旅行花了不少，兩人相視一笑說下個月再省。',
    advice: '設一個共同帳戶，每月發薪日各自自動轉一筆進去。',
  },
};

function money(c: Ctx): MeaningItem {
  const { a, b, syn } = c;
  const pa = groupPct(a.chart, '財星');
  const pb = groupPct(b.chart, '財星');
  // 差距不到 8 個百分點就不算「一個重、一個輕」，以兩人的平均來看。
  const close = Math.abs(pa - pb) < 8;
  const avg = (pa + pb) / 2;
  const shared: MoneyLevel = avg >= 25 ? 'h' : avg <= 10 ? 'l' : 'm';
  const la = close ? shared : moneyLevel(a.chart);
  const lb = close ? shared : moneyLevel(b.chart);
  const basis1 = `財星：${a.name} ${pa}%、${b.name} ${pb}%`;
  let hook: string;
  let p1: string;
  let scene: string;
  let advice: string;
  if (la === lb) {
    const m = MONEY_SAME[la];
    hook = m.hook;
    p1 = m.p;
    scene = m.scene;
    advice = m.advice;
  } else {
    const rank = { h: 2, m: 1, l: 0 } as const;
    const [more, less] = rank[la] > rank[lb] ? [a.name, b.name] : [b.name, a.name];
    hook = '一個管帳，一個管生活';
    p1 =
      (la === 'h' && lb === 'l') || (la === 'l' && lb === 'h')
        ? `${more}對錢敏感、想得遠，${less}覺得夠用就好。一個管帳、一個負責讓日子有趣，分工起來其實很搭。`
        : `${more}比較常想到錢的事，${less}相對隨緣。共同的開銷交給${more}規劃，${less}有知情權就好。`;
    scene = `${more}在算這趟旅行的預算，${less}已經在看想吃的餐廳。`;
    advice = `共同開銷由${more}記帳，每月向${less}說明一次。`;
  }

  const monthPair = syn.branchPairs.find((p) => p.pillarA === 'month' && p.pillarB === 'month');
  const mk = monthPair?.relations.map((r) => r.kind) ?? [];
  const isWealth = (g: string) => g === '正財' || g === '偏財';
  let p2: string;
  if (monthPair && mk.includes('liuChong')) {
    p2 = `做事的節奏相反，一個求快、一個求穩。合作前把分工和期限講定，兩種節奏反而能互相把關。（${relText(monthPair)}）`;
  } else if (monthPair && (mk.includes('xing') || mk.includes('hai'))) {
    p2 = `一起做事時都很有想法，容易在細節上各持己見。先分清楚誰負責哪一塊，就不會互相下指導棋。（${relText(monthPair)}）`;
  } else if (monthPair && (mk.includes('liuHe') || mk.includes('banHe'))) {
    p2 = `一起做事很順：一個起頭，另一個自然補位，不太需要開會。當室友、旅伴或合夥人，都是省心的搭檔。（${relText(monthPair)}）`;
  } else if (monthPair && mk.includes('ziXing')) {
    p2 = `兩人做事的習慣很像，優點加倍，盲點也加倍。合作時找第三個人幫忙看一眼，會更保險。（${relText(monthPair)}）`;
  } else if (isWealth(syn.tenGodBForA) || isWealth(syn.tenGodAForB)) {
    const [s, o, god] = isWealth(syn.tenGodBForA)
      ? [a.name, b.name, syn.tenGodBForA]
      : [b.name, a.name, syn.tenGodAForB];
    p2 = `${s}和${o}合作時特別有幹勁，也願意為兩人的生活多賺一點。${o}的存在，讓${s}對未來更有規劃。（${o}是${s}的${god}）`;
  } else {
    switch (syn.stem.kind) {
      case 'he':
        p2 = '兩人合作有默契，對外口徑很容易一致。當合夥人時，一個主內、一個主外最順。';
        break;
      case 'same':
        p2 = '兩人能力相近，適合各管一塊、各自負責成果。錢和功勞算清楚，合作才會長久。';
        break;
      case 'aGeneratesB':
      case 'bGeneratesA': {
        const [g, r] = stemRoles(c);
        p2 = `共事時${g}常是出力打底的那個，${r}負責把成果發揮出來。記得讓功勞兩邊都算得到。`;
        break;
      }
      default: {
        const [k, d] = stemRoles(c);
        p2 = `共事時${k}適合定標準、抓進度，${d}適合執行和補細節。角色清楚，效率就高。`;
      }
    }
    p2 = `${p2}（${stemBasis(c)}）`;
  }
  return card(
    '一起財運與共事',
    '依兩人盤中財星的份量、月支（做事方式）之間的關係，以及對方是不是自己的財星。',
    hook,
    `${p1}（${basis1}）`,
    p2,
    scene,
    advice,
  );
}

// ---------------------------------------------------------------------------
// 10. 初見印象與深交後的反轉：年干（第一印象）之間的關係 vs 日柱（真實相處）
// ---------------------------------------------------------------------------

type YearKind = 'he' | 'same' | 'generate' | 'control';

function yearRelation(ganA: string, ganB: string): { kind: YearKind; aActive: boolean } | null {
  const wa = STEM_WX[ganA];
  const wb = STEM_WX[ganB];
  if (!wa || !wb) return null;
  if (STEM_HE.some(([x, y]) => (x === ganA && y === ganB) || (x === ganB && y === ganA)))
    return { kind: 'he', aActive: true };
  const i = WX_ORDER.indexOf(wa);
  const j = WX_ORDER.indexOf(wb);
  if (i === j) return { kind: 'same', aActive: true };
  if ((i + 1) % 5 === j) return { kind: 'generate', aActive: true };
  if ((j + 1) % 5 === i) return { kind: 'generate', aActive: false };
  if ((i + 2) % 5 === j) return { kind: 'control', aActive: true };
  return { kind: 'control', aActive: false };
}

const YEAR_KIND_NAME: Record<YearKind, string> = {
  he: '相合',
  same: '同類',
  generate: '相生',
  control: '相剋',
};

type Arc = 'easyEasy' | 'easySpark' | 'tenseEasy' | 'tenseSpark' | 'difficult';

const ARC: Record<Arc, { hook: string; p: string; scene: string; advice: string }> = {
  easyEasy: {
    hook: '初見與深交，是同一個人',
    p: '熟了以後，這份好感沒有打折，只是從新鮮變成習慣。濾鏡褪去後看到的，和當初想像的差不多。',
    scene: '認識很久了，朋友還是說：這兩個人跟剛認識時一樣。',
    advice: '每年做一件剛認識時常做的事，提醒彼此當初的樣子。',
  },
  easySpark: {
    hook: '第一印象的順，只是開場',
    p: '熟了以後才發現，兩人骨子裡比外表看起來更有稜角。初見的順是禮貌，深交後的磨，才是真正認識對方。',
    scene: '第一次吵架時，兩人都愣了一下：原來對方也有這麼堅持的一面。',
    advice: '發現對方和想像不同時，先問「還有什麼是沒說過的」。',
  },
  tenseEasy: {
    hook: '慢熱型，越熟越對味',
    p: '熟了以後反而越來越順，當初的距離感慢慢變成信任。這一對是慢熱型，越相處越有味道。',
    scene: '回想第一次見面，兩人都笑說：當時完全沒想到會變這麼熟。',
    advice: '別太早下定論，重要的決定至少等相處滿一年再做。',
  },
  tenseSpark: {
    hook: '那股張力，從第一天就在',
    p: '熟了以後，當初感覺到的那股張力還在，只是從好奇變成日常的拉扯。好處是，彼此從來不必裝。',
    scene: '熟了之後的爭執，其實在第一次見面的對話裡就有影子了。',
    advice: '把最常拉扯的一件事挑出來，約定一個兩人都能接受的做法。',
  },
  difficult: {
    hook: '濾鏡褪去後，才是考題',
    p: '坦白說，深交後的落差會比多數伴侶明顯：生活步調與說話方式常對不上。看清這一點再決定怎麼相處，比硬撐好。',
    scene: '剛認識時覺得可愛的小習慣，同住三個月後變成最常吵的事。',
    advice: '重大承諾前，先一起住或長途旅行一次，再坐下來談。',
  },
};

function firstVsDeep(c: Ctx): MeaningItem | null {
  const { a, b, syn } = c;
  const ya = pillarOf(a.chart, 'year');
  const yb = pillarOf(b.chart, 'year');
  const rel = ya && yb ? yearRelation(ya.gan, yb.gan) : null;
  if (!ya || !yb || !rel) return null;
  const [act, pas] = rel.aActive ? [a.name, b.name] : [b.name, a.name];
  const first: Record<YearKind, string> = {
    he: '剛認識時兩人就有種說不出的投緣，不用找話題也聊得起來。第一印象是：這個人跟我很合。',
    same: '剛認識時兩人覺得彼此很像，背景、說話方式都有熟悉感。第一印象是：這個人我看得懂。',
    generate: `剛認識時${act}很自然地照顧${pas}，${pas}也覺得被放在心上。第一印象是：相處起來很舒服。`,
    control: `剛認識時${act}的氣場讓${pas}印象很深，帶點距離，也帶點好奇。第一印象是：這個人不太一樣。`,
  };
  const firstEasy = rel.kind !== 'control';
  const stemClash = syn.stem.kind === 'aControlsB' || syn.stem.kind === 'bControlsA';
  const dayHe = c.dayKinds.includes('liuHe') || c.dayKinds.includes('banHe');
  const deepSpark =
    c.dayKinds.includes('liuChong') || c.dayKinds.includes('xing') || (stemClash && !dayHe);
  const arc: Arc = c.difficult
    ? 'difficult'
    : firstEasy
      ? deepSpark
        ? 'easySpark'
        : 'easyEasy'
      : deepSpark
        ? 'tenseSpark'
        : 'tenseEasy';
  const x = ARC[arc];
  const dayBasis = syn.dayPair ? `，${relText(syn.dayPair)}` : '';
  return card(
    '初見印象與深交後的反轉',
    '依兩人年柱（給外人的第一印象）之間的關係，對照日柱（熟了以後的真實相處）。',
    x.hook,
    `${first[rel.kind]}（年干${ya.gan}、${yb.gan}${YEAR_KIND_NAME[rel.kind]}）`,
    `${x.p}（${stemBasis(c)}${dayBasis}）`,
    x.scene,
    x.advice,
  );
}

/** Cards placed before 日常相處 (themes 1–4) and after it (themes 6–10), in guideline order. */
export function baziPairCards(
  a: BaziPartner,
  b: BaziPartner,
  syn: BaziSynastry,
): { before: MeaningItem[]; after: MeaningItem[] } {
  const c = buildCtx(a, b, syn);
  const keep = (xs: Array<MeaningItem | null>) => xs.filter((x): x is MeaningItem => x !== null);
  return {
    before: keep([shine(c), friction(c), inner(c), lesson(c)]),
    after: keep([fight(c), battery(c), power(c), money(c), firstVsDeep(c)]),
  };
}
