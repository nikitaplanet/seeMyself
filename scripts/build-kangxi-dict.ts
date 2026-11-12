/**
 * Build the 姓名學 character dictionary `src/lib/name/data/kangxi_dict.json` and the list of
 * distinct roots `src/lib/name/data/roots.json`. Both are committed so the runtime needs no network
 * (spec `.claude/gemini-code-姓名學.md` §1: no API / LLM calls at runtime).
 *
 * Usage: npx tsx scripts/build-kangxi-dict.ts            (downloads are cached in `.cache/kangxi/`)
 * Requires the system `curl` and `unzip` CLIs.
 *
 * ── Sources and licences ─────────────────────────────────────────────────────────────────────
 * 1. Unicode Han Database (Unihan) 15.0.0 — kRSKangXi, kRSUnicode, kIICore, kDefinition
 *      https://www.unicode.org/Public/15.0.0/ucd/Unihan.zip
 *    Unicode Character Database 15.0.0 — CJKRadicals.txt, EquivalentUnifiedIdeograph.txt
 *    Unicode Licence v3 (https://www.unicode.org/license.txt): data files may be used, copied,
 *    modified and redistributed, including derived data, provided the notice accompanies them.
 *    15.0.0 is pinned on purpose: it is the last release that still carries kRSKangXi (the
 *    radical + residual strokes as printed in the 康熙字典 itself; removed in Unicode 15.1).
 * 2. BIG5.TXT (Unicode, Inc. mapping table, same terms) — only used to enumerate the Big5 level-1
 *    常用字 block (0xA440–0xC67E, 5,401 characters).
 *      https://www.unicode.org/Public/MAPPINGS/OBSOLETE/EASTASIA/OTHER/BIG5.TXT
 * 3. BabelStone IDS (Andrew West) — Ideographic Description Sequences, used for `roots`.
 *      https://www.babelstone.co.uk/CJK/IDS.TXT
 *    The file header (§2) waives all copyright claims: "anyone is free to make use of the IDS data
 *    provided in this file for personal or commercial purposes without asking permission or
 *    providing attribution". (Chosen over CHISE / cjkvi-ids, which are GPLv2.)
 *
 * ── Character set ────────────────────────────────────────────────────────────────────────────
 * Big5 level 1 (5,401 常用字) ∪ IICore characters with a Taiwan (T) source (6,566, a superset of
 * level 1 that adds many name characters such as 婕 妘 姵 瑀 瑄 鈺 鑫 堃) ∪ EXTRA_CHARS below
 * (百家姓 and common Taiwanese surnames / 複姓 / given-name characters that are in neither set).
 *
 * ── kangxi_strokes ───────────────────────────────────────────────────────────────────────────
 * strokes = (stroke count of the Kangxi radical in its full form) + (residual strokes).
 * Radical number and residual come from kRSKangXi, falling back to the first kRSUnicode value
 * when a character has no kRSKangXi. The full-form radical stroke count is the position of the
 * radical in the 214-radical Kangxi sequence (RADICAL_STROKE_GROUPS), so 氵 counts as 水 4,
 * 扌 as 手 4, 忄 as 心 4, 犭 as 犬 4, 礻 as 示 5, 王旁 as 玉 5, 艹 as 艸 6, 衤 as 衣 6, 月(肉) as
 * 肉 6, 罒 as 网 6, 辶 as 辵 7, 阝right as 邑 7, 阝left as 阜 8.
 * As in the 康熙字典, only the *radical* is restored to its full form: 酒 is filed under 酉, so its
 * 氵 stays 3 strokes (酒 = 10), and 巡 is filed under 巛 (巡 = 7).
 * STROKE_OVERRIDES holds the 姓名學 exceptions (numerals counted by value); see the comment there.
 *
 * ── wuxing (字義五行) ────────────────────────────────────────────────────────────────────────
 * There is no canonical dataset for 字義五行; published tables disagree with each other. This
 * script uses a documented, reproducible rule, applied in order (first hit wins):
 *   1. WUXING_OVERRIDES — characters whose element is fixed by 五行 doctrine itself: the five
 *      elements, 天干, 地支, 五方, 四季, 五色.
 *   2. Radical — the character's Kangxi radical, via WUXING_BY_ROOT (木 竹 艸 禾 … → 木, 火 日 心 … →
 *      火, 土 山 石 田 阜 邑 … → 土, 金 刀 戈 玉 貝 … → 金, 水 冫 雨 魚 … → 水).
 *   3. Meaning — whole-word keyword match on the Unihan kDefinition gloss (WUXING_KEYWORDS); the
 *      element with the most keyword hits wins, ties are not decided here.
 *   4. Component — the first root (see `roots`) that appears in WUXING_BY_ROOT.
 *   5. Fallback — 筆畫五行: last digit of kangxi_strokes (1,2 木; 3,4 火; 5,6 土; 7,8 金; 9,0 水), the
 *      same rule the five grids use.
 * The script prints how many characters each step decided.
 *
 * ── roots ────────────────────────────────────────────────────────────────────────────────────
 * The IDS of the character (the first, most widely shared sequence BabelStone lists) is decomposed
 * recursively. Decomposition stops at a component that is a Kangxi radical, one of ROOT_UNITS
 * (王 君 申 寅 …: units that 生肖姓名學 reads as a whole), or has no further IDS. Variant forms are
 * normalised to the full form (ROOT_VARIANTS: 艹→艸, 氵→水, 忄→心, 扌→手, 犭→犬, 礻→示, 衤→衣,
 * 辶→辵, 𤣩→玉, ⺼→肉 …). Context-dependent forms use the enclosing character's radical: 阝 is 阜
 * (radical 170 / left side) or 邑 (radical 163 / right side); 月 is 肉 when the enclosing
 * character is filed under 肉 (胡 育 能); 罒 is 网 under radicals 网/貝 and 目 elsewhere (夢 德 曼).
 * Single strokes and unencoded fragments are dropped; a component character that does not split
 * cleanly because of them is reported whole, followed by the parts that could be identified
 * (嘩 → 口 華 艸). Repeated roots are kept (品 → 口 口 口).
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..");
const CACHE_DIR = path.join(ROOT, ".cache", "kangxi");
const OUT_DIR = path.join(ROOT, "src", "lib", "name", "data");
const DICT_FILE = path.join(OUT_DIR, "kangxi_dict.json");
const ROOTS_FILE = path.join(OUT_DIR, "roots.json");

const UCD = "https://www.unicode.org/Public/15.0.0/ucd/";
const DOWNLOADS: Record<string, string> = {
  "Unihan.zip": `${UCD}Unihan.zip`,
  "CJKRadicals.txt": `${UCD}CJKRadicals.txt`,
  "EquivalentUnifiedIdeograph.txt": `${UCD}EquivalentUnifiedIdeograph.txt`,
  "BIG5.TXT": "https://www.unicode.org/Public/MAPPINGS/OBSOLETE/EASTASIA/OTHER/BIG5.TXT",
  "IDS.TXT": "https://www.babelstone.co.uk/CJK/IDS.TXT",
};

type Wuxing = "木" | "火" | "土" | "金" | "水";

/** Number of Kangxi radicals per stroke count, in dictionary order (1 畫 × 6, 2 畫 × 23, …, 17 畫 × 1). */
const RADICAL_STROKE_GROUPS = [6, 23, 31, 34, 23, 29, 20, 9, 11, 8, 6, 4, 4, 2, 1, 2, 1];

