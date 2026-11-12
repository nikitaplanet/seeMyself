import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ChartMeaningCard } from '@/components/ChartMeaningCard';
import { computeNameState, NamePairTab, NamePersonalTab } from '@/components/name/NameView';
import { NAME_CARD_TERMS } from '@/lib/name/report';
import { NAME_PAIR_TERMS } from '@/lib/name/synastry';
import {
    guessNameFields,
    nameInputKeys,
    parseNameInputs,
    resolveNameFields,
} from '@/lib/ui/nameInputStore';

// 姓名學分頁的畫面：伺服器端渲染沒有 localStorage，所以欄位值來自命盤名稱的預填猜測。
const render = (el: ReturnType<typeof createElement>) => renderToStaticMarkup(el);

const subject = (chartName: string | null, savedId: string | null = 'c1') => ({
    savedId,
    chartName,
    date: '1990-05-20',
    time: '08:30',
});

const count = (html: string, needle: string) => html.split(needle).length - 1;

describe('姓名學：預填與記憶', () => {
    it('2–4 個中文字才預填；四個字拆成 2＋2', () => {
        expect(guessNameFields('王怡君')).toEqual({ surname: '王', given: '怡君' });
        expect(guessNameFields('陳琳')).toEqual({ surname: '陳', given: '琳' });
        expect(guessNameFields('歐陽志明')).toEqual({ surname: '歐陽', given: '志明' });
        expect(guessNameFields('我')).toEqual({ surname: '', given: '' });
        expect(guessNameFields('我（出生證明時間）')).toEqual({ surname: '', given: '' });
        expect(guessNameFields('Amy')).toEqual({ surname: '', given: '' });
        expect(guessNameFields(null)).toEqual({ surname: '', given: '' });
    });

    it('已存的輸入優先於預填；已儲存命盤用 id，也找得到儲存前以出生時刻記下的值', () => {
        const keys = nameInputKeys('abc', { date: '1990-05-20', time: '08:30' });
        expect(keys).toEqual(['chart:abc', 'birth:1990-05-20T08:30']);
        expect(nameInputKeys(null, { date: '1990-05-20', time: '08:30' })).toEqual([
            'birth:1990-05-20T08:30',
        ]);
        const all = parseNameInputs(
            JSON.stringify({ 'birth:1990-05-20T08:30': { surname: '林', given: '美' }, bad: 1 }),
        );
        expect(resolveNameFields(all, keys, '王怡君')).toEqual({ surname: '林', given: '美' });
        expect(resolveNameFields({}, keys, '王怡君')).toEqual({ surname: '王', given: '怡君' });
        expect(parseNameInputs('not json')).toEqual({});
    });
});

describe('姓名學：輸入狀態', () => {
    it('空白、缺一欄、字數不符、查不到的字', () => {
        expect(computeNameState({ surname: '', given: '' }, '1990-05-20').kind).toBe('empty');
        expect(computeNameState({ surname: '王', given: ' ' }, '1990-05-20')).toEqual({
            kind: 'incomplete',
            missing: '名',
        });
        const shape = computeNameState({ surname: '王', given: '怡君君' }, '1990-05-20');
        expect(shape.kind).toBe('error');
        const unknown = computeNameState({ surname: '王', given: '𠮷a' }, '1990-05-20');
        expect(unknown).toMatchObject({ kind: 'error' });
        if (unknown.kind === 'error') {
            expect(unknown.message).toContain('字典裡找不到「𠮷」「a」，目前無法計算');
        }
    });

    it('出生日期壞掉時仍然計算，只是不看生肖', () => {
        const s = computeNameState({ surname: '王', given: '怡君' }, 'oops');
        expect(s).toMatchObject({ kind: 'ok', zodiacSkipped: true });
    });

    it('複姓與單名都能算', () => {
        const fuxing = computeNameState({ surname: '歐陽', given: '志明' }, '1990-05-20');
        const danming = computeNameState({ surname: '陳', given: '琳' }, '1990-05-20');
        expect(fuxing.kind).toBe('ok');
        expect(danming.kind).toBe('ok');
        if (fuxing.kind === 'ok') expect(fuxing.analysis.surname).toHaveLength(2);
        if (danming.kind === 'ok') expect(danming.analysis.given).toHaveLength(1);
    });
});

