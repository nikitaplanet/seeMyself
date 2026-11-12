import type { MeaningItem } from '@/lib/ui/personMeaning';
import { displayPalaceName } from './labels';
import { INNER, leadOf, OUTER, palaceByName, starsOfPalace, type PalaceStars } from './meaning';
import type { ConflictStyle, ZiweiFit, ZiweiPartner, ZiweiSynastry } from './synastry';

// 紫微合盤的主題卡片（.claude/星盤開發準則.md §3B），每張都只用盤上真的有的資料：
//   一起時的亮點 = 兩人命宮主星的組合          吵架與冷戰 = 各自的生年化忌星 + 福德宮主星
//   兩人內耗與充電 = 兩人福德宮主星            權力與主導權 = 命宮主星 + 化權落在對方哪一宮
//   財運與共事 = 兩人財帛宮主星 + 化祿落宮     初見與深交 = 遷移宮主星 vs 命宮主星
// 版型：hook ≤ 20 字；【解析】兩段各 ≤ 80 字；【相處場景】≤ 60 字；【給兩人的建議】≤ 50 字。

interface PairCopy {
    hook: string;
    p1: string;
    p2?: string;
    scene: string;
    advice: string;
}
type PairEntry = (x: string, y: string) => PairCopy;

function pick<S extends string>(
    table: Record<string, PairEntry>,
    order: readonly S[],
    sa: S,
    sb: S,
    na: string,
    nb: string,
): PairCopy {
    return order.indexOf(sa) <= order.indexOf(sb)
        ? table[`${sa}-${sb}`](na, nb)
        : table[`${sb}-${sa}`](nb, na);
}

function withBasis(text: string, basis: string): string {
    return text.endsWith('。') ? `${text.slice(0, -1)}${basis}。` : `${text}${basis}`;
}

function card(term: string, field: string, c: Required<PairCopy>): MeaningItem {
    return {
        term,
        field,
        hook: c.hook,
        meaning: ['【解析】', c.p1, c.p2, '【相處場景】', c.scene, '【給兩人的建議】', c.advice].join('\n'),
    };
}

const label = (name: string, palace: string, ps: PalaceStars) =>
    `${name}${palace}${ps.names.length === 0 ? '無主星' : `${ps.borrowed ? '借對宮' : ''}${ps.names.join('')}`}`;

// ---------------------------------------------------------------------------
// 一起時的亮點：命宮主星的組合
// ---------------------------------------------------------------------------

type Group = 'drive' | 'lead' | 'care' | 'voice';
const GROUP_ORDER: readonly Group[] = ['drive', 'lead', 'care', 'voice'];
const STAR_GROUP: Record<string, Group> = {
    七殺: 'drive',
    破軍: 'drive',
    貪狼: 'drive',
    紫微: 'lead',
    天府: 'lead',
    武曲: 'lead',
    廉貞: 'lead',
    天相: 'lead',
    天機: 'care',
    太陰: 'care',
    天同: 'care',
    天梁: 'care',
    太陽: 'voice',
    巨門: 'voice',
};