/**
 * 姓名學 exceptions to the 康熙字典 count: the numerals 一–十 are counted by their value, not by their
 * written strokes (the 康熙字典 itself gives 四 5、五 4、六 4、七 2、八 2、九 2、十 2). 一 二 三 already agree;
 * 百 千 萬 follow the 康熙 count (6 / 3 / 15) and need no entry.
 * Source: 〈姓名學理論知識(3)：姓名與五格取象〉, 看中國, 2009-03-15, rule (13): 「名字中有“一、二、三、四、五、
 * 六、七、八、九、十”的字要分別按1、2、3、4、5、6、7、8、9、10畫」
 *   https://www.secretchina.com/news/gb/2009/03/15/284767p.html
 * The same article lists the radical rules (氵4 扌4 月/肉6 艸6 辶7 左阝8 右阝7 王5 礻5 衤6 犭4 忄4) that
 * the radical arithmetic above implements.
 *
 * Verification: 124 common name characters were compared with the 康熙筆畫 shown on zdic.net (漢典);
 * the agreeing values are pinned in tests/name/analyze.test.ts. Known differences: the numerals
 * (by design); 華 陳 羅, where zdic counts the radical as written (12 / 11 / 19) and the rule above
 * gives 14 / 16 / 20; 王, filed under 玉 with residual −1, is 4 here and 5 on zdic; 視 was 11 from
 * kRSKangXi and is corrected to 12 below. A further random sample of 127 dictionary characters
 * agreed on 122; the five differences were 覷 垵 荊 礴 癌 (rare characters, or a non-radical 艹
 * inside the residual, which Unihan counts as written).
 */
