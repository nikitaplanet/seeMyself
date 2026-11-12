import { BODY_NAMES, formatDegMin } from './labels';
import { describeConfig, NATAL_SECTIONS, weighNatal } from './natalWeight';
import type { AstroChart, AstroZodiacPos } from './types';

// AI prompt for the 個人本命盤 report (星盤開發準則 §4): eleven sections, weighted top
// configurations per section, context chaining, de-jargon and strict JSON output.

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

    const w = weighNatal(chart);
    const weighted = NATAL_SECTIONS.map((s, i) => {
        const rows = w.sections[s.id].map((c) => `  - [${c.weight}] ${describeConfig(c)}`);
        return `${i + 1}. ${s.title}（${s.id}）\n${rows.join('\n') || '  - （無高權重配置）'}`;
    }).join('\n');

    const caveat = chart.timeUnknown
        ? '\n- 出生時間不確定：行星以當地 12:00 推算，月亮可能偏差約 ±7°（星座也可能不同），沒有上升、天頂與宮位。請勿依宮位或上升解讀，並在相關板塊用白話說明哪些部分較不確定、原因為何。'
        : '';

    return `請依下列西洋占星本命盤資料，用台灣繁體中文撰寫「個人本命盤」解析。

## 撰寫規則
- 依序產出 ${NATAL_SECTIONS.length} 個板塊：${NATAL_SECTIONS.map((s) => s.title).join('、')}。每個板塊只根據「權重最高的配置」中該板塊列出的項目撰寫（權重 1～100，越高越重要）。
- 上下文傳遞：先寫「個性與日常特色」「底層邏輯思考方式」，作為後面板塊的基礎脈絡；後面板塊若碰到已提過的特質，必須轉化成該領域的具體場景（例如「思維跳躍」→ 職場上「適合從 0 到 1 的企劃，但容易對例行公事失去耐心」），不可重複相同的形容詞或句型，也不可重複句子。
- 禁止條列式拼接：不要寫成「你的太陽在XX，代表…；月亮在OO，代表…」，要把高權重配置融合成一段自然流暢的心理描述。
- 去術語化：不要直接使用「刑剋」「入廟」「容許度」「四分」「三分」「對分」「相位」等占星術語，改用白話的心理描述；星盤依據只在括號內簡短附註，例如（月亮與土星的緊密角度）。
- 讓內容因人而異：開頭與金句要從這張盤權重最高的組合出發，綜合宮位、緊密角度、元素與模式分布，不要套用固定開場句；同星座的兩個人也應讀起來不同。
- 語氣：先寫優勢，正負約 2:1，挑戰寫成成長課題並附具體提醒；「面對壓力的顯現」與「核心優缺點」必須誠實點出盲點，但保持建設性。
- 使用台灣繁體中文的自然用語，避免翻譯腔、簡體字與中國用語（例如「質量」「信息」「視頻」）。
- 「金錢觀與安全感來源」只談怎麼賺、怎麼花、靠什麼安心；「原生家庭與依附模式」只描述傾向與靠近人的方式，不可論斷家人做過什麼；「天賦盲區」寫別人眼裡的超能力，也就是當事人習以為常、沒當一回事的能力。
- 這是性格傾向的說明，不是必然命運；避免恐嚇或保證。${caveat}

## 輸出格式
只輸出一個 JSON 陣列，依序包含 ${NATAL_SECTIONS.length} 個物件，不要加任何其他文字或 Markdown。每個物件的欄位：
{
  "section_id": "${NATAL_SECTIONS[0].id}",
  "section_title": "${NATAL_SECTIONS[0].title}",
  "hook_quote": "一句點出這個板塊核心的金句（限 20 字內）",
  "core_insight": "主體深度解析，2 個短段落，以 \\n 分隔，每段不超過 80 字",
  "key_dynamic": "具體的生活場景描述（限 60 字內）",
  "actionable_advice": "一條具體可行的建議（限 50 字內）"
}
section_id 依序為：${NATAL_SECTIONS.map((s) => s.id).join('、')}。

## 權重最高的配置（依板塊）
${weighted}

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
${aspects}`;
}
