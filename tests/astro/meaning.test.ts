import { describe, expect, it } from 'vitest';
import { computeAstro } from '@/lib/astro/compute';
import {
    astroMeaningItems,
    natalReport,
    splitSentences,
    tightestAspects,
} from '@/lib/astro/meaning';
import { expectValidReport } from './natalHelpers';
import type { AstroBody, AstroChart } from '@/lib/astro/types';

// Same birth data as tests/astro/prompt.test.ts.
const INPUT = {
    date: '1993-06-21',
    time: '11:18',
    timezone: 'Asia/Taipei',
    place: { name: '臺北市', lat: 25.04776, lon: 121.53185, countryCode: 'TW' },
};
const OTHER = {
    date: '1969-10-02',
    time: '22:15',
    timezone: 'Asia/Tokyo',
    place: { name: '東京', lat: 35.6762, lon: 139.6503, countryCode: 'JP' },
};

describe('astroMeaningItems — full chart', () => {
    const chart = computeAstro(INPUT);

    it('returns the eleven guideline sections in order with the card layout', () => {
        const items = expectValidReport(chart);
        expect(items.map((i) => i.term)).toEqual([
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
        ]);
    });

    it('bases cards 7–11 on the houses and points the guideline names', () => {
        const byTerm = new Map(astroMeaningItems(chart).map((i) => [i.term, i.meaning]));
        expect(byTerm.get('面具與真實的反差感')).toMatch(/上升[\s\S]+月亮/);
        expect(byTerm.get('面具與真實的反差感')).toContain('第 12 宮');
        expect(byTerm.get('內耗與充電說明書')).toMatch(/月亮在第 \d+ 宮/);
        expect(byTerm.get('內耗與充電說明書')).toMatch(/第 (6|12) 宮/);
        expect(byTerm.get('金錢觀與安全感來源')).toMatch(/第 2 宮[\s\S]+第 8 宮/);
        expect(byTerm.get('金錢觀與安全感來源')).toMatch(/金星|木星/);
        expect(byTerm.get('原生家庭與依附模式')).toMatch(/天底[\s\S]+月亮/);
        expect(byTerm.get('天賦盲區')).toMatch(/木星在第 \d+ 宮/);
        expect(byTerm.get('天賦盲區')).toContain('北交點');
    });

    it('chains context: later sections reuse earlier traits only as domain scenes', () => {
        const report = natalReport(chart);
        expect(report[4].scene).toMatch(/職場|工作|上班/);
        expect(report[3].insight[1]).toMatch(/^(到了感情裡|談起戀愛)/);
    });

    it('differs between two charts', () => {
        const a = astroMeaningItems(chart).map((i) => i.meaning);
        const b = astroMeaningItems(computeAstro(OTHER)).map((i) => i.meaning);
        a.forEach((m, i) => expect(m).not.toBe(b[i]));
        const sa = new Set(a.flatMap(splitSentences));
        const shared = b.flatMap(splitSentences).filter((s) => sa.has(s) && !s.startsWith('【'));
        expect(shared.length).toBeLessThanOrEqual(2);
    });

    it('keeps the old tightest-aspect helper', () => {
        expect(tightestAspects(chart)).toHaveLength(3);
    });
});

describe('astroMeaningItems — time unknown', () => {
    const chart = computeAstro(INPUT, true);
    const items = expectValidReport(chart);

    it('does not invent an ascendant or houses', () => {
        for (const it of items) {
            expect(it.meaning, it.term).not.toMatch(/上升[^\s、）]|第 \d+ 宮|天頂|下降點|命主星/);
        }
    });

    it('says in plain words which sections are less certain and why', () => {
        const byTerm = new Map(items.map((i) => [i.term, i.field]));
        expect(byTerm.get('個性與日常特色')).toContain('出生時間不確定');
        expect(byTerm.get('個性與日常特色')).toContain('較不確定');
        expect(byTerm.get('工作與天賦潛能')).toContain('參考性較低');
        expect(byTerm.get('面對壓力的顯現')).toContain('月亮位置可能偏差');
        expect(byTerm.get('核心優缺點')).toContain('略過');
        for (const t of ['面具與真實的反差感', '內耗與充電說明書', '原生家庭與依附模式'])
            expect(byTerm.get(t), t).toContain('出生時間不確定');
        expect(byTerm.get('金錢觀與安全感來源')).toContain('參考性較低');
        expect(byTerm.get('天賦盲區')).toContain('略過');
    });

    it('leaves Moon aspects out', () => {
        for (const a of tightestAspects(chart)) expect([a.a, a.b]).not.toContain('moon');
        for (const s of natalReport(chart)) {
            for (const c of s.configs) {
                if (c.kind === 'aspect') expect([c.aspect.a, c.aspect.b]).not.toContain('moon');
            }
        }
    });
});

describe('astroMeaningItems — every sign renders', () => {
    it('covers all 12 signs for every placement table', () => {
        const base = computeAstro(INPUT);
        for (let sign = 0; sign < 12; sign++) {
            const shift = (p: AstroBody): AstroBody => ({ ...p, sign, degree: 15 });
            const chart: AstroChart = {
                ...base,
                bodies: base.bodies.map(shift),
                angles: base.angles && {
                    asc: { ...base.angles.asc, sign },
                    mc: { ...base.angles.mc, sign: (sign + 9) % 12 },
                },
            };
            expectValidReport(chart);
            expectValidReport({ ...chart, timeUnknown: true });
        }
    });

    it('handles a chart with no aspects', () => {
        const chart = { ...computeAstro(INPUT, true), aspects: [] };
        const items = expectValidReport(chart);
        expect(items[1].meaning).toContain('水星沒有緊密角度');
    });
});