const STROKE_OVERRIDES: Record<string, number> = {
  四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10,
  // 視 is filed under 見 and printed with a full 示 in the 康熙字典 (康熙筆畫 12 on zdic.net); kRSKangXi's
  // residual of 4 counts the left side as 礻.
  視: 12,
};

/** 百家姓, common Taiwanese surnames / 複姓 and given-name characters; only those outside the base set are added. */
const EXTRA_CHARS = [
  // 百家姓
  "趙錢孫李周吳鄭王馮陳褚衛蔣沈韓楊朱秦尤許何呂施張孔曹嚴華金魏陶姜戚謝鄒喻柏水竇章雲蘇潘葛奚范彭郎",
  "魯韋昌馬苗鳳花方俞任袁柳酆鮑史唐費廉岑薛雷賀倪湯滕殷羅畢郝鄔安常樂于時傅皮卞齊康伍余元卜顧孟平黃",
  "和穆蕭尹姚邵湛汪祁毛禹狄米貝明臧計伏成戴談宋茅龐熊紀舒屈項祝董梁杜阮藍閔席季麻強賈路婁危江童顏郭",
  "梅盛林刁鍾徐邱駱高夏蔡田樊胡凌霍虞萬支柯昝管盧莫經房裘繆干解應宗丁宣賁鄧郁單杭洪包諸左石崔吉鈕龔",
  "程嵇邢滑裴陸榮翁荀羊於惠甄麴家封芮羿儲靳汲邴糜松井段富巫烏焦巴弓牧隗山谷車侯宓蓬全郗班仰秋仲伊宮",
  "甯仇欒暴甘鈄厲戎祖武符劉景詹束龍葉幸司韶郜黎薊薄印宿白懷蒲邰從鄂索咸籍賴卓藺屠蒙池喬陰鬱胥能蒼雙",
  "聞莘黨翟譚貢勞逄姬申扶堵冉宰酈雍郤璩桑桂濮牛壽通邊扈燕冀郟浦尚農溫別莊晏柴瞿閻充慕連茹習宦艾魚容",
  "向古易慎戈廖庾終暨居衡步都耿滿弘匡國文寇廣祿闕東歐殳沃利蔚越夔隆師鞏厙聶晁勾敖融冷訾辛闞那簡饒空",
  "曾毋沙乜養鞠須豐巢關蒯相查后荊紅游竺權逯蓋益桓公万俟司馬上官歐陽夏侯諸葛聞人東方赫連皇甫尉遲公羊",
  "澹臺公冶宗政濮陽淳于單于太叔申屠公孫仲孫軒轅令狐鍾離宇文長孫慕容鮮于閭丘司徒司空亓官司寇仉督子車",
  "顓孫端木巫馬公西漆雕樂正壤駟公良拓跋夾谷宰父穀梁晉楚閆法汝鄢涂欽段干百里東郭南門呼延歸海羊舌微生",
  "岳帥緱亢況後有琴梁丘左丘東門西門商牟佘佴伯賞南宮墨哈譙笪年愛陽佟第五言福",
  // 臺灣常見姓氏與複姓補充
  "凃塗粘鐘温游范姜張簡歐呂洪葉卓連巫鄞釋鍾蕭",
  // 名字常用字（不在 Big5 第一層／IICore-T 內的才會被加入）
  "喆堃峯湉淏澔灝瀞瀅瀠濬澧溎洧淯浤渼湲沄泫浵淩潾澍霂霙靉",
  "妤婕妍姍嫻媗嫺妘姵嬿婞媃嫚姮婠娸婼妏妡姈媄嬅嫙嬡妶媁嫈孋",
  "彧昀晞暄晟昕昱晏暐曄曦旻昊昶暘旼昇晙昫晅晧暟昉晢暻曈",
  "瑀瑄璇琇瑩玟珮琪琦瑋瑜瑤瑾璟璐璽瓊玥珈珺琮琬瑛瑢璦璿玹玠珉珩琁琤瑭璘璞瓈玨琡瑈珵瑒璨瓅玓珅琄瑆璉璠瓔",
  "祐祺禎禕祤禔褘筠綺絜紜紘綾綸緁緹縈繹纓絃紓綝絢綵縉繡",
  "芸茜萱蓁芯芷芮苡苓茵荃莛菁菀葳蓉蓓蕙薇蘊芃芊芩苒茹莞菡蒨蓳蕎薰蘅茗荏苙芫荺蒔蓀薏茉荳菘萓蓊蔻",
  "霈霏霓雯霖靄靚頤頎頡顥頲頊頔騫騏驊馥馡颺",
  "鈺錡鈞銓鋐鍇鎧鏵鐸鑫釗鈜鈿鉦銥鋆錞鍶鎔鏞鑠鈊鉑鋕鎂鈵鉉銧錤鎬鑌",
  "宸宥宬翊羿翎翾翀翃臻郢麒麟崴嵐嶸巍崙岱峮崚巒",
  "彤彥彣恬愷懿忻恂惇懋恪悌愃懃栩桓梓棠槿樺橙檸櫻枋楀槙橒杋枻柟栯棨楙榛櫟",
  "歆煒熙燁炘炫烜焜煜熠燿爔焄炅煊熒燊爗睿瞳秉秝稜竣筑箏篤竑竤竺箴粲",
  "羚耘聿詠誼諺詮諭訢詒諄謜詡謦諠譞贊贇賚軒輊逵迦遴迺闓閎閺閬陞雋隼韡韻韶",
  "鴒鵑黛齊龢亘伃佾倢偲僖优叡垚堉塏壎奐孜寅崧弈徠抒掄擎斐旂朵毓牷畇畯皜皞盺睎瞱碁稹穠",
  "胤臧虔衍覲赫軾鄀鼐麐麓黻鬱龔",
  // 常見異體寫法
  "峯羣啓衞恒眞内産爲衆裏綫栢",
].join("");

