import type { BaziChart } from './types';

export function buildBaziAiPrompt(chart: BaziChart): string {
  const pillars = chart.pillars
    .map((p) => {
      const hidden = p.hidden.map((h) => `${h.gan}${h.tenGod}`).join('、') || '無';
      return `- ${p.label}：${p.gan}${p.zhi}（${p.ganTenGod}）藏干${hidden}；地勢${p.diShi}，自坐${p.ziZuo}，納音${p.naYin}，空亡${p.xunKong}；神煞：${p.shensha.join('、') || '無'}`;
    })
    .join('\n');
  const yun = chart.daYun
    .map(
      (d) =>
        `- ${d.ganZhi} ${d.tenGod} ${d.startAge}–${d.endAge}歲（${d.startYear}–${d.endYear}）`,
    )
    .join('\n');
  const wx = chart.wuXing.map((s) => `${s.wx}${s.percent}%（${s.stage}/${s.gods}）`).join('、');

  return `請依下列八字命盤資料，用繁體中文做解讀。

解讀原則：
- 以日主、月令格局、身強身弱與用神為主軸，再看大運流年。
- 這是命盤結構說明，不是必然命運；請給可對照生活的觀察，避免恐嚇或保證。

## 盤頭
- 陽曆：${chart.solarLabel}
- 農曆：${chart.lunarLabel}
- ${chart.genderLabel}；陰陽：${chart.yinYang}；生肖：${chart.shengXiao}；星座：${chart.xingZuo}
- 節氣：${chart.jieQi}；季節：${chart.season}
- 日主：${chart.dayMaster}；司令：${chart.siLing}
- 命格：${chart.geJu}；強弱：${chart.strength}；旺衰：${chart.wangShuai}
- 命宮：${chart.mingGong}；身宮：${chart.shenGong}；胎元：${chart.taiYuan}；胎息：${chart.taiXi}
- 起運：${chart.yunStartLabel}（${chart.yunStartNote}）

## 四柱
${pillars}
${chart.stemNotes}${chart.branchNotes}

## 五行
${wx}
幫輔：${chart.helpers}；剋洩耗：${chart.drainers}

## 用神
${chart.yongShenSummary}
${chart.yongShenBody}
調候：${chart.tiaoHou}
喜神 ${chart.xiShen}；用神 ${chart.yongShen}；忌神 ${chart.jiShen}

## 大運
${yun}

請先總覽日主與格局，再依序說明下列主題，最後補上「大運提醒」並給 3～5 條務實建議：
1. 個性與日常特色（日主天干與強弱）
2. 思考方式（日主五行、食傷與印星的比例、月柱天干）
3. 面對壓力（官殺的份量與日主強弱）
4. 感情模式（日支配偶宮、桃花與紅鸞）
5. 工作與天賦（月柱格局、貴人星）
6. 核心優缺點（最旺與最弱的五行）
7. 面具與真實的反差（年柱給人的第一印象 vs 日柱真實的自己，時柱看更深的內在）
8. 內耗與充電說明書（忌神是耗電點、喜用神是回血方式）
9. 金錢觀與安全感（財星的份量、正財或偏財）
10. 原生家庭與依附（年柱、月柱與印星；只談依附習慣，不論斷家人做了什麼）
11. 天賦盲區（藏在地支、沒有透到天干的力量）

寫法：每個主題用「一句 20 字內的金句、兩段各 80 字內的解析、一個 60 字內的生活場景、一條 50 字內做得到的建議」；用台灣繁體中文的白話描述，術語只放在句尾括號當依據；不下宿命式的斷語；前面主題說過的特質，後面要換成該主題的具體場景，不要重複同樣的形容詞。`;
}
