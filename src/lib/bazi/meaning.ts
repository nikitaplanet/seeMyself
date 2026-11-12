import type { MeaningItem } from '@/lib/ui/personMeaning';
import { BRANCH_WX, STEM_WX } from './labels';
import type { BaziChart, BaziPillar, WuXing } from './types';

// 八字個人盤說明 — pure logic, no React. Follows .claude/星盤開發準則.md, translated to what a
// 八字 chart really computes:
//   個性＝日主天干＋強弱；思考＝日主五行＋食傷／印星比例＋月干；壓力＝官殺份量＋強弱；
//   感情＝日支（配偶宮）主氣＋桃花紅鸞；工作＝月柱格局＋貴人星；優缺點＝最旺／最弱五行；
//   面具＝年干 vs 日主（＋時干）；內耗與充電＝忌神／喜神五行；金錢＝財星份量＋透干；
//   原生家庭＝印星份量＋年干；天賦盲區＝藏而不透的十神＋尚未提過的貴人星。
// Each card: hook ≤ 20 字, 【解析】 two paragraphs ≤ 80 字, 【生活場景】 ≤ 60 字, 【給你的建議】 ≤ 50 字.
// A trait is stated once: every card is keyed to a different part of the chart, and the trailing
// full-width parenthesis carries the basis. The six reference items (日主、四柱…) follow, folded.

export const BAZI_LIMITS = { hook: 20, paragraph: 80, scene: 60, advice: 50 } as const;

type Group = '比劫' | '食傷' | '財星' | '官殺' | '印梟';
type Strength = '身弱' | '身旺' | '中和';
type Level = 'heavy' | 'mid' | 'light';

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

const GROUP_LABEL: Record<Group, string> = {
  比劫: '比劫',
  食傷: '食傷',
  財星: '財星',
  官殺: '官殺',
  印梟: '印星',
};

const YANG_STEMS = new Set(['甲', '丙', '戊', '庚', '壬']);

interface Env {
  chart: BaziChart;
  stem: string;
  wx: WuXing;
  yang: boolean;
  strength: Strength;
  weak: boolean;
  year?: BaziPillar;
  month?: BaziPillar;
  day?: BaziPillar;
  time?: BaziPillar;
  /** 年、月、時（時間確定時）天干的十神；日干是日主本身，不算。 */
  exposed: string[];
  shensha: Set<string>;
  /** 貴人星 already used by an earlier card, so a later card picks another one. */
  usedStars: Set<string>;
  pct: (g: Group) => number;
}

function buildEnv(chart: BaziChart): Env {
  const stem = chart.dayMaster.charAt(0);
  const pillar = (k: BaziPillar['key']) => chart.pillars.find((p) => p.key === k);
  const time = chart.timeUnknown ? undefined : pillar('time');
  const year = pillar('year');
  const month = pillar('month');
  const strength: Strength =
    chart.strength === '身弱' || chart.strength === '身旺' ? chart.strength : '中和';
  const shensha = new Set<string>();
  for (const p of chart.pillars) {
    if (chart.timeUnknown && p.key === 'time') continue;
    for (const s of p.shensha) shensha.add(s);
  }
  return {
    chart,
    stem,
    wx: STEM_WX[stem] ?? chart.dayMasterWx,
    yang: YANG_STEMS.has(stem),
    strength,
    weak: strength === '身弱',
    year,
    month,
    day: pillar('day'),
    time,
    exposed: [year, month, time].map((p) => p?.ganTenGod ?? '').filter((g) => g in GROUP_OF),
    shensha,
    usedStars: new Set(),
    pct: (g) => chart.wuXing.filter((s) => s.gods === g).reduce((n, s) => n + s.percent, 0),
  };
}

function level(percent: number): Level {
  return percent >= 25 ? 'heavy' : percent <= 10 ? 'light' : 'mid';
}

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
    meaning: ['【解析】', p1, p2, '【生活場景】', scene, '【給你的建議】', advice]
      .filter(Boolean)
      .join('\n'),
  };
}

// ---------------------------------------------------------------------------
// 1. 個性與日常特色：日主天干 × 強弱
// ---------------------------------------------------------------------------

interface StemCore {
  hook: string;
  /** 身弱時改用的金句。 */
  hookWeak: string;
  p: string;
  scene: string;
  advice: string;
}

const STEM_CORE: Record<string, StemCore> = {
  甲: {
    hook: '像樹一樣，認定了就往上長',
    hookWeak: '一棵想長高、也需要土的樹',
    p: '你像一棵往上長的樹，認定方向就一路走到底，答應的事會扛到完。別人常覺得有你在，事情就有人負責。',
    scene: '聚餐沒人訂位時，你嘴上說隨便，最後還是默默把時間地點都敲定。',
    advice: '每季檢查一次目標，允許自己改一條路線，不算半途而廢。',
  },
  乙: {
    hook: '柔軟不是弱，是很會找路',
    hookWeak: '看似隨和，其實很會借力',
    p: '你像藤蔓，懂得看環境找路走，身段軟卻不容易被折斷。到新的地方，你總能很快找到站得住的位置。',
    scene: '一群人意見不合時，你會先聽完每個人，再提一個大家都能接受的折衷方案。',
    advice: '做決定前先寫下自己想要什麼，再去問別人的意見。',
  },
  丙: {
    hook: '人到哪裡，光就到哪裡',
    hookWeak: '想照亮大家，也需要被添柴',
    p: '你像太陽，人一到場氣氛就熱起來，喜怒都寫在臉上。你習慣大方給予，也希望自己的付出被看見。',
    scene: '朋友心情不好，你會直接約出門吃飯，用熱鬧把低氣壓趕走。',
    advice: '想到新計畫先放三天，三天後還想做再開始。',
  },
  丁: {
    hook: '不搶眼，卻把人照得很清楚',
    hookWeak: '一盞細火，被護著才亮得穩',
    p: '你像一盞燈，不搶眼卻能把身邊的人照得很清楚。你觀察細、記得住小事，溫暖是慢慢滲出來的。',
    scene: '朋友隨口提過想要的東西，幾個月後你還記得，生日時剛好送上。',
    advice: '心裡反覆想同一件事時，寫下來或說給一個人聽。',
  },
  戊: {
    hook: '話不多，但站在那裡就很穩',
    hookWeak: '想當大家的山，也會累',
    p: '你像一座山，話不多但站得穩，朋友遇到事會先想到你。你做決定慢，定了就很少反悔。',
    scene: '大家慌成一團時，你反而最安靜，先把手上的事一件一件做完。',
    advice: '每個月試一件沒做過的小事，例如換一條回家的路。',
  },
  己: {
    hook: '默默把大家都照料好的人',
    hookWeak: '總在顧別人，忘了顧自己',
    p: '你像一塊田，習慣把人和事都照料好，細節總是你先想到。你不愛出風頭，卻常是讓團體運轉的那個人。',
    scene: '出遊前你會默默查好路線、訂好餐廳，連誰不吃辣都記在心裡。',
    advice: '每天留一件事只為自己做，不用對任何人交代。',
  },
  庚: {
    hook: '乾脆俐落，話直心熱',
    hookWeak: '外表很硬，其實怕被辜負',
    p: '你像一把刀，講求乾脆俐落，看不慣拖泥帶水。朋友有難你會第一個站出來，話直但心是熱的。',
    scene: '看到有人插隊，你很難裝沒看見，會直接開口請對方排好。',
    advice: '開口前先說一句對方做得好的地方，再講你的意見。',
  },
  辛: {
    hook: '寧缺勿濫，對質感很堅持',
    hookWeak: '標準很高，心卻很細',
    p: '你像一塊玉，對質感和分寸很敏銳，東西要好、話也要說得體面。你要求高，對自己尤其如此。',
    scene: '買一樣東西你會比較很久，寧可多等，也不想將就一個看不順眼的。',
    advice: '事情做到八分就先交出去，剩下兩分留給回饋再修。',
  },
  壬: {
    hook: '像河一樣，不喜歡被框住',
    hookWeak: '想法很多，需要一條河道',
    p: '你像一條大河，腦筋動得快、興趣廣，到哪裡都待得住。你討厭被框住，喜歡自己決定往哪流。',
    scene: '週末常是臨時起意，說走就走，行程排太滿反而讓你不想出門。',
    advice: '替最重要的一件事訂下截止日，其他的再隨興。',
  },
  癸: {
    hook: '安靜，卻什麼都感覺得到',
    hookWeak: '感受很深，需要時間醞釀',
    p: '你像雨露，安靜卻滲透力強，常能察覺別人沒說出口的事。你靠感覺認路，需要時間慢慢醞釀。',
    scene: '走進一個場合，你不用問就感覺得到誰今天心情不好。',
    advice: '每天留半小時獨處，不滑手機，讓雜亂的感受沉澱。',
  },
};

