import type { MeaningItem } from '@/lib/ui/personMeaning';
import { BODY_NAMES, SIGN_ELEMENTS, SIGN_NAMES } from './labels';
import type { AspectType, AstroAspect, AstroBody, AstroBodyKey, AstroChart } from './types';

// Rule-based interpretation text for the 星盤說明 card. Every sign table is indexed 0 = 牡羊 …
// 11 = 雙魚 and must keep all 12 entries. Client-safe: imports labels/types only, never compute.ts.

type SignTable = readonly [
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
];

const SUN: SignTable = [
    '你的核心動力來自「開始」：有想法就想立刻試，勇氣和直接是你最大的本錢。盲點是耐性短，容易衝完就沒了後續。給自己留一個收尾的步驟，衝勁會更有成果。',
    '你靠穩定與實感活得踏實，做事耐得住，也懂得享受生活裡具體的好東西。盲點是改變來得慢，固執起來不太聽勸。遇到新狀況時，先小規模試一下，比一口回絕更能保住你要的安穩。',
    '你的生命力在好奇與交流裡，學得快、聊得開，能把不同的資訊串起來。盲點是興趣多、容易分散，事情開了頭不一定收得了。挑一兩件真正在意的事深挖下去，聰明才會累積成實力。',
    '你重視歸屬與照顧，對身邊的人很有感，也很能營造讓人安心的氛圍。盲點是受傷時容易縮回殼裡，委屈不說出口。試著直接講出自己的需要，被照顧不等於欠人。',
    '你需要真心地表達自己，熱情、慷慨，有讓場子亮起來的能力。盲點是很在意被肯定，沒被看見時容易受挫或硬撐面子。把舞台感用在你真正相信的事情上，掌聲反而來得自然。',
    '你擅長把事情整理清楚、做到好用，對細節和品質有敏銳的眼光。盲點是對自己和別人都挑剔，容易陷在「還不夠好」。先完成再修正，允許八十分的版本先上場。',
    '你在關係與平衡裡找到自己，懂得體貼、協調，對美感與公平很敏銳。盲點是太顧慮別人的感受，遲遲做不了決定。先問自己想要什麼，再去找平衡點，關係會更對等。',
    '你投入的方式很深，重視真誠與信任，看事情能看到表面底下。盲點是不輕易放下，防備心也重，容易把事情悶著。挑幾個值得的人慢慢打開，深度關係會是你的力量來源。',
    '你需要意義與遠方，樂觀、坦率，喜歡探索新的想法、地方和信念。盲點是承諾和細節容易被跳過，話也可能說得太直。在大方向之外，替自己訂幾個近期就能完成的小目標。',
    '你務實、有長遠眼光，願意一步步把目標扛起來，責任感強。盲點是把價值綁在成就上，不太允許自己休息或示弱。把休息也排進計畫裡，走得遠比走得快更重要。',
    '你重視獨立和自己的想法，看事情常有不同角度，也在意群體與公平。盲點是情感上容易保持距離，被說成難以親近。理念之外，偶爾讓人看見你的在乎，連結會更紮實。',
    '你敏感、有同理心，想像力豐富，能感受到別人沒說出口的部分。盲點是界線模糊，容易被環境的情緒帶走，或用逃避來處理壓力。給自己固定的獨處與整理時間，把感受化成作品或行動。',
];

