import {
    AUTHORITY_NAMES_ZH,
    CENTER_NAMES_ZH,
    DEFINITION_NAMES_ZH,
    TYPE_NAMES_ZH,
} from '@/lib/hd/constants';
import type { Authority, CenterId, ChartResult, Definition, HDType } from '@/lib/hd/types';
import type { BaziChart } from '@/lib/bazi/types';
import { displayPalaceName } from '@/lib/ziwei/labels';
import type { ZiweiChart, ZiweiPalace } from '@/lib/ziwei/types';

export type MeaningItem = [string, string];

const TYPE_OPERATE: Record<HDType, string> = {
    generator: '能量靠薦骨對生活的「對／不對」來發動；對真正有感覺的事才有持續力，硬推容易空轉。',
    manifestingGenerator: '能回應也能帶動，節奏快；要先有內在回應，再告知後行動，才比較不耗。',
    manifestor: '能量適合自己發起、把事情帶起來；先告知再動，摩擦會小很多。',
    projector: '能量不適合長時間硬幹，強項是看清系統與他人；被看見、被邀請時最能發揮。',
    reflector: '像環境的鏡子，狀態隨月亮與周遭起伏；給自己一個週期再下判斷，會準很多。',
};

const AUTHORITY_THINK: Record<Authority, string> = {
    emotional: '情緒有波浪，想清楚前不宜立刻拍板；等高低都走過，答案比較穩。',
    sacral: '當下身體的「嗯／嗯嗯」比分析可靠；用頭腦推翻薦骨，事後容易後悔。',
    splenic: '直覺來得快、也過得快；當下那一下的對／不對，比事後合理化更準。',
    egoManifested: '意志與承諾是核心；自己真心答應的事才推得動，也才推得久。',
    egoProjected: '意志要被看見才使得出力；自己一個人硬撐，方向容易偏。',
    selfProjected: '開口說出來才知道自己怎麼想；對信任的人說話，比悶頭想更清楚。',
    mental: '適合用環境與對話來想；換地方、找對的人聊，判斷會比較準。',
    lunar: '需要一個月亮週期（約 28 天）讓感覺沉澱，不宜用一天的心情做大事。',
};

const TYPE_RELATE: Record<HDType, string> = {
    generator: '相處上，給你時間回應，比一直被催促更舒服；對方的邀請或提問，往往比命令有效。',
    manifestingGenerator: '相處上，先讓你感覺得到、再說你要做什麼；被打斷節奏時特別煩。',
    manifestor: '相處上，先被告知再一起動，比事後被質問「為什麼沒講」更自在。',
    projector: '相處上，被看見、被請教時最自在；被當成勞力或被忽略，能量掉得很快。',
    reflector: '相處上，需要能讓你做自己的環境與圈子；空間不對，人會整個不一樣。',
};

const PROFILE_RELATE: Record<string, string> = {
    '1/3': '學習靠自己研究，再在試錯裡修正；相處時需要被允許實驗，而不是一次到位。',
    '1/4': '先打穩基礎，再透過熟人網絡發揮；關係裡信任比新鮮感重要。',
    '2/4': '有被動被看見的魅力，也靠熟識圈互動；被硬拉出場會不舒服，自然被找上門剛好。',
    '2/5': '外表常被投射成能解決問題的人；需要獨處充電，也要小心別人的期待。',
    '3/5': '從嘗試與碰撞裡長經驗，又常被當成能扛事的人；過程可以亂，結論要能落地。',
    '3/6': '前半段試錯、後半段成為榜樣；相處時允許前後不一致，比要求永遠成熟更真。',
    '4/6': '人脈與機會從熟識來，人生角色帶一點旁觀與示範；友誼是重要通道。',
    '4/1': '一邊連著熟人，一邊要有自己的根基；轉彎時需要被理解「不是善變，是換基礎」。',
    '5/1': '容易被投射成能救場的人，內在其實靠研究與原則；公開角色與私下需求要分開看。',
    '5/2': '外在被期待去影響他人，內在需要隱居式的節奏；被強迫社交特別累。',
    '6/2': '帶有旁觀與被動天賦；相處時不急著跳進中心，看清楚再靠近。',
    '6/3': '人生分階段：先試、再退一步看、再回來示範；關係也會有明顯的階段感。',
};

const DEFINITION_NOTE: Record<Definition, string> = {
    none: '九個中心都開放，狀態很受環境影響，也特別能反映身邊的人。',
    single: '已定義的部分連成一塊，專注時很整，轉換主題則需要一點時間。',
    split: '能量分成兩塊，中間常靠他人或環境橋接；對的人在旁邊，思路會突然通。',
    tripleSplit: '三塊定義之間需要更多橋接；資訊與關係要多方流通，才不容易卡住。',
    quadrupleSplit: '定義很散，彈性大，也容易覺得自己「很難被一次說清楚」。',
};