const HIGHLIGHT: Record<string, PairEntry> = {
    'drive-drive': () => ({
        hook: '兩個行動派，說走就走',
        p1: '兩人都敢衝、敢試，想到什麼就一起去做，生活很少停在原地；彼此也懂對方那股不想被綁住的勁。',
        p2: '這份衝勁的另一面，是誰都不想先停；兩人同時往不同方向衝時，需要有人先喊一聲等一下。',
        scene: '週五晚上一句「要不要去看海」，半小時後兩人已經在路上，住哪裡到了再說。',
        advice: '每次臨時起意前，先花一分鐘確認兩人想去的是同一個地方。',
    }),
    'drive-lead': (x, y) => ({
        hook: '一個開路，一個掌舵',
        p1: `${x}負責往前衝、打開新局面，${y}負責看方向、把成果守住；兩人合在一起，既有速度也有章法。`,
        p2: `吸引彼此的正是這份不同，磨合時也在這裡：${x}嫌慢、${y}嫌亂，其實兩人要的是同一個結果。`,
        scene: `${x}興奮地提出新計畫，${y}第一句話是「預算呢」；吵完之後，計畫真的變得更可行。`,
        advice: `新點子先讓${x}講完五分鐘，${y}再提問，順序對了就不會像潑冷水。`,
    }),
    'drive-care': (x, y) => ({
        hook: '一個帶來風，一個留住溫度',
        p1: `${x}替生活帶來變化與刺激，${y}細心地把日子照顧好；${x}因此有了歸處，${y}也看見更大的世界。`,
        p2: `同樣的差異在疲累時會變成節奏落差：${x}想往外跑、${y}想慢下來，輪流配合就能兩全。`,
        scene: `${x}臨時說要出門，${y}默默多帶了外套和水；回程時${x}說「還好有你」。`,
        advice: `每個月各選一天：一天照${x}的節奏衝，一天照${y}的步調慢。`,
    }),
    'drive-voice': (x, y) => ({
        hook: '一個敢做，一個敢說',
        p1: `${x}行動快，${y}表達力強，一個把事情做出來，一個把事情說出去；兩人在一起很有聲勢。`,
        p2: '兩人都直接，痛快的另一面是話和動作都很快；意見不同時，先慢半拍再回應會更好。',
        scene: `${x}已經動手做了，${y}在旁邊向大家說明來龍去脈，朋友都說你們像一個小團隊。`,
        advice: `有爭執時約定：${y}先不講道理、${x}先不走開，各聽對方說完兩分鐘。`,
    }),
    'lead-lead': () => ({
        hook: '兩個靠得住的人，把日子過穩',
        p1: '兩人都有擔當、重承諾，做事有規劃，交代的事不會漏；在一起的生活很有秩序，也很踏實。',
        p2: '兩人都習慣拿主意，穩定的另一面是誰也不想讓；把各自負責的範圍分清楚，就不必爭。',
        scene: '出國前一個訂機票住宿、一個排預算行程，兩份表格一合，連備案都有了。',
        advice: '把家裡的大事分成兩份清單，各自全權負責一份，互不插手。',
    }),
    'lead-care': (x, y) => ({
        hook: '一個撐起架構，一個填進溫柔',
        p1: `${x}有主見、能扛事，${y}體貼、想得細；${x}定方向時有${y}補上人情味，兩人的決定又穩又暖。`,
        p2: `磨合點也在這裡：${x}的果斷有時讓${y}來不及表達，${y}的顧慮有時讓${x}覺得腳步被拉住。`,
        scene: `${x}說「就這樣決定」，${y}輕聲補一句「那邊要不要先講一聲」，事情因此更圓滿。`,
        advice: `${x}拍板前固定問一句「你有沒有還沒說的」，並真的等${y}說完。`,
    }),
    'lead-voice': (x, y) => ({
        hook: '一個定調，一個發聲',
        p1: `${x}沉得住、看得遠，${y}熱情、敢表達；${x}在後面穩住局面，${y}在前面把話說出去，內外搭配得很好。`,
        p2: `意見不合時，容易變成${y}說得多、${x}回得少；${x}多給一點回應，${y}就不必越說越大聲。`,
        scene: `聚會上${y}負責炒熱氣氛，${x}負責記得誰喝了酒、怎麼回家，分工從來不用講。`,
        advice: `${y}說完想法後，${x}至少回三句話，而不是只說「嗯，知道了」。`,
    }),
    'care-care': () => ({
        hook: '兩個細膩的人，懂彼此的安靜',
        p1: '兩人都心思細、重感受，很能察覺對方的心情，相處溫柔、少有尖銳的話；在一起很有被懂的感覺。',
        p2: '細膩的另一面，是兩人都容易把話放在心裡，等對方先開口；有一個人先說，另一個就會跟著說。',
        scene: '一個人嘆了口氣，另一個就倒來一杯熱茶，什麼都沒問，卻什麼都懂了。',
        advice: '約定一個暗號，代表「我有事想說，但不知道怎麼開口」。',
    }),
    'care-voice': (x, y) => ({
        hook: '一個聽得深，一個說得亮',
        p1: `${x}善於傾聽與體察，${y}樂於表達與分享；${y}的話有人認真接住，${x}的心事也有人幫忙說出口。`,
        p2: `磨合時，${y}的直白可能讓${x}一時接不住，${x}的沉默又讓${y}摸不著頭緒；彼此多給一點提示就好。`,
        scene: `${y}滔滔不絕講完一天的事，${x}只問了一句，就問到${y}自己都沒發現的重點。`,
        advice: `${y}講完後換問${x}「那你今天呢」，並等${x}慢慢說。`,
    }),
    'voice-voice': () => ({
        hook: '話題聊不完，家裡很熱鬧',
        p1: '兩人都愛表達、有想法，從時事聊到夢想都能接上；有話直說，相處坦率，很少有猜來猜去的時候。',
        p2: '都愛說的另一面，是都想被聽見；討論容易變成辯論，輪流當聽眾，話才真的進得去。',
        scene: '一頓飯可以聊三個小時，從餐廳聊到家門口，還站在門口多講了十分鐘。',
        advice: '意見不同時輪流發言，一人說完，另一人先複述一次再回應。',
    }),
};

// ---------------------------------------------------------------------------
// 吵架與冷戰：各自的生年化忌星（地雷）+ 福德宮主星（破冰方式）+ 命宮主星的反應類型
// ---------------------------------------------------------------------------

const MINE: Record<string, string> = {
    太陽: '付出被當成應該的、沒人看見',
    太陰: '心情被忽略、被說「想太多」',
    廉貞: '被冤枉，或在別人面前沒面子',
    巨門: '話被打斷、說的話不被相信',
    天機: '計畫被臨時推翻、被嫌想太多',
    文曲: '承諾被當玩笑、說好的事沒做到',
    天同: '被催促、被逼著當場表態',
    文昌: '說過的話不算數、訊息不讀不回',
    武曲: '錢的事不清不楚、努力被否定',
    貪狼: '被管得太緊、興致被潑冷水',
};
const MINE_FALLBACK = '在意的事被輕描淡寫帶過';

const ICE: Record<string, string> = {
    紫微: '先給一個台階，別逼著認錯',
    天機: '讓腦袋先轉完，再約時間好好談',
    太陽: '大方說一句「剛剛是我太急了」',
    武曲: '不必多說，直接做一件實際的事',
    天同: '帶點好吃的，語氣放軟就好',
    廉貞: '認真地說一次「我在乎你」',
    天府: '給一點時間，別催著馬上和好',
    太陰: '安靜陪在旁邊，不急著追問',
    貪狼: '用一個玩笑或提議把氣氛換掉',
    巨門: '先聽完整段話，中途不打斷',
    天相: '先說「我們都有不對」，再談事情',
    天梁: '認真請教一句「你怎麼看」',
    七殺: '給空間，過一陣子直接約出門',
    破軍: '換個地方、換個話題重新開始',
};
const ICE_FALLBACK = '先問一句「你現在需要什麼」';

const CONFLICT_ORDER: readonly ConflictStyle[] = ['direct', 'reason', 'withdraw', 'soothe'];