const STRENGTH_DAILY: Record<Strength, { yang: string; yin: string }> = {
  身旺: {
    yang: '你的能量很足，習慣自己扛、自己衝，主見強到不太需要別人背書。事情越有挑戰，你越有精神。',
    yin: '你外表不一定強勢，骨子裡卻很有主張，認定的做法不容易被說動。你有足夠的底氣照自己的步調走。',
  },
  身弱: {
    yang: '你想做的事很多，但電力有限，容易一開始衝太快。有可靠的夥伴或熟悉的環境撐著，你發揮得最好。',
    yin: '你對環境很敏感，會先觀察再決定要不要出手。身邊有人支持的時候，你的細膩會變成很大的優勢。',
  },
  中和: {
    yang: '你的能量收放都還算自如，該衝的時候衝得出去，該停也停得下來。順境逆境都不太會讓你失衡。',
    yin: '你不太走極端，會依場合調整自己的力道。這份彈性讓你在各種環境裡都能找到舒服的位置。',
  },
};

function strengthBasis(env: Env): string {
  const { strength, wangShuai } = env.chart;
  return wangShuai && wangShuai !== strength ? `${strength}，${wangShuai}` : strength || env.strength;
}

function personality(env: Env): MeaningItem | null {
  const core = STEM_CORE[env.stem];
  if (!core) return null;
  return card(
    '個性與日常特色',
    '依日主（代表你自己的那個字）與它在盤中的強弱。',
    env.weak ? core.hookWeak : core.hook,
    `${core.p}（日主${env.stem}${env.wx}）`,
    `${STRENGTH_DAILY[env.strength][env.yang ? 'yang' : 'yin']}（${strengthBasis(env)}）`,
    core.scene,
    core.advice,
  );
}

// ---------------------------------------------------------------------------
// 2. 思考方式：日主五行 × 食傷（輸出）與印星（吸收）的比例 × 月干十神
// ---------------------------------------------------------------------------

const THINK_WX: Record<WuXing, { hook: string; p: string }> = {
  木: {
    hook: '先有方向，腦袋才開始轉',
    p: '你想事情習慣先定方向，再一步步往前推，像樹先長主幹再分枝。沒有目標的討論會讓你很沒耐心。',
  },
  火: {
    hook: '直覺先到，理由後補',
    p: '你的想法來得快，常是畫面或直覺先到，理由之後才補上。越講越有靈感，是邊說邊想的類型。',
  },
  土: {
    hook: '想到踏實了，才肯下結論',
    p: '你會把一件事翻來覆去想到踏實才下結論，重視的是行不行得通。別人覺得你慢，你其實在排除風險。',
  },
  金: {
    hook: '先分清楚輕重，再談其他',
    p: '你習慣把事情切開來看，先分對錯與輕重，再挑最有效率的做法。模糊不清的說法會讓你不舒服。',
  },
  水: {
    hook: '一個念頭，接著十個念頭',
    p: '你的思緒是流動的，一個念頭會接到另一個，很容易看出事情之間的關聯。同時想好幾條路對你很自然。',
  },
};

type Balance = 'out' | 'in' | 'both' | 'low';

const THINK_BALANCE: Record<Balance, { hook: string | null; p: string; advice: string }> = {
  out: {
    hook: '想法要說出口才算數',
    p: '你屬於先說再修的人，想法要講出來或做出來才會成形。悶著想太久，反而卡住。',
    advice: '重要的話先寫成三行草稿，隔一小時再送出。',
  },
  in: {
    hook: '想得比說得多',
    p: '你習慣先聽、先讀、先消化，確定自己懂了才開口。你的意見不多，但通常想得比別人深一層。',
    advice: '想到七分就先說出口，讓別人幫你補上剩下三分。',
  },
  both: {
    hook: null,
    p: '你吸收快、輸出也快，學到的東西很快能用自己的話講出來。教別人的時候，你自己想得最清楚。',
    advice: '每週挑一個學到的東西，用自己的話講給一個人聽。',
  },
  low: {
    hook: null,
    p: '你不太靠長篇大論來想事情，比較相信實際做過的經驗。動手試一次，比開會討論三次有用。',
    advice: '卡住時先做一個最小的版本，看到實物再調整。',
  },
};

const THINK_SCENE: Record<string, string> = {
  比肩: '開會時你心裡早有答案，會先堅持自己的版本，除非對方拿出更好的理由。',
  劫財: '討論到一半你會忍不住提出相反的做法，試試看對方的想法站不站得住。',
  食神: '想事情時你喜歡邊吃邊聊、慢慢來，氣氛輕鬆，點子反而比較多。',
  傷官: '看到流程不合理，你很難照做，會先問「為什麼一定要這樣」。',
  正財: '做決定前你會先算成本和時間，沒有把握的事寧可再等等。',
  偏財: '你常同時留意好幾個機會，哪邊有動靜就先往哪邊試。',
  正官: '你會先確認規則和責任歸屬，知道界線在哪裡，才放心往下做。',
  七殺: '期限越近你腦袋越清楚，常在最後關頭一口氣做出決定。',
  正印: '遇到不懂的事，你會先找書、找前輩，把來龍去脈弄懂再動手。',
  偏印: '你常從別人沒注意的角度切入，想出來的解法跟大家都不一樣。',
};

const THINK_SCENE_WX: Record<WuXing, string> = {
  木: '排旅行時你會先決定去哪、待幾天，細節之後再一項一項補上。',
  火: '逛街時突然想到一個點子，你會立刻傳訊息給朋友，免得忘記。',
  土: '買大件的東西前，你會反覆看評價好幾天，確定了才下單。',
  金: '看一份文件，你會先抓出重點和問題，其他的快速帶過。',
  水: '查一個資料，你常順著連結一路點下去，回神時已經學了三件別的事。',
};

function thinking(env: Env): MeaningItem {
  const out = env.pct('食傷');
  const inn = env.pct('印梟');
  const balance: Balance =
    out >= inn + 8 ? 'out' : inn >= out + 8 ? 'in' : out >= 15 && inn >= 15 ? 'both' : 'low';
  const b = THINK_BALANCE[balance];
  const w = THINK_WX[env.wx];
  const monthGod = env.month?.ganTenGod ?? '';
  return card(
    '思考方式',
    '依日主的五行，以及盤中「表達輸出」（食傷）與「吸收學習」（印星）兩股力量的比例。',
    b.hook ?? w.hook,
    `${w.p}（日主屬${env.wx}）`,
    `${b.p}（食傷 ${out}%、印星 ${inn}%）`,
    THINK_SCENE[monthGod] ?? THINK_SCENE_WX[env.wx],
    b.advice,
  );
}

// ---------------------------------------------------------------------------
// 3. 面對壓力：官殺份量 × 強弱；天干透出的是正官還是七殺
// ---------------------------------------------------------------------------

const STRESS_P1: Record<Level, Record<Strength, string>> = {
  heavy: {
    身弱: '你很容易把別人的期待當成自己的責任，事情還沒發生就先繃緊。壓力一多，你會先懷疑自己做得不夠。',
    身旺: '壓力對你像是磨刀石，越被要求越想證明自己。你扛得起重擔，只是常忘了自己也有上限。',
    中和: '你對責任很有感，別人交代的事會放在心上。壓力來時你撐得住，但會默默睡不好。',
  },
  mid: {
    身弱: '平常的壓力你應付得來，但同時來好幾件就容易慌。你需要有人幫忙分擔，或至少幫你排個順序。',
    身旺: '你面對壓力的方式是直接處理，問題擺著比解決它更讓你難受。你抗壓性好，也不太會把情緒帶回家。',
    中和: '你對壓力的反應算平穩，會先評估輕重再決定怎麼做。真正讓你煩的不是事情多，而是事情不清楚。',
  },
  light: {
    身弱: '你不喜歡被逼，外在壓力一大就想躲開或拖延。你比較適合照自己的步調，一次專心做好一件事。',
    身旺: '外來的規矩不太管得動你，你的壓力多半是自己給的。沒有人盯的時候，你反而容易鬆掉或衝過頭。',
    中和: '你天生不太被外界的要求綁住，心態相對放鬆。只有真正在乎的事，才會讓你感到壓力。',
  },
};

const STRESS_HOOK: Record<Level, { weak: string; other: string }> = {
  heavy: { weak: '還沒出事，你就先繃緊了', other: '越被要求，越想證明自己' },
  mid: { weak: '一件一件來，你就不慌', other: '問題擺著，比解決更難受' },
  light: { weak: '逼你沒用，照步調才做得好', other: '最大的壓力，是自己給的' },
};

