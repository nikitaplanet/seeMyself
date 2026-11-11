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

/** What it means when person X's 命宮 falls on this palace of Y's chart (X plays this role in Y's life). */
const SOUL_OVERLAY: Record<string, (x: string, y: string) => string> = {
  命宮: (x, y) =>
    `兩人命宮在同一個地支，看事情的角度很像，常常不用解釋就懂；也因為太像，${x}的缺點${y}一眼就看穿，容易互相挑剔。`,
  兄弟: (x, y) =>
    `${x}在${y}的生命裡像手足或同學，相處平起平坐、可以互相吐槽，一起做事分工很自然，浪漫感則要刻意經營。`,
  夫妻: (x, y) =>
    `${x}正好落在${y}的感情宮位，${y}容易一見面就把${x}當成「可能的另一半」來看，吸引力強，期待也高。`,
  子女: (x, y) =>
    `${y}看${x}帶點看晚輩的疼愛，會想照顧、想教${x}；一起養寵物、做作品或經營共同興趣特別有共鳴。`,
  財帛: (x, y) =>
    `${x}和${y}的錢與資源綁得較緊，${x}常牽動${y}怎麼賺、怎麼花；一起理財或創業時影響最明顯。`,
  疾厄: (x, y) =>
    `${x}很容易影響${y}的身體與情緒，${y}在${x}身邊特別放鬆，也特別容易被${x}的情緒帶著走。`,
  遷移: (x, y) =>
    `兩人命宮正好相對，個性常是一動一靜、一內一外，互補又互相吸引；${x}像替${y}打開一扇對外的窗，立場也容易相反。`,
  僕役: (x, y) =>
    `${y}把${x}當成朋友圈裡的自己人，相處自在不拘束，很適合一起聚會、旅行；要走向戀人，需要多一點刻意的浪漫。`,
  官祿: (x, y) =>
    `${x}對${y}的工作和志向很有影響，兩人聊事業特別起勁，${x}常是${y}職涯上的推手或搭檔。`,
  田宅: (x, y) =>
    `${x}給${y}家人般的熟悉感，和${x}在一起像回到家，很適合同住、一起布置生活。`,
  福德: (x, y) =>
    `${x}正好落在${y}的精神宮位，${y}和${x}在一起心比較安、比較快樂，${x}的一舉一動也特別牽動${y}的心情。`,
  父母: (x, y) =>
    `${x}在${y}眼中帶點長輩或主管的味道，${y}願意聽${x}的建議，有時也會覺得被管、被唸。`,
};

/**
 * 命宮互落是成對出現的（兄弟↔父母、夫妻↔福德、子女↔田宅、財帛↔官祿、疾厄↔僕役），
 * key 是「x 的命宮在 y 盤的宮位」，用來寫一句兩人合起來看的總結。
 */
const SOUL_PAIR_NOTE: Record<string, (x: string, y: string) => string> = {
  父母: (x, y) =>
    `合起來看：${x}對${y}來說像給方向的前輩，${y}對${x}來說像並肩的夥伴；一個習慣帶、一個願意跟，角色清楚就很穩。`,
  夫妻: (x, y) =>
    `合起來看：${x}讓${y}心動，${y}讓${x}心安；一邊是吸引，一邊是陪伴與療癒，是很典型的伴侶組合。`,
  子女: (x, y) =>
    `合起來看：${y}疼${x}、想照顧${x}，也給${x}家一般的安定感；很適合一起經營生活、養寵物或培養共同的興趣。`,
  財帛: (x, y) =>
    `合起來看：${x}牽動${y}的錢，${y}推動${x}的工作與志向；兩人是很實際的搭檔，一起做事業或存錢都有成果，帳要算清楚。`,
  疾厄: (x, y) =>
    `合起來看：${x}把${y}當成自在的朋友，但${x}的情緒和作息很容易牽動${y}的身心；輕鬆之餘，留意別讓${y}默默累積負擔。`,
};

/** 四化星本身帶的主題，讓同一宮的不同星有不同的重點。 */
const STAR_THEME: Record<string, string> = {
  紫微: '面子與決定權',
  天機: '想法與計畫',
  太陽: '付出與被看見',
  武曲: '錢與實際行動',
  天同: '情緒與舒適感',
  廉貞: '感情與原則',
  太陰: '細膩的情緒與照顧',
  貪狼: '玩樂與新鮮感',
  巨門: '說話與溝通',
  天梁: '照顧與道理',
  破軍: '改變與突破',
  文昌: '文字、規矩與細節',
  文曲: '口才與情感表達',
  左輔: '實際的幫忙',
  右弼: '默默的支援',
};

type FlightText = (from: string, to: string, theme: string) => string;