const FIGHT: Record<string, (x: string, y: string) => { hook: string; scene: string; advice: string }> = {
    'direct-direct': () => ({
        hook: '吵得快，和好也快',
        scene: '一句話不對，兩人同時大聲起來；十分鐘後一個人問「要不要吃宵夜」，氣就消了一半。',
        advice: '吵完當天睡前，各說一句「我剛剛真正想說的是…」。',
    }),
    'direct-reason': (x, y) => ({
        hook: '一個要態度，一個要道理',
        scene: `${x}說「你就是不在乎」，${y}開始一條條舉證；${x}要的其實只是一句「我在乎」。`,
        advice: `${y}先說一句「我在乎你」，再開始講理由，順序換一下就好。`,
    }),
    'direct-withdraw': (x, y) => ({
        hook: '一個追著講，一個先躲開',
        scene: `${x}追到房門口想講清楚，${y}戴上耳機不說話；門裡門外，兩人其實都很難受。`,
        advice: `${y}離開前說一句「我一小時後回來談」，並且準時回來。`,
    }),
    'direct-soothe': (x, y) => ({
        hook: '一個火氣快，一個先讓步',
        scene: `${x}一口氣把不滿說完，${y}馬上說「好啦對不起」；${x}反而覺得沒被認真聽。`,
        advice: `${y}道歉之前，先複述一次${x}在意的是什麼。`,
    }),
    'reason-reason': () => ({
        hook: '吵架像辯論，贏了也不開心',
        scene: '兩人為了誰記錯時間翻出對話紀錄比對，證明完之後，才發現重點根本不是時間。',
        advice: '爭到第三輪就喊停，各自寫下「我要的結果」，交換著看。',
    }),
    'reason-withdraw': (x, y) => ({
        hook: '一個講道理，一個不說話',
        scene: `${x}傳來一長串分析，${y}只回「嗯」；${x}以為被敷衍，${y}其實是不知道從哪裡回。`,
        advice: `${x}把長篇分析縮成一個問題，${y}只需要回答那一題。`,
    }),
    'reason-soothe': (x, y) => ({
        hook: '一個想理清，一個想和好',
        scene: `${x}還想把原因講清楚，${y}已經在問「那我們和好了嗎」；兩人都覺得對方沒抓到重點。`,
        advice: `先讓${y}得到一個擁抱，再給${x}十分鐘把事情說完。`,
    }),
    'withdraw-withdraw': () => ({
        hook: '誰都不開口，冷戰容易拖長',
        scene: '吵完各自滑手機，同一個屋簷下安靜了兩天，誰都在等對方先說第一句話。',
        advice: '約好冷戰不過夜，睡前至少傳一個貼圖給對方。',
    }),
    'withdraw-soothe': (x, y) => ({
        hook: '一個沉默，一個先伸手',
        scene: `${y}端了水果過來示好，${x}還沒準備好說話，只點了點頭；${y}猜不出這算不算和好。`,
        advice: `${x}還沒準備好時，回一句「再給我一點時間，我沒有不理你」。`,
    }),
    'soothe-soothe': () => ({
        hook: '很少大吵，小疙瘩卻會累積',
        scene: '兩人都說「沒關係」，事情就這樣過去了；三個月後為了一件小事，舊帳突然一起冒出來。',
        advice: '每個月約一次「小抱怨時間」，各說一件平常沒說的事。',
    }),
};

// ---------------------------------------------------------------------------
// 兩人內耗與充電：福德宮主星
// ---------------------------------------------------------------------------

type Charge = 'quiet' | 'social' | 'active' | 'cozy';
const CHARGE_ORDER: readonly Charge[] = ['quiet', 'social', 'active', 'cozy'];
const STAR_CHARGE: Record<string, Charge> = {
    太陰: 'quiet',
    天機: 'quiet',
    巨門: 'quiet',
    天梁: 'quiet',
    太陽: 'social',
    貪狼: 'social',
    七殺: 'active',
    破軍: 'active',
    武曲: 'active',
    天同: 'cozy',
    天府: 'cozy',
    紫微: 'cozy',
    廉貞: 'cozy',
    天相: 'cozy',
};

/** 快沒電時的訊號（接在「快沒電時」後面）。 */
const LOW: Record<string, string> = {
    紫微: '會變得挑剔、什麼都不滿意',
    天機: '話變少、開始睡不好',
    太陽: '笑容變少、懶得出門',
    武曲: '回話變短、只談正事',
    天同: '什麼都提不起勁、只想躺著',
    廉貞: '情緒起伏變大、容易較真',
    天府: '什麼提議都說「再看看」',
    太陰: '特別安靜、常說「沒事」',
    貪狼: '坐不住、一直想找事做',
    巨門: '容易挑語病、越問越多',
    天相: '勉強說好、笑得很客氣',
    天梁: '開始碎念、叮嚀變多',
    七殺: '容易不耐煩、想一個人',
    破軍: '突然想把東西全部換掉',
};
const LOW_FALLBACK = '會變得比平常安靜';

