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

請先總覽命宮格局與四化，再分「性格與人生方向（命／福德）」「事業與財帛」「感情與家人」「需要留意的宮位」說明，最後給 3～5 條務實建議。`;
}