/** 化X 飛入對方某宮：逐宮逐化寫出的具體作用。 */
const FLIGHT_TEXT: Record<string, Record<string, FlightText>> = {
  命宮: {
    祿: (f, t, th) => `${f}的存在本身就讓${t}覺得舒服，${f}在${th}上的付出，${t}很自然就接收得到。`,
    權: (f, t) => `${f}對${t}的人生選擇很有影響力，${t}常會參考${f}的意見；拿捏好是推力，太多就變成「我替你決定」。`,
    科: (f, t) => `${f}很欣賞${t}，也願意在別人面前替${t}說好話，${t}在${f}身邊會比較有自信。`,
    忌: (f, t, th) => `${f}對${t}這個人特別在意、放不下，在${th}上常有要求；${t}感受到的可能是關心，也可能是壓力。`,
  },
  兄弟: {
    祿: (f, t) => `${f}對${t}的手足、同事也很好，兩人一起合作或互相介紹資源都很順。`,
    權: (f, t) => `${f}在分工上習慣主導，和${t}一起做事時，多半是${f}在分配任務。`,
    科: (f, t) => `${f}在${t}的同儕和家人之間形象好，容易被${t}身邊的人認可。`,
    忌: (f, t, th) => `${f}和${t}的手足、合作夥伴之間容易有比較或卡關，在${th}上要先把話講明。`,
  },
  夫妻: {
    祿: (f, t, th) => `${f}在感情上容易讓${t}心動，相處有甜度，${f}在${th}上的付出很對${t}的胃口。`,
    權: (f, t) => `${f}在感情裡想主導節奏，約會去哪、多久見一次常由${f}決定；${t}若喜歡被帶著走就很合拍。`,
    科: (f, t) => `${f}讓${t}覺得這段感情拿得出手，相處斯文有禮，意見不合時也比較能好好講。`,
    忌: (f, t, th) => `${f}對${t}的感情投入很深也很執著，在${th}上特別敏感；這是最有感覺、也最需要溝通的一條線。`,
  },
  子女: {
    祿: (f, t) => `${f}會想寵${t}，也很適合和${t}一起養寵物、做作品、經營共同的興趣。`,
    權: (f, t) => `${f}對兩人共同的計畫（孩子、作品、興趣）很有主見，常想照自己的方式來，${t}要記得表達自己的想法。`,
    科: (f, t) => `${f}很能欣賞${t}的創意和作品，是${t}最好的觀眾。`,
    忌: (f, t, th) => `${f}對${t}的子女、作品或晚輩特別操心，在${th}上容易插手太多。`,
  },
  財帛: {
    祿: (f, t) => `${f}在金錢上對${t}很大方，或能帶給${t}賺錢的機會，一起理財很順。`,
    權: (f, t) => `${f}對${t}的花錢方式有意見，兩人共同的錢容易由${f}掌管。`,
    科: (f, t) => `${f}能給${t}理性的理財建議，${t}的錢在${f}的提醒下比較有規劃。`,
    忌: (f, t, th) => `兩人在錢上容易有糾結，起因常和${f}的${th}有關，${t}可能覺得有負擔；共同開銷先說好比例最省事。`,
  },
  疾厄: {
    祿: (f, t) => `${f}待在${t}身邊時，${t}的身體和情緒都比較放鬆，像被照顧到。`,
    權: (f, t) => `${f}會管${t}的作息和健康，催早睡、催運動，出於關心，${t}有時也會嫌囉唆。`,
    科: (f, t) => `${f}能用冷靜、理性的方式陪${t}度過低潮或身體不適。`,
    忌: (f, t, th) => `${f}的情緒很容易直接影響${t}的身心，${f}在${th}上的壓力，${t}會跟著累。`,
  },
  遷移: {
    祿: (f, t) => `${f}能為${t}帶來外面的機會與人脈，兩人一起出門、旅行特別順。`,
    權: (f, t) => `${f}會推著${t}往外走，鼓勵${t}去闖，也可能替${t}決定往哪裡發展。`,
    科: (f, t) => `${f}讓${t}在外人面前更有面子，帶${f}出席場合，${t}會覺得加分。`,
    忌: (f, t, th) => `${f}很在意${t}在外面的狀況，${t}出門、出差或到外地發展時，${f}容易在${th}上牽掛、不放心。`,
  },
  僕役: {
    祿: (f, t) => `${f}在${t}的朋友圈很吃得開，兩人有共同朋友、一起聚會很自在。`,
    權: (f, t) => `${f}會影響${t}交什麼朋友，對${t}的社交圈有不少意見。`,
    科: (f, t) => `${f}在${t}的朋友眼中評價很好，是會被朋友說「你們很配」的那種。`,
    忌: (f, t, th) => `${f}容易在意${t}的朋友和社交，${t}和誰出去、聊到多晚，都可能牽動${f}的${th}，變成兩人的話題。`,
  },
  官祿: {
    祿: (f, t) => `${f}能帶給${t}工作上的好運與實際幫助，兩人很適合一起做事。`,
    權: (f, t) => `${f}在工作上很能推${t}一把，也會對${t}的職涯方向指指點點。`,
    科: (f, t) => `${f}像${t}工作上的軍師，能幫${t}把想法整理清楚、做得更體面。`,
    忌: (f, t, th) => `${f}特別在意${t}的工作表現與方向，在${th}上容易給壓力；工作的事先當同事討論，別直接變成感情問題。`,
  },
  田宅: {
    祿: (f, t) => `${f}讓${t}有家的感覺，兩人很適合一起布置住處、經營日常。`,
    權: (f, t) => `${f}對家裡的安排很有主見，住哪裡、怎麼布置常由${f}決定，${t}負責提出需求就好。`,
    科: (f, t) => `${f}能把${t}的生活打理得有條理，和${t}的家人也相處得體。`,
    忌: (f, t, th) => `${f}對${t}的家和生活習慣很在意，同住時在${th}上容易有摩擦，家事分工最好先講好。`,
  },
  福德: {
    祿: (f, t) => `${f}能讓${t}打從心裡快樂，和${f}在一起，${t}的心比較安、比較放鬆。`,
    權: (f, t) => `${f}會影響${t}的想法和興趣，${t}的價值觀容易跟著${f}調整。`,
    科: (f, t) => `${f}能讓${t}心情平靜，${t}煩惱時聽${f}說幾句就會想通。`,
    忌: (f, t, th) => `${f}特別牽動${t}的情緒，${t}常為${f}想很多、睡前還在想；${f}一句關於${th}的話，就能讓${t}開心或難過一整天。`,
  },
  父母: {
    祿: (f, t) => `${f}像${t}的貴人，給的建議和資源都很實用，${t}的長輩也容易喜歡${f}。`,
    權: (f, t) => `${f}在${t}面前像個指導者，習慣替${t}出主意，${t}可能覺得被管。`,
    科: (f, t) => `${f}能在文書、規劃上幫${t}的忙，說的話對${t}很有說服力。`,
    忌: (f, t, th) => `${f}和${t}的長輩、主管之間容易有牽扯，在${th}上也像長輩一樣放心不下${t}。`,
  },
};