describe('姓名學：個人分頁', () => {
    it('王／怡君：五格、三才、生肖、九張卡與依據標籤、提示詞', () => {
        const html = render(createElement(NamePersonalTab, { subject: subject('王怡君') }));
        expect(html).toContain('value="王"');
        expect(html).toContain('value="怡君"');
        for (const label of ['天格', '人格', '地格', '外格', '總格', '三才', '生肖']) {
            expect(html).toContain(label);
        }
        expect(html).toContain('屬馬');
        for (const term of NAME_CARD_TERMS) expect(html).toContain(term);
        expect(count(html, 'aria-label="依據"')).toBe(NAME_CARD_TERMS.length);
        expect(html).toContain('提供給 AI 的提示詞');
        expect(html).toContain('康熙字典');
        expect(html).not.toContain('role="alert"');
    });

    it('暱稱不預填：顯示輸入說明，沒有卡片也沒有錯誤', () => {
        const html = render(createElement(NamePersonalTab, { subject: subject('我') }));
        expect(html).toContain('姓與名分開填');
        expect(html).not.toContain('role="alert"');
        expect(html).not.toContain(NAME_CARD_TERMS[0]);
        expect(html).toContain('康熙字典');
    });

    it('查不到的字：role="alert" 並指出是哪個字', () => {
        const html = render(createElement(NamePersonalTab, { subject: subject('王𠮷𠮷') }));
        expect(html).toContain('role="alert"');
        expect(html).toContain('字典裡找不到「𠮷」，目前無法計算');
        expect(html).not.toContain(NAME_CARD_TERMS[0]);
    });

    it('兩個輸入框都有對應的 label', () => {
        const html = render(createElement(NamePersonalTab, { subject: subject('王怡君') }));
        const ids = [...html.matchAll(/<input[^>]*\sid="([^"]+)"/g)].map((m) => m[1]);
        expect(ids).toHaveLength(2);
        for (const id of ids) expect(html).toContain(`for="${id}"`);
    });
});

describe('姓名學：合盤分頁', () => {
    const person = (chartName: string, savedId: string) => ({
        ...subject(chartName, savedId),
        displayName: chartName,
    });

    it('兩人都有效：六張卡，內文用合盤頁的顯示名稱', () => {
        const html = render(
            createElement(NamePairTab, {
                a: person('歐陽志明', 'a'),
                b: { ...person('陳琳', 'b'), date: '1992-11-03' },
            }),
        );
        for (const term of NAME_PAIR_TERMS) expect(html).toContain(term);
        expect(count(html, 'aria-label="依據"')).toBe(NAME_PAIR_TERMS.length);
        expect(html).toContain('歐陽志明');
        expect(html).toContain('value="歐陽"');
        expect(html).toContain('value="琳"');
    });

    it('有一人還沒填：不出卡片，只有提示', () => {
        const html = render(
            createElement(NamePairTab, { a: person('王怡君', 'a'), b: person('妹', 'b') }),
        );
        expect(html).not.toContain(NAME_PAIR_TERMS[0]);
        expect(html).toContain('兩個人的姓名都填好之後');
    });
});

describe('ChartMeaningCard：依據標籤', () => {
    const item = { term: '測試', field: '欄位', meaning: '內容' };
    it('有 tags 才顯示；沒有或空陣列時不多出任何標記', () => {
        const plain = renderToStaticMarkup(
            createElement(ChartMeaningCard, { heading: 'h', lead: 'l', items: [item] }),
        );
        const empty = renderToStaticMarkup(
            createElement(ChartMeaningCard, {
                heading: 'h',
                lead: 'l',
                items: [{ ...item, tags: [] }],
            }),
        );
        const tagged = renderToStaticMarkup(
            createElement(ChartMeaningCard, {
                heading: 'h',
                lead: 'l',
                items: [{ ...item, tags: ['外格 12 畫（木）'] }],
            }),
        );
        expect(empty).toBe(plain);
        expect(plain).not.toContain('依據');
        expect(tagged).toContain('外格 12 畫（木）');
    });
});