const MOON: SignTable = [
    '情緒來得快、去得也快，需要能立刻行動、發洩的空間。盲點是一急就衝口而出，事後才後悔。感到煩躁時先動一動身體，再談事情會順很多。',
    '安全感來自穩定的作息、熟悉的人和身體的舒服。盲點是不安時容易抓緊不放，或用吃、用買來安撫自己。替自己建立幾個可靠的日常儀式，心比較容易定下來。',
    '用說話和思考來消化情緒，聊一聊、寫下來就會好很多。盲點是習慣把感受理性化，講了很多卻沒碰到真正的情緒。偶爾問自己「我現在是什麼感覺」，而不只是「我怎麼想」。',
    '情感細膩，需要被照顧、也很會照顧人，家與親近的人是情緒的根。盲點是心情起伏大，受傷時容易退縮或翻舊帳。把需要說清楚，比等對方猜更能被好好接住。',
    '需要被重視、被欣賞，溫暖大方，喜歡讓身邊的人開心。盲點是被冷落時自尊容易受傷，表面沒事、心裡在意。主動說出「我需要你的肯定」，並不丟臉。',
    '透過把事情處理好來得到安心，習慣用照顧細節表達關心。盲點是焦慮時會過度檢查、挑剔自己。把擔心列成清單，分出「能做的」和「只能放下的」，心會輕一點。',
    '需要和諧的關係與舒服的環境，衝突會讓你很不安。盲點是為了維持和平而壓下自己的不滿。小的不舒服早點說，比累積到受不了再爆發好處理得多。',
    '情感濃烈而深，需要被完全信任，也很在意忠誠。盲點是受傷後不容易放下，可能用沉默或控制來保護自己。替強烈的情緒找一個安全的出口，例如書寫，或一個信得過的人。',
    '需要自由與希望感，心情好壞常跟眼前有沒有新的可能有關。盲點是遇到沉重的情緒時想逃開，或用玩笑帶過。給自己一點空間，但也練習留下來把難受的事談完。',
    '情緒內斂，靠掌控感和把事情扛好來得到安全。盲點是習慣自己撐著、不太示弱，壓力會悄悄累積。允許自己在信任的人面前放鬆，那不是軟弱。',
    '需要情感上的空間與被尊重的獨立，太黏的關係會讓你想退開。盲點是習慣抽離來處理情緒，旁人會覺得你冷。說明你需要空間的原因，對方就比較不會誤會成拒絕。',
    '情感敏銳、容易共感，很能體會他人的心情。盲點是吸收太多別人的情緒，分不清哪些是自己的。定期獨處，或藉由音樂、散步、親近水邊，幫自己把情緒沉澱下來。',
];

const ASC: SignTable = [
    '給人的第一印象直接、有活力，遇到事情習慣先動手再說。這份衝勁能帶動場面，但也可能顯得急躁。重要的場合放慢半拍，讓別人跟得上你。',
    '給人穩重、親切、不慌不忙的感覺，面對新環境會先觀察，再慢慢進入。可靠是你的名片，只是起步較慢，可能錯過時機。替自己設個期限，避免想太久。',
    '給人機靈、好聊、反應快的印象，很容易和陌生人搭上話。缺點是可能顯得不夠定性。在重要的人面前把話說到做到，會讓人更信任你。',
    '給人溫和、可親、帶點保護色的感覺，對環境的氣氛很敏感，熟了之後才會完全打開。不必勉強自己一開始就很外放，但可以主動釋出一點善意。',
    '給人大方、有自信、存在感強的印象，一出場就容易被注意到。這份光采是資產，只是太在意形象時會累。讓真實的你出場，比完美的樣子更有吸引力。',
    '給人細心、謹慎、有條理的印象，習慣先看清細節再行動。別人會覺得你可靠，也可能覺得你拘謹。偶爾放下「要先準備好」的標準，直接參與看看。',
    '給人優雅、好相處、有分寸的印象，很懂得讓互動舒服。代價是容易為了討人喜歡而模糊自己的立場。適時說出不同的意見，反而讓人更尊重你。',
    '給人沉穩、有點神祕、不容易看透的印象，觀察力很強。你不輕易交出自己，讓人既好奇又覺得有距離。確認對方值得信任後，讓人看見你柔軟的一面。',
    '給人開朗、坦率、愛冒險的印象，喜歡新鮮的人事物。這份熱情很有感染力，但說話有時太直。多留一點餘地給別人的感受，你的真誠會更好入口。',
    '給人成熟、穩重、有責任感的印象，年輕時常被當成比實際年齡大。你習慣先確認規則與目標再出手。在熟悉的場合允許自己放鬆，不必永遠當最可靠的那個。',
    '給人獨特、友善但保有距離的印象，常帶著與眾不同的觀點。在團體裡自在，一對一的親密則較慢熱。想靠近一個人時，可以多一點直接的表示。',
    '給人溫柔、隨和、帶點夢幻感的印象，很容易讓人放下防備。缺點是界線不清楚，容易被別人的要求推著走。學會溫和地說「不」，是保護自己的第一步。',
];