/** 化忌的具體做法建議，依落入的宮位。 */
const JI_ACTION: Record<string, (from: string, to: string) => string> = {
  命宮: (f) => `${f}把在意說出口時，用「我希望」開頭，而不是「你應該」。`,
  兄弟: (_f, t) => `和${t}的手足、同事相處，先問清楚分工與界線。`,
  夫妻: () => '隔一段時間聊聊彼此的期待，別讓不安變成查勤。',
  子女: (_f, t) => `對共同的計畫或晚輩，先問${t}想怎麼做，再補充意見。`,
  財帛: () => '共同開銷與借貸先講好規則，錢的事白紙黑字最安心。',
  疾厄: (f, t) => `${f}累的時候先照顧好自己，別把壓力直接丟給${t}。`,
  遷移: (f, t) => `${t}外出時約好報平安的方式，${f}就不必一直牽掛。`,
  僕役: (_f, t) => `給${t}和朋友相處的空間，有疑慮就直接問，不要猜。`,
  官祿: (_f, t) => `談工作時先聽${t}說完，給建議而不是下指令。`,
  田宅: () => '同住時把家事和作息分工講清楚，各自保留一個角落。',
  福德: (f, t) => `${f}心情不好時先說一句「不是你的問題」，${t}就不會想太多。`,
  父母: (_f, t) => `和${t}的長輩、主管保持禮貌距離，不必替${t}出頭。`,
};

const SAME_ELEMENT_NOTE: Record<Element, string> = {
  木: '兩人都屬木，喜歡成長、有理想，一起學東西、規劃未來很投入；缺點是都想往上長，容易各自堅持己見。',
  火: '兩人都屬火，熱情、反應快，在一起很有活力；吵起來也一樣快，情緒容易一起燒起來。',
  土: '兩人都屬土，穩重、重承諾，生活很有安全感；但都慢熱、不愛變，關係容易停在舒適圈。',
  金: '兩人都屬金，講原則、做事俐落，說到做到；但兩人都硬，意見不同時誰也不肯先讓。',
  水: '兩人都屬水，聰明、會變通，很能聊、很懂彼此心思；但都善變，計畫容易一改再改。',
};

/** 相生：key 是給予的一方的五行。 */
const GENERATE_NOTE: Record<Element, (g: string, r: string) => string> = {
  木: (g, r) => `木生火：${g}像柴火，常用鼓勵和點子點燃${r}的熱情；${r}衝勁十足時，記得回頭謝謝${g}。`,
  火: (g, r) => `火生土：${g}的熱情與行動讓${r}覺得踏實、被支持；${g}容易燒完就累，需要${r}的穩定接住。`,
  土: (g, r) => `土生金：${g}是穩定的後盾，讓${r}能放心做決定、衝事業；${r}別把${g}的付出當成理所當然。`,
  金: (g, r) => `金生水：${g}的原則和判斷，替想法多、變化快的${r}定下方向；${g}給建議時語氣放軟，${r}更聽得進去。`,
  水: (g, r) => `水生木：${g}的體貼和理解滋養${r}成長，${r}在${g}身邊特別敢做夢；${g}也需要被照顧，別只當付出的那個。`,
};

/** 相剋：key 是剋人的一方的五行。 */
const CONTROL_NOTE: Record<Element, (c: string, t: string) => string> = {
  木: (c, t) => `木剋土：${c}一直想往前推、想改變，${t}只想穩穩來，常覺得被催；${c}放慢一點，${t}其實會跟上。`,
  火: (c, t) => `火剋金：${c}情緒一上來，${t}的原則和堅持就被燒得受不了；${c}先降溫再談，兩人比較不會硬碰硬。`,
  土: (c, t) => `土剋水：${c}重規劃、愛定規矩，想法多變的${t}會覺得被框住；留一點彈性給${t}，關係會鬆很多。`,
  金: (c, t) => `金剋木：${c}眼光銳利、容易挑毛病，${t}的想法和熱情常被修剪；${c}先肯定再建議，就是很好的磨練。`,
  水: (c, t) => `水剋火：${c}冷靜理性，常在${t}興頭上潑冷水；${c}先接住${t}的熱情，再提醒現實面。`,
};

function relationNote(a: ZiweiPartner, b: ZiweiPartner, ea: Element, eb: Element, rel: ElementRelation): string {
  switch (rel) {
    case 'same':
      return SAME_ELEMENT_NOTE[ea];
    case 'aGeneratesB':
      return `${a.name}的${ea}生${b.name}的${eb}。${GENERATE_NOTE[ea](a.name, b.name)}`;
    case 'bGeneratesA':
      return `${b.name}的${eb}生${a.name}的${ea}。${GENERATE_NOTE[eb](b.name, a.name)}`;
    case 'aControlsB':
      return `${a.name}的${ea}剋${b.name}的${eb}。${CONTROL_NOTE[ea](a.name, b.name)}`;
    case 'bControlsA':
      return `${b.name}的${eb}剋${a.name}的${ea}。${CONTROL_NOTE[eb](b.name, a.name)}`;
  }
}

// ---------------------------------------------------------------------------
// 日常相處：依主星整理的生活畫面
// ---------------------------------------------------------------------------

/** 個性在生活裡的樣子（接在名字後面）。 */
const STAR_PERSONA: Record<string, string> = {
  紫微: '在一群人裡自然成為拿主意的人，重視被尊重，在外人面前很顧形象',
  天機: '腦袋停不下來，常同時冒出好幾個想法，計畫改來改去是常態',
  太陽: '熱心、閒不住，朋友有事總是第一個出現，也希望付出被看見',
  武曲: '話不多但說到做到，做事講效率、看結果，不太說好聽話',
  天同: '隨和好相處，喜歡舒服的節奏，能不吵就不吵',
  廉貞: '有自己的原則和堅持，愛恨分明，情緒來得快也寫在臉上',
  天府: '穩重、有規劃，習慣先把家裡和存款顧好才有安全感',
  太陰: '細心、敏感，很會察覺氣氛，有心事多半先放在心裡',
  貪狼: '興趣多、社交活躍，喜歡新鮮好玩的事，很會炒熱氣氛',
  巨門: '觀察入微，常一眼看出問題，習慣把話說清楚、問到底',
  天相: '懂分寸、會照顧場面，常是居中協調的人，很在意公平',
  天梁: '像大哥大姊，習慣照顧人、給建議，遇事沉得住氣',
  七殺: '行動派，想到就做，獨立、不喜歡被管，遇到挑戰反而來勁',
  破軍: '受不了一成不變，常想換環境、換做法，敢從零開始',
};

