import { displayBrightness, PALACE_ORDER } from './labels';
import type { ZiweiChart, ZiweiPalace, ZiweiStar } from './types';

function starText(star: ZiweiStar, showBrightness: boolean): string {
  const brightness = showBrightness ? displayBrightness(star.brightness) : '';
  const mutagen = star.mutagen ? `化${star.mutagen}` : '';
  return `${star.name}${brightness}${mutagen}`;
}

function palaceBlock(palace: ZiweiPalace): string {
  const extras = [
    ...palace.adjectiveStars.map(s => s.name),
    palace.changsheng12,
    palace.boshi12,
  ].filter(Boolean);
  const lines = [
    `### ${palace.displayName}（${palace.heavenlyStem}${palace.earthlyBranch}）`,
    palace.decadal
      ? `- 大限：${palace.decadal.range[0]}–${palace.decadal.range[1]} 歲`
      : null,
    palace.majorStars.length > 0
      ? `- 主星：${palace.majorStars.map(s => starText(s, true)).join('、')}`
      : '- 主星：（空宮）',
    palace.minorStars.length > 0
      ? `- 輔星：${palace.minorStars.map(s => starText(s, false)).join('、')}`
      : null,
    extras.length > 0 ? `- 雜曜：${extras.join('、')}` : null,
  ];
  return lines.filter((x): x is string => x !== null).join('\n');
}

export function buildZiweiAiPrompt(chart: ZiweiChart): string {
  const ordered = PALACE_ORDER.map(name =>
    chart.palaces.find(p => p.name === name),
  ).filter((p): p is ZiweiPalace => p !== undefined);
  const mutagens =
    chart.mutagens.length > 0
      ? chart.mutagens.map(m => `${m.star}化${m.mutagen}`).join('、')
      : '（無）';

  return `請依下列紫微斗數本命盤資料，用繁體中文做解讀。

排盤說明：
- 派別為通行版本（三合派），宮名用「交友宮／事業宮」，亮度「得」寫作「地」、「不」寫作「陷」。
- 以命宮、身宮、十四主星亮度與生年四化為主軸，再看十二宮與大限。
- 這是命盤結構說明，不是必然命運；請給可對照生活的觀察，避免恐嚇或保證。

## 盤頭
- 陽曆：${chart.solarDateLabel}
- 農曆：${chart.lunarDateLabel}
- 干支：${chart.chineseDateLabel}
- 性別：${chart.yinYangGender}
- 時辰：${chart.timing.timeName}（${chart.timing.timeRange}）
- 五行局：${chart.fiveElementsLabel}
- 命主：${chart.soul}；身主：${chart.body}
- 生年四化：${mutagens}

## 十二宮
${ordered.map(palaceBlock).join('\n\n')}

請先用兩三句話總覽命宮格局與四化，再依下列十一個主題各寫一段，每段都要有：一句 20 字內的金句、兩小段解析（每段 80 字內）、一個具體的生活場景（60 字內）、一條做得到的建議（50 字內）：
1. 個性與日常特色（命宮主星、身宮落宮）
2. 思考方式（命宮主星的決策習慣、化科）
3. 面對壓力（福德宮、化忌落宮）
4. 感情模式（夫妻宮、命宮）
5. 工作與天賦（事業宮、化權落宮）
6. 核心優缺點（化祿的星、化忌的星）
7. 面具與真實的反差（遷移宮是別人眼中的樣子，命宮是私底下的樣子）
8. 內耗與充電說明書（命宮看耗電的情境，福德宮看回血的方式）
9. 金錢觀與安全感（財帛宮、田宅宮）
10. 原生家庭與依附模式（父母宮；只描述相處與依附的傾向，不要斷言家人做了什麼）
11. 天賦盲區：別人眼裡的超能力（化祿落宮、化科落宮）

寫作要求：
- 用台灣慣用的白話，先寫優點，優點與提醒約 2:1；提醒要寫成可以練習的方向。
- 不要直接丟術語（廟旺陷、化忌沖、空劫夾等），依據只放在句尾的全形括號裡，例如（財帛宮武曲化祿）。
- 不要寫宿命論的斷語，只描述傾向。
- 前面提過的特質，後面不要用同樣的形容詞再說一次，請換成該主題的具體場景。
- 不要寫成「你的某宮是某星，代表…」這種逐條拼接的句子。`;
}