const BATTERY: Record<string, PairEntry> = {
    'quiet-quiet': () => ({
        hook: '各自安靜，也是一種陪伴',
        p1: '兩人都靠安靜來恢復，待在同一個空間各做各的事就很自在，不需要一直找話講，相處幾乎不耗電。',
        scene: '週日下午一個看書、一個聽音樂，三小時沒說幾句話，卻都覺得今天過得很好。',
        advice: '每週留一個「一起獨處」的晚上，同處一室、各自充電。',
    }),
    'quiet-social': (x, y) => ({
        hook: '一個想回家，一個想出門',
        p1: `${x}要靜下來才恢復，${y}要往外走才有電；${y}替${x}帶回外面的新鮮事，${x}給${y}一個安穩的落腳處。`,
        scene: `連假第一天，${y}已經約好兩場聚會，${x}看著行事曆，默默想著哪一場可以不去。`,
        advice: `聚會前先講好幾點離開，${x}也可以自己先走，${y}不必陪著。`,
    }),
    'quiet-active': (x, y) => ({
        hook: '一個靜靜充電，一個動著放電',
        p1: `${x}靠安靜回神，${y}靠活動筋骨釋放壓力；各自充飽電再碰面，${y}帶來活力，${x}帶來沉澱。`,
        scene: `下班後${y}想去運動、${x}想窩在沙發；硬要一起，兩個人都覺得沒休息到。`,
        advice: '平日各自充電一小時，再一起吃晚餐分享今天的事。',
    }),
    'quiet-cozy': (x, y) => ({
        hook: '慢慢的日子，兩人都喜歡',
        p1: `${x}喜歡安靜，${y}喜歡愜意，步調都不快，很容易找到兩人都滿意的過法；在家約會就很幸福。`,
        scene: `${y}準備了好吃的，${x}挑了一部安靜的電影，兩人窩在沙發上過了一個完美的晚上。`,
        advice: `偶爾讓${x}獨處半天，${y}自己去吃頓好的，再回來相聚。`,
    }),
    'social-social': () => ({
        hook: '一起出門，電量一起滿',
        p1: '兩人都靠往外走、和人互動來恢復，一起聚會、一起嘗鮮特別合拍，是朋友眼中最好約的一對。',
        scene: '週末行事曆排得滿滿，回到家兩人都累，卻也都笑著說「下週還要」。',
        advice: '每個月留一個週末不約任何人，只有兩人，把電留給彼此。',
    }),
    'social-active': (x, y) => ({
        hook: '都坐不住，往外跑就對了',
        p1: `${x}喜歡熱鬧與人群，${y}喜歡活動與挑戰，兩人都待不住家裡，一起出門玩很有默契。`,
        scene: `${x}想去朋友的聚會，${y}想去爬山；最後決定白天爬山、晚上聚會，兩人都盡興。`,
        advice: `出遊行程各排一半：一半${x}想見的人，一半${y}想做的事。`,
    }),
    'social-cozy': (x, y) => ({
        hook: '一個愛熱鬧，一個愛窩著',
        p1: `${x}出門見人才有精神，${y}待在熟悉的地方才放鬆；${x}替生活添熱度，${y}讓家成為最好待的地方。`,
        scene: `${x}興沖沖說朋友約唱歌，${y}看著剛泡好的茶，問了一句「可以不去嗎」。`,
        advice: `把朋友約到家裡來，${x}有人聊，${y}也不必離開自己的窩。`,
    }),
    'active-active': () => ({
        hook: '一起流汗，煩惱就散了',
        p1: '兩人都靠動起來恢復，一起運動、一起說走就走特別痛快；用行動陪伴彼此，比說話更有效。',
        scene: '兩人都心煩的晚上，沒多說什麼，換上球鞋出門跑一圈，回來就好了。',
        advice: '找一項兩人都喜歡的運動，固定每週一起做一次。',
    }),
    'active-cozy': (x, y) => ({
        hook: '一個要動，一個要躺',
        p1: `${x}休息的方式是動起來，${y}休息的方式是慢下來；${x}拉著${y}出門走走，${y}教${x}好好放鬆。`,
        scene: `假日早上${x}已經運動回來，${y}才剛醒；一個說「出門吧」，一個說「再躺一下」。`,
        advice: `假日分成兩段：上午照${x}的動，下午照${y}的慢。`,
    }),
    'cozy-cozy': () => ({
        hook: '一起耍廢，就是最好的約會',
        p1: '兩人都靠簡單的享受來恢復，吃好吃的、窩在家、慢慢過一天；很懂得一起把日子過得愜意。',
        scene: '兩人為了晚餐吃什麼認真討論半小時，吃完一起癱在沙發上，覺得人生圓滿。',
        advice: '每季一起嘗試一項小小的新活動，替安穩的日子加一點新鮮。',
    }),
};

// ---------------------------------------------------------------------------
// 權力與主導權：命宮主星的決策類型 + 化權落在對方哪一宮
// ---------------------------------------------------------------------------

type Rule = 'chief' | 'advisor' | 'steward' | 'easy';
const RULE_ORDER: readonly Rule[] = ['chief', 'advisor', 'steward', 'easy'];
const STAR_RULE: Record<string, Rule> = {
    紫微: 'chief',
    七殺: 'chief',
    破軍: 'chief',
    武曲: 'chief',
    廉貞: 'chief',
    太陽: 'chief',
    天機: 'advisor',
    巨門: 'advisor',
    天梁: 'advisor',
    天府: 'steward',
    天相: 'steward',
    天同: 'easy',
    太陰: 'easy',
    貪狼: 'easy',
};