/** 福德宮主星：放鬆、充電的方式。 */
const STAR_RELAX: Record<string, string> = {
  紫微: '想要有品味、有質感的休息，不喜歡隨便將就',
  天機: '喜歡看書、追劇、研究新東西，腦袋動著才放鬆',
  太陽: '想出門、見朋友，或做點有意義的事',
  武曲: '喜歡做點實際的事，運動、整理房間、看看帳戶都能讓心定下來',
  天同: '最愛吃好吃的、睡到自然醒、什麼都不做',
  廉貞: '需要有情感濃度的活動，看展、聽音樂，或和親近的人深聊',
  天府: '喜歡待在熟悉的地方，吃頓好的、把家裡打理好',
  太陰: '需要一個人的安靜時間，夜晚、音樂或泡澡最療癒',
  貪狼: '喜歡熱鬧和嘗鮮，聚會、旅行、新開的餐廳都很加分',
  巨門: '喜歡聊天、看有深度的內容，把心裡的疑問想通才舒服',
  天相: '喜歡整齊舒適的環境，和好朋友吃頓飯、好好打扮一下',
  天梁: '喜歡清靜又有意義的休息，像散步、讀書或陪家人',
  七殺: '要動起來才放鬆，運動或說走就走的小旅行',
  破軍: '喜歡換個新環境，旅行、改造房間或嘗試沒做過的事',
};

type ThinkStyle = 'fast' | 'analyze' | 'steady' | 'feel';
type ConflictStyle = 'direct' | 'reason' | 'withdraw' | 'soothe';

/** 思考與做決定的方式。 */
const STAR_THINK: Record<string, { text: string; style: ThinkStyle }> = {
  紫微: { text: '做決定喜歡自己拍板，會先聽意見，但最後想由自己定案', style: 'steady' },
  天機: { text: '會先查資料、比較好幾個方案，訂一家餐廳也可能改兩次主意', style: 'analyze' },
  太陽: { text: '憑熱情和直覺先答應下來，細節邊做邊補', style: 'fast' },
  武曲: { text: '先算成本和效益，划不划算比好不好玩重要，算完就很快決定', style: 'fast' },
  天同: { text: '看心情和舒不舒服做決定，不喜歡被逼著馬上選', style: 'feel' },
  廉貞: { text: '先問合不合自己的原則與感覺，一旦認定就很難改', style: 'feel' },
  天府: { text: '要先看到完整的規劃和退路，才願意點頭', style: 'steady' },
  太陰: { text: '會在心裡反覆琢磨，也很在意這個決定會不會讓誰不開心', style: 'feel' },
  貪狼: { text: '哪個選項好玩、有新鮮感就先試，不行再換', style: 'fast' },
  巨門: { text: '會先找漏洞、問「萬一呢」，想通了才放心', style: 'analyze' },
  天相: { text: '會先問大家的意見，找一個各方都能接受的做法', style: 'steady' },
  天梁: { text: '從長遠和「對不對」來想，常替別人考慮得比自己多', style: 'analyze' },
  七殺: { text: '看準目標就直接衝，最受不了討論太久', style: 'fast' },
  破軍: { text: '傾向選最有突破性的選項，不怕推翻原本的計畫', style: 'fast' },
};

/** 吵架、意見不合時的反應。 */
const STAR_CONFLICT: Record<string, { text: string; style: ConflictStyle }> = {
  紫微: { text: '吵架時很難先低頭，比起道理，更在意自己有沒有被尊重', style: 'withdraw' },
  天機: { text: '吵架時腦筋轉很快，會一條條分析，甚至翻出舊事來佐證', style: 'reason' },
  太陽: { text: '吵架時聲音大、火氣來得快，但氣消得也快，吵完就想當沒事', style: 'direct' },
  武曲: { text: '吵架時話變少、語氣變硬，用沉默或埋頭做事代替說話', style: 'withdraw' },
  天同: { text: '吵架時最想趕快和好，常先退一步，但委屈會默默累積', style: 'soothe' },
  廉貞: { text: '吵架時情緒很強，碰到底線會當場翻臉，事後又會內疚', style: 'direct' },
  天府: { text: '吵架時表面冷靜、不太正面衝突，但會把事情記在心裡', style: 'withdraw' },
  太陰: { text: '吵架時傾向先安靜、自己消化，要過一陣子才說得出真正的感受', style: 'withdraw' },
  貪狼: { text: '吵架時常用轉移話題、開玩笑或撒嬌帶過，不喜歡僵持', style: 'soothe' },
  巨門: { text: '吵架時要把話講透、把是非辯清楚，說出口的話常比本意更重', style: 'reason' },
  天相: { text: '吵架時會先顧和氣、想辦法折衷，但被逼急了也會堅持公平', style: 'soothe' },
  天梁: { text: '吵架時容易進入講道理、教對方該怎麼做的模式', style: 'reason' },
  七殺: { text: '吵架時想當下講清楚，講完就翻篇，最受不了冷戰', style: 'direct' },
  破軍: { text: '吵架時一旦受夠了，會脫口說出「那就不要了」這類重話', style: 'direct' },
};

/** 表達愛的方式（接在名字後面）與 outward：是否外放。 */
const STAR_LOVE_SHOW: Record<string, { text: string; outward: boolean }> = {
  紫微: { text: '表達愛的方式是替對方安排好、扛下大事', outward: false },
  天機: { text: '會記得對方隨口提過的小事，用點子和小驚喜表達心意', outward: false },
  太陽: { text: '愛一個人就大方付出，連對方的家人朋友都照顧到', outward: true },
  武曲: { text: '用行動表達愛，修東西、出錢、把事情辦好，很少說甜言蜜語', outward: false },
  天同: { text: '愛的表現是黏在一起，一起吃好吃的、一起放空', outward: true },
  廉貞: { text: '愛得濃烈又專一，也期待對方同樣投入', outward: true },
  天府: { text: '用穩定的照顧表達愛，把生活和兩人的存款都顧好', outward: false },
  太陰: { text: '用細膩的小動作表達愛，記得對方的口味、默默準備好一切', outward: false },
  貪狼: { text: '會帶對方去玩、去嘗鮮，很會製造浪漫', outward: true },
  巨門: { text: '用聊天和分享表達親近，心裡話只講給對方聽', outward: false },
  天相: { text: '用體貼與配合表達愛，很顧及對方的面子和感受', outward: false },
  天梁: { text: '用照顧和提醒表達愛，對方的大小事都會操心', outward: false },
  七殺: { text: '愛得直接，喜歡就說、想做就一起去做', outward: true },
  破軍: { text: '愛得熱烈，願意為對方改變自己的生活', outward: true },
};

