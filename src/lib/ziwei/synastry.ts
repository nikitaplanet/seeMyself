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
// 契合度訊號：只有結構上明顯辛苦的組合才會觸發，其餘一律用「優點先行」的語氣
// ---------------------------------------------------------------------------

/** 化忌、化祿最直接作用於感情的宮位：命宮（這個人）、夫妻（感情）、福德（內心）。 */
const BOND_PALACES: readonly string[] = ['命宮', '夫妻', '福德'];

export interface ZiweiFit {
  /** true 只代表結構上辛苦，需要比一般組合多花力氣，不是「不能在一起」。 */
  difficult: boolean;
  /** 落在命、夫妻、福德的化忌條數（兩人合計）。 */
  bondJi: number;
  /** 落在命、夫妻、交友、福德的化祿條數（兩人合計）。 */
  keyLu: number;
  /** 五行局相剋。 */
  elementClash: boolean;
}

/**
 * 保守的契合度判斷，三個條件要同時成立才算辛苦：
 *   1. 兩人合計至少 2 條化忌落在對方的命宮、夫妻宮或福德宮（牽掛集中在最核心的位置）；
 *   2. 沒有任何一條化祿落在對方的命、夫妻、交友、福德宮（核心位置少了自然的甜頭來緩衝）；
 *   3. 五行局相剋（兩人的基本節奏互相壓制）。
 * 任一條件不成立都視為一般組合。
 */
export function ziweiFit(syn: ZiweiSynastry): ZiweiFit {
  const bondJi = syn.flights.filter((f) => f.mutagen === '忌' && f.palace && BOND_PALACES.includes(f.palace)).length;
  const keyLu = syn.flights.filter((f) => f.mutagen === '祿' && f.key).length;
  const elementClash = syn.relation === 'aControlsB' || syn.relation === 'bControlsA';
  return { difficult: bondJi >= 2 && keyLu === 0 && elementClash, bondJi, keyLu, elementClash };
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
    `兩人命宮在同一個地支，看世界的角度很像，常常一個眼神就懂，聊天很少需要多解釋，是難得的「同類」。也因為太懂彼此，${x}的小缺點${y}一眼就看得出來；看到時笑著說一句「這點我們真像」，挑剔就能變成默契。`,
  兄弟: (x, y) =>
    `${x}在${y}的生命裡像最有默契的手足或同學，平起平坐、可以互相吐槽也互相罩，一起做事分工很自然，是能並肩走很久的夥伴。想多一點心動，可以試試偶爾把「一起做事」換成「專程約會」。`,
  夫妻: (x, y) =>
    `${x}正好落在${y}的感情宮位，${y}容易一見面就覺得「就是這個人」，吸引力很強，${x}身上有${y}心中伴侶的影子。期待高是因為在乎；當${x}和想像不太一樣時，${y}多看一眼真實的${x}，往往會發現更多驚喜。`,
  子女: (x, y) =>
    `${y}看${x}帶著疼愛，想照顧、想分享所學，一起養寵物、做作品或經營共同興趣特別有共鳴，兩人在一起很有「一起創造」的快樂。可以試試讓${x}偶爾當帶頭的那個，${y}會發現${x}也很會照顧人。`,
  財帛: (x, y) =>
    `${x}和${y}在錢與資源上很有緣，${x}常能帶動${y}賺錢、規劃花用的方式，一起理財或創業容易累積出成果，是很實際的好搭檔。共同的錢先講好規則，這份默契就能長長久久。`,
  疾厄: (x, y) =>
    `${y}在${x}身邊身心特別放鬆，${x}的一個笑容就能讓${y}的一天輕鬆起來，是很有療癒感的組合。${x}心情低落時直接說一聲，${y}就不必跟著猜，兩人都能好好照顧自己。`,
  遷移: (x, y) =>
    `兩人命宮正好相對，一動一靜、一內一外，天生互補又互相吸引；${x}像替${y}打開一扇對外的窗，${y}也讓${x}看見另一種生活的可能。立場不同時，當成「多一個角度」來聽，就是兩人最大的優勢。`,
  僕役: (x, y) =>
    `${y}把${x}當成最自在的自己人，相處輕鬆、不用裝，一起聚會、旅行都很開心，是越相處越舒服的關係。想往戀人走，可以試試在熟悉的日常裡多安排一點專屬兩人的小儀式。`,
  官祿: (x, y) =>
    `${x}是${y}工作和志向上的好推手，兩人聊起事業特別起勁，${x}常能看見${y}的潛力、陪${y}往目標前進。偶爾約好「今天不聊工作」，感情的溫度也會跟著升高。`,
  田宅: (x, y) =>
    `${x}給${y}家人般的安心感，和${x}在一起像回到家，很適合同住、一起布置生活，日常的小事都能變得溫馨。偶爾換個地方約會、為對方打扮一下，熟悉裡也能一直保有心動。`,
  福德: (x, y) =>
    `${x}正好落在${y}的精神宮位，和${x}在一起，${y}心裡特別安定、快樂，是能讓${y}打從心底放鬆的人。也因為${x}這麼重要，${x}的一點冷淡${y}都感覺得到；心情不好時先說一句「不是你的關係」，${y}就能安心。`,
  父母: (x, y) =>
    `${x}在${y}眼中像值得信賴的前輩，給的建議${y}聽得進去，有${x}在，${y}少走很多冤枉路。${x}給意見前先問一句「想聽聽我的看法嗎」，${y}會更感受到被尊重。`,
};

/**
 * 命宮互落是成對出現的（兄弟↔父母、夫妻↔福德、子女↔田宅、財帛↔官祿、疾厄↔僕役），
 * key 是「x 的命宮在 y 盤的宮位」，用來寫一句兩人合起來看的總結。
 */
