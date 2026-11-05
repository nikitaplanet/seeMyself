import type { PartnerKey } from '@/lib/hd/synastry';
import { STAR_TRAIT, type MeaningItem } from '@/lib/ui/personMeaning';
import { displayPalaceName, MUTAGEN_ORDER, PALACE_ORDER } from './labels';
import type { ZiweiChart, ZiweiPalace } from './types';

// 紫微雙人合盤 — pure logic, no React. Built only from data the single chart already has:
//   - both 命宮 main stars and 五行局;
//   - 宮位對照: iztro palace index is fixed by earthly branch (0 = 寅), so A's 命宮 index points at
//     the palace with the same branch in B's chart;
//   - 生年四化飛入: A's four 生年四化 stars are looked up in B's chart, giving the B palace each one
//     lands in (and vice versa). 命、夫妻、交友（僕役）、福德 are flagged as the key palaces.

export type Element = '木' | '火' | '土' | '金' | '水';

const ELEMENTS: readonly Element[] = ['木', '火', '土', '金', '水'];

export type ElementRelation = 'same' | 'aGeneratesB' | 'bGeneratesA' | 'aControlsB' | 'bControlsA';

/** 「土五局」→ 土 */
export function bureauElement(fiveElementsClass: string): Element | null {
  const ch = fiveElementsClass.charAt(0);
  return (ELEMENTS as readonly string[]).includes(ch) ? (ch as Element) : null;
}

export function elementRelation(a: Element, b: Element): ElementRelation {
  const i = ELEMENTS.indexOf(a);
  const j = ELEMENTS.indexOf(b);
  if (i === j) return 'same';
  if ((i + 1) % 5 === j) return 'aGeneratesB';
  if ((j + 1) % 5 === i) return 'bGeneratesA';
  if ((i + 2) % 5 === j) return 'aControlsB';
  return 'bControlsA';
}

export const KEY_PALACES: readonly string[] = ['命宮', '夫妻', '僕役', '福德'];

export interface ZiweiMutagenFlight {
  from: PartnerKey;
  star: string;
  mutagen: string;
  /** iztro palace name in the other person's chart, null if the star is not on that chart. */
  palace: string | null;
  key: boolean;
}

export interface ZiweiSynastry {
  soulA: ZiweiPalace | null;
  soulB: ZiweiPalace | null;
  /** B's palace (iztro name) that sits on A's 命宮 branch, and vice versa. */
  soulAInB: string | null;
  soulBInA: string | null;
  elementA: Element | null;
  elementB: Element | null;
  relation: ElementRelation | null;
  flights: ZiweiMutagenFlight[];
}

function palaceOfStar(chart: ZiweiChart, star: string): ZiweiPalace | undefined {
  return chart.palaces.find((p) =>
    [...p.majorStars, ...p.minorStars].some((s) => s.name === star),
  );
}

function flightsOf(from: PartnerKey, src: ZiweiChart, dst: ZiweiChart): ZiweiMutagenFlight[] {
  return [...src.mutagens]
    .sort(
      (x, y) =>
        MUTAGEN_ORDER.indexOf(x.mutagen as (typeof MUTAGEN_ORDER)[number]) -
        MUTAGEN_ORDER.indexOf(y.mutagen as (typeof MUTAGEN_ORDER)[number]),
    )
    .map((m) => {
      const at = palaceOfStar(dst, m.star);
      const palace = at?.name ?? null;
      return {
        from,
        star: m.star,
        mutagen: m.mutagen,
        palace,
        key: palace !== null && KEY_PALACES.includes(palace),
      };
    });
}

export function analyzeZiweiSynastry(a: ZiweiChart, b: ZiweiChart): ZiweiSynastry {
  const soulA = a.palaces.find((p) => p.isSoulPalace) ?? null;
  const soulB = b.palaces.find((p) => p.isSoulPalace) ?? null;
  const elementA = bureauElement(a.fiveElementsClass);
  const elementB = bureauElement(b.fiveElementsClass);
  return {
    soulA,
    soulB,
    soulAInB: soulA ? (b.palaces.find((p) => p.index === soulA.index)?.name ?? null) : null,
    soulBInA: soulB ? (a.palaces.find((p) => p.index === soulB.index)?.name ?? null) : null,
    elementA,
    elementB,
    relation: elementA && elementB ? elementRelation(elementA, elementB) : null,
    flights: [...flightsOf('a', a, b), ...flightsOf('b', b, a)],
  };
}