/** 最容易感到被愛的時刻（接在「是」後面）。 */
const STAR_LOVE_FEEL: Record<string, string> = {
  紫微: '對方在人前給足面子、尊重自己的決定',
  天機: '對方願意陪自己聊那些天馬行空的想法',
  太陽: '自己的付出被看見，聽到一句真心的謝謝',
  武曲: '對方說到做到、靠得住',
  天同: '被溫柔對待、不被催促',
  廉貞: '對方在意自己的情緒，把自己放在第一位',
  天府: '生活安穩，對方願意一起承擔',
  太陰: '不用開口，對方就察覺到自己的心情',
  貪狼: '相處一直有新鮮感，對方仍覺得自己有魅力',
  巨門: '對方願意深談、認真回應，不敷衍',
  天相: '被公平對待、被真心肯定',
  天梁: '對方尊重自己的經驗，願意聽建議',
  七殺: '對方給自己空間，又在關鍵時刻挺自己',
  破軍: '對方接受自己的善變，願意一起冒險',
};

/** 夫妻宮主星：心裡期待的伴侶樣子。 */
const STAR_SPOUSE_WISH: Record<string, string> = {
  紫微: '有格局、讓自己引以為傲的人',
  天機: '聰明、聊得來、能一起動腦的人',
  太陽: '熱情大方、在外面有光彩的人',
  武曲: '能幹務實、靠得住的人',
  天同: '溫和體貼、相處沒壓力的人',
  廉貞: '有魅力、愛得投入的人',
  天府: '穩重、能一起累積生活的人',
  太陰: '溫柔細心、懂得照顧情緒的人',
  貪狼: '有趣、有魅力、生活多彩的人',
  巨門: '能深談、願意溝通的人',
  天相: '體面、講道理、懂分寸的人',
  天梁: '成熟、能照顧也能指引自己的人',
  七殺: '有魄力、有主見的強者',
  破軍: '有個性、能帶來改變的人',
};

const FALLBACK_PERSONA = '個性較有彈性，常隨環境與身邊的人調整自己';
const FALLBACK_THINK = { text: '做決定時會看情況調整，受身邊的人影響較多', style: 'steady' as ThinkStyle };
const FALLBACK_CONFLICT = { text: '吵架時反應會看對方而定，常先觀察再回應', style: 'soothe' as ConflictStyle };
const FALLBACK_LOVE_SHOW = { text: '表達愛的方式會跟著對方調整', outward: false };
const FALLBACK_LOVE_FEEL = '對方穩定地陪在身邊';

const THINK_ORDER: readonly ThinkStyle[] = ['fast', 'analyze', 'steady', 'feel'];
const CONFLICT_ORDER: readonly ConflictStyle[] = ['direct', 'reason', 'withdraw', 'soothe'];

/** key 是「x 的類型-y 的類型」，依 *_ORDER 排序。 */
const THINK_PAIR: Record<string, (x: string, y: string) => string> = {
  'fast-fast': () => '兩人都習慣快速決定，事情推得很快；要留意兩人同時拍板、方向又不同時，誰都不讓。',
  'fast-analyze': (x, y) =>
    `${x}想先做再說，${y}想先想清楚；出去玩時一個已經訂好票，另一個還在比價。分工最省力：${y}查資料，${x}拍板執行。`,
  'fast-steady': (x, y) =>
    `${x}嫌${y}慢，${y}覺得${x}太衝；像大筆花費、搬家、換工作這類事，先給${y}一兩天消化，比當場要答案順利。`,
  'fast-feel': (x, y) =>
    `${x}要的是結論，${y}要的是感覺對；${x}催得太急，${y}容易嘴上答應、心裡不舒服。`,
  'analyze-analyze': () => '兩人都想得多，討論很有深度，但也容易想太久遲遲不決；替每件事訂個「決定期限」會很有幫助。',
  'analyze-steady': (x, y) =>
    `${x}負責找問題、${y}負責守底線，做大決定很穩；缺點是兩人都偏保守，新嘗試容易一拖再拖。`,
  'analyze-feel': (x, y) =>
    `${x}講邏輯、${y}講感受；${x}分析得再對，${y}也可能只覺得「你沒懂我」，先回應情緒再談道理。`,
  'steady-steady': () => '兩人都求穩，生活規律、很少出亂子；偶爾刻意安排一點新鮮事，關係才不會只剩例行公事。',
  'steady-feel': (x, y) =>
    `${x}給${y}安全感，${y}讓${x}的生活多點溫度；${x}做決定時，記得問一句${y}「你覺得呢」。`,
  'feel-feel': () => '兩人都憑感覺做決定，默契好；但遇到錢、合約這類需要冷靜判斷的事，最好一起列清單再決定。',
};