const STRESS_WX: Record<WuXing, string> = {
  木: '壓力大時你會變得更固執，硬要照原計畫走完。身體常先反應在肩頸僵硬或容易動怒。',
  火: '壓力大時你會變急，說話變快、耐性變短。情緒來得猛，發洩完又很快沒事。',
  土: '壓力大時你會悶著不講，一個人反覆想。外表看不出來，胃口和睡眠卻先受影響。',
  金: '壓力大時你會變得更嚴格，對自己和別人都挑剔。你習慣用把事情做完來止住焦慮。',
  水: '壓力大時你會想很多，腦袋停不下來，甚至想乾脆逃開。你需要安靜，才理得出頭緒。',
};

const STRESS_SCENE: Record<Level, { yang: string; yin: string }> = {
  heavy: {
    yang: '主管臨時加一個案子，你當場說好，回家路上才開始覺得喘不過氣。',
    yin: '收到一句「我們談一下」，你會在見面前把所有可能出錯的地方想過一遍。',
  },
  mid: {
    yang: '事情卡住時你會直接打電話問清楚，不想等訊息慢慢回。',
    yin: '待辦事項一多，你會先列清單，劃掉一項才覺得鬆一口氣。',
  },
  light: {
    yang: '被人催進度時你會不耐煩，寧可對方告訴你期限，然後別再管你。',
    yin: '別人一直提醒同一件事，你表面說好，心裡其實更不想動。',
  },
};

const STRESS_ADVICE: Record<Strength, { heavy: string; other: string }> = {
  身弱: {
    heavy: '接下新任務前先問期限和優先順序，把一件舊的事交出去。',
    other: '同時最多放三件事在手上，多的寫下來排到下週。',
  },
  身旺: {
    heavy: '每週排一個完全不處理公事的晚上，當成正式行程。',
    other: '替自己訂一個有期限的小挑戰，讓力氣有地方用。',
  },
  中和: {
    heavy: '睡前把明天要做的三件事寫下來，寫完就不再想。',
    other: '覺得煩的時候，先問自己哪一點不清楚，去問清楚。',
  },
};

function stress(env: Env): MeaningItem {
  const pct = env.pct('官殺');
  const lv = level(pct);
  const sha = env.exposed.includes('七殺');
  const guan = env.exposed.includes('正官');
  const p2 =
    sha && guan
      ? '你的壓力來源很明確：一邊是該守的規矩，一邊是突然砸下來的挑戰。兩邊同時拉扯時，你最容易煩躁。（天干同時見正官與七殺）'
      : sha
        ? '你遇到的壓力常是突發、硬碰硬的那種，逼你立刻反應。你在急難時特別果斷，事後才發現自己累壞了。（天干見七殺）'
        : guan
          ? '你的壓力多半來自責任和評價，怕讓人失望、怕做得不合規矩。你會用更自律來回應。（天干見正官）'
          : `${STRESS_WX[env.wx]}（日主屬${env.wx}，天干不見官殺）`;
  return card(
    '面對壓力',
    '依盤中代表規範與壓力的力量（官殺）有多重，以及日主本身撐不撐得住。',
    STRESS_HOOK[lv][env.weak ? 'weak' : 'other'],
    `${STRESS_P1[lv][env.strength]}（官殺 ${pct}%、${env.strength}）`,
    p2,
    STRESS_SCENE[lv][env.yang ? 'yang' : 'yin'],
    STRESS_ADVICE[env.strength][lv === 'heavy' ? 'heavy' : 'other'],
  );
}

// ---------------------------------------------------------------------------
// 4. 感情模式：日支（配偶宮）主氣的十神 × 桃花／紅鸞 × 日支五行
// ---------------------------------------------------------------------------

const LOVE_GOD: Record<string, { hook: string; p: string }> = {
  比肩: {
    hook: '要的是隊友，不是依賴',
    p: '你要的伴侶像隊友，能並肩做事、各自獨立。太黏或太需要被照顧的關係，會讓你想保持距離。',
  },
  劫財: {
    hook: '愛得大方，也愛得好強',
    p: '你容易被有個性、有主見的人吸引，感情裡帶點較勁。你付出很大方，也在意對方是不是同樣投入。',
  },
  食神: {
    hook: '在一起舒服，比什麼都重要',
    p: '你在感情裡想要的是輕鬆和舒服，一起吃飯、聊天就很滿足。你會用照顧對方的生活來表達在乎。',
  },
  傷官: {
    hook: '聊得來，才愛得下去',
    p: '你欣賞有才華、聊得來的人，受不了無趣。你在親密關係裡很敢說真話，也期待對方跟得上你。',
  },
  正財: {
    hook: '認定了，就認真經營',
    p: '你對感情很務實，看重的是穩定和可靠。一旦認定，就會認真經營，把對方放進長期的計畫裡。',
  },
  偏財: {
    hook: '要新鮮，也要自由',
    p: '你在感情裡大方又有趣，喜歡新鮮感和一起探索。你需要一點自由，被管太緊會想逃。',
  },
  正官: {
    hook: '要一段名正言順的關係',
    p: '你希望伴侶是值得尊敬、讓你放心的人，關係要名正言順。你會自動負起責任，也希望對方守承諾。',
  },
  七殺: {
    hook: '心動很猛，要記得守住自己',
    p: '你容易被氣場強、有魄力的人吸引，感情裡張力十足。心動來得猛，你也需要學著在關係裡守住自己。',
  },
  正印: {
    hook: '想被懂，也想被接住',
    p: '你想要的是被理解、被接住的感覺，伴侶最好像個可以安心依靠的家人。你付出的方式是包容和陪伴。',
  },
  偏印: {
    hook: '慢熱，但懂了就很專一',
    p: '你在感情裡慢熱，需要心靈上對得上頻率。你不太說心事，但被真正懂了以後會非常專一。',
  },
};

const LOVE_SCENE: Record<WuXing, string> = {
  木: '你希望兩人一起有所成長，一起學東西、訂計畫，會讓你覺得關係在前進。',
  火: '你喜歡熱熱鬧鬧的相處，一起出門、見朋友，冷掉的對話會讓你不安。',
  土: '對你來說，一起吃飯、固定見面這些日常，就是感情最實在的證明。',
  金: '你在意說到做到，約好的事被取消或遲到，會比吵架更讓你失望。',
  水: '你需要能聊很深的對象，深夜的一場長談，比十次約會更讓你靠近。',
};

const LOVE_ADVICE: Record<Group, string> = {
  比劫: '每週留一段只屬於兩人的時間，不談公事也不各滑各的手機。',
  食傷: '想吐槽對方時，先說一件今天欣賞對方的事。',
  財星: '除了為對方做事，也每週說一次心裡的感受。',
  官殺: '心動的時候先慢一拍，寫下三個自己不能退讓的原則。',
  印梟: '想被照顧時直接說出來，不要等對方自己發現。',
};

function love(env: Env): MeaningItem | null {
  const day = env.day;
  const god = day?.hidden[0]?.tenGod ?? '';
  const g = LOVE_GOD[god];
  if (!day || !g) return null;
  const polarity = env.yang ? '陽' : '陰';
  const p2 = env.shensha.has('桃花')
    ? '你身上有種容易讓人靠近的親和力，不用刻意就有人緣。對象不難遇到，難的是分清楚欣賞和喜歡。（命帶桃花）'
    : env.shensha.has('紅鸞')
      ? '你對感情有期待，也容易在對的時機遇到願意認真的人。緣分來時你會很投入，把關係當成人生大事。（命帶紅鸞）'
      : env.yang
        ? env.weak
          ? `你喜歡了會主動靠近，卻也容易因為對方一句話而動搖。穩定的回應最能讓你安心。（日主屬${polarity}、身弱）`
          : `你在感情裡偏主動，喜歡了會直接表示，不太玩猜心遊戲。對方態度不明時，你會很快失去耐性。（日主屬${polarity}）`
        : env.weak
          ? `你在感情裡容易先顧對方的感受，把自己的需要往後放。你需要一個會主動問「那你呢」的人。（日主屬${polarity}、身弱）`
          : `你在感情裡偏被動，習慣觀察對方的誠意再慢慢打開。你不擅長主動示好，但一旦開始就很長情。（日主屬${polarity}）`;
  return card(
    '感情模式',
    '依日支（八字裡代表伴侶與親密關係的位置）與盤中的人緣星。',
    g.hook,
    `${g.p}（日支${day.zhi}，坐${god}）`,
    p2,
    LOVE_SCENE[BRANCH_WX[day.zhi] ?? env.wx],
    LOVE_ADVICE[GROUP_OF[god]],
  );
}