/** Units that 生肖姓名學 reads as a whole; decomposition stops here even though an IDS exists. */
const ROOT_UNITS = new Set([
  ..."王君帝主令冠少川西東南北中上下天夫母",
  ..."丑寅卯巳午未申戌亥丁丙壬癸庚甲戊",
  ..."兔虎蛇猴雞豬狗袁侯乃也巴之云光星兌林青朱",
]);

/** Variant component → full-form radical. Applied after EquivalentUnifiedIdeograph.txt. */
const ROOT_VARIANTS: Record<string, string> = {
  艹: "艸", 卝: "艸", 氵: "水", 氺: "水", 忄: "心", "㣺": "心", 扌: "手", 龵: "手", 犭: "犬", 礻: "示", 衤: "衣",
  辶: "辵", 刂: "刀", 亻: "人", 灬: "火", 爫: "爪", 牜: "牛", 糹: "糸", 訁: "言", 飠: "食", 釒: "金",
  "𥫗": "竹", "𦍌": "羊", "𧾷": "足", 攵: "攴", 尣: "尢", "丬": "爿", 罓: "网", 覀: "西", 镸: "長",
  耂: "老", 肀: "聿", 彑: "彐", 旡: "无", 歺: "歹", "𤣩": "玉", 巜: "巛", "𠆢": "人", 户: "戶",
  靑: "青", 黄: "黃", 麦: "麥", 亀: "龜", 竜: "龍", 歯: "齒", 斉: "齊", 鼡: "鼠", 黒: "黑",
};

/** Single strokes: never reported as roots. */
const NOISE = new Set([..."一丨丶丿亅乚乛"]);

/** Step 1 of the wuxing rule: elements fixed by 五行 doctrine (五行、天干、地支、五方、四季、五色). */
const WUXING_OVERRIDES: Record<Wuxing, string> = {
  木: "木甲乙寅卯東春青綠",
  火: "火丙丁巳午南夏紅赤朱丹",
  土: "土戊己辰戌丑未中黃",
  金: "金庚辛申酉西秋白",
  水: "水壬癸亥子北冬黑玄",
};