const CONFLICT_PAIR: Record<string, (x: string, y: string) => string> = {
  'direct-direct': () => '兩人吵架都來得快、說得直，常常越吵越大聲；約好「先停五分鐘再講」，能避免說出收不回的話。',
  'direct-reason': (x, y) =>
    `${x}要對方馬上表態，${y}要把道理講清楚；${x}覺得${y}在上課，${y}覺得${x}不講理。先說「我在氣什麼」，再談誰對誰錯。`,
  'direct-withdraw': (x, y) =>
    `${x}想當下講清楚，${y}先冷處理；${x}越追，${y}越退。約好${y}可以先冷靜，但要說出「我需要多久」，${x}就不會那麼焦慮。`,
  'direct-soothe': (x, y) =>
    `${x}一發火，${y}就先讓步，看起來很快和好，但${y}的委屈沒說出口；吵完找個平靜的時候，讓${y}把沒講的話講完。`,
  'reason-reason': () => '兩人都想說贏，吵架容易變成辯論比賽；先承認對方有一句說得對，氣氛會鬆很多。',
  'reason-withdraw': (x, y) =>
    `${x}想一次講清楚，${y}只想先安靜；${x}的分析在${y}聽來像指責。改用傳訊息或隔天再談，${y}比較說得出心裡話。`,
  'reason-soothe': (x, y) =>
    `${x}要分出對錯，${y}只想快點和好；${y}說「好啦算了」不代表被說服，讓${y}說完感受，比贏了道理重要。`,
  'withdraw-withdraw': () => '兩人吵架都先沉默，表面風平浪靜，問題卻容易被擱著；約好冷靜之後一定回來談，不讓冷戰拖過夜。',
  'withdraw-soothe': (x, y) =>
    `${x}先安靜，${y}急著想和好；${y}的示好如果被冷冷擋回去會很受傷，${x}可以先回一句「我需要一點時間，不是在生你的氣」。`,
  'soothe-soothe': () => '兩人都怕衝突，很少大吵，但不滿容易一直往下壓；定期問彼此「最近有沒有哪裡不舒服」，比等到爆發好。',
};

function pairNote<S extends string>(
  table: Record<string, (x: string, y: string) => string>,
  order: readonly S[],
  sa: S,
  sb: S,
  na: string,
  nb: string,
): string {
  return order.indexOf(sa) <= order.indexOf(sb)
    ? (table[`${sa}-${sb}`]?.(na, nb) ?? '')
    : (table[`${sb}-${sa}`]?.(nb, na) ?? '');
}

interface PalaceStars {
  names: string[];
  borrowed: boolean;
}

/** 某宮的主星；空宮就借對宮主星（傳統借星安宮的看法）。 */
function palaceStars(chart: ZiweiChart, palace: ZiweiPalace | undefined | null): PalaceStars {
  if (!palace) return { names: [], borrowed: false };
  if (palace.majorStars.length > 0) return { names: palace.majorStars.map((s) => s.name), borrowed: false };
  const opp = chart.palaces.find((p) => p.index === (palace.index + 6) % 12);
  return { names: opp?.majorStars.map((s) => s.name) ?? [], borrowed: true };
}

function starsLabel(ps: PalaceStars): string {
  if (ps.names.length === 0) return '空宮';
  return `${ps.borrowed ? '借對宮' : ''}${ps.names.join('')}`;
}

/** 第一顆有資料的主星（雙星宮以排在前面的星為主）。 */
function lead<T>(ps: PalaceStars, table: Record<string, T>): T | undefined {
  for (const n of ps.names) if (table[n] !== undefined) return table[n];
  return undefined;
}

function byName(chart: ZiweiChart, name: string): ZiweiPalace | undefined {
  return chart.palaces.find((p) => p.name === name);
}

const LOVE_PALACES = ['夫妻', '福德', '命宮'];
const LOVE_FEEL_BY_MUTAGEN: Record<string, string> = {
  祿: '被寵、被照顧',
  權: '有人撐腰、被保護（偶爾也像被管）',
  科: '被欣賞、被尊重',
};