const CENTER_TRAIT: Record<CenterId, string> = {
    head: '靈感與問題來得穩',
    ajna: '想法與概念有自己的軌道',
    throat: '表達與顯化有固定方式',
    g: '方向與愛的感覺相對穩定',
    heart: '意志與承諾有底氣',
    sacral: '生命力與工作節奏可持續',
    solarPlexus: '情緒波是內建的，不是毛病',
    spleen: '直覺與身體警訊來得清楚',
    root: '壓力與驅力有自己的出口',
};

const CHANNEL_TRAIT: Record<string, string> = {
    '1-8': '有自己的創造節奏，做出來是為了貢獻，不是為了表演。',
    '2-14': '方向對了，資源與驅力會跟著來；方向不對就容易空忙。',
    '3-60': '習慣在限制裡突變，格式與突破同時存在。',
    '4-63': '腦子會懷疑、求證，邏輯問完才肯信。',
    '5-15': '有自己的節奏，太被打亂會不舒服。',
    '6-59': '親密與界線是人生課題，對誰敞開很挑。',
    '7-31': '適合被推到帶領的位置，影響力來自被信任，不是硬搶。',
    '9-52': '能坐得住、把一件事盯完；注意力是資產。',
    '10-20': '活著本身就是表達，當下怎麼做比計畫更像你。',
    '10-34': '靠行動探索自己是誰，停太久會不安。',
    '10-57': '對「這樣活對不對」很敏感，身體直覺幫你校正形式。',
    '11-56': '好奇心強，喜歡找故事、找意義，再講給人聽。',
    '12-22': '情緒來了才說得出話；對的氛圍裡，表達特別有感染力。',
    '13-33': '擅長聽與記得，過往經驗會變成你說給別人的方向。',
    '16-48': '技術與深度可以練到很精，對「不夠好」很敏銳。',
    '17-62': '意見要講得具體才甘願；細節與組織是你的語言。',
    '18-58': '看見不完美就想修，活力來自把事情調準。',
    '19-49': '對需求與原則都很敏感，關係裡要公平才待得住。',
    '20-34': '一有能量就想動，忙碌本身是表達。',
    '20-57': '直覺能立刻說出口，當下那句話往往最準。',
    '21-45': '對資源、管理與「誰說了算」有感覺，適合掌物資與節奏。',
    '23-43': '洞見來得突然，需要用自己的語言講出來別人才懂。',
    '24-61': '會反覆想一件事直到「知道了」；內在問題是燃料。',
    '25-51': '能在衝擊裡保持中心，也會去震醒場域。',
    '26-44': '善於把東西傳達、推銷或連接對的人，嗅覺在關係與時機。',
    '27-50': '照顧與價值觀綁在一起，誰值得被護、規則是什麼，你很清楚。',
    '28-38': '生命要有目的才肯拼；無意義的奮鬥留不住你。',
    '29-46': '答應了就投入身體去經驗，成功感來自「在場」，不是旁觀。',
    '30-41': '感覺與慾望驅動經驗，高潮與落差都是教材。',
    '32-54': '在意轉化與成就的階梯，耐心與野心同時在。',
    '34-57': '直覺帶著身體力，反應快，不適合被頭腦拖慢。',
    '35-36': '靠經驗學習，危機與新鮮感會推你出門。',
    '37-40': '看重契約與圈子，家、社群、互相幫忙是你的場。',
    '39-55': '情緒與精神性綁在一起，對「有沒有靈魂」很挑。',
    '42-53': '事情要有開始與成熟的循環，半途而廢會不舒服。',
    '47-64': '抽象的領悟需要時間發酵，混濁過後才會突然清楚。',
};

const STAR_TRAIT: Record<string, string> = {
    紫微: '尊貴、要有主見與位置',
    天機: '善變、機巧、想得快',
    太陽: '外顯、照人、也需被看見',
    武曲: '務實、剛決、重結果',
    天同: '溫和、享樂、怕衝突',
    廉貞: '情感濃、面子與是非都重',
    天府: '穩、能守庫、重安全感',
    太陰: '細膩、內收、重感受',
    貪狼: '慾望、交際、多方嘗試',
    巨門: '口才、質疑、把話說穿',
    天相: '協調、形象、願意服務',
    天梁: '蔭護、清高、能勸也能扛',
    七殺: '行動快、魄力、坐不住',
    破軍: '求變、破壞再建、不喜重複',
};