// ---------------------------------------------------------------------------
// Report text
// ---------------------------------------------------------------------------

export interface ZiweiPartner {
  name: string;
  chart: ZiweiChart;
  timeUnknown: boolean;
}

/** What it means when person X's 命宮 falls on this palace of Y's chart. */
const SOUL_OVERLAY: Record<string, (x: string, y: string) => string> = {
  命宮: () => '兩人命宮同一個宮位，看事情的角度相近，很容易懂彼此；也因為太像，彼此的缺點會看得特別清楚。',
  兄弟: (x, y) => `${x}在${y}眼中像手足或同儕，相處平起平坐，適合一起合作、互相支援。`,
  夫妻: (x, y) => `${y}容易把${x}視為伴侶型的人，感情上的吸引力與期待都比較強。`,
  子女: (x, y) => `${y}容易想照顧${x}，或和${x}一起創造些什麼；${x}在${y}眼中帶點晚輩的可愛。`,
  財帛: (x, y) => `${x}和${y}的金錢、資源連結較深，一起理財或合作生意時影響特別明顯。`,
  疾厄: (x, y) => `${x}和${y}的身心狀態連動深，親近也容易互相牽動；相處時留意別互相消耗。`,
  遷移: () => '兩人命宮正好相對，個性常互補，容易互相吸引，也容易立場相反；把差異當成視野，而不是對立。',
  僕役: (x, y) => `${y}容易把${x}當朋友、夥伴，相處自在、輕鬆，也很適合一起社交。`,
  官祿: (x, y) => `${x}容易在工作與志向上影響${y}，兩人很適合談事業、一起做事。`,
  田宅: (x, y) => `${y}和${x}在一起有家人般的熟悉與安定感，很適合一起經營生活。`,
  福德: (x, y) => `${x}能帶給${y}精神上的滿足與放鬆，${y}和${x}在一起時心比較安。`,
  父母: (x, y) => `${x}在${y}眼中帶點長輩、上司或指導者的味道，${y}容易聽${x}的建議，也可能覺得被管。`,
};

/** 化X 飛入對方某宮：對對方那一塊的作用。 */
const MUTAGEN_GIVE: Record<string, string> = {
  祿: '容易帶來好感、順利與實質的付出，是緣分與甜頭所在',
  權: '會想主導、給推力，幫對方撐起來，也可能讓對方覺得被管',
  科: '能帶來理性的支持、好名聲與體面，是貴人式的幫忙',
  忌: '特別在意、放不下，最容易讓對方感到壓力或虧欠；是緣分最深、也最需要經營的地方',
};

/** The other person's area each palace stands for. */
const PALACE_AREA: Record<string, string> = {
  命宮: '自我與整體人生',
  兄弟: '手足與合作夥伴',
  夫妻: '感情與親密關係',
  子女: '子女、創作與晚輩',
  財帛: '金錢與收入',
  疾厄: '身心狀態',
  遷移: '外出發展與對外舞台',
  僕役: '朋友圈與社交',
  官祿: '工作與事業',
  田宅: '家與生活根基',
  福德: '內心滿足與精神享受',
  父母: '長輩、上司與文書',
};

const RELATION_NOTE = (
  a: ZiweiPartner,
  b: ZiweiPartner,
  ea: Element,
  eb: Element,
): Record<ElementRelation, string> => ({
  same: `兩人五行局同屬${ea}，步調與處事節奏相近，容易有共識；缺點是同樣的弱點也會一起放大。`,
  aGeneratesB: `${a.name}的${ea}生${b.name}的${eb}：${a.name}較常是給予、支持的一方，${b.name}在這段關係裡容易被滋養。給的一方也需要被回饋，才不會累。`,
  bGeneratesA: `${b.name}的${eb}生${a.name}的${ea}：${b.name}較常是給予、支持的一方，${a.name}在這段關係裡容易被滋養。給的一方也需要被回饋，才不會累。`,
  aControlsB: `${a.name}的${ea}剋${b.name}的${eb}：${a.name}在相處中容易站在主導或要求的位置，${b.name}可能感到壓力。剋也代表約束與磨練，說話留點餘地，就能變成互相砥礪。`,
  bControlsA: `${b.name}的${eb}剋${a.name}的${ea}：${b.name}在相處中容易站在主導或要求的位置，${a.name}可能感到壓力。剋也代表約束與磨練，說話留點餘地，就能變成互相砥礪。`,
});