function dailyLifeLines(a: ZiweiPartner, b: ZiweiPartner, syn: ZiweiSynastry): string[] {
  const soul = { a: palaceStars(a.chart, syn.soulA), b: palaceStars(b.chart, syn.soulB) };
  const fude = { a: palaceStars(a.chart, byName(a.chart, '福德')), b: palaceStars(b.chart, byName(b.chart, '福德')) };
  const spouse = { a: palaceStars(a.chart, byName(a.chart, '夫妻')), b: palaceStars(b.chart, byName(b.chart, '夫妻')) };
  const A = a.name;
  const B = b.name;
  const name = (k: PartnerKey) => (k === 'a' ? A : B);
  const other = (k: PartnerKey) => (k === 'a' ? B : A);
  const theme = (star: string) => STAR_THEME[star] ?? `${star}相關的事`;
  const flights = syn.flights.filter((f): f is ZiweiMutagenFlight & { palace: string } => f.palace !== null);

  // 個性
  const persona = (ps: PalaceStars) => {
    const main = lead(ps, STAR_PERSONA) ?? FALLBACK_PERSONA;
    const second = ps.names[1];
    const extra = second && STAR_TRAIT[second] ? `，也帶著${second}${STAR_TRAIT[second]}的一面` : '';
    return `${main}${extra}`;
  };
  const personality = [
    `${A}（命宮${starsLabel(soul.a)}）${persona(soul.a)}；${B}（命宮${starsLabel(soul.b)}）${persona(soul.b)}。`,
  ];
  if (soul.a.names[0] && soul.a.names[0] === soul.b.names[0]) {
    personality.push(`兩人命宮主星都是${soul.a.names[0]}，很容易在對方身上看到自己，好的壞的都一樣。`);
  }
  const relaxA = lead(fude.a, STAR_RELAX);
  const relaxB = lead(fude.b, STAR_RELAX);
  if (relaxA && relaxB) {
    personality.push(
      fude.a.names[0] === fude.b.names[0]
        ? `兩人福德宮都是${fude.a.names[0]}，放鬆方式很像：都${relaxA}，排假日行程幾乎不用討論。`
        : `放假時，${A}${relaxA}；${B}則${relaxB}。輪流照對方的方式過一天，是很好的相處練習。`,
    );
  }

  // 思考方式
  const tA = lead(soul.a, STAR_THINK) ?? FALLBACK_THINK;
  const tB = lead(soul.b, STAR_THINK) ?? FALLBACK_THINK;
  const thinking = [`${A}${tA.text}；${B}${tB.text}。`, pairNote(THINK_PAIR, THINK_ORDER, tA.style, tB.style, A, B)];
  for (const f of flights) {
    if (f.mutagen === '權' && (f.palace === '命宮' || f.palace === '官祿')) {
      thinking.push(`${name(f.from)}的${f.star}化權落在${other(f.from)}的${displayPalaceName(f.palace)}，${other(f.from)}做重要決定時，很容易被${name(f.from)}的意見左右。`);
    }
    if (f.mutagen === '科' && (f.palace === '官祿' || f.palace === '父母')) {
      thinking.push(`${name(f.from)}的${f.star}化科落在${other(f.from)}的${displayPalaceName(f.palace)}，${other(f.from)}想法卡住時，${name(f.from)}常能幫忙把思路理清。`);
    }
  }

  // 處理矛盾
  const cA = lead(soul.a, STAR_CONFLICT) ?? FALLBACK_CONFLICT;
  const cB = lead(soul.b, STAR_CONFLICT) ?? FALLBACK_CONFLICT;
  const conflict = [`${A}${cA.text}；${B}${cB.text}。`, pairNote(CONFLICT_PAIR, CONFLICT_ORDER, cA.style, cB.style, A, B)];
  const jiKey = flights.filter((f) => f.mutagen === '忌' && f.key);
  if (jiKey.length === 2 && jiKey[0].palace === jiKey[1].palace && jiKey[0].from !== jiKey[1].from) {
    const [x, y] = jiKey;
    conflict.push(
      `兩人的化忌都落在對方的${displayPalaceName(x.palace)}（${name(x.from)}的${x.star}、${name(y.from)}的${y.star}），${name(x.from)}在意的是「${theme(x.star)}」，${name(y.from)}在意的是「${theme(y.star)}」，這兩件事最容易變成吵架的引爆點。`,
    );
  } else {
    for (const f of jiKey) {
      conflict.push(`${name(f.from)}的${f.star}化忌落在${other(f.from)}的${displayPalaceName(f.palace)}，兩人最容易在「${theme(f.star)}」的事情上起摩擦。`);
    }
  }
  for (const f of flights) {
    if (f.mutagen === '權' && (f.palace === '夫妻' || f.palace === '田宅')) {
      conflict.push(`${name(f.from)}的化權落在${other(f.from)}的${displayPalaceName(f.palace)}，「這件事誰說了算」容易變成爭執點，事先分好誰管哪一塊最有效。`);
    }
  }

  // 親密與愛
  const lA = lead(soul.a, STAR_LOVE_SHOW) ?? FALLBACK_LOVE_SHOW;
  const lB = lead(soul.b, STAR_LOVE_SHOW) ?? FALLBACK_LOVE_SHOW;
  const feelA = lead(soul.a, STAR_LOVE_FEEL) ?? FALLBACK_LOVE_FEEL;
  const feelB = lead(soul.b, STAR_LOVE_FEEL) ?? FALLBACK_LOVE_FEEL;
  const love = [
    `${A}${lA.text}；${B}${lB.text}。${A}最容易感到被愛的時候，是${feelA}；${B}則是${feelB}。`,
    lA.outward === lB.outward
      ? lA.outward
        ? '兩人都外放，愛意說得出口、做得出來；熱度高時很甜，忙起來一冷下來，就容易互相覺得被冷落。'
        : '兩人都不擅長把愛掛在嘴邊，默默做的比說的多；偶爾直接說一句「謝謝你」「我很在乎你」，效果會比想像中大。'
      : (() => {
          const [o, i] = lA.outward ? [A, B] : [B, A];
          return `${o}的愛很直接，${i}的愛藏在小事裡；${o}要學著看見${i}默默做的事，${i}也可以多說出口一點。`;
        })(),
  ];
  for (const [self, mate, sp, mateSoul] of [
    [A, B, spouse.a, soul.b],
    [B, A, spouse.b, soul.a],
  ] as const) {
    const wish = lead(sp, STAR_SPOUSE_WISH);
    if (!wish) continue;
    const match = mateSoul.names.find((n) => sp.names.includes(n));
    love.push(
      match
        ? `${self}的夫妻宮${sp.borrowed ? '' : '是'}${starsLabel(sp)}，心裡期待${wish}；${mate}的命宮正好也有${match}，很符合${self}心中的伴侶樣子。`
        : `${self}的夫妻宮${sp.borrowed ? '' : '是'}${starsLabel(sp)}，心裡期待${wish}。`,
    );
  }
  for (const f of flights) {
    const feel = LOVE_FEEL_BY_MUTAGEN[f.mutagen];
    if (feel && LOVE_PALACES.includes(f.palace)) {
      love.push(`${name(f.from)}的${f.star}化${f.mutagen}落在${other(f.from)}的${displayPalaceName(f.palace)}，${other(f.from)}特別容易從${name(f.from)}身上感到${feel}。`);
    }
  }

  return [
    `【個性】${personality.join('')}`,
    `【思考方式】${thinking.filter(Boolean).join('')}`,
    `【處理矛盾】${conflict.filter(Boolean).join('')}`,
    `【親密與愛】${love.join('')}`,
  ];
}

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
  const mark = f.key ? '★ ' : '';
  const text = FLIGHT_TEXT[f.palace]?.[f.mutagen]?.(from, to, STAR_THEME[f.star] ? `「${STAR_THEME[f.star]}」` : '這方面') ?? '';
  return `${mark}${from}的${f.star}化${f.mutagen} → ${to}的${displayPalaceName(f.palace)}：${text}`;
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
          relationNote(a, b, syn.elementA, syn.elementB, syn.relation),
        ].join('\n'),
      ),
    );
  }

  const overlay: string[] = [];
  const symmetric = syn.soulAInB !== null && (syn.soulAInB === '命宮' || syn.soulAInB === '遷移');
  if (syn.soulAInB) {
    overlay.push(
      symmetric
        ? `兩人命宮互為對方的${displayPalaceName(syn.soulAInB)}：${SOUL_OVERLAY[syn.soulAInB](a.name, b.name)}`
        : `${a.name}的命宮落在${b.name}盤的${displayPalaceName(syn.soulAInB)}：${SOUL_OVERLAY[syn.soulAInB]?.(a.name, b.name) ?? ''}`,
    );
  }
  if (syn.soulBInA && !symmetric) {
    overlay.push(
      `${b.name}的命宮落在${a.name}盤的${displayPalaceName(syn.soulBInA)}：${SOUL_OVERLAY[syn.soulBInA]?.(b.name, a.name) ?? ''}`,
    );
  }
  if (syn.soulAInB && syn.soulBInA && !symmetric) {
    const pair = SOUL_PAIR_NOTE[syn.soulAInB]
      ? SOUL_PAIR_NOTE[syn.soulAInB](a.name, b.name)
      : SOUL_PAIR_NOTE[syn.soulBInA]?.(b.name, a.name);
    if (pair) overlay.push(pair);
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
        '一人的生年四化星落在另一人的哪一宮：化祿是好感與甜頭，化權是主導與推力，化科是欣賞與助力，化忌是在意與牽掛。★ 表示落在命宮、夫妻宮、交友宮、福德宮這幾個關係最直接的宮位。',
        [
          ...flights.map((f) => flightLine(f, a, b)),
          keyCount > 0
            ? `共有 ${keyCount} 條四化落在關係最直接的宮位，兩人的緣分感會比較明顯。`
            : '四化都沒有落在命、夫妻、交友、福德這幾宮，兩人的互動較多透過生活其他面向展開。',
        ].join('\n'),
      ),
    );
  }

  items.push(
    item(
      '日常相處',
      '依兩人命宮、夫妻宮、福德宮的主星（空宮借對宮）與四化互飛，整理生活裡常見的相處畫面。',
      dailyLifeLines(a, b, syn).join('\n'),
    ),
  );

  items.push(item('相處建議', '依上面的四化與命宮對照整理的具體做法。', adviceLines(a, b, syn).join('\n')));
  return items;
}