const PALACE_LIFE: Record<string, string> = {
    命宮: '自身格局與人生方向',
    兄弟: '手足、同儕與合作',
    夫妻: '親密關係與伴侶互動',
    子女: '子女、晚輩與創作產出',
    財帛: '收入與物質資源',
    疾厄: '身心負荷與保養',
    遷移: '外出、環境與對外發展',
    僕役: '朋友、部屬與社交',
    官祿: '工作、志向與社會角色',
    田宅: '居住與生活根基',
    福德: '精神享受與內心滿足',
    父母: '長輩、貴人與來源',
};

const STEM_TRAIT: Record<string, string> = {
    甲: '像樹，要有空間往上長，不喜被砍方向。',
    乙: '像藤，柔軟攀附也能開花，環境對了就活。',
    丙: '像太陽，要照人、要熱，悶著會不舒服。',
    丁: '像燈火，細而持久，需要被護著才亮得穩。',
    戊: '像山土，厚重能承載，變化太快會不安。',
    己: '像田土，養人、整合，需要被需要才有感。',
    庚: '像金屬，斬決、要有用，拖泥帶水最煩。',
    辛: '像珠玉，精緻、愛美，對質感與體面敏感。',
    壬: '像江河，流動、涵養，困在死水裡會悶。',
    癸: '像雨露，滲透、直覺，需要空間醞釀。',
};

const TEN_GOD_TRAIT: Record<string, string> = {
    比肩: '平行的自我與夥伴，獨立也要同類。',
    劫財: '競爭與分享同時在，資源議題敏感。',
    食神: '表達、享受、把才華做熟。',
    傷官: '叛逆、創意、把規則講破再重建。',
    偏財: '機會財、交際、抓流動的資源。',
    正財: '穩當的付出與收穫，務實換安定。',
    七殺: '壓力、魄力、被逼才爆發。',
    正官: '責任、規矩、社會角色。',
    偏印: '偏門知識、直覺、非常規依靠。',
    正印: '學習、被護、從傳統裡取暖。',
};

function joinZh(parts: string[]): string {
    return parts.filter(Boolean).join('');
}

export function hdMeaningItems(chart: ChartResult): MeaningItem[] {
    const typeName = TYPE_NAMES_ZH[chart.type];
    const authName = AUTHORITY_NAMES_ZH[chart.authority];
    const profile = `${chart.profile.personality}/${chart.profile.design}`;
    const defined = chart.definedCenters;
    const open = (
        ['head', 'ajna', 'throat', 'g', 'heart', 'sacral', 'solarPlexus', 'spleen', 'root'] as const
    ).filter((c) => !defined.includes(c));

    const items: MeaningItem[] = [
        ['底層運作', joinZh([`以${typeName}來看，`, TYPE_OPERATE[chart.type]])],
        ['思考與決定', joinZh([`內在權威是${authName}。`, AUTHORITY_THINK[chart.authority]])],
        [
            '相處方式',
            joinZh([
                TYPE_RELATE[chart.type],
                PROFILE_RELATE[profile] ? `人生角色 ${profile}：${PROFILE_RELATE[profile]}` : '',
            ]),
        ],
    ];

    if (chart.channels.length > 0) {
        const lines = chart.channels.map((ch) => {
            const trait = CHANNEL_TRAIT[ch.id] ?? '這是兩個中心之間已接通的固定能力。';
            const a = CENTER_NAMES_ZH[ch.centers[0]];
            const b = CENTER_NAMES_ZH[ch.centers[1]];
            return `${ch.id}（${a}—${b}）：${trait}`;
        });
        items.push(['通道與特色', lines.join(' ')]);
    } else {
        items.push([
            '通道與特色',
            '目前沒有已成立的通道，個人特色較分散在閘門與開放中心的學習上。',
        ]);
    }

    if (defined.length > 0) {
        items.push([
            '穩定之處',
            `已定義${defined.map((c) => `${CENTER_NAMES_ZH[c]}（${CENTER_TRAIT[c]}）`).join('、')}。`,
        ]);
    }
    if (open.length > 0) {
        items.push([
            '較受環境影響',
            `${open.map((c) => CENTER_NAMES_ZH[c]).join('、')}未定義，這些領域較會吸收身邊的人，也較能彈性學習。定義型態是${DEFINITION_NAMES_ZH[chart.definition]}。${DEFINITION_NOTE[chart.definition]}`,
        ]);
    } else {
        items.push([
            '定義型態',
            `${DEFINITION_NAMES_ZH[chart.definition]}。${DEFINITION_NOTE[chart.definition]}`,
        ]);
    }

    return items;
}