// ---------------------------------------------------------------------------
// 5. 工作與天賦：月柱格局 × 貴人星（沒有時看喜用）
// ---------------------------------------------------------------------------

interface GeJuWork {
  hook: string;
  p: string;
  scene: string;
  advice: string;
}

const GEJU_WORK: Record<string, GeJuWork> = {
  正官格: {
    hook: '在制度裡，你走得最穩',
    p: '你適合有制度、有升遷路徑的環境，按部就班反而走得遠。你守信用、扛責任，容易被放在管理的位置。',
    scene: '新制度上路時，你通常是第一個讀完規則、照著做好的人。',
    advice: '每年替自己訂一個不是公司要求、而是你自己想要的目標。',
  },
  七殺格: {
    hook: '越難的戰場，越顯本事',
    p: '你適合有難度、有競爭的戰場，越難的任務越能激出本事。你敢做決定，適合開創或帶隊衝刺。',
    scene: '案子出狀況、大家都在觀望時，你會先跳下去收拾。',
    advice: '接任務前先問清楚資源和支援，別一個人硬扛到底。',
  },
  正財格: {
    hook: '一步一腳印，換來的最實在',
    p: '你適合靠穩定累積換成果的工作，數字、流程、細節都難不倒你。你務實可靠，交給你的事很少出錯。',
    scene: '報表裡一個對不上的數字，別人沒發現，你會追到找出原因。',
    advice: '每個月撥一筆固定的錢或時間，投資在學新東西上。',
  },
  偏財格: {
    hook: '機會在哪，你都看得到',
    p: '你適合和人、和機會打交道的工作，業務、談判、資源整合都是強項。你反應快，哪裡有機會都看得到。',
    scene: '一場聚會下來，你已經認識了三個之後可能合作的人。',
    advice: '同時進行的案子別超過三個，先把一個做到收尾。',
  },
  食神格: {
    hook: '把喜歡的事，做到專業',
    p: '你適合把興趣做成專業，內容、餐飲、設計、教學這類靠手感的事最能發揮。做喜歡的事，你最有耐心。',
    scene: '做自己喜歡的作品時，你可以一坐好幾個小時忘了吃飯。',
    advice: '替你的興趣訂一個發表日，把作品公開給人看。',
  },
  傷官格: {
    hook: '天生來打破舊做法的人',
    p: '你適合能發揮創意、不被層層管著的舞台。你點子多、表達強，擅長把舊做法打掉重來。',
    scene: '聽完簡報，你腦中已經有另一個更好的版本，忍不住想說出來。',
    advice: '提反對意見時，一併附上一個你願意負責的替代方案。',
  },
  正印格: {
    hook: '越學越值錢的那種人',
    p: '你適合需要專業累積的路，教育、研究、顧問這類越老越值錢的領域。你學得紮實，容易得到前輩提攜。',
    scene: '接到新任務，你會先把相關資料讀完，再動手做第一步。',
    advice: '學完一樣東西，兩週內找一個實際的場合用出來。',
  },
  偏印格: {
    hook: '冷門的路，你走得最深',
    p: '你適合鑽研冷門或技術性的領域，別人覺得枯燥的東西你能越挖越深。你的優勢是想法和別人不一樣。',
    scene: '別人問「這有什麼用」的冷知識，常在關鍵時刻被你派上用場。',
    advice: '挑一個專長持續做滿一年，並定期寫下來分享給別人。',
  },
  建祿格: {
    hook: '靠自己，最對味',
    p: '你適合靠自己的實力打拚，自由度高、成果直接算在自己身上的工作最對味。你獨立，不太需要人帶。',
    scene: '比起等人分配工作，你更習慣自己找事做、自己定進度。',
    advice: '每季主動找一個人合作一件事，練習把工作分出去。',
  },
};

const WORK_STAR: Array<[string, string]> = [
  ['將星', '你身上有帶頭的氣質，團體裡自然會被推出來做決定。位置越高、責任越清楚，你越做得好。'],
  ['天官貴人', '你在體制裡容易遇到願意拉你一把的長官或前輩。認真做事的樣子，常被該看到的人看到。'],
  ['德秀貴人', '你有才氣也有好人緣，做出來的東西帶著自己的風格。遇到難關時，常有人適時出手幫忙。'],
];

const WORK_STRENGTH: Record<Strength, string> = {
  身弱: '你單打獨鬥比較吃力，有團隊、有夥伴時成績最好。選對環境和合作對象，比多拚幾個小時更重要。（身弱，喜比劫與印星相助）',
  身旺: '你的力氣需要有地方用，最好是有具體目標、成果看得見的工作。太安逸的位置反而會讓你悶。（身旺，喜財官與食傷）',
  中和: '你的適應力好，換環境或換角色都不太吃虧。不必急著定型，多試幾種位置反而找得到最順手的。（強弱中和）',
};

function work(env: Env): MeaningItem | null {
  const g = GEJU_WORK[env.chart.geJu];
  if (!g) return null;
  const star = WORK_STAR.find(([name]) => env.shensha.has(name));
  if (star) env.usedStars.add(star[0]);
  const month = env.month ? `月柱${env.month.gan}${env.month.zhi}，` : '';
  return card(
    '工作與天賦',
    '依月柱（代表工作與社會角色的位置）形成的格局，與盤中的貴人星。',
    g.hook,
    `${g.p}（${month}${env.chart.geJu}）`,
    star ? `${star[1]}（命帶${star[0]}）` : WORK_STRENGTH[env.strength],
    g.scene,
    g.advice,
  );
}

// ---------------------------------------------------------------------------
// 6. 核心優缺點：最旺的五行是本錢，最弱的五行是功課
// ---------------------------------------------------------------------------

const CORE_TOP: Record<WuXing, { word: string; p: string; scene: string }> = {
  木: {
    word: '成長',
    p: '你最大的本錢是成長的動力，總想學新的、往更好的地方去。你有理想也肯行動，身邊的人常被你帶著往前。',
    scene: '看到朋友在進修或換跑道，你會馬上想：那我下一步是什麼？',
  },
  火: {
    word: '熱度',
    p: '你最大的本錢是熱度，做事有衝勁、表達有感染力。有你在的地方，事情容易動起來。',
    scene: '團體裡氣氛冷下來時，通常是你先開口說「不然我們來試試看」。',
  },
  土: {
    word: '可靠',
    p: '你最大的本錢是可靠，答應的事一定做到。別人願意把重要的事託付給你，就是因為你穩。',
    scene: '朋友搬家、辦活動，第一個想到要找的幫手常常是你。',
  },
  金: {
    word: '決斷',
    p: '你最大的本錢是決斷，知道什麼該留、什麼該捨。原則清楚，讓你做事又快又準。',
    scene: '整理房間時你丟東西毫不手軟，用不到的就是用不到。',
  },
  水: {
    word: '靈活',
    p: '你最大的本錢是腦筋活，遇到狀況總能想出別的路。你學得快、轉得快，很少真的被難倒。',
    scene: '原訂的餐廳客滿，你三十秒內就能想出另外兩個選項。',
  },
};

const CORE_LOW: Record<WuXing, { word: string; p: string; advice: string }> = {
  木: {
    word: '起步',
    p: '比較需要練習的是起步：有了想法卻遲遲不開始，或缺一個長期的方向。目標定小一點，就容易跨出去。',
    advice: '挑一件想了很久的事，今天先做十五分鐘就好。',
  },
  火: {
    word: '表達',
    p: '比較需要練習的是表達熱情：你心裡在乎，別人卻不一定看得出來。主動多說一句，誤會會少很多。',
    advice: '每天對一個人說一句具體的稱讚或感謝。',
  },
  土: {
    word: '持續',
    p: '比較需要練習的是持續：開頭很有勁，卻不容易定下來把事情收尾。固定的作息能幫你落地。',
    advice: '替自己固定一個每天同一時間做的小習慣，例如早餐。',
  },
  金: {
    word: '取捨',
    p: '比較需要練習的是取捨：不忍心拒絕、不想切斷，事情就越堆越多。學會說「不」，你會輕鬆很多。',
    advice: '這週練習拒絕一件其實不想答應的事。',
  },
  水: {
    word: '轉彎',
    p: '比較需要練習的是轉彎：習慣照原本的做法，計畫一變就不自在。多留一個備案，就不怕變化。',
    advice: '做計畫時多寫一行：如果行不通，我改成怎麼做。',
  },
};