function adviceLines(a: ZiweiPartner, b: ZiweiPartner, syn: ZiweiSynastry): string[] {
  const lines: string[] = [];
  const name = (k: PartnerKey) => (k === 'a' ? a.name : b.name);
  const other = (k: PartnerKey) => (k === 'a' ? b.name : a.name);
  const ji = syn.flights.filter((f) => f.mutagen === '忌' && f.palace);
  const sharedJi = ji.length === 2 && ji[0].palace === ji[1].palace && ji[0].from !== ji[1].from ? ji[0].palace : null;
  if (sharedJi) {
    const act = JI_ACTION[sharedJi]?.('兩人', '對方');
    if (act) lines.push(`兩人的化忌都在對方的${displayPalaceName(sharedJi)}：${act}`);
  }
  for (const f of syn.flights) {
    if (!f.palace) continue;
    const from = name(f.from);
    const to = other(f.from);
    const where = `${from}的化${f.mutagen}在${to}的${displayPalaceName(f.palace)}`;
    if (f.mutagen === '忌') {
      const act = sharedJi ? undefined : JI_ACTION[f.palace]?.(from, to);
      if (act) lines.push(`${where}：${act}`);
      continue;
    }
    if (!f.key) continue;
    if (f.mutagen === '祿') lines.push(`${where}：好意不用刻意，${to}記得回一句「我有感受到」，甜頭才會一直在。`);
    if (f.mutagen === '權') lines.push(`${where}：${from}出主意前先問「你想聽建議嗎」，${to}會比較願意接受。`);
    if (f.mutagen === '科') lines.push(`${where}：${from}的肯定對${to}很有用，多在別人面前說出來。`);
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
  const focus = [a, b]
    .map((p) => {
      const soul = p.chart.palaces.find((x) => x.isSoulPalace);
      return ['命宮', '夫妻', '福德']
        .map((n) => {
          const palace = n === '命宮' ? soul : byName(p.chart, n);
          return `${displayPalaceName(n)}${starsLabel(palaceStars(p.chart, palace))}`;
        })
        .join('、');
    })
    .map((t, i) => `- ${[a, b][i].name}：${t}`)
    .join('\n');

  return `請依下列兩人的紫微斗數本命盤，用繁體中文做雙人合盤解讀。

解讀原則：
- 派別為通行版本（三合派），宮名用「交友宮／事業宮」。
- 以兩人命宮主星、五行局，以及生年四化飛入對方命盤的宮位為主軸（特別是命宮、夫妻宮、交友宮、福德宮）。
- 化祿、化權、化科、化忌都要解讀：祿看好感與付出、權看主導與誰說了算、科看欣賞與助力、忌看在意與牽掛；同一化落在不同宮位、由不同星化出，意思要寫出差別，不要套同一句話。
- 空宮請借對宮主星來看；雙星同宮請說明兩顆星合起來的味道。
- 除了命宮，也請參考雙方的夫妻宮（期待的伴侶樣子、感情裡的姿態）與福德宮（放鬆方式、內心需求）。
- 這是命盤結構說明，不是關係好壞的判決；請給可實踐的相處建議，避免恐嚇或保證。

## 兩人命盤
${chartBlock(a)}

${chartBlock(b)}

## 命宮對照
${overlay || '- （無）'}

## 四化互飛
${flights}

## 兩人重點宮位
${focus}

請依下列結構回答：
1. 總覽：兩人的性格組合與這段關係的基本樣貌。
2. 吸引與緣分：命宮對照與四化互飛（含化權、化科）說明彼此在對方生命裡的角色。
3. 日常相處，分四項，每項都要寫出兩人「各自」的樣子，並舉 2–3 個具體的生活情境（例如：吵架時${a.name}先冷處理、${b.name}想當下講清楚；出遊或花大錢時誰先拍板、誰還在比較）：
   - 個性：平常的樣子、放假時想怎麼過。
   - 思考方式：兩人怎麼想事情、怎麼做決定，意見不同時怎麼分工。
   - 處理矛盾的方法：吵架或意見不合時各自的反應、容易怎麼卡住、怎麼收尾比較好。
   - 感受親密與愛的方式：各自怎麼表達愛、在什麼時候最能感到被愛，以及容易錯過對方心意的地方。
4. 容易卡住的地方：指出具體是哪一條四化或哪一組主星造成的。
5. 合作（感情、朋友、工作）。
最後給兩人各 3 條具體可做的相處提醒（寫成行動，例如「吵完隔天主動約吃早餐」，而不是「多溝通」）。`;
}