const SOUL_PAIR_NOTE: Record<string, (x: string, y: string) => string> = {
  父母: (x, y) =>
    `合起來看：${x}對${y}來說像給方向的前輩，${y}對${x}來說像並肩的夥伴；一個願意帶、一個願意跟，角色清楚又互相信任，是很穩的組合。偶爾換${y}拿主意，${x}也能輕鬆一點。`,
  夫妻: (x, y) =>
    `合起來看：${x}讓${y}心動，${y}讓${x}心安；一邊是吸引，一邊是陪伴與療癒，是很典型、也很珍貴的伴侶組合。${y}喜歡火花、${x}喜歡安穩，兩種需要輪流照顧，關係就既有熱度又有溫度。`,
  子女: (x, y) =>
    `合起來看：${y}疼${x}、想照顧${x}，也給${x}家一般的安定感，兩人很適合一起經營生活、一起創造屬於兩人的東西。${y}累的時候換${x}撐一下，這份照顧就會在兩人之間流動。`,
  財帛: (x, y) =>
    `合起來看：${x}帶動${y}的財運，${y}推動${x}的工作與志向，兩人是能互相成就的實際搭檔，一起做事業或存錢都很有成果。帳算清楚之外，也留一點時間只談心，感情和事業就能一起成長。`,
  疾厄: (x, y) =>
    `合起來看：${x}把${y}當成自在的朋友，${y}在${x}身邊身心都放鬆，彼此是很好的充電站。${x}累的時候說一聲，${y}就能更安心地陪伴。`,
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

/** 化X 飛入對方某宮：逐宮逐化寫出的具體作用，優點在前，成長點在後。 */
const FLIGHT_TEXT: Record<string, Record<string, FlightText>> = {
  命宮: {
    祿: (f, t, th) => `${f}的存在本身就讓${t}覺得舒服，${f}在${th}上的付出，${t}很自然就接收得到，像被溫柔地放在心上。${t}偶爾回一句「謝謝你」，這份好就會一直流動。`,
    權: (f, t) => `${f}是${t}人生選擇上很有力的推手，${t}迷惘時，${f}的一句話常能讓${t}定下心來。${f}給意見時留一點空間讓${t}自己拍板，推力就會變成${t}的底氣。`,
    科: (f, t) => `${f}由衷欣賞${t}，也樂意在別人面前替${t}說好話，${t}在${f}身邊會更有自信、更敢發光。${t}偶爾讓${f}看看自己不完美的一面，這份欣賞會變得更深。`,
    忌: (f, t, th) => `${f}對${t}這個人特別在乎、放不下，這是很深的緣分，${t}在${f}心裡的分量很重；${f}在${th}上的期待，其實都是在意。${f}把期待說成「我希望」，${t}就更能感受到其中的心意。`,
  },
  兄弟: {
    祿: (f, t) => `${f}對${t}身邊的手足、同事也很好，兩人一起合作或互相介紹資源都很順，${t}的人際圈因為${f}更熱絡。人情往來時偶爾聊聊彼此的分寸，就能一直輕鬆自在。`,
    權: (f, t) => `${f}在分工上很有一套，和${t}一起做事時常能把任務排得清清楚楚，效率很高。可以試試偶爾換${t}來排一次，兩人會更像真正的搭檔。`,
    科: (f, t) => `${f}在${t}的同儕和家人之間形象很好，${t}身邊的人很容易認可${f}，帶${f}見朋友家人${t}會很放心。私下${f}不必一直維持完美，真實的情緒${t}一樣接得住。`,
    忌: (f, t, th) => `${f}很把${t}當自己人，連${t}的手足、合作夥伴都放在心上，這份投入很真誠。在${th}上先把話講明、界線說好，合作就會很順。`,
  },
  夫妻: {
    祿: (f, t, th) => `${f}在感情上很能讓${t}心動，相處有甜度，${f}在${th}上的付出特別對${t}的胃口，是會讓${t}覺得「被好好愛著」的一條線。${t}也回送一點小驚喜，甜就會越來越濃。`,
    權: (f, t) => `${f}在感情裡願意帶節奏，約會去哪、多久見一次常由${f}安排，${t}很省心，也很有被照顧的感覺。重要的事問一句「你想怎麼過」，${t}會更喜歡被${f}帶著走。`,
    科: (f, t) => `${f}讓${t}覺得這段感情很體面、很值得驕傲，相處斯文有禮，意見不同時也能好好說，是很成熟的愛。偶爾放下客氣、撒個嬌，熱度就會跟著上來。`,
    忌: (f, t, th) => `${t}很可能是${f}最放不下的人，${f}對這段感情的投入又深又專一，在${th}上特別有感，這是兩人緣分最深的一條線。多留一點固定的談心時間，這份在乎就會成為最強的牽繫。`,
  },
  子女: {
    祿: (f, t) => `${f}很想寵${t}，也特別適合和${t}一起養寵物、做作品、經營共同興趣，兩人一起創造的東西常帶著滿滿的快樂。讓${t}也有親手完成的機會，成就感會加倍。`,
    權: (f, t) => `${f}對兩人共同的計畫（孩子、作品、興趣）很有想法，能把事情一步步推起來，是很可靠的執行者。${t}也記得說出自己的點子，兩人的作品會更完整。`,
    科: (f, t) => `${f}很能欣賞${t}的創意和作品，是${t}最溫暖的觀眾，${t}有了${f}的捧場更敢嘗試。想再進步時，${t}直接問「你覺得哪裡可以更好」，${f}就會給出真心的建議。`,
    忌: (f, t, th) => `${f}對${t}的子女、作品或晚輩特別上心，真的當成自己的事在顧，是很有責任感的在乎。在${th}上先問${t}的想法再補充，這份用心會更被感謝。`,
  },
  財帛: {
    祿: (f, t) => `${f}在金錢上對${t}很大方，也常帶給${t}賺錢的機會，兩人一起理財很順，是能一起把日子過得寬裕的組合。${t}也找機會回饋${f}，這份富足就是兩人一起的。`,
    權: (f, t) => `${f}很會守錢、做預算，兩人共同的錢交給${f}管，帳通常守得很穩。花費的規則一起訂，${t}也會更有參與感。`,
    科: (f, t) => `${f}能給${t}理性又實用的理財建議，${t}的錢在${f}的提醒下更有規劃。遇到大筆支出時兩人一起坐下來討論，建議就能變成共同的計畫。`,
    忌: (f, t, th) => `${f}很認真把兩人的錢當一回事，是想一起把生活顧好的那種在乎，在錢上的想法常和${f}的${th}有關。共同開銷先說好比例，這份認真就會成為安心感。`,
  },
  疾厄: {
    祿: (f, t) => `${f}待在${t}身邊時，${t}的身體和情緒都跟著放鬆，像被好好照顧著，是很有療癒感的陪伴。${f}累的時候，${t}也可以反過來照顧一下。`,
    權: (f, t) => `${f}很關心${t}的作息和健康，會催${t}早睡、陪${t}運動，是把${t}的身體放在心上的人。提醒時多用邀請的語氣，像「一起去走走吧」，${t}會更樂意配合。`,
    科: (f, t) => `${f}能用冷靜、溫和的方式陪${t}度過低潮或身體不適，有${f}在，${t}比較不慌。${t}需要的若是一個擁抱，直接說出來，${f}一定願意給。`,
    忌: (f, t, th) => `${f}和${t}的身心狀態連得很緊，${f}在${th}上的心情，${t}最能感受；反過來說，${t}也是最能接住${f}的人，這是很深的陪伴緣分。${f}累的時候先說一聲，兩人就能互相照應。`,
  },
  遷移: {
    祿: (f, t) => `${f}能為${t}帶來外面的機會與人脈，兩人一起出門、旅行特別順，常有意外的好運。回到家的日子也安排一點小新鮮，平凡就會變得有滋味。`,
    權: (f, t) => `${f}會推著${t}往外走，鼓勵${t}去闖、去見世面，是${t}向外發展時很有力的後盾。方向由${t}最後決定，${f}的支持會更有力量。`,
    科: (f, t) => `${f}讓${t}在外人面前更有面子，帶${f}出席場合${t}會覺得很加分，兩人是讓人羨慕的一對。私下也多聊聊真心話，外面的合拍就會延續到家裡。`,
    忌: (f, t, th) => `${f}很惦記${t}在外面的狀況，${t}出門、出差或到外地時，${f}總在${th}上牽掛著，這是被人放在心上的幸福。約好報平安的方式，牽掛就會變成安心。`,
  },
  僕役: {
    祿: (f, t) => `${f}在${t}的朋友圈很吃得開，兩人有共同朋友、一起聚會很自在，${t}的社交生活因為${f}更熱鬧。熱鬧之外，也留一些只屬於兩人的時間。`,
    權: (f, t) => `${f}看人很準，常能幫${t}分辨誰值得深交，是${t}社交圈裡的好參謀。給意見時點到為止，${t}會更願意聽。`,
    科: (f, t) => `${f}在${t}的朋友眼中評價很好，是會被朋友說「你們很配」的那種，有${f}在${t}很有面子。私下有小不滿時也輕輕說出來，好評就會表裡如一。`,
    忌: (f, t, th) => `${f}很想被放進${t}的生活圈，所以特別留意${t}的朋友和社交，${t}和誰出去、聊到多晚，都牽動著${f}的${th}。${t}主動分享行程，這份在意就會變成安全感。`,
  },
  官祿: {
    祿: (f, t) => `${f}能帶給${t}工作上的好運與實際幫助，兩人很適合一起做事，常能互相成就。合作順利時，也記得留時間聊聊工作以外的心事。`,
    權: (f, t) => `${f}在工作上很能推${t}一把，關鍵時刻常能幫${t}下定決心往前衝。${f}給方向、${t}做決定，兩人就是最好的事業搭檔。`,
    科: (f, t) => `${f}像${t}工作上的軍師，能幫${t}把想法整理清楚、做得更漂亮，${t}有了${f}的建議更有底氣。重要的決定讓${t}自己拍板，軍師的價值會更被看見。`,
    忌: (f, t, th) => `${f}特別在意${t}的工作表現與方向，在${th}上格外上心，也最願意陪${t}熬過低潮。工作的事先當同事討論，這份關心就能化成實際的支持。`,
  },
  田宅: {
    祿: (f, t) => `${f}讓${t}有家的感覺，兩人很適合一起布置住處、經營日常，平凡的日子也很溫馨。偶爾為對方打扮一下、安排個小驚喜，舒服之外更有心動。`,
    權: (f, t) => `${f}對家裡的安排很有主見，住哪裡、怎麼布置常能拿出好方案，省了${t}很多心力。留一個角落讓${t}自由發揮，這個家會更像兩個人的。`,
    科: (f, t) => `${f}能把${t}的生活打理得井井有條，和${t}的家人也相處得體，${t}的家人很容易喜歡${f}。慢慢放下拘謹，${f}會更自然地成為一家人。`,
    忌: (f, t, th) => `${f}對${t}的家和生活習慣很上心，是真心想和${t}一起過日子的那種在意，在${th}上特別有感。家事和作息先講好分工，同住會很愉快。`,
  },
  福德: {
    祿: (f, t) => `${f}能讓${t}打從心裡快樂，和${f}在一起，${t}的心特別安、特別放鬆，是${t}最好的心靈充電站。${t}也培養一些自己的小樂趣，兩人在一起時會更豐盛。`,
    權: (f, t) => `${f}能帶${t}看到新的想法和興趣，打開${t}的視野，${t}的精神世界因為${f}變得更寬。保留一些${t}原本就喜歡的東西，兩人的世界會更多彩。`,
    科: (f, t) => `${f}能讓${t}心情平靜，${t}煩惱時聽${f}說幾句就容易想通，是很溫柔的陪伴。心裡更深的結，${t}也可以放心說出來，${f}會陪著一起解。`,
    忌: (f, t, th) => `${f}和${t}在情感上綁得很深，${t}常把${f}放在心上，${f}一句關於${th}的話，就能讓${t}暖上一整天，偶爾也會讓${t}掛心一整晚，這是最深刻的心靈緣分。${f}心情不好時說一句「不是你的關係」，${t}就能安心。`,
  },
  父母: {
    祿: (f, t) => `${f}像${t}的貴人，給的建議和資源都很實用，${t}的長輩也容易喜歡${f}，有${f}在${t}很有底氣。${t}也找機會回報${f}，兩人就能平起平坐、互相扶持。`,
    權: (f, t) => `${f}在${t}面前像可靠的指導者，常能替${t}出好主意，讓${t}少走冤枉路。${f}先問「想聽建議嗎」，${t}會更樂意接受。`,
    科: (f, t) => `${f}能在文書、規劃上幫${t}很大的忙，說的話${t}很信得過。重要的事${t}再加上自己的判斷，就是最好的組合。`,
    忌: (f, t, th) => `${f}像長輩一樣放心不下${t}，在${th}上特別照看，和${t}的長輩、主管之間也很有緣，這份牽掛是一種保護。和${t}的長輩相處保持輕鬆的距離，${f}的關心會更被接受。`,
  },
};

/** 化忌的具體做法建議，依落入的宮位。 */
const JI_ACTION: Record<string, (from: string, to: string) => string> = {
  命宮: (f) => `${f}把在意說出口時，用「我希望」開頭，而不是「你應該」。`,
  兄弟: (_f, t) => `和${t}的手足、同事相處，先問清楚分工與界線。`,
  夫妻: () => '隔一段時間聊聊彼此的期待，讓在乎化成安心，而不是猜測。',
  子女: (_f, t) => `對共同的計畫或晚輩，先問${t}想怎麼做，再補充意見。`,
  財帛: () => '共同開銷與借貸先講好規則，錢的事白紙黑字最安心。',
  疾厄: (f, t) => `${f}累的時候先照顧好自己，再讓${t}知道需要什麼樣的陪伴。`,
  遷移: (f, t) => `${t}外出時約好報平安的方式，${f}就能放心。`,
  僕役: (_f, t) => `給${t}和朋友相處的空間，有疑慮就直接問，不要猜。`,
  官祿: (_f, t) => `談工作時先聽${t}說完，給建議而不是下指令。`,
  田宅: () => '同住時把家事和作息分工講清楚，各自保留一個角落。',
  福德: (f, t) => `${f}心情不好時先說一句「不是你的問題」，${t}就不會想太多。`,
  父母: (_f, t) => `和${t}的長輩、主管保持禮貌距離，不必替${t}出頭。`,
};

const SAME_ELEMENT_NOTE: Record<Element, string> = {
  木: '兩人都屬木，都喜歡成長、有理想，一起學東西、規劃未來特別投入，是會一起變得更好的組合。意見不同時，可以試試「各長一枝」，讓兩人的想法並存。',
  火: '兩人都屬火，熱情、反應快，在一起總是很有活力，一起做事說衝就衝。情緒上來時約好先喝杯水再說，熱情就只會用在對的地方。',
  土: '兩人都屬土，穩重、重承諾，生活很有安全感，是能把日子踏實過好的組合。偶爾一起嘗試沒做過的事，穩定裡也會長出新鮮感。',
  金: '兩人都屬金，講原則、做事俐落、說到做到，彼此都很信得過對方。意見不同時，先讓一步的那個人其實最有力量。',
  水: '兩人都屬水，聰明、會變通，很能聊、很懂彼此心思，相處充滿靈感。重要的計畫寫下來、定個日子，靈活就會變成效率。',
};

/** 相生：key 是給予的一方的五行。 */
const GENERATE_NOTE: Record<Element, (g: string, r: string) => string> = {
  木: (g, r) => `木生火：${g}像柴火，常用鼓勵和點子點燃${r}的熱情，${r}在${g}身邊特別有衝勁、特別亮。${r}衝得順的時候回頭謝謝${g}，也照顧一下${g}的體力，這份支持就能源源不絕。`,
  火: (g, r) => `火生土：${g}的熱情與行動讓${r}覺得踏實、被支持，${r}也用自己的穩定接住${g}的熱度。${r}偶爾主動跨出第一步，${g}會覺得被回應。`,
  土: (g, r) => `土生金：${g}是穩定的後盾，讓${r}能放心做決定、衝事業，${r}的每一次成果裡都有${g}的一份。${r}常把感謝說出口，${g}就知道自己有多重要。`,
  金: (g, r) => `金生水：${g}的原則和判斷，替想法多、變化快的${r}定下方向，${r}有了${g}更敢放手去想。${g}給建議時語氣放軟、${r}也練習自己拿主意，兩人會一起變得更強。`,
  水: (g, r) => `水生木：${g}的體貼和理解滋養${r}成長，${r}在${g}身邊特別敢做夢。${r}也記得回頭澆灌${g}，這份滋養就會雙向流動。`,
};

/** 相剋：key 是剋人的一方的五行。 */
const CONTROL_NOTE: Record<Element, (c: string, t: string) => string> = {
  木: (c, t) => `木剋土：${c}充滿往前推的動力，帶著${t}走出原本不會踏出的那一步，${t}的穩也替${c}的衝勁打好地基。${c}放慢一點、${t}多試一點，兩人的步伐會越來越合。`,
  火: (c, t) => `火剋金：火能鍛金，${c}的熱情常讓${t}重新想過自己的原則，想過之後往往更站得住腳。${c}情緒上來時先降溫再談，這份磨練就會變成兩人的成長。`,
  土: (c, t) => `土剋水：有${c}這道堤防，${t}的點子才不會四處流散，${c}的規劃讓${t}的靈感真的落地。留一點彈性給${t}，關係會更輕鬆。`,
  金: (c, t) => `金剋木：${c}眼光銳利，能替${t}修剪掉多餘的枝葉，${t}因此長得更有方向。${c}先肯定再建議，${t}會把這份修剪當成禮物。`,
  水: (c, t) => `水剋火：${c}冷靜理性，常在${t}衝動時幫忙踩一下煞車，讓${t}少走很多彎路，${t}的熱情也替${c}的生活加溫。${c}先接住${t}的熱情，再提醒現實面，就是最好的搭配。`,
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
  紫微: '在一群人裡自然成為拿主意的人，靠得住、有擔當，給人很強的安全感；很顧形象，需要一點台階才好放下身段',
  天機: '點子多、反應快，總能想到別人沒想到的辦法，相處很少無聊；靈感一多，計畫也常跟著新想法調整',
  太陽: '熱心、溫暖，朋友有事總是第一個出現，像身邊的小太陽；付出時也希望被看見，一句謝謝就能充滿電',
  武曲: '話不多但說到做到，做事有效率、很可靠，溫柔都藏在行動裡，需要身邊的人細心發現',
  天同: '隨和好相處，讓身邊的人很放鬆，跟誰都處得來；喜歡舒服的節奏，遇到難題時需要一點推力',
  廉貞: '有原則、真誠又愛恨分明，對在乎的人特別投入；情緒來得快也寫在臉上，反而很好懂',
  天府: '穩重、有規劃，總能把家裡和存款顧好，給人很踏實的感覺；面對變動比較謹慎，給點時間就能接受',
  太陰: '細心、溫柔，很會察覺氣氛、照顧別人的感受；有心事時習慣先放在心裡，被溫柔地問起才會說',
  貪狼: '興趣廣、很會炒熱氣氛，身邊的人很少覺得無聊，生活多彩多姿；喜歡新鮮，日常裡多點變化就很開心',
  巨門: '觀察入微，常一眼看出問題、說到重點，是很好的軍師；說話直，語氣放軟時更能被聽進去',
  天相: '懂分寸、會照顧場面，常是居中協調、讓大家都舒服的人；顧著別人時，也值得多說說自己的需要',
  天梁: '像可靠的大哥大姊，習慣照顧人、給建議，遇事沉得住氣；關心多的時候，用分享代替叮嚀會更好',
  七殺: '行動派，想到就做，獨立又勇敢，遇到挑戰反而來勁；習慣自己扛，學著偶爾開口求助會更輕鬆',
  破軍: '敢從零開始，總能替生活帶來新局面和驚喜；喜歡變化，重大改變前先和身邊的人商量會更順',
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
  天機: { text: '會先查資料、比較好幾個方案，連訂一家餐廳都會認真比較', style: 'analyze' },
  太陽: { text: '憑熱情和直覺先答應下來，細節邊做邊補', style: 'fast' },
  武曲: { text: '先算成本和效益，划不划算比好不好玩重要，算完就很快決定', style: 'fast' },
  天同: { text: '看心情和舒不舒服做決定，喜歡有時間慢慢選', style: 'feel' },
  廉貞: { text: '先問合不合自己的原則與感覺，一旦認定就很堅定', style: 'feel' },
  天府: { text: '要先看到完整的規劃和退路，才願意點頭', style: 'steady' },
  太陰: { text: '會在心裡反覆琢磨，也很在意這個決定會不會讓誰不開心', style: 'feel' },
  貪狼: { text: '哪個選項好玩、有新鮮感就先試，不行再換', style: 'fast' },
  巨門: { text: '會先找漏洞、問「萬一呢」，想通了才放心', style: 'analyze' },
  天相: { text: '會先問大家的意見，找一個各方都能接受的做法', style: 'steady' },
  天梁: { text: '從長遠和「對不對」來想，常替別人考慮得比自己多', style: 'analyze' },
  七殺: { text: '看準目標就直接衝，不喜歡討論太久', style: 'fast' },
  破軍: { text: '傾向選最有突破性的選項，不怕推翻原本的計畫', style: 'fast' },
};

/** 意見不合時的反應。 */
const STAR_CONFLICT: Record<string, { text: string; style: ConflictStyle }> = {
  紫微: { text: '意見不合時很在意自己有沒有被尊重，給足面子，就很願意各退一步', style: 'withdraw' },
  天機: { text: '意見不合時腦筋轉很快，會一條條分析，把問題理得很清楚', style: 'reason' },
  太陽: { text: '意見不合時直來直往，火氣來得快、消得也快，事後不記仇', style: 'direct' },
  武曲: { text: '意見不合時話會變少，習慣先埋頭做事讓自己冷靜下來', style: 'withdraw' },
  天同: { text: '意見不合時最想趕快和好，常先退一步，心裡的感受需要有人問起', style: 'soothe' },
  廉貞: { text: '意見不合時情緒很真，碰到底線會直接說出來，事後也很願意修補', style: 'direct' },
  天府: { text: '意見不合時表面冷靜、不愛正面衝突，會把事情放在心裡慢慢想', style: 'withdraw' },
  太陰: { text: '意見不合時傾向先安靜、自己消化，過一陣子才說得出真正的感受', style: 'withdraw' },
  貪狼: { text: '意見不合時常用開玩笑或撒嬌化解，不喜歡讓氣氛僵著', style: 'soothe' },
  巨門: { text: '意見不合時想把話講透、把是非理清，說出口有時比本意更直', style: 'reason' },
  天相: { text: '意見不合時會先顧和氣、想辦法折衷，很在意事情公不公平', style: 'soothe' },
  天梁: { text: '意見不合時習慣講道理、替對方分析該怎麼做', style: 'reason' },
  七殺: { text: '意見不合時想當下講清楚，講完就翻篇，不留隔夜仇', style: 'direct' },
  破軍: { text: '意見不合時很乾脆，受夠了會直接攤牌，話說完就想往前走', style: 'direct' },
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
  天梁: { text: '用照顧和提醒表達愛，對方的大小事都會放在心上', outward: false },
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
  天同: '溫和體貼、相處很放鬆的人',
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

const FALLBACK_PERSONA = '個性有彈性，能隨環境與身邊的人調整，很好相處；偶爾也值得把自己的立場說清楚';
const FALLBACK_THINK = { text: '做決定時會看情況調整，也很願意參考身邊的人', style: 'steady' as ThinkStyle };
const FALLBACK_CONFLICT = { text: '意見不合時會先觀察對方，再決定怎麼回應', style: 'soothe' as ConflictStyle };
const FALLBACK_LOVE_SHOW = { text: '表達愛的方式會跟著對方調整', outward: false };
const FALLBACK_LOVE_FEEL = '對方穩定地陪在身邊';

const THINK_ORDER: readonly ThinkStyle[] = ['fast', 'analyze', 'steady', 'feel'];
const CONFLICT_ORDER: readonly ConflictStyle[] = ['direct', 'reason', 'withdraw', 'soothe'];

/** key 是「x 的類型-y 的類型」，依 *_ORDER 排序。 */
const THINK_PAIR: Record<string, (x: string, y: string) => string> = {
  'fast-fast': () => '兩人都行動力十足，說好就出發，事情推得飛快，一起做事很痛快。方向不同時先花一分鐘對齊目標，速度就會變成兩人的優勢。',
  'fast-analyze': (x, y) =>
    `${x}想先做再說，${y}想先想清楚，一個補行動力、一個補周全，是天生的分工組合：出去玩時${x}早早訂好票，${y}已經把最好吃的店列好了。${x}等${y}一下、${y}也信${x}一次，就會很順。`,
  'fast-steady': (x, y) =>
    `${x}踩油門、${y}顧煞車，兩人一起做的決定，通常比各自做的少走很多冤枉路。像大筆花費、搬家、換工作這類事，先給${y}一兩天消化，${x}的衝勁就能用在最對的時機。`,
  'fast-feel': (x, y) =>
    `${x}能把${y}猶豫很久的事輕快地推動起來，${y}則提醒${x}這個決定讓人舒不舒服，兩人合起來既有效率又有溫度。${x}做決定前多問一句「你覺得呢」，${y}會更安心地跟上。`,
  'analyze-analyze': () => '兩人都想得深，討論很有質量，常能把事情看得比別人透澈。可以試試替每件事訂個「決定期限」，深思熟慮就能更快落地。',
  'analyze-steady': (x, y) =>
    `${x}負責找問題、${y}負責守底線，做大決定特別穩，很少出錯。偶爾一起挑戰一件新事情，穩健之外也會多點驚喜。`,
  'analyze-feel': (x, y) =>
    `${x}講邏輯、${y}講感受，合在一起能看到事情的兩面，決定周全又有人情味。${x}先回應${y}的心情再談道理，兩人就會很有默契。`,
  'steady-steady': () => '兩人都求穩，生活規律、很少出亂子，是能一起把日子踏實過好的組合。偶爾刻意安排一點新鮮事，穩定裡也會充滿樂趣。',
  'steady-feel': (x, y) =>
    `${x}給${y}安全感，${y}讓${x}的生活多了溫度與彈性，一個有規劃、一個有感覺，彼此補位。${x}照計畫走時記得問${y}「你覺得呢」，${y}想調整時也說說原因，兩人都會更放心。`,
  'feel-feel': () => '兩人都憑感覺做決定，默契很好，常常不用多說就想到一塊。遇到錢、合約這類大事時一起列張清單，直覺就有了穩穩的後盾。',
};

const CONFLICT_PAIR: Record<string, (x: string, y: string) => string> = {
  'direct-direct': () => '兩人都直來直往，話都攤在桌上，很少有悶在心裡的舊帳，和好也快。情緒上來時約好「先停五分鐘再講」，坦率就會是兩人最大的優點。',
  'direct-reason': (x, y) =>
    `${x}希望對方表態、${y}希望把道理講清楚，兩人都不逃避，問題總會被好好拿出來談。先說「我在意的是什麼」，再談怎麼解決，溝通會順很多。`,
  'direct-withdraw': (x, y) =>
    `${x}讓問題不被擱著，${y}讓場面不至於失控，一個勇於開口、一個沉得住氣，其實很互補。約好${y}可以先冷靜，但說出「我需要多久」，${x}就能安心等待。`,
  'direct-soothe': (x, y) =>
    `${x}心直口快，${y}溫和願讓，兩人很少冷戰、和好也快。等氣氛平靜後，讓${y}把心裡話說完，這份和氣就會更踏實。`,
  'reason-reason': () => '兩人都講道理，意見不合時常能真的把事情說清楚，很少不了了之。先承認對方有一句說得對，討論就會從辯論變成合作。',
  'reason-withdraw': (x, y) =>
    `${x}能把問題理清楚，${y}則不會火上加油，兩人很少鬧到不可收拾。改用傳訊息或隔天再談，${y}更說得出心裡話，${x}的分析也更容易被接住。`,
  'reason-soothe': (x, y) =>
    `${x}想把事情理清，${y}想快點和好，兩人很難真的鬧大，是很平和的組合。讓${y}先說完感受，再一起理出結論，兩人都會覺得被在乎。`,
  'withdraw-withdraw': () => '兩人意見不合時都先沉默，很少說出傷人的話，相處很有修養。約好冷靜之後一定回來聊，安靜就不會變成距離。',
  'withdraw-soothe': (x, y) =>
    `${x}先安靜、${y}主動示好，這段關係很少撕破臉，總有人願意先伸出手。${x}回一句「我需要一點時間，不是在生你的氣」，${y}就能放心等待。`,
  'soothe-soothe': () => '兩人都珍惜和氣，很少起大衝突，相處溫柔又放鬆。定期問彼此「最近有沒有哪裡不舒服」，小事就不會累積成大事。',
};

/** 結構辛苦的組合，在處理矛盾裡多補一句坦白的提醒（依兩人的反應類型）。 */
const HARD_CONFLICT_NOTE: Record<ConflictStyle, string> = {
  direct: '不過要老實說，以這組盤來看，兩人的在意集中在最核心的位置，一旦卡住，話容易越說越重，傷到的往往是最在乎的那一塊；比起當下爭出結果，先停下來更重要。',
  reason: '不過要老實說，以這組盤來看，兩人的在意集中在最核心的位置，講道理很容易變成互相證明誰對，問題說清楚了，心卻離得更遠；先處理感受，再處理對錯。',
  withdraw: '不過要老實說，以這組盤來看，兩人的在意集中在最核心的位置，沉默很容易被解讀成不在乎，冷下來的時間一長，距離就真的出現了；冷靜可以，但要約好回來的時間。',
  soothe: '不過要老實說，以這組盤來看，兩人的在意集中在最核心的位置，一直讓步、一直求和，真正的不滿反而沒被說出口，累積久了會突然爆開；和好之前，先把心裡的話講完。',
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
/** 四化落在命、夫妻、福德時，被愛的感受（feel）與一個小小的成長點（tip，接在 feel 後面）。 */
/** tip 有兩種寫法，同一化出現第二次時換一句，避免同段重複。 */
const LOVE_FEEL_BY_MUTAGEN: Record<string, { feel: string; tip: ((from: string, to: string) => string)[] }> = {
  祿: {
    feel: '被寵、被照顧',
    tip: [
      (f, t) => `，這份甜是兩人很珍貴的養分；${t}偶爾也回寵${f}一下，就能一直甜下去`,
      (f, t) => `；${t}也找機會反過來照顧${f}，這份好就會在兩人之間來回流動`,
    ],
  },
  權: {
    feel: '有人撐腰、被保護',
    tip: [
      (f, t) => `，有${f}在，${t}很安心；${t}想自己做主時，${f}退半步支持，${t}會更感動`,
      (f, t) => `；偶爾讓${t}主導一次，${f}的保護會更被珍惜`,
    ],
  },
  科: {
    feel: '被欣賞、被尊重',
    tip: [
      (f, t) => `，在${f}眼中${t}一直很有光彩；${t}偶爾露出不設防的一面，兩人會更親近`,
      (f, t) => `；${t}不必一直維持完美，${f}欣賞的本來就是真實的${t}`,
    ],
  },
};

function dailyLifeLines(a: ZiweiPartner, b: ZiweiPartner, syn: ZiweiSynastry, fit: ZiweiFit): string[] {
  const soul = { a: palaceStars(a.chart, syn.soulA), b: palaceStars(b.chart, syn.soulB) };
  const fude = { a: palaceStars(a.chart, byName(a.chart, '福德')), b: palaceStars(b.chart, byName(b.chart, '福德')) };
  const spouse = { a: palaceStars(a.chart, byName(a.chart, '夫妻')), b: palaceStars(b.chart, byName(b.chart, '夫妻')) };
  const A = a.name;
  const B = b.name;
  const name = (k: PartnerKey) => (k === 'a' ? A : B);
  const other = (k: PartnerKey) => (k === 'a' ? B : A);
  const theme = (star: string) => STAR_THEME[star] ?? `${star}相關的事`;
  const flights = syn.flights.filter((f): f is ZiweiMutagenFlight & { palace: string } => f.palace !== null);

  // 先說在前面（只有結構辛苦的組合）
  const upfront: string[] = [];
  if (fit.difficult) {
    const bondJi = flights.filter((f) => f.mutagen === '忌' && BOND_PALACES.includes(f.palace));
    const lines = bondJi.map((f) => `${name(f.from)}的化忌在${other(f.from)}的${displayPalaceName(f.palace)}`).join('、');
    upfront.push(
      `【先說在前面】坦白說，從紫微合盤來看，這是一組需要比一般組合多花力氣的關係：${lines}，牽掛集中在最核心的位置；化祿沒有落在對方的命、夫妻、交友、福德這幾宮，少了自然的甜頭來緩衝；五行局又是相剋，兩人的基本節奏容易互相壓制。這不代表不能在一起，而是代表很多事不會「自然就好」，需要兩人都有意識地經營。下面先寫兩人相處的好，再寫最需要留意的地方。`,
    );
  }

  // 個性
  const persona = (ps: PalaceStars) => {
    const main = lead(ps, STAR_PERSONA) ?? FALLBACK_PERSONA;
    const second = ps.names[1];
    const extra = second && STAR_TRAIT[second] ? `，也帶著${second}${STAR_TRAIT[second]}的一面` : '';
    return `${main}${extra}`;
  };
  const sameLead = !!soul.a.names[0] && soul.a.names[0] === soul.b.names[0];
  /** 兩人同一顆主星時，描述一樣就合成一句，不重複兩次。 */
  const both = (x: string, y: string, same: string) => (x === y ? `${same}${x}。` : `${A}${x}；${B}${y}。`);
  const extraOf = (ps: PalaceStars) => {
    const second = ps.names[1];
    return second && STAR_TRAIT[second] ? `${second}${STAR_TRAIT[second]}的一面` : '';
  };
  const personality: string[] = [];
  if (sameLead) {
    const main = lead(soul.a, STAR_PERSONA) ?? FALLBACK_PERSONA;
    const [ea, eb] = [extraOf(soul.a), extraOf(soul.b)];
    const diff =
      ea && eb && ea !== eb
        ? `不同的是，${A}還帶著${ea}，${B}則帶著${eb}。`
        : ea || eb
          ? `不同的是，${ea ? A : B}還帶著${ea || eb}。`
          : '';
    personality.push(
      `${A}（命宮${starsLabel(soul.a)}）和${B}（命宮${starsLabel(soul.b)}）都${main}。${diff}兩人命宮主星都是${soul.a.names[0]}，很容易在對方身上看到自己，欣賞對方的地方，往往也是自己的長處，這份「像」是很難得的默契；看到對方的小毛病時溫柔一點，那常常也是自己的影子。`,
    );
  } else {
    personality.push(`${A}（命宮${starsLabel(soul.a)}）${persona(soul.a)}；${B}（命宮${starsLabel(soul.b)}）${persona(soul.b)}。`);
  }
  const relaxA = lead(fude.a, STAR_RELAX);
  const relaxB = lead(fude.b, STAR_RELAX);
  if (relaxA && relaxB) {
    personality.push(
      fude.a.names[0] === fude.b.names[0]
        ? `兩人福德宮都是${fude.a.names[0]}，放鬆方式很像：都${relaxA}，排假日行程幾乎不用討論，一起充電特別合拍。偶爾輪流帶對方試一件新事情，舒適圈會越來越大。`
        : `放假時，${A}${relaxA}；${B}則${relaxB}。正因為不一樣，兩人能替彼此打開另一種充電方式，輪流照對方的方式過一天，生活會變得更豐富。`,
    );
  }

  // 思考方式
  const tA = lead(soul.a, STAR_THINK) ?? FALLBACK_THINK;
  const tB = lead(soul.b, STAR_THINK) ?? FALLBACK_THINK;
  const thinking = [both(tA.text, tB.text, `${A}和${B}在這點上一模一樣：`), pairNote(THINK_PAIR, THINK_ORDER, tA.style, tB.style, A, B)];
  for (const f of flights) {
    if (f.mutagen === '權' && (f.palace === '命宮' || f.palace === '官祿')) {
      thinking.push(`${name(f.from)}的${f.star}化權落在${other(f.from)}的${displayPalaceName(f.palace)}，${other(f.from)}拿不定主意時，有${name(f.from)}幫忙拍板會安心很多；重要的決定由${other(f.from)}說最後一句，這份支持會更有力量。`);
    }
    if (f.mutagen === '科' && (f.palace === '官祿' || f.palace === '父母')) {
      thinking.push(`${name(f.from)}的${f.star}化科落在${other(f.from)}的${displayPalaceName(f.palace)}，${other(f.from)}想法卡住時，${name(f.from)}常能幫忙把思路理清，是很好的討論對象；${other(f.from)}把心裡真正的顧慮也說出來，${name(f.from)}就能幫得更到位。`);
    }
  }

  // 處理矛盾
  const cA = lead(soul.a, STAR_CONFLICT) ?? FALLBACK_CONFLICT;
  const cB = lead(soul.b, STAR_CONFLICT) ?? FALLBACK_CONFLICT;
  const conflict = [both(cA.text, cB.text, '這點兩人也很像，'), pairNote(CONFLICT_PAIR, CONFLICT_ORDER, cA.style, cB.style, A, B)];
  if (fit.difficult) conflict.push(HARD_CONFLICT_NOTE[cA.style]);
  const jiKey = flights.filter((f) => f.mutagen === '忌' && f.key);
  if (jiKey.length === 2 && jiKey[0].palace === jiKey[1].palace && jiKey[0].from !== jiKey[1].from) {
    const [x, y] = jiKey;
    conflict.push(
      fit.difficult
        ? `兩人的化忌都落在對方的${displayPalaceName(x.palace)}（${name(x.from)}的${x.star}、${name(y.from)}的${y.star}），${name(x.from)}在意的是「${theme(x.star)}」，${name(y.from)}在意的是「${theme(y.star)}」，兩人在意的不是同一件事，又都放在心上，很容易各說各的、都覺得對方不懂。這也正說明誰都放不下誰；把各自最在意的那件事明白說出來，比猜對方在氣什麼有用得多。`
        : `兩人的化忌都落在對方的${displayPalaceName(x.palace)}（${name(x.from)}的${x.star}、${name(y.from)}的${y.star}），${name(x.from)}在意的是「${theme(x.star)}」，${name(y.from)}在意的是「${theme(y.star)}」。兩人都把對方放在心上，這是很深的緣分；聊到這兩件事時先說一句「我是因為在乎你」，在意就會變成靠近的理由。`,
    );
  } else {
    jiKey.forEach((f, i) => {
      const at = `${name(f.from)}的${f.star}化忌落在${other(f.from)}的${displayPalaceName(f.palace)}`;
      conflict.push(
        i === 0
          ? fit.difficult
            ? `${at}，「${theme(f.star)}」是兩人最容易起摩擦的地方，${name(f.from)}越在乎越容易把話說重；摩擦底下是在乎，但在乎需要被好好說出來，才不會變成互相傷害。`
            : `${at}，${name(f.from)}對${other(f.from)}特別在乎，這份在乎最常表現在「${theme(f.star)}」上；聊到這件事時多一點耐心，就是兩人最好的練習。`
          : `另外，${at}，「${theme(f.star)}」也是${name(f.from)}很放在心上的事；這份重量，正說明${other(f.from)}在${name(f.from)}心裡占了多大的位置。`,
      );
    });
  }
  const quanHome = flights.filter((f) => f.mutagen === '權' && (f.palace === '夫妻' || f.palace === '田宅'));
  if (quanHome.length === 2 && quanHome[0].from !== quanHome[1].from) {
    conflict.push(
      `兩人的化權都落在對方的${quanHome.map((f) => displayPalaceName(f.palace)).filter((v, i, arr) => arr.indexOf(v) === i).join('、')}，兩個人都肯出力、都有主見，生活上的事推得特別快；事先分好誰管哪一塊，兩股力量就能往同一個方向使。`,
    );
  } else {
    for (const f of quanHome) {
      conflict.push(`${name(f.from)}的化權落在${other(f.from)}的${displayPalaceName(f.palace)}，${name(f.from)}願意扛起生活上的決定，${other(f.from)}因此省心不少；事先說好哪些事由誰作主，合作會更順。`);
    }
  }

  // 親密與愛
  const lA = lead(soul.a, STAR_LOVE_SHOW) ?? FALLBACK_LOVE_SHOW;
  const lB = lead(soul.b, STAR_LOVE_SHOW) ?? FALLBACK_LOVE_SHOW;
  const feelA = lead(soul.a, STAR_LOVE_FEEL) ?? FALLBACK_LOVE_FEEL;
  const feelB = lead(soul.b, STAR_LOVE_FEEL) ?? FALLBACK_LOVE_FEEL;
  const love = [
    both(lA.text, lB.text, '兩人愛人的方式也相同，') +
      (feelA === feelB
        ? `兩人最容易感到被愛的時候也一樣，都是${feelA}；要的東西相同，很容易給到對方心坎裡，誰先主動一點，甜就來得更快。`
        : `${A}最容易感到被愛的時候，是${feelA}；${B}則是${feelB}。`),
    lA.outward === lB.outward
      ? lA.outward
        ? '兩人都外放，愛意說得出口、做得出來，相處很甜、很有熱度；忙的時候也記得留一句問候，熱度就不會斷。'
        : '兩人都是默默做的比說的多，關係踏實不浮誇，心意都藏在小事裡；偶爾直接說一句「謝謝你」「我很在乎你」，效果會比想像中大。'
      : (() => {
          const [o, i] = lA.outward ? [A, B] : [B, A];
          return `${o}的愛很直接，${i}的愛藏在小事裡，一個帶來熱度、一個帶來細水長流，是很互補的組合；${o}多留意${i}默默做的事，${i}也偶爾把心意說出口，兩人都會更有被愛的感覺。`;
        })(),
  ];
  const wishes = (
    [
      [A, B, spouse.a, soul.b],
      [B, A, spouse.b, soul.a],
    ] as const
  ).flatMap(([self, mate, sp, mateSoul]) => {
    const wish = lead(sp, STAR_SPOUSE_WISH);
    if (!wish) return [];
    const match = mateSoul.names.find((n) => sp.names.includes(n));
    return [{ self, mate, wish, match, label: `${self}的夫妻宮${sp.borrowed ? '' : '是'}${starsLabel(sp)}` }];
  });
  const unmatched = wishes.filter((w) => !w.match);
  for (const w of wishes) {
    if (w.match) {
      love.push(`${w.label}，心裡期待${w.wish}；${w.mate}的命宮正好也有${w.match}，很符合${w.self}心中的伴侶樣子，是很容易心動的組合。相處久了看到真實的一面，${w.self}也會發現${w.mate}比想像中更可愛。`);
    } else if (unmatched.length === 1) {
      love.push(`${w.label}，心裡期待${w.wish}；${w.mate}也許不完全是這個樣子，卻帶著自己獨特的好，不拿心中的範本去比，${w.self}會發現更多驚喜。`);
    }
  }
  if (unmatched.length === 2) {
    const [x, y] = unmatched;
    love.push(`${x.label}，心裡期待${x.wish}；${y.label}，期待的是${y.wish}。兩人都不是照著範本挑的對象，也正因為如此，才更看得到對方本來的好，這份「意料之外」本身就很珍貴。`);
  }
  const usedTip: Record<string, number> = {};
  for (const f of flights) {
    if (!LOVE_PALACES.includes(f.palace)) continue;
    const where = `${name(f.from)}的${f.star}化${f.mutagen}落在${other(f.from)}的${displayPalaceName(f.palace)}`;
    const m = LOVE_FEEL_BY_MUTAGEN[f.mutagen];
    if (m) {
      const n = usedTip[f.mutagen] ?? 0;
      usedTip[f.mutagen] = n + 1;
      love.push(`${where}，${other(f.from)}特別容易從${name(f.from)}身上感到${m.feel}${m.tip[n % m.tip.length](name(f.from), other(f.from))}。`);
    } else if (f.mutagen === '忌') {
      const n = usedTip['忌'] ?? 0;
      usedTip['忌'] = n + 1;
      love.push(
        fit.difficult
          ? n === 0
            ? `${where}，${other(f.from)}是${name(f.from)}感情裡最放不下的人，這份在乎很真，但也很重；${name(f.from)}不安時容易用要求代替表達，${other(f.from)}則可能覺得怎麼做都不夠。把「我需要什麼」具體說出來，是這段關係最重要的功課。`
            : `${where}，${name(f.from)}對${other(f.from)}的牽掛同樣很深；兩個人都把對方放得很重，不安也最容易互相傳染，一個人慌的時候，另一個人要先穩住，而不是跟著慌。`
          : n === 0
            ? `${where}，${other(f.from)}是${name(f.from)}感情裡最放不下的人，這份在乎很真也很深，是兩人最牢的牽繫；${name(f.from)}不安時，${other(f.from)}一句確定的話就能讓一切安穩。`
            : `${where}，${name(f.from)}對${other(f.from)}的牽掛同樣很深；兩個人都把對方放在心上，這段關係很有分量，一個人慌的時候，另一個人先穩住就好。`,
      );
    }
  }

  return [
    ...upfront,
    `【個性】${personality.join('')}`,
    `【思考方式】${thinking.filter(Boolean).join('')}`,
    `【處理矛盾】${conflict.filter(Boolean).join('')}`,
    `【親密與愛】${love.join('')}`,
  ];
}

// ---------------------------------------------------------------------------
// 這段關係的禮物：從這組盤裡挑出最珍貴的地方
// ---------------------------------------------------------------------------

/** x 的命宮落在 y 的某宮時，x 帶給 y 的東西。 */
const GIFT_ROLE: Record<string, (x: string, y: string) => string> = {
  命宮: () => '兩人是彼此的「同類」，很多話不用說出口就懂',
  兄弟: (x, y) => `${x}是${y}身邊最有默契的夥伴，能一起並肩做很多事`,
  夫妻: (x, y) => `${x}帶給${y}心動的感覺，讓${y}相信遇到了對的人`,
  子女: (x, y) => `${y}在${x}身上找到想疼、想一起創造的快樂`,
  財帛: (x, y) => `${x}讓${y}的生活更寬裕、更踏實`,
  疾厄: (x, y) => `${x}是${y}身心最放鬆的避風港`,
  遷移: () => '兩人一內一外，讓彼此看見更大的世界',
  僕役: (x, y) => `${x}是${y}最自在、不用裝的自己人`,
  官祿: (x, y) => `${x}是${y}追夢路上的推手`,
  田宅: (x, y) => `${x}給${y}一種回到家的安心`,
  福德: (x, y) => `${x}是讓${y}打從心底快樂的人`,
  父母: (x, y) => `${x}像${y}可以信賴的前輩，讓${y}走得更穩`,
};

const GIFT_FLIGHT: Record<string, (f: string, t: string, where: string, theme: string) => string> = {
  祿: (f, t, where, th) => `${where}，${f}在${th}上給的好，是${t}最能感受到的溫柔`,
  權: (f, t, where, th) => `${where}，在${th}上，${f}是${t}最有力的支持`,
  科: (f, t, where) => `${where}，${f}的欣賞讓${t}更相信自己`,
};

const SAME_GIFT: Record<Element, string> = {
  木: '一起成長、一起變得更好',
  火: '熱熱鬧鬧把日子過亮',
  土: '把日子踏實地過好',
  金: '說到做到、彼此信任',
  水: '心意相通、一起靈活應變',
};

/** 相生：key 是給予的一方的五行。 */
const GENERATE_GIFT: Record<Element, (g: string, r: string) => string> = {
  木: (g, r) => `${g}的鼓勵是${r}熱情的柴火`,
  火: (g, r) => `${g}的熱度讓${r}的生活更踏實溫暖`,
  土: (g, r) => `${g}的穩定是${r}最安心的後盾`,
  金: (g, r) => `${g}的判斷替${r}的想法指出方向`,
  水: (g, r) => `${g}的體貼一直滋養著${r}`,
};

function bestFlight(syn: ZiweiSynastry, from: PartnerKey): ZiweiMutagenFlight | undefined {
  const own = syn.flights.filter((f) => f.from === from && f.palace && f.mutagen !== '忌');
  const rank = (f: ZiweiMutagenFlight) => (f.key ? 0 : 10) + ['祿', '權', '科'].indexOf(f.mutagen);
  return [...own].sort((x, y) => rank(x) - rank(y))[0];
}

function giftLines(a: ZiweiPartner, b: ZiweiPartner, syn: ZiweiSynastry, fit: ZiweiFit): string[] {
  const name = (k: PartnerKey) => (k === 'a' ? a.name : b.name);
  const other = (k: PartnerKey) => (k === 'a' ? b.name : a.name);
  const sentences: string[] = [];

  // 1. 命宮對照：在彼此生命裡的角色
  const symmetric = syn.soulAInB === '命宮' || syn.soulAInB === '遷移';
  const roles = [
    syn.soulAInB ? GIFT_ROLE[syn.soulAInB]?.(a.name, b.name) : undefined,
    !symmetric && syn.soulBInA ? GIFT_ROLE[syn.soulBInA]?.(b.name, a.name) : undefined,
  ].filter((s): s is string => !!s);
  if (roles.length > 0) sentences.push(`${roles.join('；')}。`);

  // 2. 四化：兩人各自最好的那條祿、權、科
  const gifts = (['a', 'b'] as const)
    .map((k) => bestFlight(syn, k))
    .filter((f): f is ZiweiMutagenFlight & { palace: string } => !!f && !!f.palace)
    .map((f) => {
      const where = `${name(f.from)}的${f.star}化${f.mutagen}落在${other(f.from)}的${displayPalaceName(f.palace)}`;
      const th = STAR_THEME[f.star] ? `「${STAR_THEME[f.star]}」` : '生活';
      return GIFT_FLIGHT[f.mutagen]?.(name(f.from), other(f.from), where, th);
    })
    .filter((s): s is string => !!s);
  if (gifts.length === 2) sentences.push(`兩人都在給：${gifts[0]}；${gifts[1]}。`);
  else if (gifts.length === 1) sentences.push(`${gifts[0]}。`);

  // 3. 五行局
  const { elementA: ea, elementB: eb, relation: rel } = syn;
  if (!fit.difficult && ea && eb && rel) {
    if (rel === 'same') sentences.push(`同屬${ea}的兩人節奏相近，是能${SAME_GIFT[ea]}的伴。`);
    else if (rel === 'aGeneratesB') sentences.push(`五行上${a.name}的${ea}生${b.name}的${eb}，${GENERATE_GIFT[ea](a.name, b.name)}。`);
    else if (rel === 'bGeneratesA') sentences.push(`五行上${b.name}的${eb}生${a.name}的${ea}，${GENERATE_GIFT[eb](b.name, a.name)}。`);
    else {
      const [c, t] = rel === 'aControlsB' ? [a.name, b.name] : [b.name, a.name];
      sentences.push(`五行雖是相剋，${c}和${t}卻能互相磨出更好的樣子，這份磨合本身就是成長。`);
    }
  }

  if (fit.difficult) {
    const ji = syn.flights.filter((f) => f.mutagen === '忌' && f.palace && BOND_PALACES.includes(f.palace));
    const cares = ji
      .map((f) => STAR_THEME[f.star])
      .filter((v, i, arr): v is string => !!v && arr.indexOf(v) === i)
      .map((v) => `「${v}」`)
      .join('、');
    const head = sentences.length > 0 ? `真實而珍貴的部分是：${sentences.join('')}` : '';
    return [
      head,
      `要讓這段關係走得下去，需要的是：兩人都願意把${cares || '心裡最在意的事'}說清楚，而不是等對方猜；有一方慌的時候，另一方先穩住；五行相剋的節奏差異，靠事先約好的規則來承接，而不是靠感覺硬撐。做得到，兩人的在乎會變成很深的牽繫；做不到也不必勉強，看清楚這一點本身就是一種成熟。`,
    ].filter(Boolean);
  }
  return [sentences.join('')];
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

/** 結構辛苦的組合：落在核心宮位的化忌，補一句坦白的提醒（第二條換一種說法）。 */
const HARD_JI_NOTE: ((from: string, to: string) => string)[] = [
  (f, t) => `不過在這組盤裡，這份在乎少了化祿的甜頭來緩衝，容易從關心變成要求、從牽掛變成不安；${f}要練習把需要說清楚，${t}也不必為了讓${f}安心而勉強自己配合每一個期待。`,
  (f, t) => `只是這條線同樣缺少甜頭的緩衝，${f}的心情起伏很容易直接落到${t}身上；${t}可以溫柔地接住，但不必替${f}的每一次不安負責。`,
];

function flightLine(f: ZiweiMutagenFlight, a: ZiweiPartner, b: ZiweiPartner, fit: ZiweiFit, hardSeen = 0): string {
  const [from, to] = f.from === 'a' ? [a.name, b.name] : [b.name, a.name];
  if (!f.palace) return `${from}的${f.star}化${f.mutagen}：${to}的盤上沒有這顆星。`;
  const mark = f.key ? '★ ' : '';
  const text = FLIGHT_TEXT[f.palace]?.[f.mutagen]?.(from, to, STAR_THEME[f.star] ? `「${STAR_THEME[f.star]}」` : '這方面') ?? '';
  const hard =
    fit.difficult && f.mutagen === '忌' && BOND_PALACES.includes(f.palace)
      ? HARD_JI_NOTE[hardSeen % HARD_JI_NOTE.length](from, to)
      : '';
  return `${mark}${from}的${f.star}化${f.mutagen} → ${to}的${displayPalaceName(f.palace)}：${text}${hard}`;
}

export function ziweiSynastryItems(
  a: ZiweiPartner,
  b: ZiweiPartner,
  syn: ZiweiSynastry,
): MeaningItem[] {
  const fit = ziweiFit(syn);
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
        '一人的生年四化星落在另一人的哪一宮：化祿是好感與甜頭；化權是推力與支持；化科是欣賞與助力；化忌是在乎與緣分，最放不下的地方，也最值得用心經營。★ 表示落在命宮、夫妻宮、交友宮、福德宮這幾個關係最直接的宮位。',
        [
          ...flights.map((f, i) =>
            flightLine(f, a, b, fit, flights.slice(0, i).filter((g) => g.mutagen === '忌' && g.palace && BOND_PALACES.includes(g.palace)).length),
          ),
          keyCount > 0
            ? `共有 ${keyCount} 條四化落在關係最直接的宮位，兩人的緣分感很明顯，彼此的好在對方身上會被放大，也更值得好好珍惜。`
            : '四化都沒有落在命、夫妻、交友、福德這幾宮，兩人的互動較多透過生活其他面向展開，相處輕鬆自在、沒有負擔；感情的濃度由兩人一起慢慢累積，反而更踏實。',
        ].join('\n'),
      ),
    );
  }

  items.push(
    item(
      '日常相處',
      '依兩人命宮、夫妻宮、福德宮的主星（空宮借對宮）與四化互飛，整理生活裡常見的相處畫面。',
      dailyLifeLines(a, b, syn, fit).join('\n'),
    ),
  );

  items.push(
    fit.difficult
      ? item(
          '這段關係的課題與禮物',
          '這組盤需要多花力氣經營；這裡誠實寫出要讓關係走下去需要什麼，也寫出兩人之間真實而珍貴的部分。',
          giftLines(a, b, syn, fit).join('\n'),
        )
      : item(
          '這段關係的禮物',
          '從兩人的命宮對照、四化與五行局裡，挑出這段關係最珍貴的地方。',
          giftLines(a, b, syn, fit).join('\n'),
        ),
  );

  items.push(item('相處建議', '依上面的四化與命宮對照整理的具體做法。', adviceLines(a, b, syn, fit).join('\n')));
  return items;
}

function adviceLines(a: ZiweiPartner, b: ZiweiPartner, syn: ZiweiSynastry, fit: ZiweiFit): string[] {
  const lines: string[] = [];
  const name = (k: PartnerKey) => (k === 'a' ? a.name : b.name);
  const other = (k: PartnerKey) => (k === 'a' ? b.name : a.name);
  if (fit.difficult) {
    lines.push('這組盤最需要的是固定的溝通習慣：每週找一個不趕時間的時候，各說一件「這週讓我在意的事」和一件「這週謝謝你的事」，不打斷、不辯解。');
    lines.push('約好一個「暫停暗號」：任何一方說出來，兩人就先停下、各自冷靜二十分鐘，再回來談，不讓情緒替兩人做決定。');
  }
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
    if (f.mutagen === '祿') lines.push(`${where}：${to}記得回一句「我有感受到」，讓${from}知道這份好被看見，甜頭就會一直在。`);
    if (f.mutagen === '權') lines.push(`${where}：${from}出主意前先問「你想聽建議嗎」，${to}會比較願意接受。`);
    if (f.mutagen === '科') lines.push(`${where}：${from}的肯定對${to}很有力量，多在別人面前說出來；私下也真誠交流，欣賞會更深。`);
  }
  lines.push(
    fit.difficult
      ? '四化互飛描述的是互相影響的方向，不是誰欠誰，也不是命中注定的結局：這組盤的難處是真實的，但兩人怎麼相處，最後還是由兩人決定；如果長期覺得辛苦，找信任的朋友或專業的伴侶諮商聊聊，也是很好的選擇。'
      : '四化互飛描述的是互相影響的方向，不是誰欠誰：化祿是彼此給的甜，化忌是緣分最深的地方；把它當成兩人聊天的話題，一起找到最舒服的相處方式。',
  );
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
  const fit = ziweiFit(syn);
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

  const tone = fit.difficult
    ? `- 語氣：這組盤結構上較辛苦（兩人合計 ${fit.bondJi} 條化忌落在對方的命宮／夫妻宮／福德宮、核心宮位沒有化祿、五行局相剋）。請在開頭就坦白、尊重地說明這一點，不要硬寫成很合；挑戰的份量可以多於優點，但每個挑戰都要附上具體可做的方法，同時也誠實寫出兩人之間真實而珍貴的部分。不要恐嚇，也不要斷言一定會分開。`
    : `- 語氣：溫暖、鼓勵、優點先行，讓讀的人感到被欣賞、對這段關係有希望。每一段先寫這組合珍貴的地方（彼此給了對方什麼、一個具體溫暖的生活畫面），再用較短、柔和的方式寫成長點，並附上可以試試的小方法（例如「可以試試…」「當…時，…就能變成你們的優勢」）。優點與挑戰的份量大約 2:1。
- 化忌請先解讀為在乎與緣分，再談需要留意的地方；化祿、化權、化科寫出它帶來的具體好處。盡量用柔和但誠實的說法，避免「耗」「依賴」「壓力」「委屈」「理所當然」這類刺耳的字眼。`;

  return `請依下列兩人的紫微斗數本命盤，用繁體中文做雙人合盤解讀。

解讀原則：
- 派別為通行版本（三合派），宮名用「交友宮／事業宮」。
- 以兩人命宮主星、五行局，以及生年四化飛入對方命盤的宮位為主軸（特別是命宮、夫妻宮、交友宮、福德宮）。
- 化祿、化權、化科、化忌都要解讀：祿看好感與付出、權看推力與誰來拍板、科看欣賞與助力、忌看在乎與牽掛；同一化落在不同宮位、由不同星化出，意思要寫出差別，不要套同一句話。
- 空宮請借對宮主星來看；雙星同宮請說明兩顆星合起來的味道。
- 除了命宮，也請參考雙方的夫妻宮（期待的伴侶樣子、感情裡的姿態）與福德宮（放鬆方式、內心需求）。
${tone}
- 不要每段都套固定句型，請自然地寫，句子之間不要重複。
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
1. 總覽：兩人的性格組合與這段關係的基本樣貌${fit.difficult ? '，並坦白說明這組盤辛苦在哪裡' : '，先寫最珍貴的地方'}。
2. 吸引與緣分：命宮對照與四化互飛（含化權、化科）說明彼此在對方生命裡的角色，以及各自給了對方什麼。
3. 日常相處，分四項，每項都要寫出兩人「各自」的樣子，先寫兩人在這方面合得來、互相補位的地方，再寫可以一起練習的成長點與具體做法，舉 2–3 個具體的生活情境（例如：意見不合時${a.name}先冷處理、${b.name}想當下講清楚；出遊或花大錢時誰先拍板、誰還在比較）：
   - 個性：平常的樣子、放假時想怎麼過。
   - 思考方式：兩人怎麼想事情、怎麼做決定，意見不同時怎麼分工。
   - 處理矛盾的方法：意見不合時各自的反應、容易怎麼卡住、怎麼收尾比較好。
   - 感受親密與愛的方式：各自怎麼表達愛、在什麼時候最能感到被愛，以及怎麼更接住對方的心意。
4. 互相成就與成長點：各指出具體是哪一條四化或哪一組主星，先寫它帶來的好，再寫可以怎麼經營。
5. 合作（感情、朋友、工作）。
6. ${fit.difficult ? '這段關係的課題與禮物：誠實寫出要讓這段關係走下去需要什麼，也寫出兩人之間真實而珍貴的部分（2–4 句）。' : '這段關係的禮物：用 2–3 句話，依這組盤的實際資料寫出兩人在一起最珍貴的地方。'}
最後給兩人各 3 條具體可做的相處提醒（寫成行動，例如「鬧彆扭的隔天主動約吃早餐」，而不是「多溝通」）。`;
}