const MERCURY: SignTable = [
    '想得快、說得直，喜歡馬上下結論、立刻討論。要留意的是話還沒聽完就想反駁。重要的對話先多問一個問題，再給意見。',
    '思考踏實、慢而穩，一旦想通就不容易動搖，學習偏好具體、能動手的內容。被催的時候容易卡住，給自己需要的消化時間。',
    '腦筋靈活、好奇，擅長收集資訊、換句話說和同時處理多件事。要留意的是想法跳得快，容易淺嘗即止。把想法寫下來整理，你的聰明會更有說服力。',
    '思考帶著感受與記憶，很能聽出話裡的情緒。要留意的是心情會影響判斷，被批評時容易當成針對自己。重要的決定，等情緒平穩再定。',
    '說話有自信、有感染力，擅長講故事和帶動氣氛。要留意的是不太喜歡被當眾糾正。把一點舞台讓給別人的意見，你的說服力反而更強。',
    '分析細膩，擅長找出問題、整理流程，把事情講清楚。要留意的是容易過度思考、鑽牛角尖。設定「夠好就交」的標準，避免卡在細節裡。',
    '善於從多個角度看事情，說話得體，是很好的協調者。要留意的是看得太周全，反而難下結論。先列出自己的優先順序，做決定會容易得多。',
    '思考有深度，擅長看出動機和藏在底下的問題，問話常一針見血。要留意的是容易多疑，也不輕易說出自己的想法。分享觀察時，記得先給對方一點溫度。',
    '想得大、看得遠，喜歡討論理念、哲學與各種可能。要留意的是對細節不耐煩，話容易說太滿。把大方向拆成具體步驟，構想才落得了地。',
    '思考務實、有條理，重視結論和可行性。要留意的是對不實際的點子容易直接否決。偶爾讓自己天馬行空一下，再用你擅長的方式篩選。',
    '思考獨立、有創見，常跳出框架提出新角度。要留意的是有時固守自己的邏輯，聽不進感受面的意見。把「這樣合理嗎」和「對方感覺如何」放在一起看。',
    '思考靠直覺與想像，很能理解抽象、藝術或感性的東西。要留意的是條理和細節容易漏掉。重要的事寫成清單，靈感也隨手記下，才不會流失。',
];

const VENUS: SignTable = [
    '喜歡就直接追，感情來得熱烈，欣賞有活力、坦率的人。要小心的是熱度退得也快。在關係裡多給一點時間，讓新鮮感之外的東西長出來。',
    '重視穩定、忠誠與實際的照顧，對美食、觸感和好物很有品味。要小心的是佔有慾和習慣性強，不太願意改變相處模式。偶爾在關係裡加一點新的嘗試。',
    '容易被聰明、有趣、聊得來的人吸引，感情需要對話與新鮮感。要小心的是容易三心二意，或停在表面。對真正在乎的人，記得讓對方看到你的認真。',
    '用照顧與陪伴表達愛，重視家的感覺和安全感。要小心的是太在意對方的反應，或用付出換取被需要。也讓自己被照顧，關係才會對等。',
    '愛得大方、浪漫，喜歡被寵愛，也喜歡讓對方覺得特別。要小心的是很需要被欣賞，對方一冷淡就很受傷。把期待說出口，比等對方察覺更有效。',
    '用實際行動和細節表現在乎，記得對方的小需要。要小心的是容易挑剔，或覺得自己不夠好。看見對方的努力就說出來，也練習接受別人對你的肯定。',
    '重視和諧、公平與美感，懂得經營讓雙方都舒服的關係。要小心的是為了避免衝突而委屈自己。好的關係容得下不同意見，練習把真話溫和地說出來。',
    '愛得深，要的是全然的信任與連結，不喜歡淺淺的關係。要小心的是佔有慾和猜疑心。把不安直接說出來，而不是用試探去確認。',
    '需要自由與一起探索，喜歡能同行旅行、學習、看世界的伴。要小心的是怕被承諾綁住。說清楚你需要的空間，也讓對方知道你會回來。',
    '對感情謹慎認真，重視承諾與長期規劃，愛是用時間證明的。要小心的是不太表達情感，容易顯得冷淡。偶爾把心意說出口，或做點不那麼實用的浪漫小事。',
    '偏好像朋友一樣的關係，也重視彼此的獨立，欣賞特別、有想法的人。要小心的是表達情感偏理性，容易保持距離。在適合的時候，讓對方看見你也會依賴。',
    '浪漫、體貼、願意付出，容易被需要照顧或有藝術氣質的人吸引。要小心的是容易把對方理想化，或付出到忽略自己。看清楚真實的對方，也守住自己的界線。',
];