function item(term: string, field: string, meaning: string): MeaningItem {
  return { term, field, meaning };
}

function soulStarsText(chart: ZiweiChart, soul: ZiweiPalace | null): string {
  if (!soul) return '（無資料）';
  if (soul.majorStars.length > 0) {
    return soul.majorStars
      .map((s) => {
        const trait = STAR_TRAIT[s.name];
        return `${s.name}${s.mutagen ? `化${s.mutagen}` : ''}${trait ? `（${trait}）` : ''}`;
      })
      .join('、');
  }
  const opp = chart.palaces.find((p) => p.index === (soul.index + 6) % 12);
  const borrowed = opp?.majorStars.map((s) => s.name) ?? [];
  return borrowed.length > 0 ? `空宮，借對宮${borrowed.join('、')}` : '空宮';
}

function flightLine(f: ZiweiMutagenFlight, a: ZiweiPartner, b: ZiweiPartner): string {
  const [from, to] = f.from === 'a' ? [a.name, b.name] : [b.name, a.name];
  if (!f.palace) return `${from}的${f.star}化${f.mutagen}：${to}的盤上沒有這顆星。`;
  const area = PALACE_AREA[f.palace] ?? '這一塊';
  const mark = f.key ? '★ ' : '';
  return `${mark}${from}的${f.star}化${f.mutagen} → ${to}的${displayPalaceName(f.palace)}：${from}在${to}的${area}上，${MUTAGEN_GIVE[f.mutagen] ?? '有明顯的作用'}。`;
}

export function ziweiSynastryItems(
  a: ZiweiPartner,
  b: ZiweiPartner,
  syn: ZiweiSynastry,
): MeaningItem[] {
  const items: MeaningItem[] = [];
  const caveat =
    a.timeUnknown || b.timeUnknown
      ? `\n${[a, b]
          .filter((p) => p.timeUnknown)
          .map((p) => p.name)
          .join('、')}的出生時間不確定，命宮與各星落宮都可能不同，以下宮位對照僅供參考。`
      : '';

  items.push(
    item(
      '命宮主星',
      '兩人命宮的主星，是各自的基本性格；放在一起看彼此的互補與相似。',
      [
        `${a.name}：${soulStarsText(a.chart, syn.soulA)}`,
        `${b.name}：${soulStarsText(b.chart, syn.soulB)}`,
      ].join('\n') + caveat,
    ),
  );

  if (syn.elementA && syn.elementB && syn.relation) {
    items.push(
      item(
        '五行局',
        '五行局代表各自的節奏與底色，看兩人之間是相生、相剋或同類。',
        [
          `${a.name}：${a.chart.fiveElementsClass}；${b.name}：${b.chart.fiveElementsClass}。`,
          RELATION_NOTE(a, b, syn.elementA, syn.elementB)[syn.relation],
        ].join('\n'),
      ),
    );
  }

  const overlay: string[] = [];
  if (syn.soulAInB) {
    overlay.push(
      `${a.name}的命宮落在${b.name}盤的${displayPalaceName(syn.soulAInB)}：${SOUL_OVERLAY[syn.soulAInB]?.(a.name, b.name) ?? ''}`,
    );
  }
  if (syn.soulBInA) {
    overlay.push(
      `${b.name}的命宮落在${a.name}盤的${displayPalaceName(syn.soulBInA)}：${SOUL_OVERLAY[syn.soulBInA]?.(b.name, a.name) ?? ''}`,
    );
  }
  if (overlay.length > 0) {
    items.push(
      item(
        '命宮對照',
        '把一人的命宮地支放到另一人的盤上，看自己在對方生命中扮演的角色。',
        overlay.join('\n'),
      ),
    );
  }

  const flights = syn.flights.filter((f) => f.palace !== null);
  if (flights.length > 0) {
    const keyCount = flights.filter((f) => f.key).length;
    items.push(
      item(
        '四化互飛',
        '一人的生年四化星落在另一人的哪一宮。★ 表示落在命宮、夫妻宮、交友宮、福德宮這幾個關係最直接的宮位。',
        [
          ...flights.map((f) => flightLine(f, a, b)),
          keyCount > 0
            ? `共有 ${keyCount} 條四化落在關係最直接的宮位，兩人的緣分感會比較明顯。`
            : '四化都沒有落在命、夫妻、交友、福德這幾宮，兩人的互動較多透過生活其他面向展開。',
        ].join('\n'),
      ),
    );
  }

  items.push(item('相處建議', '依上面的四化與命宮對照整理的提醒。', adviceLines(a, b, syn).join('\n')));
  return items;
}