function core(env: Env): MeaningItem | null {
  const sorted = [...env.chart.wuXing].sort((a, b) => b.percent - a.percent);
  const top = sorted[0];
  const low = sorted[sorted.length - 1];
  if (!top || !low || top.wx === low.wx) return null;
  const t = CORE_TOP[top.wx];
  const l = CORE_LOW[low.wx];
  return card(
    '核心優缺點',
    '依盤中最旺與最弱的五行：最旺的是你的強項，最弱的是容易忽略的地方。',
    `${t.word}是本錢，${l.word}是功課`,
    `${t.p}（${top.wx}最旺，占 ${top.percent}%）`,
    `${l.p}（${low.wx}最弱，占 ${low.percent}%）`,
    t.scene,
    l.advice,
  );
}

// ---------------------------------------------------------------------------
// 7. 面具與真實的反差：年干（第一印象）vs 日主（真實的自己）；時干＝更深的內在
// ---------------------------------------------------------------------------

const MASK_OUTER: Record<WuXing, { word: string; p: string }> = {
  木: { word: '很有主張', p: '初次見面，別人多半覺得你正派、有想法，像是很有目標的人。' },
  火: { word: '很好聊', p: '初次見面，別人多半覺得你開朗好聊，是很容易熟起來的人。' },
  土: { word: '沒脾氣', p: '初次見面，別人多半覺得你穩重好相處，不太有脾氣。' },
  金: { word: '有距離', p: '初次見面，別人多半覺得你俐落、有點距離感，不太好親近。' },
  水: { word: '很隨和', p: '初次見面，別人多半覺得你聰明隨和，什麼話題都接得上。' },
};

const MASK_INNER: Record<WuXing, { word: string; p: string }> = {
  木: { word: '很堅持', p: '熟了才知道，你其實很堅持，決定的事別人很難改。' },
  火: { word: '很怕被冷落', p: '熟了才知道，你其實很需要回應，被冷落會默默在意很久。' },
  土: { word: '想很多', p: '熟了才知道，你其實想很多，只是不輕易說出口。' },
  金: { word: '很重感情', p: '熟了才知道，你其實很重感情，只是不習慣說軟話。' },
  水: { word: '藏得很深', p: '熟了才知道，你其實心思很深，真正的想法只給少數人看。' },
};

const MASK_GAP: Record<Group, { p: string; advice: string }> = {
  比劫: {
    p: '你的外表和內在是同一路的，面具不厚。差別只在外面的你比較收斂，回到熟人面前才完全放開。',
    advice: '在新認識的人面前，試著多說一句自己真正的喜好。',
  },
  食傷: {
    p: '你對外展現的是愛表現、有才華的那一面，容易被當成愛說愛玩的人。安靜下來的你，其實比較嚴肅。',
    advice: '想安靜的時候就直接說「我今天想少講話」，不必硬撐場面。',
  },
  財星: {
    p: '你對外展現的是務實能幹的那一面，別人常覺得你很會打理事情。其實你心裡也有不想那麼現實的時候。',
    advice: '每個月做一件不划算但自己很想做的事。',
  },
  官殺: {
    p: '你對外習慣端出守規矩、有分寸的樣子，把真實的脾氣收在後面。只有在安全的人面前，你才敢任性。',
    advice: '挑一個信任的人，練習在對方面前說一次「我不想」。',
  },
  印梟: {
    p: '你對外給人溫和、被保護得很好的印象。其實你比看起來獨立，很多事早就自己想清楚了。',
    advice: '有主見的時候直接說出來，別讓人以為你都可以。',
  },
};

const MASK_ALONE: Record<Group, string> = {
  比劫: '獨處的時候，你其實比自己以為的更好強，會偷偷跟過去的自己比較。',
  食傷: '獨處的時候，你會冒出很多想說、想做的點子，只是很少真的告訴別人。',
  財星: '獨處的時候，你常在心裡盤算未來要怎麼過，比外表看起來更在意安穩。',
  官殺: '獨處的時候，你對自己其實很嚴格，常檢討今天哪裡沒做好。',
  印梟: '獨處的時候，你最放鬆，一本書、一部片就能把自己安頓好。',
};

function mask(env: Env): MeaningItem | null {
  const year = env.year;
  const yearWx = year ? STEM_WX[year.gan] : undefined;
  const yearGroup = year ? GROUP_OF[year.ganTenGod] : undefined;
  if (!year || !yearWx || !yearGroup) return null;
  const outer = MASK_OUTER[yearWx];
  const inner = MASK_INNER[env.wx];
  const same = yearWx === env.wx;
  const p1 = same
    ? `${outer.p}熟了以後印象也差不多，你表裡相當一致，只是內在比外表更濃一些。`
    : `${outer.p}${inner.p}`;
  const timeGroup = env.time ? GROUP_OF[env.time.ganTenGod] : undefined;
  const scene = timeGroup
    ? MASK_ALONE[timeGroup]
    : env.yang
      ? '回到家關上門，你會一下子安靜下來，跟外面那個有說有笑的人判若兩人。'
      : '在外面客客氣氣的你，回到熟人面前話才多起來，連吐槽都很犀利。';
  return card(
    '面具與真實的反差',
    env.time
      ? '依年柱（給外人的第一印象）與日柱（真實的自己）的落差；時柱代表獨處時更深的內在。'
      : '依年柱（給外人的第一印象）與日柱（真實的自己）的落差；出生時間不確定，時柱（更深的內在）不列入。',
    same ? '表裡如一，只是裡面更濃' : `看起來${outer.word}，其實${inner.word}`,
    `${p1}（年干${year.gan}${yearWx}、日主${env.stem}${env.wx}）`,
    `${MASK_GAP[yearGroup].p}（年干為${year.ganTenGod}）`,
    scene,
    MASK_GAP[yearGroup].advice,
  );
}

// ---------------------------------------------------------------------------
// 8. 內耗與充電說明書：最重的忌神＝耗電點；喜神五行＝回血方式
// ---------------------------------------------------------------------------

const DRAIN: Record<Group, { hook: string; p: string; scene: string }> = {
  食傷: {
    hook: '熱鬧過後，你需要關機',
    p: '最耗你的是一直輸出：不停說話、表現、照顧場面。熱鬧過後，你常覺得整個人被掏空。',
    scene: '連續幾天聚會或簡報之後，你會突然誰的訊息都不想回。',
  },
  財星: {
    hook: '什麼都想顧好，電就漏光了',
    p: '最耗你的是同時顧太多現實的事：錢、待辦、別人的請託。每件都想處理好，電力就一點一點漏掉。',
    scene: '月底對帳、繳費、回覆請託擠在一起時，你會煩到什麼都不想碰。',
  },
  官殺: {
    hook: '被盯著的時候，最耗電',
    p: '最耗你的是被盯著、被要求的感覺。就算沒人開口，你也會自己想像別人的標準，然後先累了。',
    scene: '被主管或長輩盯進度的那幾天，你回到家只想躺著不動。',
  },
  比劫: {
    hook: '力氣很多，別都花在硬撐',
    p: '最耗你的是凡事自己來、不肯求助，還有暗中跟別人比較。力氣很多，卻常花在硬撐上。',
    scene: '事情做不完又不想開口請人幫忙，你會一個人撐到半夜。',
  },
  印梟: {
    hook: '想太多，比做太多還累',
    p: '最耗你的是想太多、準備太久卻遲遲不動。資訊越看越多，心反而越來越重。',
    scene: '為了做決定查了一整晚資料，結果更難選，人也更累。',
  },
};

const RECHARGE: Record<WuXing, { p: string; advice: string }> = {
  木: {
    p: '能幫你回血的是有生長感的事：走進公園或山裡、照顧植物、學一樣新東西。看到自己在進步，電就回來了。',
    advice: '每週排一次半小時的戶外散步，手機放口袋。',
  },
  火: {
    p: '能幫你回血的是有溫度的事：曬太陽、流汗運動、和談得來的人熱鬧聚一場。身體一暖，心就亮了。',
    advice: '每天曬十分鐘太陽，或做到微微流汗的運動。',
  },
  土: {
    p: '能幫你回血的是有規律的事：好好吃一頓、整理房間、照固定的時間睡覺。日子一踏實，你就穩了。',
    advice: '固定三餐和睡覺時間，先連續做滿一週。',
  },
  金: {
    p: '能幫你回血的是把東西理清楚：斷捨離、列清單、把一件事徹底收尾。界線一清楚，你就輕了。',
    advice: '每天睡前花五分鐘，把桌面和明天的清單整理好。',
  },
  水: {
    p: '能幫你回血的是安靜流動的事：泡澡、游泳、聽音樂、一個人散步發呆。讓腦袋放空，靈感自己回來。',
    advice: '每週留一晚不排行程，泡澡或聽音樂，什麼都不做。',
  },
};