const MARS: SignTable = [
    '行動力強、反應快，遇到挑戰會正面迎上去。麻煩常出在脾氣來得急，容易衝動。把能量放在運動或有競爭性的目標上，衝勁會變成成果。',
    '行動慢而穩，一旦決定就很有持久力，不輕易放棄。麻煩常出在被逼急才爆發，或固執到不肯轉彎。設幾個階段性的檢查點，讓自己適時調整方向。',
    '靠腦力和話語行動，能同時處理多件事，反應機敏。麻煩常出在精力分散，也容易在口頭上爭輸贏。一次專注在少數任務上，效率會更好。',
    '為了保護在乎的人與事，會變得很有力量，但行動受情緒影響大。麻煩常出在不直接表達怒氣，容易生悶氣或冷處理。不滿時直接說，比迂迴更能解決問題。',
    '做事有熱情、有魄力，喜歡帶頭，也喜歡能被看見的挑戰。麻煩常出在自尊心強，面子被挑戰時容易硬碰硬。把重點放在事情本身，而不是誰贏。',
    '做事精準、有效率，擅長按步驟把事情一件件完成。麻煩常出在壓力大時容易焦慮，對細節過度要求。替自己留一點彈性時間，也練習把事情交給別人。',
    '傾向用協商與合作推動事情，擅長替雙方找到都能接受的方案。麻煩常出在猶豫不決，或把怒氣壓到最後才爆。練習在當下就說出「我不同意」。',
    '意志力強、專注而持久，認定的目標會深入到底。麻煩常出在怒氣容易悶在心裡，甚至記很久。替這股力量找健康的出口，例如高強度運動或需要深度投入的工作。',
    '為了理想與自由而行動，熱情、樂觀，喜歡冒險。麻煩常出在衝得快，後續容易沒耐心。替大目標配上具體的時間表，熱情才能持續。',
    '行動有紀律、有策略，能為長期目標持續付出。麻煩常出在太看重成果，給自己太大壓力。在努力之外，也記得肯定自己已經走過的路。',
    '為了理念和改變而行動，喜歡用自己的方式做事。麻煩常出在骨子裡的反叛，被強迫時特別抗拒。把想改變的事變成具體提案，別人比較容易跟上。',
    '行動受感覺與靈感引導，願意為別人或理想付出。麻煩常出在方向容易模糊，遇到衝突傾向退讓或逃避。設定清楚的小目標，並練習為自己爭取。',
];

const JUPITER: SignTable = [
    '成長來自主動開創、勇於嘗試，機會常在你先跨出第一步時出現。留意別因過度自信而貪多。',
    '透過穩健累積與實際經營得到收穫，對資源與生活品質有好眼光。留意享受與安逸過了頭。',
    '成長來自學習、交流與人脈，多看多聊常帶來機會。留意涉獵太廣而不夠深入。',
    '在照顧他人、經營家庭與歸屬感中得到滋養，人情味是你的福氣。留意保護過度。',
    '透過表現自己、創作與帶領他人而成長，慷慨能為你帶來好人緣。留意排場與面子。',
    '在服務、技能與把事情做好之中累積信心，細節裡藏著你的機會。留意對完美的要求過高。',
    '成長來自合作與公平的交流，好的夥伴能放大你的運氣。留意過度依賴別人的意見。',
    '在深入研究與心理層面的探索中成長，危機常帶來轉機。留意執著過深。',
    '透過旅行、學習、信念與教學擴展視野，樂觀是你的燃料。留意承諾太多、做不完。',
    '成長靠紀律與長期耕耘，越踏實越有收穫。留意因為太保守而錯過機會。',
    '在團體、創新與理想中找到成長，新觀念常為你開門。留意理想與現實之間的落差。',
    '在同理、藝術與心靈層面得到擴展，善意常以意想不到的方式回來。留意界線模糊而被利用。',
];

