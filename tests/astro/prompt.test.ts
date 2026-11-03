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
    it('includes planets, angles, houses, aspects, and reading instructions', () => {
        const text = buildAstroAiPrompt(computeAstro(INPUT));
        expect(text).toContain('請依下列西洋占星本命盤資料');
        expect(text).toContain('- 太陽：雙子');
        expect(text).toContain('上升 ASC：');
        expect(text).toContain('宮位制：普拉西度制');
        expect(text).toContain('第 12 宮：');
        expect(text).toContain('容許度');
        expect(text).toContain('3～5 條務實建議');
    });

    it('warns about the unknown birth time and leaves out houses', () => {
        const text = buildAstroAiPrompt(computeAstro(INPUT, true));
        expect(text).toContain('出生時間不確定');
        expect(text).toContain('（無宮位資料）');
        expect(text).not.toContain('上升 ASC：');
    });
});