const POWER: Record<string, PairEntry> = {
    'chief-chief': () => ({
        hook: '兩個都想拍板，先分好地盤',
        p1: '兩人都有主見、習慣自己做決定，遇到大事都想說了算；好處是誰都扛得起，家裡不缺拿主意的人。',
        scene: '裝潢選哪個顏色、旅行去哪個國家，兩人各有堅持，最後用猜拳決定，輸的人還碎念三天。',
        advice: '把決定分成「你管的」「我管的」「一起決定的」三類，寫下來。',
    }),
    'chief-advisor': (x, y) => ({
        hook: '一個拍板，一個當軍師',
        p1: `${x}習慣做最後決定，${y}擅長分析與提醒；${y}把利弊講清楚，${x}來下決心，是很順的搭配。`,
        scene: `${x}說「就買這台」，${y}拿出比較表指出另一台更划算；${x}看完，改口說「那聽你的」。`,
        advice: `${x}決定前先問${y}的分析，${y}說完後，由${x}拍板不再翻案。`,
    }),
    'chief-steward': (x, y) => ({
        hook: '一個帶頭，一個把關',
        p1: `${x}負責帶方向、往前推，${y}負責顧細節、守住底線；表面上${x}主導，其實${y}握有關鍵的一票。`,
        scene: `${x}興致勃勃宣布計畫，${y}平靜地問「錢從哪裡來」；${x}安靜了三秒，開始重算。`,
        advice: `大筆開銷採「雙簽制」：${x}提案，${y}同意才算數。`,
    }),
    'chief-easy': (x, y) => ({
        hook: '一個帶路，一個樂得跟',
        p1: `${x}喜歡安排、做決定，${y}隨和、樂得輕鬆；多數時候${x}拿主意、${y}配合，兩人都自在。`,
        scene: `${x}問「晚餐吃什麼」，${y}說「都可以」；${x}選好之後，${y}才小聲說其實想吃麵。`,
        advice: `每週固定一天由${y}全權安排行程，${x}只負責說好。`,
    }),
    'advisor-advisor': () => ({
        hook: '都愛出主意，沒人想拍板',
        p1: '兩人都擅長分析、給建議，討論起來很有深度；不太會有人獨斷，重要的事都是商量出來的。',
        scene: '討論換不換車聊了三個晚上，利弊列了兩頁，最後兩人同時說「那你決定吧」。',
        advice: '每件事指定一位「最後決定人」，兩人輪流擔任。',
    }),
    'advisor-steward': (x, y) => ({
        hook: '一個想得遠，一個顧得穩',
        p1: `${x}提供想法與方向，${y}負責評估與把關；兩人都不強勢，主導權是輪流的，很少有誰壓過誰。`,
        scene: `${x}提出三個方案，${y}一個個問「這樣會不會太趕」；選出來的那個，通常很穩。`,
        advice: `${x}的方案限三個以內，${y}的顧慮限三條以內，然後就做決定。`,
    }),
    'advisor-easy': (x, y) => ({
        hook: '一個出主意，一個說都好',
        p1: `${x}想法多、樂於給建議，${y}隨和、願意聽；大小事常照${x}的分析走，${y}也樂得省心。`,
        scene: `${x}分析完三間餐廳的優缺點，${y}笑著說「你講這麼多，就去你想去的那間吧」。`,
        advice: `${x}給建議前先問${y}的直覺，${y}的第一個答案也算一票。`,
    }),
    'steward-steward': () => ({
        hook: '都顧全大局，客氣到沒人做主',
        p1: '兩人都穩重、會替對方想，決定事情時互相尊重；沒有誰壓誰的問題，家裡的氣氛很平和。',
        scene: '「你決定就好」「沒關係你選」來回了五次，兩人站在店門口笑了出來。',
        advice: '約定誰先說「你決定」，另一個人就必須在十秒內選好。',
    }),
    'steward-easy': (x, y) => ({
        hook: '一個默默掌舵，一個安心搭船',
        p1: `${x}習慣把事情安排妥當，${y}樂於配合；${x}不強勢卻把關一切，${y}信任地交出方向盤。`,
        scene: `${y}出門前才發現，證件、雨傘、訂位，${x}都已經準備好了。`,
        advice: `${x}每月交一件事給${y}全權處理，過程中不提醒、不補救。`,
    }),
    'easy-easy': () => ({
        hook: '誰都不搶，日子隨興過',
        p1: '兩人都隨和、不愛爭主導，相處輕鬆沒壓力；很少為了誰說了算而吵架，凡事好商量。',
        scene: '兩人滑了二十分鐘外送，誰也沒下單，最後一起煮了泡麵，也吃得很開心。',
        advice: '輪流當「本週隊長」，隊長負責做所有小決定。',
    }),
};

/** 化權落在對方的哪一宮：主見最常放在哪件事上。 */
const QUAN_DOMAIN: Record<string, string> = {
    命宮: '對方的人生選擇上',
    兄弟: '對方和手足同事的事上',
    夫妻: '感情的節奏上',
    子女: '孩子與共同計畫上',
    財帛: '錢怎麼賺怎麼花上',
    疾厄: '對方的作息健康上',
    遷移: '出門與對外的安排上',
    僕役: '對方的交友圈上',
    官祿: '對方的工作方向上',
    田宅: '家裡的安排上',
    福德: '休閒與生活品味上',
    父母: '和對方長輩的相處上',
};

// ---------------------------------------------------------------------------
// 財運與共事：財帛宮主星 + 化祿落在對方哪一宮
// ---------------------------------------------------------------------------

type Cash = 'earn' | 'keep' | 'plan' | 'enjoy';
const CASH_ORDER: readonly Cash[] = ['earn', 'keep', 'plan', 'enjoy'];
const STAR_CASH: Record<string, Cash> = {
    武曲: 'earn',
    七殺: 'earn',
    破軍: 'earn',
    貪狼: 'earn',
    天府: 'keep',
    太陰: 'keep',
    天相: 'keep',
    天梁: 'keep',
    天機: 'plan',
    巨門: 'plan',
    紫微: 'plan',
    廉貞: 'plan',
    天同: 'enjoy',
    太陽: 'enjoy',
};