const SATURN: SignTable = [
    '功課是學習獨立行動、管理衝動，真正的自信來自一次次練習。急不得，但也別因為怕失敗就不動。',
    '功課在安全感與資源，可能對金錢或穩定特別焦慮。慢慢建立自己的基礎，價值感會跟著站穩。',
    '功課在溝通與學習，可能曾覺得自己說不好、學不夠。持續練習、建立方法，會讓你成為很可靠的表達者。',
    '功課在情感與家庭，可能較早就學會自己扛。在安全的關係裡學著示弱，是成熟的一部分。',
    '功課在自我表現與被肯定，對站上台可能既渴望又害怕。給自己練習的舞台，自信是一點一滴累積的。',
    '功課在工作方法與健康習慣，容易對自己要求過嚴。規律的作息與合理的標準，比苛責更有幫助。',
    '功課在關係與承諾，要學會在合作中守住公平與界線。關係越成熟，你越懂得長久經營。',
    '功課在信任與親密，害怕失控時會想抓緊一切。學著一步步交出信任，力量反而更穩。',
    '功課在信念與方向，對「什麼才是對的」可能很嚴肅。讓信念經得起經驗檢驗，會更有分量。',
    '責任感與耐力都很強，適合長期經營重要的目標。留意別把自己只當成工作的機器。',
    '功課在群體與個人自由之間取得平衡，要學會把理想變成可執行的結構。你常是團體裡穩定的骨架。',
    '功課在界線與現實感，容易被說不清的不安困擾。替感受和想像找到具體的形式，例如作品或固定的練習。',
];

const RETROGRADE_NOTE: Partial<Record<AstroBodyKey, string>> = {
    mercury: '水星逆行，想法常要反覆咀嚼才定案，回顧和修改是你的強項。',
    venus: '金星逆行，對愛與價值的判斷偏向內省，常要經過一段時間才確定自己真正喜歡什麼。',
    mars: '火星逆行，行動前習慣先在心裡演練，起步慢，後勁卻足。',
};

/** Index 0 = 第 1 宮. */
const HOUSE_THEME = [
    '自我形象與個人行動',
    '金錢、資源與自我價值',
    '溝通、學習與日常往來',
    '家庭、根源與內在安全感',
    '創作、戀愛、玩樂與自我表現',
    '工作日常、健康與服務',
    '伴侶與一對一的合作關係',
    '親密、共同資源與深層轉變',
    '學問、信念、旅行與遠方',
    '事業、社會角色與公開形象',
    '朋友、社群與未來願景',
    '獨處、潛意識與幕後付出',
] as const;

/** Short noun phrases for what each body is about, used to build aspect sentences. */
const BODY_FUNCTION: Record<AstroBodyKey, string> = {
    sun: '自我認同',
    moon: '情緒需求',
    mercury: '思考表達',
    venus: '感情喜好',
    mars: '行動衝勁',
    jupiter: '成長信心',
    saturn: '責任紀律',
    uranus: '求新求變',
    neptune: '理想想像',
    pluto: '深層掌控',
    northNode: '人生方向',
    chiron: '內在舊傷',
};

type Phrase = (a: string, b: string) => string;

