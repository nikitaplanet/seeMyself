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
幫輔：${chart.helpers}；克洩耗：${chart.drainers}

## 用神
${chart.yongShenSummary}
${chart.yongShenBody}
調候：${chart.tiaoHou}
喜神 ${chart.xiShen}；用神 ${chart.yongShen}；忌神 ${chart.jiShen}

## 大運
${yun}

請先總覽日主與格局，再分「性格與健康」「事業財富」「感情家人」「大運提醒」說明，最後給 3～5 條務實建議。`;
}
