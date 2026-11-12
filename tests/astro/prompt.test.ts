import { describe, expect, it } from 'vitest';
import { computeAstro } from '@/lib/astro/compute';
import { buildAstroAiPrompt } from '@/lib/astro/prompt';

const INPUT = {
    date: '1993-06-21',
    time: '11:18',
    timezone: 'Asia/Taipei',
    place: { name: '臺北市', lat: 25.04776, lon: 121.53185, countryCode: 'TW' },
};

describe('buildAstroAiPrompt', () => {
    const text = buildAstroAiPrompt(computeAstro(INPUT));

    it('includes the chart data', () => {
        expect(text).toContain('請依下列西洋占星本命盤資料');
        expect(text).toContain('- 太陽：雙子');
        expect(text).toContain('上升 ASC：');
        expect(text).toContain('宮位制：普拉西度制');
        expect(text).toContain('第 12 宮：');
    });

    it('asks for the eleven sections with weighted configurations', () => {
        for (const t of [
            '個性與日常特色',
            '底層邏輯思考方式',
            '面對壓力的顯現',
            '感情模式',
            '工作與天賦潛能',
            '核心優缺點',
            '面具與真實的反差感',
            '內耗與充電說明書',
            '金錢觀與安全感來源',
            '原生家庭與依附模式',
            '天賦盲區',
        ]) {
            expect(text).toContain(t);
        }
        expect(text).toContain('## 權重最高的配置（依板塊）');
        expect(text).toMatch(/- \[\d+\] 上升 處女/);
        expect(text).toContain('依序產出 11 個板塊');
        expect(text).toContain('natal_battery');
        expect(text).toMatch(/- \[\d+\] 北交點 /);
    });

    it('states chaining, de-jargon, no-concatenation and strict JSON rules', () => {
        expect(text).toContain('上下文傳遞');
        expect(text).toContain('禁止條列式拼接');
        expect(text).toContain('去術語化');
        for (const k of [
            'section_id',
            'section_title',
            'hook_quote',
            'core_insight',
            'key_dynamic',
            'actionable_advice',
        ]) {
            expect(text).toContain(`"${k}"`);
        }
        expect(text).toContain('限 20 字內');
        expect(text).toContain('每段不超過 80 字');
        expect(text).toContain('限 60 字內');
        expect(text).toContain('限 50 字內');
    });

    it('warns about the unknown birth time and leaves out houses', () => {
        const t = buildAstroAiPrompt(computeAstro(INPUT, true));
        expect(t).toContain('出生時間不確定');
        expect(t).toContain('（無宮位資料）');
        expect(t).not.toContain('上升 ASC：');
    });
});