/** Two phrasings per aspect type so repeated types in the top three don't read identically. */
const ASPECT_PHRASES: Record<AspectType, readonly [Phrase, Phrase]> = {
    conjunction: [
        (a, b) =>
            `${a}和${b}緊緊綁在一起，兩股力量互相放大；集中時很有力，只是不容易把兩者分開看。同時被觸發時，留意自己的反應是否過頭。`,
        (a, b) =>
            `${a}與${b}融成同一股力量，是這張盤很鮮明的特色；用得好時效果加倍，失衡時兩邊一起卡住。`,
    ],
    sextile: [
        (a, b) => `${a}和${b}之間有順手的合作機會，但需要你主動去用，才會變成真正的能力。`,
        (a, b) =>
            `${a}能自然地支援${b}，屬於一練就上手的天賦；給它一個固定的練習場合，會越用越好。`,
    ],
    square: [
        (a, b) =>
            `${a}和${b}彼此拉扯，常在壓力下才逼出成長；這份摩擦是動力，給它一個具體的出口，比壓下來好。`,
        (a, b) =>
            `${a}與${b}的需求常互相衝突，讓你覺得卡卡的；也正是這股張力讓你不甘停在原地，學會兩邊都照顧，就會變成長處。`,
    ],
    trine: [
        (a, b) =>
            `${a}和${b}天生流暢，是不太費力就會的事；別因為太自然而忽略它，把它刻意用在重要的地方。`,
        (a, b) =>
            `${a}與${b}彼此和諧，這方面你常比別人輕鬆；只是舒適區太舒服，偶爾也給自己一點挑戰。`,
    ],
    opposition: [
        (a, b) =>
            `${a}和${b}站在兩端，常在兩種需求之間、或在與人的關係裡擺盪；練習輪流照顧兩邊，而不是二選一。`,
        (a, b) =>
            `${a}與${b}彼此對望，常透過別人看見自己的另一面；找到中間的平衡點，兩股力量就能互補。`,
    ],
};

const ELEMENT_STRONG: Record<(typeof SIGN_ELEMENTS)[number], string> = {
    火: '熱情、行動快、敢衝，能點燃身邊的人，要留意耐性與持續力',
    土: '務實、穩定、重視實際成果，要留意彈性與冒險心',
    風: '重思考與交流，擅長看見關聯與不同觀點，要留意落實與感受面',
    水: '感受力與同理心強，重視情感連結，要留意界線與情緒消化',
};

const ELEMENT_LACK: Record<(typeof SIGN_ELEMENTS)[number], string> = {
    火: '缺火，可能較難主動起頭或燃起熱情，可以借助運動、有挑戰的目標或熱情的朋友來點火。',
    土: '缺土，落實與規律可能比較費力，可以用固定作息、預算和清單幫自己扎根。',
    風: '缺風，可能不太習慣把想法說清楚，或退一步看全局，多和不同的人聊、多寫下來會有幫助。',
    水: '缺水，自己的情緒可能不太容易被察覺，可以透過書寫、藝術或親近的關係練習感受。',
};

const MODALITIES = ['開創', '固定', '變動'] as const;
type Modality = (typeof MODALITIES)[number];

const MODALITY_STRONG: Record<Modality, string> = {
    開創: '擅長起頭、推動新局面，記得替開始的事安排收尾',
    固定: '有定力、能堅持到底，要留意固執與不易轉彎',
    變動: '適應力強、能隨機應變，要留意方向分散',
};

const MODALITY_SKILL: Record<Modality, string> = { 開創: '起頭', 固定: '堅持', 變動: '應變' };

const MODALITY_LACK: Record<Modality, string> = {
    開創: '沒有開創星座，起步時可能需要外力推一把。',
    固定: '沒有固定星座，持續力可以靠習慣和明確的承諾來補。',
    變動: '沒有變動星座，遇到變化時給自己多一點調適時間。',
};

/** The ten classical/modern planets used for element and modality counts. */
const PLANETS: AstroBodyKey[] = [
    'sun',
    'moon',
    'mercury',
    'venus',
    'mars',
    'jupiter',
    'saturn',
    'uranus',
    'neptune',
    'pluto',
];

function item(term: string, field: string, meaning: string): MeaningItem {
    return { term, field, meaning };
}

function signName(sign: number): string {
    return SIGN_NAMES[((sign % 12) + 12) % 12];
}

function signItem(
    b: AstroBody,
    field: string,
    table: SignTable,
    prefix = '',
    withRetro = false,
): MeaningItem {
    const retro = withRetro && b.retrograde ? (RETROGRADE_NOTE[b.key] ?? '') : '';
    return item(`${b.name} · ${b.signName}`, field, `${prefix}${table[b.sign]}${retro}`);
}