function adviceLines(a: ZiweiPartner, b: ZiweiPartner, syn: ZiweiSynastry): string[] {
  const lines: string[] = [];
  const name = (k: PartnerKey) => (k === 'a' ? a.name : b.name);
  const other = (k: PartnerKey) => (k === 'a' ? b.name : a.name);
  for (const f of syn.flights) {
    if (!f.palace) continue;
    if (f.mutagen === '祿' && f.key)
      lines.push(`${name(f.from)}的化祿進入${other(f.from)}的${displayPalaceName(f.palace)}，是這段關係的甜頭，自然地付出就好。`);
    if (f.mutagen === '忌') {
      lines.push(
        `${name(f.from)}的化忌進入${other(f.from)}的${displayPalaceName(f.palace)}：${name(f.from)}在${other(f.from)}的${PALACE_AREA[f.palace] ?? '這一塊'}上容易太在意或放不下，留意別把關心變成壓力。`,
      );
    }
  }
  lines.push('四化互飛描述的是互相影響的方向，不是誰欠誰；把它當成溝通的話題，比當成定論更有用。');
  return lines;
}

// ---------------------------------------------------------------------------
// AI prompt
// ---------------------------------------------------------------------------

function chartBlock(p: ZiweiPartner): string {
  const c = p.chart;
  const palaces = PALACE_ORDER.map((n) => c.palaces.find((x) => x.name === n))
    .filter((x): x is ZiweiPalace => x !== undefined)
    .map((x) => {
      const major = x.majorStars.map((s) => `${s.name}${s.mutagen ? `化${s.mutagen}` : ''}`).join('、');
      return `- ${displayPalaceName(x.name)}（${x.heavenlyStem}${x.earthlyBranch}）：${major || '空宮'}`;
    })
    .join('\n');
  return `### ${p.name}
- 性別：${c.yinYangGender}；生肖：${c.zodiac}
- 陽曆：${c.solarDateLabel}${p.timeUnknown ? '（出生時間不確定）' : ''}
- 時辰：${c.timing.timeName}（${c.timing.timeRange}）
- 五行局：${c.fiveElementsLabel}；命主：${c.soul}；身主：${c.body}
- 生年四化：${c.mutagens.map((m) => `${m.star}化${m.mutagen}`).join('、') || '（無）'}
${palaces}`;
}

export function buildZiweiSynastryAiPrompt(
  a: ZiweiPartner,
  b: ZiweiPartner,
  syn: ZiweiSynastry,
): string {
  const flights =
    syn.flights
      .filter((f) => f.palace)
      .map((f) => {
        const [from, to] = f.from === 'a' ? [a.name, b.name] : [b.name, a.name];
        return `- ${from}的${f.star}化${f.mutagen} → ${to}的${displayPalaceName(f.palace ?? '')}`;
      })
      .join('\n') || '- （無）';
  const overlay = [
    syn.soulAInB ? `- ${a.name}的命宮落在${b.name}的${displayPalaceName(syn.soulAInB)}` : '',
    syn.soulBInA ? `- ${b.name}的命宮落在${a.name}的${displayPalaceName(syn.soulBInA)}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  return `請依下列兩人的紫微斗數本命盤，用繁體中文做雙人合盤解讀。

解讀原則：
- 派別為通行版本（三合派），宮名用「交友宮／事業宮」。
- 以兩人命宮主星、五行局，以及生年四化飛入對方命盤的宮位為主軸（特別是命宮、夫妻宮、交友宮、福德宮）。
- 這是命盤結構說明，不是關係好壞的判決；請給可實踐的相處建議，避免恐嚇或保證。

## 兩人命盤
${chartBlock(a)}

${chartBlock(b)}

## 命宮對照
${overlay || '- （無）'}

## 四化互飛
${flights}

請先總覽兩人的性格組合，再分「吸引與緣分」「相處與溝通」「容易卡住的地方」「合作（感情、朋友、工作）」說明，最後給兩人各 3 條相處提醒。`;
}