/** Steps 2 and 4: element of a radical / root (full forms). */
const WUXING_ROOTS: Record<Wuxing, string> = {
  木: "木竹艸禾米麥麻黍豆瓜韭片爿虍林青",
  火: "火日赤心馬鳥羽飛光",
  土: "土山石田阜邑里厂穴牛羊犬黃瓦龍",
  金: "金刀戈斤矛矢辛白玉貝",
  水: "水冫雨魚巛川气月黑子豕鼠黽龜血",
};

/** Step 3: whole-word keywords looked up in the Unihan kDefinition gloss. */
const WUXING_KEYWORDS: Record<Wuxing, string[]> = {
  木: ["tree", "trees", "wood", "wooden", "timber", "forest", "grove", "plant", "plants", "grass", "herb", "flower",
    "flowers", "bamboo", "leaf", "leaves", "branch", "twig", "root", "fruit", "seed", "grain", "vegetable", "vine",
    "pine", "willow", "orchid", "blossom", "bloom", "sprout", "bud", "green", "east", "eastern", "lush", "luxuriant"],
  火: ["fire", "flame", "flames", "burn", "blaze", "hot", "heat", "warm", "sun", "sunlight", "sunshine", "bright",
    "brilliant", "shine", "shining", "radiant", "glow", "lamp", "torch", "red", "scarlet", "crimson", "summer",
    "south", "southern", "dawn", "daybreak", "splendid", "glorious", "passion"],
  土: ["earth", "soil", "land", "ground", "field", "mountain", "hill", "peak", "rock", "stone", "clay", "dust", "mud",
    "wall", "city", "town", "village", "territory", "yellow", "center", "centre", "plain", "mound", "embankment",
    "ridge", "cliff", "valley", "foundation", "steady", "stable", "honest", "sincere"],
  金: ["gold", "golden", "metal", "iron", "steel", "silver", "copper", "bronze", "tin", "sword", "knife", "blade",
    "weapon", "spear", "axe", "needle", "bell", "coin", "money", "jewel", "gem", "jade", "white", "autumn", "west",
    "western", "sharp", "firm", "resolute", "righteous", "righteousness"],
  水: ["water", "river", "stream", "sea", "ocean", "lake", "pond", "pool", "rain", "cloud", "clouds", "snow", "ice",
    "dew", "fog", "mist", "wave", "waves", "tide", "flow", "wet", "moist", "wash", "swim", "fish", "black", "winter",
    "north", "northern", "cold", "frost", "liquid", "deep", "clear", "pure", "wisdom", "wise"],
};

const WUXING_LIST: Wuxing[] = ["木", "火", "土", "金", "水"];
const STROKE_WUXING: Wuxing[] = ["水", "木", "木", "火", "火", "土", "土", "金", "金", "水"];

// ── downloads ────────────────────────────────────────────────────────────────────────────────

function download(name: string): string {
  const dest = path.join(CACHE_DIR, name);
  if (existsSync(dest) && statSync(dest).size > 0) return dest;
  console.log(`downloading ${DOWNLOADS[name]}`);
  const tmp = `${dest}.part`;
  const r = spawnSync("curl", ["-fsSL", "--retry", "3", "-o", tmp, DOWNLOADS[name]], { stdio: "inherit" });
  if (r.status !== 0) throw new Error(`download failed: ${DOWNLOADS[name]}`);
  renameSync(tmp, dest);
  return dest;
}

