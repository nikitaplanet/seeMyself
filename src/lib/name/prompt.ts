import { GRID_LABEL } from './assemble';
import { NAME_CARD_TERMS } from './report';
import type { GridKey, NameAnalysis } from './types';

const GRID_ORDER: GridKey[] = ['tian', 'ren', 'di', 'wai', 'zong'];

/** 給使用者自行貼到 AI 工具的提示詞（App 本身不呼叫任何 API）。 */
export function buildNameAiPrompt(a: NameAnalysis): string {
    const name = [...a.surname, ...a.given].map((c) => c.char).join('');
    const chars = [...a.surname, ...a.given]
        .map(
            (c) =>
                `- ${c.char}：康熙 ${c.strokes} 畫，字義五行${c.wuxing}，字根 ${c.roots.join('、') || '無'}`,
        )
        .join('\n');
    const grids = GRID_ORDER.map((k) => {
        const g = a.grids[k];
        return `- ${GRID_LABEL[k]}：${g.strokes} 畫（${g.wuxing}），81 數理第 ${g.number} 數`;
    }).join('\n');
    const topics = NAME_CARD_TERMS.map((t, i) => `${i + 1}. ${t}`).join('\n');

    return `請依下列姓名學資料，用台灣繁體中文做解讀。

解讀原則：
- 以五格數理、三才五行生剋與生肖字根為依據，轉譯成性格、行為與相處方式的描述。
- 這是姓名結構的說明，不是必然命運；不要用吉凶恐嚇，也不要建議改名，請給日常可以做的調整。

## 姓名
${name}

## 用字
${chars}

## 五格
${grids}

## 三才
${a.sancai.join('、')}（天格、人格、地格）

## 生肖
${a.zodiac ? `屬${a.zodiac}` : '未提供出生日期，請略過生肖字根'}

請依序說明下列主題，每個主題先講優勢，再講盲點與一條具體建議：
${topics}`;
}