function battery(env: Env): MeaningItem | null {
  // 身弱：洩、耗、剋日主的三組都是消耗；其餘：再加強自己的比劫與印星才是負擔（同命盤的忌神）。
  const drains: Group[] = env.weak ? ['食傷', '財星', '官殺'] : ['比劫', '印梟'];
  const drain = [...drains].sort((a, b) => env.pct(b) - env.pct(a))[0];
  const xiGroup: Group = env.weak ? '印梟' : '食傷';
  const rechargeWx = env.chart.wuXing.find((s) => s.gods === xiGroup)?.wx;
  if (!rechargeWx) return null;
  const d = DRAIN[drain];
  const r = RECHARGE[rechargeWx];
  return card(
    '內耗與充電說明書',
    '依對日主造成消耗與帶來幫助的五行（忌神與喜神），看什麼讓你耗電、什麼幫你回血。',
    d.hook,
    `${d.p}（${env.strength}，${GROUP_LABEL[drain]}占 ${env.pct(drain)}%）`,
    `${r.p}（喜神${GROUP_LABEL[xiGroup]}，五行屬${rechargeWx}）`,
    d.scene,
    r.advice,
  );
}

// ---------------------------------------------------------------------------
// 9. 金錢觀與安全感：財星份量 × 日主強弱；天干透出的是正財還是偏財
// ---------------------------------------------------------------------------

interface MoneyCore {
  hook: string;
  p: string;
  advice: string;
}

const MONEY: Record<Level, { weak: MoneyCore; other: MoneyCore }> = {
  heavy: {
    weak: {
      hook: '機會很多，守得住才算數',
      p: '你對錢很有感，機會和誘惑都多，卻常覺得抓不牢。賺得到，也容易因為人情或一時心軟花出去。',
      advice: '借錢、合資、作保這類請求，一律隔一天再回覆。',
    },
    other: {
      hook: '賺錢對你是成就感',
      p: '你對賺錢有企圖也有本事，看得到資源就有力氣去拿。錢對你來說是成就感，不只是安全感。',
      advice: '每年固定撥一筆收入到不能隨時動用的帳戶。',
    },
  },
  mid: {
    weak: {
      hook: '要的不多，穩穩的就好',
      p: '你要的不是大富大貴，而是手上有一筆穩穩的錢。收入一不確定，你的心就跟著不踏實。',
      advice: '先存到六個月生活費的預備金，再考慮其他投資。',
    },
    other: {
      hook: '賺多少花多少，心裡有數',
      p: '你對錢的態度務實，賺多少、花多少心裡有數。你相信靠自己的能力，錢是賺得回來的。',
      advice: '替自己設一個具體的金額目標和期限，寫在看得到的地方。',
    },
  },
  light: {
    weak: {
      hook: '安全感在人，不在存款',
      p: '錢不是你最在意的事，夠用就好。你的安全感比較來自身邊的人和熟悉的環境。',
      advice: '每個月發薪當天自動轉一筆錢到另一個帳戶。',
    },
    other: {
      hook: '有能力，就不怕沒錢',
      p: '你不太被錢綁住，花在喜歡的事和朋友身上很乾脆。你的安全感來自「我有能力」，不是存款數字。',
      advice: '每個月花十分鐘看一次總支出，知道錢去了哪裡就好。',
    },
  },
};

const MONEY_SCENE: Record<Level, { yang: string; yin: string }> = {
  heavy: {
    yang: '看到投資或兼差的機會，你會很快心動，當天就想研究怎麼開始。',
    yin: '逛街時你會默默換算：這個價錢等於我幾個小時的工作。',
  },
  mid: {
    yang: '發薪日你會先把該付的付掉，剩下的才決定怎麼花。',
    yin: '你大概知道這個月花了多少，一發現超支就會不安。',
  },
  light: {
    yang: '朋友約吃飯你很少先看價錢，帳單來了才發現這個月花多了。',
    yin: '你可以很久不買東西，但看到真心喜歡的，貴一點也會帶回家。',
  },
};

function money(env: Env): MeaningItem {
  const pct = env.pct('財星');
  const lv = level(pct);
  const m = MONEY[lv][env.weak ? 'weak' : 'other'];
  const zheng = env.exposed.includes('正財');
  const pian = env.exposed.includes('偏財');
  const p2 =
    zheng && pian
      ? '你一邊想要穩定的薪水，一邊又對額外的機會心動。兩種都抓的時候，要留意力氣被分散。（天干正財、偏財並見）'
      : zheng
        ? '你習慣一分耕耘一分收穫，偏好固定收入和看得懂的理財方式。存款慢慢變多，是你最安心的畫面。（天干見正財）'
        : pian
          ? '你的錢常從機會、人脈或副業來，來得快也去得快。你對朋友大方，請客很少手軟。（天干見偏財）'
          : env.exposed.includes('劫財')
            ? '你花錢很講義氣，朋友開口你很難拒絕。錢常不是自己花掉，而是花在別人身上。（天干見劫財，不見財星）'
            : '錢在你的盤裡不算搶眼，你比較少主動談錢。真正需要時，你其實算得很清楚。（財星不在天干）';
  return card(
    '金錢觀與安全感',
    '依盤中財星的份量、日主能不能駕馭它，以及正財、偏財哪一種明顯。',
    m.hook,
    `${m.p}（財星 ${pct}%、${env.strength}）`,
    p2,
    MONEY_SCENE[lv][env.yang ? 'yang' : 'yin'],
    m.advice,
  );
}

// ---------------------------------------------------------------------------
// 10. 原生家庭與依附：印星份量（被照顧的感覺）× 年干（早年印記）。只談依附習慣，不論斷父母。
// ---------------------------------------------------------------------------

const FAMILY: Record<Level, { weak: MoneyCore; other: MoneyCore }> = {
  heavy: {
    weak: {
      hook: '有人可以靠，你才安心',
      p: '你習慣身邊有人可以依靠，遇到事會先想找人商量。被照顧對你很自然，獨自做決定反而要練習。',
      advice: '下次想問別人意見前，先寫下自己的答案，再去對照。',
    },
    other: {
      hook: '想靠近，也想要空間',
      p: '你對關心很有感，也容易覺得被管得太多。你想靠近重要的人，又需要一塊完全屬於自己的空間。',
      advice: '想保持距離時，直接說「我需要自己想一下」，不必消失。',
    },
  },
  mid: {
    weak: {
      hook: '確定對方在，你才放心',
      p: '你在關係裡需要確定對方在，才敢放心做自己。對方一段時間沒回應，你會開始多想。',
      advice: '不安時直接問對方「你還好嗎」，取代自己猜。',
    },
    other: {
      hook: '能靠近，也能自己待著',
      p: '你和人的距離拿捏得算穩，能靠近也能獨處。你願意依靠人，但不會把全部的重量都放上去。',
      advice: '每個月主動約一位重要的人，好好聊一次近況。',
    },
  },
  light: {
    weak: {
      hook: '很早就學會自己來',
      p: '你很早就學會自己處理事情，不太習慣開口求助。心裡其實希望有人主動發現你需要幫忙。',
      advice: '這週挑一件小事，開口請一個人幫忙。',
    },
    other: {
      hook: '獨立慣了，別靠太近',
      p: '你習慣自己拿主意，獨立對你來說很自然。別人靠得太近或管太多，你會下意識退一步。',
      advice: '有人想幫你時，先說「好，謝謝」，再看需不需要。',
    },
  },
};

const FAMILY_YEAR: Record<Group, string> = {
  比劫: '你對「家」的感覺帶著同伴的味道，習慣在同輩之間找自己的位置。長大後，你把朋友看得像家人。',
  食傷: '你很早就有自己的想法，習慣用表現或成果換來注意。在親近的人面前，你最想聽到一句「做得好」。',
  財星: '你很早就懂事，習慣留意實際的需要、想幫上忙。在關係裡，你常用「幫忙解決問題」來表達在乎。',
  官殺: '你對規矩和期待很敏感，習慣先做到「應該的樣子」。在親密關係裡，你需要確定犯錯也會被接納。',
  印梟: '你對照顧者的話很有感，習慣在被保護的範圍裡探索。長大後，你容易被有包容力的人吸引。',
};