const MONEY: Record<string, PairEntry> = {
    'earn-earn': () => ({
        hook: '兩個都敢賺，也都敢花',
        p1: '兩人對賺錢都有企圖心，敢投入、敢嘗試，一起打拚很有衝勁；看準機會時，動作比別人快一步。',
        scene: '聊到一個副業點子，兩人當晚就開始查資料、算成本，隔天已經在找場地。',
        advice: '共同投資前先約定停損點，寫下來，到了就停。',
    }),
    'earn-keep': (x, y) => ({
        hook: '一個負責賺，一個負責守',
        p1: `${x}敢衝、會開源，${y}會存、能守成；${x}賺回來的，${y}替兩人留得住，是很實際的好搭檔。`,
        scene: `${x}興奮地說想投資新東西，${y}打開記帳表：「可以，但只能用這一筆」。`,
        advice: `每月固定一筆「${x}可以自由運用」的額度，其他由${y}管。`,
    }),
    'earn-plan': (x, y) => ({
        hook: '一個出手快，一個算得精',
        p1: `${x}行動力強、敢下決定，${y}擅長研究與規劃；${y}看方向，${x}去執行，合作起來效率很高。`,
        scene: `${y}做了三頁的比較，${x}看完第一頁就說「好，就這個」，當天下午就辦完了。`,
        advice: `合作時${y}負責列出前三名選項，${x}負責一天內決定。`,
    }),
    'earn-enjoy': (x, y) => ({
        hook: '一個拚命賺，一個懂得花',
        p1: `${x}努力賺錢，${y}懂得享受生活；${y}提醒${x}賺錢是為了過日子，${x}讓兩人有本錢過得好。`,
        scene: `${x}加班到很晚，回家發現${y}訂了很棒的餐廳：「錢賺了就是要花在這種時候」。`,
        advice: `一起訂出每月「享受預算」，額度內${y}安排，${x}不過問。`,
    }),
    'keep-keep': () => ({
        hook: '兩個都會存，家底越來越厚',
        p1: '兩人用錢都謹慎、重視儲蓄，財務觀念很合；不太會為了亂花錢吵架，存款穩穩地長。',
        scene: '週年紀念日兩人比較了三家餐廳的優惠，最後選了有折扣的那家，都覺得很划算。',
        advice: '每年編一筆「一定要花掉」的旅遊或體驗基金。',
    }),
    'keep-plan': (x, y) => ({
        hook: '一個守得住，一個算得清',
        p1: `${x}重視存下來，${y}重視規劃與比較；兩人做財務決定都很仔細，大錢很少花錯地方。`,
        scene: `買家電前，${y}研究了一週規格，${x}等到了週年慶；最後買到最好的價格。`,
        advice: '小額消費約定不討論，把研究的力氣留給大筆支出。',
    }),
    'keep-enjoy': (x, y) => ({
        hook: '一個想存，一個想花',
        p1: `${x}看重存款帶來的安心，${y}看重當下過得開心；${x}讓未來有保障，${y}讓現在有滋味。`,
        scene: `${y}提議出國玩，${x}第一個反應是打開存款頁面；${y}說「假期不會等人」。`,
        advice: '收入一進來先分三份：存下來的、共同花的、各自隨意的。',
    }),
    'plan-plan': () => ({
        hook: '兩個軍師，把錢算得明明白白',
        p1: '兩人花錢前都會做功課、比較方案，財務決定很理性；一起研究理財時特別有話聊。',
        scene: '為了選哪一張信用卡，兩人各做了一份試算表，還互相檢查對方的公式。',
        advice: '研究設定期限：比較不超過一週，到期就選當下最好的。',
    }),
    'plan-enjoy': (x, y) => ({
        hook: '一個精打細算，一個隨心所欲',
        p1: `${x}擅長規劃、看得懂細節，${y}大方、重視生活樂趣；${x}讓錢花得聰明，${y}讓錢花得開心。`,
        scene: `${y}隨手把東西放進購物車，${x}默默查了比價網站：「等一下，另一家便宜兩百」。`,
        advice: `${y}想買的東西先放清單，由${x}每週幫忙找一次最好的買法。`,
    }),
    'enjoy-enjoy': () => ({
        hook: '有福同享，錢留不太住',
        p1: '兩人都大方、重視生活品質，願意把錢花在吃喝玩樂與彼此身上；在一起的日子很有滋味。',
        scene: '月初兩人開心地吃了好幾頓大餐，月底一起看著帳單說：「下個月真的要省一點」。',
        advice: '設定薪水入帳自動轉存，存下來的錢兩人都不經手。',
    }),
};

const MATERIAL_PALACES: readonly string[] = ['財帛', '官祿', '田宅'];

// ---------------------------------------------------------------------------
// 初見與深交：遷移宮主星（在外給人的印象）vs 命宮主星（熟了才看到的一面）
// ---------------------------------------------------------------------------

const WARM_OUTER = new Set(['太陽', '天同', '貪狼', '天機', '天相', '太陰']);

const FIRST: Record<string, (x: string, y: string) => { hook: string; scene: string; advice: string }> = {
    'warm-warm': () => ({
        hook: '一見如故，越熟越看見心事',
        scene: '第一次見面就聊到店家打烊；交往半年後的某個晚上，才第一次聽對方說起真正的煩惱。',
        advice: '各說一件「認識越久才發現」的對方優點，當面講。',
    }),
    'warm-cool': (x, y) => ({
        hook: '一個好親近，一個要慢慢熟',
        scene: `一開始都是${x}找話題、${y}簡短回應；某天${y}主動傳來一長串心裡話，${x}才知道自己被信任了。`,
        advice: `${x}別急著要${y}敞開，${y}每週主動分享一件小事當作回應。`,
    }),
    'cool-cool': () => ({
        hook: '初見都有距離，熟了才知道多暖',
        scene: '剛認識時客客氣氣、各自有保留；直到一起經歷一件麻煩事，才看見對方靠得住的一面。',
        advice: '找一件有點挑戰的事一起完成，例如自助旅行或合辦一場聚會。',
    }),
};

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

