import {
  AUTHORITY_NAMES_ZH,
  CENTER_NAMES_ZH,
  CENTER_ORDER,
  CROSS_ANGLE_NAMES_ZH,
  DEFINITION_NAMES_ZH,
  PLANET_NAMES_ZH,
  PLANET_ORDER,
  SIDE_NAMES_ZH,
  TYPE_NAMES_ZH,
} from './constants';
import type { Activation, BirthInput, ChartResult, Side } from './types';

function actLine(a: Activation): string {
  const warn =
    Number.isFinite(a.minutesToLineBoundary) && a.minutesToLineBoundary < 30
      ? `（接近爻界，約 ${Math.round(a.minutesToLineBoundary)} 分鐘）`
      : '';
  return `${PLANET_NAMES_ZH[a.planet]} ${a.gate}.${a.line}${warn}`;
}

function sideLines(activations: Activation[], side: Side): string {
  return PLANET_ORDER.map(planet => {
    const a = activations.find(x => x.side === side && x.planet === planet);
    return a ? `- ${actLine(a)}` : `- ${PLANET_NAMES_ZH[planet]} —`;
  }).join('\n');
}

export function buildHdAiPrompt(input: {
  input: BirthInput;
  result: ChartResult;
  timeUnknown: boolean;
  placeLabel: string | null;
}): string {
  const chart = input.result;
  const [pSun, pEarth, dSun, dEarth] = chart.cross.gates;
  const defined = CENTER_ORDER.filter(c => chart.definedCenters.includes(c));
  const open = CENTER_ORDER.filter(c => !chart.definedCenters.includes(c));
  const time = input.timeUnknown
    ? '時間不確定（以當地 12:00 計算）'
    : input.input.time;
  const place = input.placeLabel ? `${input.placeLabel} · ` : '';

  const channels =
    chart.channels.length === 0
      ? '- （無）'
      : chart.channels
          .map(
            c =>
              `- ${c.id}（${CENTER_NAMES_ZH[c.centers[0]]} — ${CENTER_NAMES_ZH[c.centers[1]]}）`,
          )
          .join('\n');

  return `請依下列人類圖（Human Design）排盤資料，用繁體中文做解讀。

解讀原則：
- 以類型、策略、內在權威、人生角色為主軸，再補充已定義中心、通道與閘門。
- 個性側（黑／出生）描述意識與性格；設計側（紅）描述身體與潛意識。
- 這是能量結構說明，不是宿命預言；請給可實踐的觀察與建議，避免恐嚇或保證。
- 用詞與人類圖體系一致（例如投射者、薦骨權威、人生角色 3/5）。

## 出生資料
- 當地時間：${input.input.date} ${time}
- 時區：${place}${input.input.timezone}
- 交點模式：${chart.meta.nodeMode === 'mean' ? '平交點' : '真交點'}

## 總覽
- 類型：${TYPE_NAMES_ZH[chart.type]}
- 策略：${chart.strategy}
- 內在權威：${AUTHORITY_NAMES_ZH[chart.authority]}
- 人生角色：${chart.profile.personality}/${chart.profile.design}
- 定義型態：${DEFINITION_NAMES_ZH[chart.definition]}
- 輪迴交叉：${CROSS_ANGLE_NAMES_ZH[chart.cross.angle]}（個性太陽 ${pSun}／地球 ${pEarth}｜設計太陽 ${dSun}／地球 ${dEarth}）${chart.cross.name ? ` ${chart.cross.name}` : ''}

## 中心
- 已定義：${defined.length > 0 ? defined.map(c => CENTER_NAMES_ZH[c]).join('、') : '無'}
- 未定義：${open.length > 0 ? open.map(c => CENTER_NAMES_ZH[c]).join('、') : '無'}

## 已成立通道
${channels}

## ${SIDE_NAMES_ZH.personality}側啟動（出生）
${sideLines(chart.activations, 'personality')}

## ${SIDE_NAMES_ZH.design}側啟動
${sideLines(chart.activations, 'design')}

請先給一段總覽，再依「策略與權威如何做決定」「人生角色怎麼與人共事」「通道與閘門的具體表現」分段說明，最後給 3～5 條日常生活提醒。`;
}