const FAMILY_SCENE: Record<Level, { yang: string; yin: string }> = {
  heavy: {
    yang: '做重大決定前，你會先打電話給家人或信任的前輩，聽完才安心。',
    yin: '身體不舒服或心情低落時，你最想回到熟悉的地方讓人照顧。',
  },
  mid: {
    yang: '你會固定和家人聯絡，但自己的事多半已經有答案才說。',
    yin: '親近的人語氣一變，你會立刻察覺，並猜是不是自己做錯了什麼。',
  },
  light: {
    yang: '搬家、換工作這種大事，你常是決定好了才通知家人。',
    yin: '遇到難關你習慣自己消化，事情過了才輕描淡寫地提起。',
  },
};

function family(env: Env): MeaningItem {
  const pct = env.pct('印梟');
  const lv = level(pct);
  const f = FAMILY[lv][env.weak ? 'weak' : 'other'];
  const yearGroup = env.year ? GROUP_OF[env.year.ganTenGod] : undefined;
  const p2 =
    yearGroup && env.year
      ? `${FAMILY_YEAR[yearGroup]}（年干為${env.year.ganTenGod}）`
      : '';
  return card(
    '原生家庭與依附',
    '依代表被照顧的印星份量與年柱（早年環境的位置），看的是你習慣怎麼依靠人，不是家人做了什麼。',
    f.hook,
    `${f.p}（印星 ${pct}%、${env.strength}）`,
    p2,
    FAMILY_SCENE[lv][env.yang ? 'yang' : 'yin'],
    f.advice,
  );
}

// ---------------------------------------------------------------------------
// 11. 天賦盲區：藏在地支、沒有透到天干的十神（自己不易察覺的本事）＋尚未提過的貴人星
// ---------------------------------------------------------------------------

const GIFT: Record<Group, { hook: string; p: string; scene: string; advice: string }> = {
  比劫: {
    hook: '你以為是硬撐，其實是韌性',
    p: '你有一種自己沒注意到的韌性：被打倒後恢復得比別人快。你覺得只是「撐過去而已」，別人看來卻很不簡單。',
    scene: '朋友說「要是我早就放棄了」，你才發現自己已經撐過一段很難的時間。',
    advice: '把撐過的三件難事寫下來，下次懷疑自己時拿出來看。',
  },
  食傷: {
    hook: '你隨口說的，別人記很久',
    p: '你有一種自己沒注意到的表達天分：隨口的比喻、順手做的東西，常讓人眼睛一亮。你以為人人都會。',
    scene: '你隨手寫的一段文字或做的一份簡報，被同事存下來當範本。',
    advice: '把你順手做的東西公開一次，貼出來或拿給人看。',
  },
  財星: {
    hook: '別人還在想，你已經算好了',
    p: '你有一種自己沒注意到的現實感：很快看得出什麼值得、什麼可行。別人還在想，你已經算好了。',
    scene: '朋友買東西或談薪水前，會先來問你「這樣划算嗎」。',
    advice: '下次有人問你划不划算，把你的判斷方式也講出來。',
  },
  官殺: {
    hook: '關鍵時刻，大家都看向你',
    p: '你有一種自己沒注意到的領導力：關鍵時刻大家會看向你，等你說怎麼做。你以為只是在負責而已。',
    scene: '分組時沒人講話，大家的眼神不約而同飄向你。',
    advice: '下次沒人帶頭時，主動說一句「那我來排一下」。',
  },
  印梟: {
    hook: '再複雜的事，到你手上就懂了',
    p: '你有一種自己沒注意到的理解力：複雜的事到你手上會變得好懂。別人常找你問「這到底是什麼意思」。',
    scene: '朋友看不懂的合約或說明書，會直接拍照傳給你。',
    advice: '找一個你懂的主題，用十分鐘講給一個外行人聽。',
  },
};

const GIFT_STAR: Array<[string, string]> = [
  ['金神', '你骨子裡有股不服輸的硬氣，越被小看越要做出成績。這份剛強用對地方，很少有人擋得住。'],
  ['德秀貴人', '你身上有種讓人願意幫忙的氣質，困難時常有人主動伸手。這不是運氣，是你平常待人的方式換來的。'],
  ['天官貴人', '長輩和上位者容易對你有好印象，願意給你機會。你覺得自己只是照規矩做，別人看到的是值得信任。'],
  ['將星', '你一認真起來，周圍的人會自動跟上。這份帶動力，你自己常是最後一個發現的。'],
];

const HIDE_WEIGHTS = [1, 0.4, 0.15];