export interface ZiweiPairCards {
    /** 一起時的亮點（放在報告最前面）。 */
    highlight: MeaningItem;
    /** 吵架與冷戰、兩人內耗與充電、權力與主導權、財運與共事、初見與深交（接在日常相處之後）。 */
    themes: MeaningItem[];
}

export function ziweiPairCards(
    a: ZiweiPartner,
    b: ZiweiPartner,
    syn: ZiweiSynastry,
    fit: ZiweiFit,
    conflict: readonly [ConflictStyle, ConflictStyle],
): ZiweiPairCards {
    const A = a.name;
    const B = b.name;
    const of = (p: ZiweiPartner, palace: string) => starsOfPalace(p.chart, palaceByName(p.chart, palace));
    const soul = { a: of(a, '命宮'), b: of(b, '命宮') };
    const fude = { a: of(a, '福德'), b: of(b, '福德') };
    const wealth = { a: of(a, '財帛'), b: of(b, '財帛') };
    const travel = { a: of(a, '遷移'), b: of(b, '遷移') };
    const pairBasis = (palace: string, x: PalaceStars, y: PalaceStars) =>
        `（${label(A, palace, x)}、${label(B, palace, y)}）`;
    const flightOf = (from: 'a' | 'b', mutagen: string) =>
        syn.flights.find((f) => f.from === from && f.mutagen === mutagen && f.palace !== null);

    // 一起時的亮點
    const hl = pick(
        HIGHLIGHT,
        GROUP_ORDER,
        leadOf(soul.a, STAR_GROUP) ?? 'care',
        leadOf(soul.b, STAR_GROUP) ?? 'care',
        A,
        B,
    );
    const highlight = card('一起時的亮點', '看兩人命宮主星放在一起的樣子：最合拍的地方，和同一件事在磨合時的另一面。', {
        ...hl,
        p1: withBasis(hl.p1, pairBasis('命宮', soul.a, soul.b)),
        p2: hl.p2 ?? '',
    });

    // 吵架與冷戰
    const jiA = a.chart.mutagens.find((m) => m.mutagen === '忌')?.star;
    const jiB = b.chart.mutagens.find((m) => m.mutagen === '忌')?.star;
    const mineA = (jiA && MINE[jiA]) || MINE_FALLBACK;
    const mineB = (jiB && MINE[jiB]) || MINE_FALLBACK;
    const mineBasis = jiA && jiB ? `（${A}${jiA}化忌、${B}${jiB}化忌）` : '';
    const iceA = leadOf(fude.a, ICE) ?? ICE_FALLBACK;
    const iceB = leadOf(fude.b, ICE) ?? ICE_FALLBACK;
    const [ca, cb] = conflict;
    const fightCopy =
        CONFLICT_ORDER.indexOf(ca) <= CONFLICT_ORDER.indexOf(cb)
            ? FIGHT[`${ca}-${cb}`](A, B)
            : FIGHT[`${cb}-${ca}`](B, A);
    const fight = card('吵架與冷戰', '各自出生年的化忌是最碰不得的地雷，福德宮主星是氣消的方式；兩人吵起來的樣子看命宮主星。', {
        hook: fit.difficult ? '地雷離心很近，吵架先喊停' : fightCopy.hook,
        p1: withBasis(
            mineA === mineB
                ? `兩人的地雷是同一種：都受不了${mineA}；所以最懂哪句話不能說，也最容易同時被踩到。`
                : `${A}的地雷是${mineA}；${B}的地雷是${mineB}。踩到時先別解釋，承認「我碰到你在意的事了」。`,
            mineBasis,
        ),
        p2: fit.difficult
            ? '坦白說，兩人的地雷都離對方的心很近，一踩就痛，冷戰也容易拖長；吵起來時先喊停，比當下爭出對錯重要得多。'
            : withBasis(
                  iceA === iceB
                      ? `冷下來之後，兩人氣消的方式一樣：${iceA}；誰先做都有效。`
                      : `想讓${A}氣消，可以${iceA}；想讓${B}氣消，可以${iceB}。`,
                  pairBasis('福德宮', fude.a, fude.b),
              ),
        scene: fightCopy.scene,
        advice: fightCopy.advice,
    });

    // 兩人內耗與充電
    const bt = pick(
        BATTERY,
        CHARGE_ORDER,
        leadOf(fude.a, STAR_CHARGE) ?? 'cozy',
        leadOf(fude.b, STAR_CHARGE) ?? 'cozy',
        A,
        B,
    );
    const lowA = leadOf(fude.a, LOW) ?? LOW_FALLBACK;
    const lowB = leadOf(fude.b, LOW) ?? LOW_FALLBACK;
    const battery = card('兩人內耗與充電', '兩人福德宮的主星：各自怎麼休息才回血、快沒電時會出現什麼訊號。', {
        ...bt,
        p1: withBasis(bt.p1, pairBasis('福德宮', fude.a, fude.b)),
        p2:
            lowA === lowB
                ? `兩人快沒電時都${lowA}，很容易互相感染；誰先察覺，誰就先喊休息。`
                : `${A}快沒電時${lowA}；${B}則${lowB}。看到訊號，先讓對方充電再談事情。`,
    });

    // 權力與主導權
    const pw = pick(
        POWER,
        RULE_ORDER,
        leadOf(soul.a, STAR_RULE) ?? 'easy',
        leadOf(soul.b, STAR_RULE) ?? 'easy',
        A,
        B,
    );
    const qa = flightOf('a', '權');
    const qb = flightOf('b', '權');
    const da = qa?.palace ? QUAN_DOMAIN[qa.palace] : undefined;
    const db = qb?.palace ? QUAN_DOMAIN[qb.palace] : undefined;
    const quanBasis = [
        qa?.palace && da ? `${A}${qa.star}化權落${B}${displayPalaceName(qa.palace)}` : '',
        qb?.palace && db ? `${B}${qb.star}化權落${A}${displayPalaceName(qb.palace)}` : '',
    ]
        .filter(Boolean)
        .join('、');
    const powerP2 =
        da && db
            ? qa?.palace === qb?.palace
                ? `兩人的主見都放在${da.replace('對方', '彼此')}，這一塊最需要事先講好誰說了算。`
                : `${A}的主見最常放在${da}，${B}則放在${db}；各管一塊，就不必搶。`
            : da || db
              ? `${da ? A : B}的主見最常放在${da ?? db}；這一塊多讓${da ? A : B}拿主意，其他的事兩人商量。`
              : '兩人的主導欲都沒有特別壓在對方身上，誰拿主意多半看事情而定，彈性很大。';
    const power = card('權力與主導權', '命宮主星看各自做決定的習慣；化權落在對方的哪一宮，主見就最常放在那件事上。', {
        ...pw,
        p1: withBasis(pw.p1, pairBasis('命宮', soul.a, soul.b)),
        p2: quanBasis ? withBasis(powerP2, `（${quanBasis}）`) : powerP2,
    });

    // 財運與共事
    const mn = pick(
        MONEY,
        CASH_ORDER,
        leadOf(wealth.a, STAR_CASH) ?? 'plan',
        leadOf(wealth.b, STAR_CASH) ?? 'plan',
        A,
        B,
    );
    const la = flightOf('a', '祿');
    const lb = flightOf('b', '祿');
    const aGives = !!la?.palace && MATERIAL_PALACES.includes(la.palace);
    const bGives = !!lb?.palace && MATERIAL_PALACES.includes(lb.palace);
    const luBasis = [
        aGives && la?.palace ? `${A}${la.star}化祿落${B}${displayPalaceName(la.palace)}` : '',
        bGives && lb?.palace ? `${B}${lb.star}化祿落${A}${displayPalaceName(lb.palace)}` : '',
    ]
        .filter(Boolean)
        .join('、');
    const moneyP2 =
        aGives && bGives
            ? '兩人都能替對方帶來實際的好處，一起賺錢、一起做事特別容易有成果。'
            : aGives || bGives
              ? `${aGives ? A : B}常替${aGives ? B : A}帶來賺錢或工作上的機會，${aGives ? B : A}的事找${aGives ? A : B}商量很有幫助。`
              : '兩人帶給彼此的好處多半在生活與心情上；談到合夥或共同帳戶，先把分工和帳目講清楚最穩。';
    const money = card('財運與共事', '兩人財帛宮的主星看用錢習慣合不合；化祿落在對方的財帛、事業、田宅宮，代表能帶來實際的幫助。', {
        ...mn,
        p1: withBasis(mn.p1, pairBasis('財帛宮', wealth.a, wealth.b)),
        p2: luBasis ? withBasis(moneyP2, `（${luBasis}）`) : moneyP2,
    });

    // 初見與深交：命宮無主星時（借的就是遷移宮），內在改看福德宮
    const innerOf = (s: PalaceStars, f: PalaceStars) =>
        s.borrowed || s.names.length === 0 ? { ps: f, palace: '福德宮' } : { ps: s, palace: '命宮' };
    const inA = innerOf(soul.a, fude.a);
    const inB = innerOf(soul.b, fude.b);
    const outA = leadOf(travel.a, OUTER)?.role ?? '隨和有彈性';
    const outB = leadOf(travel.b, OUTER)?.role ?? '隨和有彈性';
    const roleA = leadOf(inA.ps, INNER)?.role ?? '想被好好認識';
    const roleB = leadOf(inB.ps, INNER)?.role ?? '想被好好認識';
    const warmA = WARM_OUTER.has(travel.a.names[0] ?? '');
    const warmB = WARM_OUTER.has(travel.b.names[0] ?? '');
    const fs =
        warmA && warmB
            ? FIRST['warm-warm'](A, B)
            : !warmA && !warmB
              ? FIRST['cool-cool'](A, B)
              : warmA
                ? FIRST['warm-cool'](A, B)
                : FIRST['warm-cool'](B, A);
    const first = card('初見與深交', '遷移宮主星是在外面給人的第一印象，命宮主星是熟了之後才看得到的那一面。', {
        ...fs,
        p1: withBasis(
            `剛認識時，${A}眼中的${B}${outB}，${B}眼中的${A}${outA}；這是兩人在外面給人的樣子。`,
            pairBasis('遷移宮', travel.a, travel.b),
        ),
        p2: withBasis(
            `熟了才發現，私下的${B}${roleB}，${A}則${roleA}；不是誰變了，是終於放心給對方看。`,
            `（${label(A, inA.palace, inA.ps)}、${label(B, inB.palace, inB.ps)}）`,
        ),
    });

    return { highlight, themes: [fight, battery, power, money, first] };
}

/** 文案表（給測試檢查字數用）。 */
export const ZIWEI_PAIR_COPY = { HIGHLIGHT, BATTERY, POWER, MONEY, FIGHT, FIRST, MINE, ICE, LOW } as const;
