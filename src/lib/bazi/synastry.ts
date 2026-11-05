import type { PartnerKey } from '@/lib/hd/synastry';
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

const TEN_GOD_ROLE: Record<string, string> = {
  比肩: '像平起平坐的夥伴，價值觀相近',
  劫財: '像會競爭、也會分享的同伴',
  食神: '是讓你放鬆、想照顧與分享的對象',
  傷官: '會激發你的創意，也會讓你想挑戰規矩',
  正財: '是讓你踏實、想好好經營的對象',
  偏財: '帶來新鮮感與機會感',
  正官: '讓你變得自律、有責任感',
  七殺: '帶給你壓力，也激發你的魄力',
  正印: '像長輩般支持、包容你',
  偏印: '能給你獨特的啟發，但不一定好懂',
};

const BRANCH_NOTE: Record<BranchRelationKind, string> = {
  liuHe: '和合、親近，相處容易有默契與好感',
  liuChong: '衝擊與變動，個性或步調相反；沖也代表互相激盪、離不開又常碰撞',
  banHe: '同氣相求，容易有共同目標與合作感',
  xing: '摩擦與彼此要求，容易在小事上較勁，說話方式要特別留意',
  hai: '暗中的不舒服或誤會，不一定說出口，要多溝通確認',
  ziXing: '兩人有同樣的地支，同樣的弱點容易互相放大',
};

function relationText(r: BranchRelation, zhiA: string, zhiB: string): string {
  const name = BRANCH_RELATION_NAMES[r.kind];
  if (r.kind === 'banHe') return `${zhiA}${zhiB}半合（${r.wx}局）`;
  if (r.kind === 'ziXing') return `${zhiA}${zhiB}自刑`;
  return `${zhiA}${zhiB}${name}`;
}

function pairLine(p: PillarPairRelation, a: BaziPartner, b: BaziPartner): string {
  const rels = p.relations.map((r) => relationText(r, p.zhiA, p.zhiB)).join('、');
  const notes = p.relations.map((r) => BRANCH_NOTE[r.kind]).join('；');
  return `${a.name}${PILLAR_NAMES[p.pillarA]}${p.zhiA} × ${b.name}${PILLAR_NAMES[p.pillarB]}${p.zhiB}：${rels}。${notes}。`;
}