function gift(env: Env): MeaningItem | null {
  // 藏干裡有、天干（年月時）沒有透出的十神組，取份量最重的一組。
  const exposedGroups = new Set(env.exposed.map((g) => GROUP_OF[g]));
  const weights = new Map<Group, number>();
  for (const p of env.chart.pillars) {
    if (env.chart.timeUnknown && p.key === 'time') continue;
    p.hidden.forEach((h, i) => {
      const g = GROUP_OF[h.tenGod];
      if (!g || exposedGroups.has(g)) return;
      const w = (HIDE_WEIGHTS[i] ?? 0.1) * (p.key === 'month' ? 2 : 1);
      weights.set(g, (weights.get(g) ?? 0) + w);
    });
  }
  const hiddenOnly = [...weights.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const dayGod = env.day?.hidden[0]?.tenGod ?? '';
  const group = hiddenOnly ?? GROUP_OF[dayGod];
  if (!group) return null;
  const basis = hiddenOnly
    ? `地支藏${GROUP_LABEL[hiddenOnly]}，天干不透`
    : `日支主氣為${dayGod}`;
  const star = GIFT_STAR.find(([name]) => env.shensha.has(name) && !env.usedStars.has(name));
  const p2 = star
    ? `${star[1]}（命帶${star[0]}）`
    : env.strength === '身旺'
      ? '你習慣把做得到的事當成理所當然，很少覺得那是本事。其實別人做同一件事，要花的力氣比你多得多。（身旺）'
      : `你常看見自己不足的地方，卻漏看了已經做得很好的部分。別人對你的評價，通常比你給自己的高。（${env.strength}）`;
  const g = GIFT[group];
  return card(
    '天賦盲區',
    '依藏在地支裡、沒有浮上天干的力量（自己不易察覺的本事），以及盤中的貴人星。',
    g.hook,
    `${g.p}（${basis}）`,
    p2,
    g.scene,
    g.advice,
  );
}

// ---------------------------------------------------------------------------
// 命盤依據（預設收合）：日主、四柱、十神、五行與強弱、格局、用神
// ---------------------------------------------------------------------------

const STEM_IMAGE: Record<string, string> = {
  甲: '像大樹，要有空間往上長，重方向與原則',
  乙: '像花草藤蔓，柔軟有韌性，環境對了就長得好',
  丙: '像太陽，熱情外放，習慣照亮身邊的人',
  丁: '像燈火，細膩持久，在安穩的環境裡亮得最穩',
  戊: '像高山，厚重能承載，重視穩定與信用',
  己: '像田園的土，善於照料與整合，把人事安頓好',
  庚: '像刀斧鋼鐵，果斷剛直，講求效率與義氣',
  辛: '像珠玉，精緻敏銳，在意質感與分寸',
  壬: '像江河大海，流動而有容量，喜歡自由與變化',
  癸: '像雨露，細密而滲透，直覺強、需要醞釀的空間',
};

const STRENGTH_NOTE: Record<string, string> = {
  身弱: '身弱不是不好，而是日主需要較多支持，與合得來的人、穩定的資源一起時最能發揮。',
  身旺: '身旺代表自主性強、能扛事，重點是替這股力氣找到出口，而不是硬碰硬。',
  中和: '中和代表盤面相對平衡，順境逆境都較能調適，關鍵在後天怎麼選擇。',
};

const TEN_GOD_TRAIT: Record<string, string> = {
  比肩: '和自己同類的力量，代表自我、同伴與獨立。優勢是有主見、重義氣；要留意固執、不願求助。和夥伴合作時把分工講清楚，比各自硬撐更好。',
  劫財: '同類但陰陽不同的力量，代表競爭與分享。優勢是行動力強、懂得結盟；要留意衝動，以及因人情或面子讓資源流失。涉及金錢的合作，事先說好規則。',
  食神: '由自己生出的力量，代表表達、享受與把才華做熟。優勢是溫和、有品味、會生活；要留意安逸、缺少衝勁。替興趣設一點目標，才華會更有成果。',
  傷官: '由自己生出、較外放的力量，代表創意與突破框架。優勢是聰明、有才華、敢說真話；要留意鋒芒太露、容易和權威衝突。表達意見時對事不對人，創意更容易被接受。',
  偏財: '自己能掌握的流動資源，代表機會、人脈與交際。優勢是大方、人緣好、反應快；要留意承諾太多。抓住機會的同時，替自己留一份穩定的底。',
  正財: '自己能掌握的穩定資源，代表踏實的付出與收穫。優勢是負責、會規劃；要留意太保守、放不開。在穩定之外，偶爾給自己嘗試新事物的空間。',
  七殺: '約束自己、較強硬的力量，代表壓力、挑戰與魄力。優勢是果斷、能扛大壓力；要留意急躁、把自己逼太緊。找到適合的紓壓方式，讓壓力變成推力。',
  正官: '約束自己、較溫和的力量，代表責任、規矩與社會角色。優勢是自律、守信；要留意拘謹、太在意別人的評價。守規矩之外，也替自己的想法留一點位置。',
  偏印: '支持自己、較特別的力量，代表直覺、冷門知識與獨到見解。優勢是領悟力強；要留意想太多、容易半途而廢。把獨特的興趣發展成專長，並適度與人分享。',
  正印: '支持自己的力量，代表學習、被照顧與貴人。優勢是仁厚、好學、有包容力；要留意依賴、行動力不足。把學到的東西實際用出來，才會變成自己的。',
};

const WX_HEAVY: Record<string, string> = {
  木: '木偏重的人常顯得有理想、想成長、肯向上，也容易同時開太多頭；挑一兩件事扎根做深，比四處延伸更有成果。',
  火: '火偏重的人常顯得熱情、積極、有表現欲，也容易衝動、熱度難以持久；替自己安排冷靜沉澱的時間，衝勁才用得長久。',
  土: '土偏重的人常顯得穩重、可靠、重承諾，也容易保守、思慮過多而行動慢；適度接受變化，給自己一點嘗試的空間。',
  金: '金偏重的人常顯得果斷、講原則、執行力強，也容易太剛、說話太直；在堅持之外多一分柔軟，合作會更順。',
  水: '水偏重的人常顯得聰明、靈活、善於變通，也容易想太多、定不下來；替自己建立固定的節奏與目標，流動才有方向。',
};

const GEJU_NOTE: Record<string, string> = {
  正官格: '月令主氣是正官，重秩序、名分與責任感，適合在有制度的環境裡穩步發展。要留意把外在的期待當成自己的目標；在可靠的框架裡，替自己留一點主見與彈性。',
  七殺格: '月令主氣是七殺，壓力與挑戰是主軸，越有難度越能激發魄力。要留意凡事硬拚、過勞；挑對戰場、找夥伴與適當的制衡，力量才用在刀口上。',
  正財格: '月令主氣是正財，重實際、踏實經營，靠穩定的付出換取成果。要留意只看眼前的穩定、不敢為長期投入；在穩健中保留一點投資自己的空間，例如學習與人脈。',
  偏財格: '月令主氣是偏財，善於掌握機會與人脈，資源常從流動中來。要留意同時抓太多機會、資源聚散不定；看見機會時先評估自己能承擔多少，穩住本業再延伸。',
  食神格: '月令主氣是食神，才華、表達與生活品味是主軸，做喜歡的事最能發光。要留意太隨興、做到一半就換；把才華變成可以分享的作品，影響力會慢慢累積。',
  傷官格: '月令主氣是傷官，聰明、有創意、敢突破框架。要留意對不認同的事很難配合、容易情緒化；選擇能容納創意的舞台，表達時兼顧對方的立場。',
  正印格: '月令主氣是正印，學習、修養與貴人扶持是主軸，適合需要專業累積的路。要留意習慣在舒適圈裡等待機會；學了就去用，讓知識變成實力。',
  偏印格: '月令主氣是偏印，思考獨特、領悟力強，適合專業技術或冷門領域。要留意對主流不感興趣、容易覺得不被理解；找到值得深耕的專長，持續下去就是優勢。',
  建祿格: '月令多為日主的同類（比劫），根基穩、靠自己打拚的味道重。要留意太獨立、不愛依靠別人；適合憑實力發展，也記得與人合作能放大成果。',
};

const PILLAR_NOTE: Record<BaziPillar['key'], string> = {
  year: '看根源、早年環境，以及給外人的第一印象',
  month: '看成長環境、工作與社會角色，也是判斷格局的位置',
  day: '天干是日主（你自己），地支看伴侶與親密關係',
  time: '看內在、未來規劃與人生後段的節奏',
};

function ref(term: string, field: string, meaning: string): MeaningItem {
  return { term, field, meaning };
}

function referenceItems(env: Env): MeaningItem[] {
  const { chart, stem } = env;
  const items: MeaningItem[] = [];

  items.push(
    ref(
      '日主',
      '出生日的天干，代表你自己；盤中其他字都相對它來看。',
      [
        `${chart.dayMaster}：${STEM_IMAGE[stem] ?? '日主是整張盤的中心'}。上方各張卡片的解讀，都是從這個字出發。`,
        `強弱為${chart.strength}（旺衰：${chart.wangShuai}）。${STRENGTH_NOTE[chart.strength] ?? ''}`,
      ].join('\n'),
    ),
  );

  const pillarLines = chart.pillars.map((p) => {
    const god = p.key === 'day' ? '' : `（天干為${p.ganTenGod}）`;
    const unknown = chart.timeUnknown && p.key === 'time' ? '；出生時間不確定，僅供參考' : '';
    return `${p.label}${p.gan}${p.zhi}${god}：${PILLAR_NOTE[p.key]}${unknown}。`;
  });
  items.push(
    ref(
      '四柱',
      '年、月、日、時四組干支，各自對應不同的人生領域。',
      [...pillarLines, '同一個十神落在不同柱，意思會偏向那一柱的領域，可以對照下方的十神一起看。'].join('\n'),
    ),
  );

  // 日柱天干是日主本身（元男／元女），不算十神。
  const tenGods = [
    ...new Set(
      chart.pillars
        .filter((p) => p.key !== 'day')
        .map((p) => p.ganTenGod)
        .filter(Boolean),
    ),
  ];
  if (tenGods.length > 0) {
    items.push(
      ref(
        '十神',
        '其他天干相對日主的關係，用來描述性格傾向與人事角色。',
        tenGods.map((g) => (TEN_GOD_TRAIT[g] ? `${g}：${TEN_GOD_TRAIT[g]}` : g)).join('\n'),
      ),
    );
  }

  const sorted = [...chart.wuXing].sort((a, b) => b.percent - a.percent);
  const top = sorted[0];
  if (top) {
    items.push(
      ref(
        '五行與強弱',
        '五行各占多少，看資源是否均衡、日主是否得到足夠的支持。',
        [
          `${chart.wuXing.map((s) => `${s.wx} ${s.percent}%`).join('、')}。`,
          WX_HEAVY[top.wx] ?? '',
          `幫助日主的五行是${chart.helpers}，消耗日主的是${chart.drainers}。偏重的五行不必刻意壓掉，讓不足的一方在生活裡多一點補充，比較容易平衡。`,
        ]
          .filter(Boolean)
          .join('\n'),
      ),
    );
  }

  items.push(
    ref(
      '格局',
      '由月柱決定的命盤結構類型，是解讀工作與社會角色的骨架。',
      `${chart.geJu}。${GEJU_NOTE[chart.geJu] ?? '格局是看盤的骨架，需要搭配用神與大運一起看。'}`,
    ),
    ref(
      '用神／喜神／忌神',
      '對日主最有幫助（用神）、可以配合（喜神）、需要節制（忌神）的力量。',
      [
        `喜神 ${chart.xiShen}、用神 ${chart.yongShen}、忌神 ${chart.jiShen}。`,
        chart.yongShenBody,
        env.weak
          ? '生活上可以把用神當成調整方向：多靠學習、休息與可信任的夥伴補足底氣，先穩住自己再承擔更多；忌神不是壞事，只是現階段要節制的消耗。'
          : '生活上可以把用神當成調整方向：把力氣用在輸出、做事與承擔責任上，讓能量有出口；忌神不是壞事，只是代表此時不宜再一味加強自己。',
      ]
        .filter(Boolean)
        .join('\n'),
    ),
  );
  return items;
}

/** The eleven theme cards, in guideline order (a card is left out when its basis is missing). */
export function baziThemeCards(chart: BaziChart): MeaningItem[] {
  const env = buildEnv(chart);
  return [
    personality(env),
    thinking(env),
    stress(env),
    love(env),
    work(env),
    core(env),
    mask(env),
    battery(env),
    money(env),
    family(env),
    gift(env),
  ].filter((x): x is MeaningItem => x !== null);
}

export function baziMeaningItems(chart: BaziChart): MeaningItem[] {
  return [...baziThemeCards(chart), ...referenceItems(buildEnv(chart))];
}