function moonCaveat(moon: AstroBody): string {
    // The noon-based Moon can be off by about ±7°, so near a sign boundary it may sit in the
    // neighbouring sign.
    let neighbour = '';
    if (moon.degree < 7) neighbour = `，也可能還在${signName(moon.sign - 1)}`;
    else if (moon.degree >= 23) neighbour = `，也可能已進入${signName(moon.sign + 1)}`;
    return `出生時間不確定，月亮一天約移動 13°，實際位置可能偏差約 ±7°${neighbour}；以下僅供參考。\n`;
}

function houseItem(sun: AstroBody, moon: AstroBody): MeaningItem | null {
    if (sun.house === null || moon.house === null) return null;
    const field =
        '宮位是人生的不同領域：太陽所在的宮位看你在哪裡發光，月亮所在的宮位看你在哪裡安心。';
    if (sun.house === moon.house) {
        const theme = HOUSE_THEME[sun.house - 1];
        return item(
            `太陽、月亮 · 第 ${sun.house} 宮`,
            field,
            `太陽和月亮都在第 ${sun.house} 宮（${theme}）：意志與情緒都集中在這個領域，投入時特別有感，這裡也是人生的重心。要留意的是別把全部的重量都壓在這一塊，其他領域也需要一點經營。`,
        );
    }
    return item(
        `太陽第 ${sun.house} 宮 · 月亮第 ${moon.house} 宮`,
        field,
        [
            `太陽在第 ${sun.house} 宮（${HOUSE_THEME[sun.house - 1]}）：人生的力氣多半往這裡去，在這個領域有所表現，最能感到自己活得有意義。`,
            `月亮在第 ${moon.house} 宮（${HOUSE_THEME[moon.house - 1]}）：安全感和情緒與這塊緊緊相連，這裡照顧好了，整個人會比較穩。`,
            '忙著往太陽的方向衝時，別忘了回到月亮的領域補充能量。',
        ].join('\n'),
    );
}

function aspectsItem(chart: AstroChart): MeaningItem {
    const field =
        '相位是行星之間的角度，容許度越小影響越明顯；這裡列出最緊密的三組，略過天王星、海王星、冥王星彼此之間的世代相位。' +
        (chart.timeUnknown ? '出生時間不確定，也略過與月亮有關的相位。' : '');
    const top = tightestAspects(chart);
    if (top.length === 0) {
        return item(
            '最緊密的相位',
            field,
            '這張盤沒有落在容許度內的主要相位，各行星比較獨立運作，可以分別從星座來理解。',
        );
    }
    const used: Partial<Record<AspectType, number>> = {};
    const lines = top.map((a) => {
        const n = used[a.type] ?? 0;
        used[a.type] = n + 1;
        const phrase = ASPECT_PHRASES[a.type][n % 2];
        const head = `${BODY_NAMES[a.a]}${a.name}${BODY_NAMES[a.b]}（容許度 ${a.orb.toFixed(1)}°）`;
        return `${head}：${phrase(BODY_FUNCTION[a.a], BODY_FUNCTION[a.b])}`;
    });
    return item('最緊密的相位', field, lines.join('\n'));
}

/** Outer planets move slowly, so aspects between two of them are shared by a whole generation. */
const OUTER = new Set<AstroBodyKey>(['uranus', 'neptune', 'pluto']);

/**
 * Up to three aspects with the smallest orb. Outer–outer (generational) aspects are skipped, and
 * so are Moon aspects when the birth time is unknown.
 */
export function tightestAspects(chart: AstroChart): AstroAspect[] {
    return chart.aspects
        .filter((a) => !(OUTER.has(a.a) && OUTER.has(a.b)))
        .filter((a) => !chart.timeUnknown || (a.a !== 'moon' && a.b !== 'moon'))
        .slice()
        .sort((x, y) => x.orb - y.orb)
        .slice(0, 3);
}