function stemText(a: BaziPartner, b: BaziPartner, syn: BaziSynastry): string {
  const ga = syn.dayGanA;
  const gb = syn.dayGanB;
  const wa = STEM_WX[ga];
  const wb = STEM_WX[gb];
  switch (syn.stem.kind) {
    case 'he':
      return `${ga}${gb}天干五合（合化${syn.stem.hua}）：日主相合是傳統合婚很看重的組合，彼此有天然的吸引與默契，容易「看對眼」，相處久了也會互相影響。`;
    case 'same':
      return `兩人日主同屬${wa}，像朋友與戰友，價值觀相近、容易互相理解；也容易各有主見、互不相讓，分工清楚會更順。`;
    case 'aGeneratesB':
      return `${a.name}的${ga}${wa}生${b.name}的${gb}${wb}：${a.name}容易照顧、付出，${b.name}在關係裡被支持與滋養。給的一方也需要被看見與回饋，才不會累。`;
    case 'bGeneratesA':
      return `${b.name}的${gb}${wb}生${a.name}的${ga}${wa}：${b.name}容易照顧、付出，${a.name}在關係裡被支持與滋養。給的一方也需要被看見與回饋，才不會累。`;
    case 'aControlsB':
      return `${a.name}的${ga}${wa}剋${b.name}的${gb}${wb}：${a.name}對${b.name}有約束、想掌握的力量。剋在八字裡也代表吸引（男命以所剋為財、為妻，女命以剋我者為官、為夫），不一定是壞事，但${a.name}說話要留點餘地。`;
    case 'bControlsA':
      return `${b.name}的${gb}${wb}剋${a.name}的${ga}${wa}：${b.name}對${a.name}有約束、想掌握的力量。剋在八字裡也代表吸引（男命以所剋為財、為妻，女命以剋我者為官、為夫），不一定是壞事，但${b.name}說話要留點餘地。`;
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
        syn.tenGodBForA
          ? `對${a.name}來說，${b.name}的日干是「${syn.tenGodBForA}」，${(TEN_GOD_ROLE[syn.tenGodBForA] ?? '').replace(/你/g, a.name)}。`
          : '',
        syn.tenGodAForB
          ? `對${b.name}來說，${a.name}的日干是「${syn.tenGodAForB}」，${(TEN_GOD_ROLE[syn.tenGodAForB] ?? '').replace(/你/g, b.name)}。`
          : '',
      ]
        .filter(Boolean)
        .join('\n'),
    ),
  );

  const keyLines: string[] = [];
  const dayZhiA = a.chart.pillars.find((p) => p.key === 'day')?.zhi;
  const dayZhiB = b.chart.pillars.find((p) => p.key === 'day')?.zhi;
  if (syn.dayPair) {
    keyLines.push(`日支是夫妻宮（配偶宮），最能反映兩人親密相處的感覺。${pairLine(syn.dayPair, a, b)}`);
  } else if (dayZhiA && dayZhiB) {
    keyLines.push(
      `日支（夫妻宮）${dayZhiA} × ${dayZhiB}：沒有明顯的合沖刑害，親密相處的感覺比較平穩，好壞多靠日常經營。`,
    );
  }
  const yearZhiA = a.chart.pillars.find((p) => p.key === 'year')?.zhi;
  const yearZhiB = b.chart.pillars.find((p) => p.key === 'year')?.zhi;
  if (syn.yearPair) {
    keyLines.push(
      `年支是生肖（${a.chart.shengXiao} × ${b.chart.shengXiao}），反映家庭背景與整體氛圍。${pairLine(syn.yearPair, a, b)}`,
    );
  } else if (yearZhiA && yearZhiB) {
    keyLines.push(
      `生肖 ${a.chart.shengXiao}（${yearZhiA}）× ${b.chart.shengXiao}（${yearZhiB}）：沒有明顯的合沖刑害，家庭背景與整體氛圍不太互相牽動。`,
    );
  }
  items.push(item('夫妻宮與生肖', '日支（夫妻宮）與年支（生肖）的合沖刑害，合婚時最先看的兩組地支。', keyLines.join('\n')));

  const others = syn.branchPairs.filter((p) => p !== syn.dayPair && p !== syn.yearPair);
  const otherLines = others.map((p) => pairLine(p, a, b));
  if (syn.sanHe.length > 0) {
    otherLines.push(
      `兩盤地支合起來湊成三合${syn.sanHe.map((wx) => `${wx}局`).join('、')}：這股力量只有兩人在一起時才完整，是共同目標與合作的來源。`,
    );
  }
  const unknown = [a, b].filter((p) => p.chart.timeUnknown).map((p) => p.name);
  items.push(
    item(
      '其他地支互動',
      '兩盤其餘各柱地支之間的六合、六沖、半合、刑、害。',
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
  if (syn.bHelpsA.length > 0)
    wxLines.push(`${a.name}的喜用五行（${syn.bHelpsA.join('、')}）在${b.name}盤中很旺：${b.name}容易帶給${a.name}需要的能量，相處時${a.name}常覺得被補足。`);
  if (syn.aHelpsB.length > 0)
    wxLines.push(`${b.name}的喜用五行（${syn.aHelpsB.join('、')}）在${a.name}盤中很旺：${a.name}容易帶給${b.name}需要的能量，相處時${b.name}常覺得被補足。`);
  if (syn.bFillsA.length > 0)
    wxLines.push(`${a.name}盤中極少的${syn.bFillsA.join('、')}，${b.name}剛好很多，能補上${a.name}比較陌生的面向。`);
  if (syn.aFillsB.length > 0)
    wxLines.push(`${b.name}盤中極少的${syn.aFillsB.join('、')}，${a.name}剛好很多，能補上${b.name}比較陌生的面向。`);
  if (
    syn.bHelpsA.length + syn.aHelpsB.length + syn.bFillsA.length + syn.aFillsB.length ===
    0
  ) {
    wxLines.push('兩人的五行沒有明顯的互補，各自的強項相近或分散；彼此的支持比較多來自相處方式，而不是五行本身。');
  }
  items.push(item('五行互補', '一方需要（喜用神）或缺少的五行，是否正是另一方的旺五行。', wxLines.join('\n')));

  items.push(item('相處建議', '依日主、地支與五行整理的提醒。', adviceLines(a, b, syn).join('\n')));
  return items;
}

function adviceLines(a: BaziPartner, b: BaziPartner, syn: BaziSynastry): string[] {
  const lines: string[] = [];
  const all = syn.branchPairs.flatMap((p) => p.relations.map((r) => r.kind));
  if (all.includes('liuChong'))
    lines.push('有六沖的柱位代表步調或立場相反，遇到衝突先停一下，確認彼此真正在意的是什麼。');
  if (all.includes('xing') || all.includes('hai'))
    lines.push('刑與害多半表現在小事與語氣上，說話時對事不對人，覺得不舒服就早點講。');
  if (all.includes('liuHe') || all.includes('banHe') || syn.stem.kind === 'he')
    lines.push('相合的部分是兩人的默契所在，多安排能發揮這份默契的共同活動。');
  const giver: PartnerKey | null =
    syn.stem.kind === 'aGeneratesB' ? 'a' : syn.stem.kind === 'bGeneratesA' ? 'b' : null;
  if (giver) {
    const [g, r] = giver === 'a' ? [a.name, b.name] : [b.name, a.name];
    lines.push(`${g}常是付出的一方，${r}記得表達感謝與回饋，關係才平衡。`);
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

  return `請依下列兩人的八字命盤，用繁體中文做合盤（合婚）解讀。

解讀原則：
- 以兩人日主的生剋合化、日支（夫妻宮）與年支（生肖）的合沖刑害為主軸，再看五行是否互補。
- 這是命盤結構說明，不是合不合的判決；請給可實踐的相處建議，避免恐嚇或保證。

## 兩人命盤
${chartBlock(a)}

${chartBlock(b)}

## 合盤摘要
- 日主：${syn.dayGanA} × ${syn.dayGanB}；對${a.name}而言${b.name}是「${syn.tenGodBForA}」，對${b.name}而言${a.name}是「${syn.tenGodAForB}」
- 兩盤合成的三合局：${syn.sanHe.map((wx) => `${wx}局`).join('、') || '無'}
${pairs}

請先總覽兩人的日主組合，再分「吸引與默契」「衝突與磨合」「五行互補與生活建議」說明，最後給兩人各 3 條相處提醒。`;
}