function palaceStarsLine(p: ZiweiPalace): string {
    const majors = p.majorStars.map((s) => {
        const mut = s.mutagen ? `化${s.mutagen}` : '';
        const trait = STAR_TRAIT[s.name] ? `，${STAR_TRAIT[s.name]}` : '';
        return `${s.name}${mut}${trait}`;
    });
    if (majors.length === 0) return '主星空宮，這塊較隨其他宮與流年帶動。';
    return majors.join('；') + '。';
}

export function ziweiMeaningItems(chart: ZiweiChart): MeaningItem[] {
    const soul = chart.palaces.find((p) => p.isSoulPalace);
    const body = chart.palaces.find((p) => p.isBodyPalace);
    const items: MeaningItem[] = [];

    if (soul) {
        items.push([
            displayPalaceName(soul.name, { isSoulPalace: true, isBodyPalace: soul.isBodyPalace }),
            joinZh([
                `這是此人自身格局的主軸（${PALACE_LIFE[soul.name] ?? '自身'}）。`,
                palaceStarsLine(soul),
            ]),
        ]);
    }
    if (body && body.index !== soul?.index) {
        items.push([
            displayPalaceName(body.name, { isBodyPalace: true }),
            joinZh(['身宮看身心安放與著力處。', palaceStarsLine(body)]),
        ]);
    }

    for (const p of chart.palaces) {
        if (p.isSoulPalace || p.isBodyPalace) continue;
        if (p.majorStars.length === 0) continue;
        const life = PALACE_LIFE[p.name] ?? displayPalaceName(p.name);
        items.push([
            displayPalaceName(p.name),
            joinZh([`這一宮對應${life}。`, palaceStarsLine(p)]),
        ]);
    }

    if (chart.mutagens.length > 0) {
        items.push([
            '生年四化',
            `祿權科忌落在：${chart.mutagens.map((m) => `${m.star}化${m.mutagen}`).join('、')}。化祿偏順與收穫，化權偏主導，化科偏名聲與文書，化忌偏卡點與在意之處。`,
        ]);
    }

    return items;
}

export function baziMeaningItems(chart: BaziChart): MeaningItem[] {
    const dm = chart.dayMaster;
    const stem = dm.charAt(0);
    const items: MeaningItem[] = [
        [
            `日主 ${dm}`,
            joinZh([
                `盤上的「自己」是${dm}。`,
                STEM_TRAIT[stem] ?? '',
                `強弱看${chart.strength}，旺衰為${chart.wangShuai}。`,
            ]),
        ],
        ['命格', `結構是${chart.geJu}。這是解讀骨架，不是一句話定終身。`],
    ];

    const dayPillar = chart.pillars.find((p) => p.key === 'day');
    const monthPillar = chart.pillars.find((p) => p.key === 'month');
    const yearPillar = chart.pillars.find((p) => p.key === 'year');
    const timePillar = chart.pillars.find((p) => p.key === 'time');

    if (monthPillar) {
        const g = TEN_GOD_TRAIT[monthPillar.ganTenGod];
        items.push([
            '月令與思考',
            `月柱${monthPillar.gan}${monthPillar.zhi}（${monthPillar.ganTenGod}）是成長環境與思考底色。${g ?? ''}`,
        ]);
    }
    if (dayPillar) {
        items.push([
            '日柱與相處',
            `日支${dayPillar.zhi}靠近自身與伴侶場域；十神${dayPillar.ganTenGod}描述自我與親近關係的互動。`,
        ]);
    }
    if (yearPillar || timePillar) {
        items.push([
            '四柱層次',
            [
                yearPillar
                    ? `年柱${yearPillar.gan}${yearPillar.zhi}（${yearPillar.ganTenGod}）偏根源與長輩場。`
                    : '',
                timePillar
                    ? `時柱${timePillar.gan}${timePillar.zhi}（${timePillar.ganTenGod}）偏內在與後期節奏。`
                    : '',
            ]
                .filter(Boolean)
                .join(''),
        ]);
    }

    items.push([
        '用神與節奏',
        `喜神 ${chart.xiShen}、用神 ${chart.yongShen}、忌神 ${chart.jiShen}。${chart.yongShenSummary} ${chart.yongShenBody}`.trim(),
    ]);

    const topWx = [...chart.wuXing].sort((a, b) => b.percent - a.percent)[0];
    if (topWx) {
        items.push([
            '五行',
            `目前最重的是${topWx.wx}（${topWx.percent}%）。幫輔：${chart.helpers}；克洩耗：${chart.drainers}。`,
        ]);
    }

    return items;
}