function balanceItem(planets: AstroBody[]): MeaningItem {
    const elementCount = SIGN_ELEMENTS.map((el, i) => ({
        el,
        n: planets.filter((p) => p.sign % 4 === i).length,
    }));
    const modalityCount = MODALITIES.map((m, i) => ({
        m,
        n: planets.filter((p) => p.sign % 3 === i).length,
    }));

    const elMax = Math.max(...elementCount.map((x) => x.n));
    const elTop = elementCount.filter((x) => x.n === elMax);
    const elLack = elementCount.filter((x) => x.n === 0);
    const moMax = Math.max(...modalityCount.map((x) => x.n));
    const moTop = modalityCount.filter((x) => x.n === moMax);
    const moLack = modalityCount.filter((x) => x.n === 0);

    const lines: string[] = [
        `${elementCount.map((x) => `${x.el} ${x.n}`).join('、')}；${modalityCount
            .map((x) => `${x.m} ${x.n}`)
            .join('、')}。`,
    ];

    if (elTop.length === 1) {
        lines.push(`${elTop[0].el}元素最多，${ELEMENT_STRONG[elTop[0].el]}。`);
    } else if (elTop.length === 2) {
        lines.push(
            `${elTop[0].el}與${elTop[1].el}並重：一方面${ELEMENT_STRONG[elTop[0].el]}；另一方面${ELEMENT_STRONG[elTop[1].el]}。`,
        );
    } else {
        lines.push('元素分布相當平均，沒有特別偏重的一種，性格面向比較多元。');
    }
    if (elLack.length > 0) {
        lines.push(elLack.map((x) => ELEMENT_LACK[x.el]).join(''));
    } else if (elTop.length < 3) {
        lines.push('四種元素都有，基本面算是平衡。');
    }

    if (moTop.length === 1) {
        lines.push(`${moTop[0].m}星座最多，${MODALITY_STRONG[moTop[0].m]}。`);
    } else if (moTop.length === 2) {
        lines.push(
            `${moTop[0].m}與${moTop[1].m}星座一樣多，兼具${MODALITY_SKILL[moTop[0].m]}與${MODALITY_SKILL[moTop[1].m]}的能力。`,
        );
    }
    if (moLack.length > 0) lines.push(moLack.map((x) => MODALITY_LACK[x.m]).join(''));

    return item(
        '元素與模式',
        '十顆行星落在火、土、風、水四元素與開創、固定、變動三種模式的分布，看整體性格的傾向。',
        lines.join('\n'),
    );
}

export function astroMeaningItems(chart: AstroChart): MeaningItem[] {
    const byKey = new Map(chart.bodies.map((b) => [b.key, b]));
    const get = (k: AstroBodyKey) => byKey.get(k);
    const items: MeaningItem[] = [];

    const sun = get('sun');
    const moon = get('moon');
    if (sun) items.push(signItem(sun, '太陽星座代表核心自我與生命動力，是你想成為的樣子。', SUN));
    if (moon) {
        items.push(
            signItem(
                moon,
                '月亮星座代表情緒需求與安全感，是放鬆時最真實的你。',
                MOON,
                chart.timeUnknown ? moonCaveat(moon) : '',
            ),
        );
    }
    if (chart.angles && !chart.timeUnknown) {
        const asc = chart.angles.asc;
        items.push(
            item(
                `上升 · ${asc.signName}`,
                '上升星座是給人的第一印象，也是你面對新環境的方式。',
                ASC[asc.sign],
            ),
        );
    }

    const planetRows: Array<[AstroBodyKey, string, SignTable]> = [
        ['mercury', '水星代表思考、學習與溝通的方式。', MERCURY],
        ['venus', '金星代表愛的方式、價值觀與審美。', VENUS],
        ['mars', '火星代表行動力、慾望與處理衝突的方式。', MARS],
        ['jupiter', '木星代表成長、信心，以及容易遇到機會的方向。', JUPITER],
        ['saturn', '土星代表責任、限制，以及需要長期練習的功課。', SATURN],
    ];
    for (const [key, field, table] of planetRows) {
        const b = get(key);
        if (b) items.push(signItem(b, field, table, '', true));
    }

    if (sun && moon && chart.houses && !chart.timeUnknown) {
        const h = houseItem(sun, moon);
        if (h) items.push(h);
    }

    items.push(aspectsItem(chart));

    const planets = PLANETS.map(get).filter((b): b is AstroBody => b !== undefined);
    if (planets.length > 0) items.push(balanceItem(planets));

    return items;
}