function unzipText(zip: string, member: string): string {
  const r = spawnSync("unzip", ["-p", zip, member], { maxBuffer: 256 * 1024 * 1024, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`unzip failed: ${member}`);
  return r.stdout;
}

function unihanFields(text: string, wanted: string[]): Map<string, Map<string, string>> {
  const out = new Map<string, Map<string, string>>(wanted.map((k) => [k, new Map()]));
  for (const line of text.split("\n")) {
    if (!line.startsWith("U+")) continue;
    const [cp, key, value] = line.split("\t");
    const bucket = out.get(key);
    if (bucket) bucket.set(String.fromCodePoint(parseInt(cp.slice(2), 16)), value.trim());
  }
  return out;
}

// ── IDS ──────────────────────────────────────────────────────────────────────────────────────

interface IdsNode {
  char?: string;
  op?: string;
  children?: IdsNode[];
}

const IDS_ARITY: Record<string, number> = {
  "⿰": 2, "⿱": 2, "⿲": 3, "⿳": 3, "⿴": 2, "⿵": 2, "⿶": 2, "⿷": 2, "⿸": 2, "⿹": 2, "⿺": 2, "⿻": 2,
  "⿼": 2, "⿽": 2, "⿾": 1, "⿿": 1, "㇯": 2,
};

function parseIds(seq: string): IdsNode | null {
  const tokens: string[] = [];
  const cps = [...seq];
  for (let i = 0; i < cps.length; i++) {
    if (cps[i] === "〾") continue;
    if (cps[i] === "{") {
      while (i < cps.length && cps[i] !== "}") i++;
      tokens.push("?");
    } else tokens.push(cps[i]);
  }
  let pos = 0;
  const read = (): IdsNode | null => {
    const t = tokens[pos++];
    if (t === undefined) return null;
    const arity = IDS_ARITY[t];
    if (!arity) return { char: t };
    const children: IdsNode[] = [];
    for (let i = 0; i < arity; i++) {
      const child = read();
      if (!child) return null;
      children.push(child);
    }
    return { op: t, children };
  };
  const node = read();
  return node && pos === tokens.length ? node : null;
}

function loadIds(file: string): Map<string, IdsNode> {
  const out = new Map<string, IdsNode>();
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    if (!line.startsWith("U+")) continue;
    const [, char, ...seqs] = line.split("\t");
    const parsed = seqs
      .map((s) => /^\^(.+)\$\(([^)]*)\)/.exec(s))
      .filter((m): m is RegExpExecArray => m !== null);
    if (parsed.length === 0) continue;
    // The first sequence is the most widely shared glyph form; region-only variants further down the
    // line (e.g. the T-only form of 望 or 彗) tend to split into unencoded fragments.
    const node = parseIds(parsed[0][1]);
    if (node) out.set(char, node);
  }
  return out;
}

// ── main ─────────────────────────────────────────────────────────────────────────────────────

