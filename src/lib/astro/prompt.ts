import { BODY_NAMES, formatDegMin } from './labels';
import type { AstroChart, AstroZodiacPos } from './types';

function pos(p: AstroZodiacPos): string {
    return `${p.signName} ${formatDegMin(p.degree, p.minute)}`;
}

export function buildAstroAiPrompt(chart: AstroChart): string {
    const bodies = chart.bodies
        .map((b) => {
            const house = b.house !== null ? `，第 ${b.house} 宮` : '';
            return `- ${b.name}：${pos(b)}${house}${b.retrograde ? '（逆行）' : ''}`;
        })
        .join('\n');
    const angles = chart.angles
        ? `- 上升 ASC：${pos(chart.angles.asc)}\n- 天頂 MC：${pos(chart.angles.mc)}`
        : `- ${chart.houseNote ?? '沒有上升與天頂資料。'}`;
    const houses = chart.houses
        ? `宮位制：${chart.houseSystemLabel}\n${chart.houses.map((h) => `- 第 ${h.house} 宮：${pos(h)}`).join('\n')}`
        : '（無宮位資料）';
    const aspects =
        chart.aspects
            .map(
                (a) =>
                    `- ${BODY_NAMES[a.a]} ${a.name} ${BODY_NAMES[a.b]}（容許度 ${a.orb.toFixed(1)}°）`,
            )
            .join('\n') || '- 無主要相位';
    const caveat = chart.timeUnknown
        ? '\n- 出生時間不確定：行星以當地 12:00 推算，月亮可能偏差約 ±7°（星座也可能不同），沒有上升與宮位，請勿依宮位解讀。'
        : '';

    return `請依下列西洋占星本命盤資料，用繁體中文做解讀。

解讀原則：
- 回歸黃道、地心座標；以太陽、月亮、上升為主軸，再看行星落宮與主要相位。
- 這是星盤結構說明，不是必然命運；請給可對照生活的觀察，避免恐嚇或保證。${caveat}

## 基本資料
- 出生時刻（UTC）：${chart.utc}
- 出生地：${chart.placeName ?? '未提供'}
- 北交點：${chart.nodeMode === 'mean' ? '平均交點' : '真實交點'}

## 行星
${bodies}

## 軸點
${angles}

## 宮位
${houses}

## 主要相位
${aspects}

請先總覽太陽、月亮、上升的組合，再分「性格與內在需求」「關係與情感」「事業與方向」「成長課題」說明，最後給 3～5 條務實建議。`;
}