function main(): void {
  mkdirSync(CACHE_DIR, { recursive: true });
  mkdirSync(OUT_DIR, { recursive: true });
  for (const name of Object.keys(DOWNLOADS)) download(name);

  const zip = path.join(CACHE_DIR, "Unihan.zip");
  const rs = unihanFields(unzipText(zip, "Unihan_RadicalStrokeCounts.txt"), ["kRSKangXi"]);
  const irg = unihanFields(unzipText(zip, "Unihan_IRGSources.txt"), ["kRSUnicode", "kIICore"]);
  const readings = unihanFields(unzipText(zip, "Unihan_Readings.txt"), ["kDefinition"]);
  const kRSKangXi = rs.get("kRSKangXi")!;
  const kRSUnicode = irg.get("kRSUnicode")!;
  const kIICore = irg.get("kIICore")!;
  const kDefinition = readings.get("kDefinition")!;

  // Kangxi radicals: number → unified ideograph, and full-form stroke count by position.
  const radicalChar = new Map<number, string>();
  for (const line of readFileSync(path.join(CACHE_DIR, "CJKRadicals.txt"), "utf8").split("\n")) {
    const m = /^(\d+);\s*[0-9A-F]*;\s*([0-9A-F]+)/.exec(line); // lines for simplified forms (e.g. 90') are skipped
    if (m) radicalChar.set(Number(m[1]), String.fromCodePoint(parseInt(m[2], 16)));
  }
  if (radicalChar.size !== 214) throw new Error(`expected 214 radicals, got ${radicalChar.size}`);
  const radicalStrokes: number[] = [0];
  RADICAL_STROKE_GROUPS.forEach((count, i) => {
    for (let k = 0; k < count; k++) radicalStrokes.push(i + 1);
  });
  const radicalSet = new Set(radicalChar.values());

  // Radical-block characters (⺡ ⽔ …) → unified ideographs.
  const equivalent = new Map<string, string>();
  for (const line of readFileSync(path.join(CACHE_DIR, "EquivalentUnifiedIdeograph.txt"), "utf8").split("\n")) {
    const m = /^([0-9A-F]+)(?:\.\.([0-9A-F]+))?\s*;\s*([0-9A-F]+)/.exec(line);
    if (!m) continue;
    const from = parseInt(m[1], 16);
    const to = m[2] ? parseInt(m[2], 16) : from;
    for (let cp = from; cp <= to; cp++) equivalent.set(String.fromCodePoint(cp), String.fromCodePoint(parseInt(m[3], 16)));
  }

  // Character set.
  const level1: string[] = [];
  for (const line of readFileSync(path.join(CACHE_DIR, "BIG5.TXT"), "utf8").split("\n")) {
    const m = /^0x([0-9A-F]{4})\s+0x([0-9A-F]{4})/.exec(line);
    if (!m) continue;
    const big5 = parseInt(m[1], 16);
    if (big5 >= 0xa440 && big5 <= 0xc67e) level1.push(String.fromCodePoint(parseInt(m[2], 16)));
  }
  if (level1.length !== 5401) throw new Error(`expected 5401 Big5 level-1 characters, got ${level1.length}`);
  const iicoreT = [...kIICore].filter(([, v]) => v.includes("T")).map(([c]) => c);
  const charset = new Set<string>([...level1, ...iicoreT]);
  const baseSize = charset.size;
  const skipped: string[] = [];
  for (const c of EXTRA_CHARS) {
    if (kRSKangXi.has(c) || kRSUnicode.has(c)) charset.add(c);
    else skipped.push(c);
  }
  if (skipped.length) throw new Error(`EXTRA_CHARS without Unihan radical-stroke data: ${skipped.join("")}`);

  const rsOf = (c: string): { radical: number; residual: number } | null => {
    const raw = kRSKangXi.get(c) ?? kRSUnicode.get(c)?.split(" ")[0];
    const m = raw ? /^(\d+)'*\.(-?\d+)$/.exec(raw) : null;
    return m ? { radical: Number(m[1]), residual: Number(m[2]) } : null;
  };

  const ids = loadIds(path.join(CACHE_DIR, "IDS.TXT"));

  // ── roots ──
  const normalise = (raw: string, ctxRadical: number, side: "left" | "right" | null): string => {
    let c = equivalent.get(raw) ?? raw;
    if (c === "阝") {
      if (ctxRadical === 170) return "阜";
      if (ctxRadical === 163) return "邑";
      return side === "right" ? "邑" : "阜";
    }
    if (c === "月" && ctxRadical === 130) return "肉";
    if (c === "罒") return ctxRadical === 122 || ctxRadical === 154 ? "网" : "目";
    c = ROOT_VARIANTS[c] ?? c;
    return c;
  };
  for (const c of [...radicalSet]) if (ROOT_VARIANTS[c]) radicalSet.add(ROOT_VARIANTS[c]); // 靑 → 青
  const isStop = (c: string): boolean => radicalSet.has(c) || ROOT_UNITS.has(c);
  const isKnown = (c: string): boolean => isStop(c) || charset.has(c);

  /** `lossy` is set when a stroke or unencoded fragment had to be dropped, i.e. the parts do not add up to `c`. */
  const expand = (c: string, depth: number): { parts: string[]; lossy: boolean } => {
    const node = ids.get(c);
    if (!node || node.char !== undefined || depth > 8) return { parts: [], lossy: false };
    const ctx = rsOf(c)?.radical ?? 0;
    const parts: string[] = [];
    let lossy = false;
    const walk = (n: IdsNode, side: "left" | "right" | null): void => {
      if (n.char !== undefined) {
        const norm = normalise(n.char, ctx, side);
        if (n.char === "?" || n.char === "？" || norm === c || NOISE.has(norm)) {
          lossy = true;
          return;
        }
        if (isStop(norm)) {
          parts.push(norm);
          return;
        }
        const sub = expand(norm, depth + 1);
        if (isKnown(norm) && (sub.lossy || sub.parts.length === 0)) {
          // A real character that does not split cleanly (亡, 專, 華 …) is reported whole, followed by
          // whatever parts could be identified, so that neither reading is lost (嘩 → 口 華 艸).
          parts.push(norm, ...sub.parts);
        } else if (sub.parts.length) {
          parts.push(...sub.parts);
          if (sub.lossy) lossy = true;
        } else lossy = true;
        return;
      }
      const kids = n.children!;
      const horizontal = n.op === "⿰" || n.op === "⿲";
      kids.forEach((kid, i) => walk(kid, horizontal ? (i === 0 ? "left" : i === kids.length - 1 ? "right" : null) : null));
    };
    walk(node, null);
    return { parts, lossy };
  };
  const rootsOf = (c: string): string[] => {
    if (isStop(c)) return [c];
    const { parts } = expand(c, 0);
    return parts.length ? parts : [c];
  };

  // ── wuxing ──
  const overrideWx = new Map<string, Wuxing>();
  const rootWx = new Map<string, Wuxing>();
  for (const wx of WUXING_LIST) {
    for (const c of WUXING_OVERRIDES[wx]) overrideWx.set(c, wx);
    for (const c of WUXING_ROOTS[wx]) rootWx.set(c, wx);
  }
  const keywordWx = new Map<string, Wuxing>();
  for (const wx of WUXING_LIST) for (const w of WUXING_KEYWORDS[wx]) keywordWx.set(w, wx);
  const byMeaning = (c: string): Wuxing | null => {
    const words = (kDefinition.get(c) ?? "").toLowerCase().match(/[a-z]+/g) ?? [];
    const score = new Map<Wuxing, number>();
    for (const w of new Set(words)) {
      const wx = keywordWx.get(w);
      if (wx) score.set(wx, (score.get(wx) ?? 0) + 1);
    }
    const ranked = [...score].sort((a, b) => b[1] - a[1]);
    if (ranked.length === 0 || (ranked.length > 1 && ranked[0][1] === ranked[1][1])) return null;
    return ranked[0][0];
  };

  const tiers = { override: 0, radical: 0, meaning: 0, component: 0, fallback: 0 };
  const dict: Record<string, string> = {};
  const rootCount = new Map<string, number>();
  const sorted = [...charset].sort((a, b) => a.codePointAt(0)! - b.codePointAt(0)!);
  for (const c of sorted) {
    const info = rsOf(c);
    if (!info) throw new Error(`no radical-stroke data for ${c}`);
    const strokes = STROKE_OVERRIDES[c] ?? radicalStrokes[info.radical] + info.residual;
    if (!(strokes >= 1 && strokes <= 64)) throw new Error(`implausible stroke count for ${c}: ${strokes}`);
    const roots = rootsOf(c);

    let wuxing: Wuxing | undefined = overrideWx.get(c);
    if (wuxing) tiers.override++;
    const radical = radicalChar.get(info.radical)!;
    if (!wuxing && (wuxing = rootWx.get(ROOT_VARIANTS[radical] ?? radical))) tiers.radical++;
    if (!wuxing) {
      const m = byMeaning(c);
      if (m) {
        wuxing = m;
        tiers.meaning++;
      }
    }
    if (!wuxing) {
      const hit = roots.find((r) => rootWx.has(r));
      if (hit) {
        wuxing = rootWx.get(hit)!;
        tiers.component++;
      }
    }
    if (!wuxing) {
      wuxing = STROKE_WUXING[strokes % 10];
      tiers.fallback++;
    }

    // Compact record: "<strokes><wuxing><roots…>", decoded by src/lib/name/dict.ts.
    dict[c] = `${strokes}${wuxing}${roots.join("")}`;
    for (const r of new Set(roots)) rootCount.set(r, (rootCount.get(r) ?? 0) + 1);
  }

  const rootsList = [...rootCount].sort((a, b) => b[1] - a[1] || a[0].codePointAt(0)! - b[0].codePointAt(0)!).map(([r]) => r);
  writeFileSync(DICT_FILE, `${JSON.stringify(dict)}\n`);
  writeFileSync(ROOTS_FILE, `${JSON.stringify(rootsList)}\n`);

  const total = sorted.length;
  const pct = (n: number): string => `${((n / total) * 100).toFixed(1)}%`;
  console.log(`characters: ${total} (base ${baseSize}, extra ${total - baseSize})`);
  console.log(`dict: ${statSync(DICT_FILE).size} bytes → ${path.relative(ROOT, DICT_FILE)}`);
  console.log(`distinct roots: ${rootsList.length} → ${path.relative(ROOT, ROOTS_FILE)}`);
  console.log(
    `wuxing decided by: override ${tiers.override} (${pct(tiers.override)}), radical ${tiers.radical} (${pct(tiers.radical)}), ` +
      `meaning ${tiers.meaning} (${pct(tiers.meaning)}), component ${tiers.component} (${pct(tiers.component)}), ` +
      `stroke-digit fallback ${tiers.fallback} (${pct(tiers.fallback)})`,
  );
}

main();
