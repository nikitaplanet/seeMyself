import { describe, expect, it } from 'vitest';
import { computeAstro } from '@/lib/astro/compute';
import { astroMeaningItems, tightestAspects } from '@/lib/astro/meaning';
import type { AstroBody, AstroChart } from '@/lib/astro/types';

// Same birth data as tests/astro/prompt.test.ts.
const INPUT = {
    date: '1993-06-21',
    time: '11:18',
    timezone: 'Asia/Taipei',
    place: { name: '臺北市', lat: 25.04776, lon: 121.53185, countryCode: 'TW' },
};

function expectClean(items: ReturnType<typeof astroMeaningItems>) {
    for (const it of items) {
        for (const text of [it.term, it.field, it.meaning]) {
            expect(text.trim().length, it.term).toBeGreaterThan(0);
            expect(text, it.term).not.toMatch(/undefined|null|NaN/);
        }
    }
    expect(new Set(items.map((i) => i.term)).size).toBe(items.length);
}

describe('astroMeaningItems — full chart', () => {
    const chart = computeAstro(INPUT);
    const items = astroMeaningItems(chart);
    const terms = items.map((i) => i.term);

    it('lists placements in order with ascendant and house items', () => {
        expect(terms[0]).toBe('太陽 · 雙子');
        expect(terms[1]).toMatch(/^月亮 · /);
        expect(terms[2]).toMatch(/^上升 · /);
        expect(terms.slice(3, 8).map((t) => t.split(' · ')[0])).toEqual([
            '水星',
            '金星',
            '火星',
            '木星',
            '土星',
        ]);
        expect(terms[8]).toMatch(/太陽.*第 \d+ 宮|太陽第 \d+ 宮/);
        expect(terms.slice(-2)).toEqual(['最緊密的相位', '元素與模式']);
    });

    it('has no undefined or empty text', () => {
        expectClean(items);
    });

    it('describes the three tightest non-generational aspects by orb', () => {
        const outer = ['uranus', 'neptune', 'pluto'];
        const sorted = chart.aspects
            .filter((a) => !(outer.includes(a.a) && outer.includes(a.b)))
            .sort((x, y) => x.orb - y.orb)
            .slice(0, 3);
        expect(sorted).toHaveLength(3);
        expect(tightestAspects(chart)).toEqual(sorted);
        const aspectText = items.find((i) => i.term === '最緊密的相位')!.meaning;
        const lines = aspectText.split('\n');
        expect(lines).toHaveLength(3);
        sorted.forEach((a, i) => expect(lines[i]).toContain(`${a.orb.toFixed(1)}°`));
    });

    it('counts all ten planets in the element balance', () => {
        const text = items.find((i) => i.term === '元素與模式')!.meaning;
        const counts = [...text.split('\n')[0].matchAll(/(\d+)/g)].map((m) => Number(m[1]));
        expect(counts.slice(0, 4).reduce((a, b) => a + b, 0)).toBe(10);
        expect(counts.slice(4, 7).reduce((a, b) => a + b, 0)).toBe(10);
    });
});

describe('astroMeaningItems — time unknown', () => {
    const chart = computeAstro(INPUT, true);
    const items = astroMeaningItems(chart);

    it('skips ascendant and houses and caveats the Moon', () => {
        expect(items.some((i) => i.term.startsWith('上升'))).toBe(false);
        expect(items.some((i) => i.term.includes('宮'))).toBe(false);
        const moon = items.find((i) => i.term.startsWith('月亮'))!;
        expect(moon.meaning).toContain('出生時間不確定');
        expectClean(items);
    });

    it('leaves Moon aspects out of the tightest list', () => {
        for (const a of tightestAspects(chart)) {
            expect([a.a, a.b]).not.toContain('moon');
        }
    });
});

describe('astroMeaningItems — every sign renders', () => {
    it('covers all 12 signs for each placement table', () => {
        const base = computeAstro(INPUT);
        for (let sign = 0; sign < 12; sign++) {
            const shift = (p: AstroBody): AstroBody => ({ ...p, sign, degree: 15 });
            const chart: AstroChart = {
                ...base,
                bodies: base.bodies.map(shift),
                angles: base.angles && { ...base.angles, asc: { ...base.angles.asc, sign } },
            };
            expectClean(astroMeaningItems(chart));
            expectClean(astroMeaningItems({ ...chart, timeUnknown: true }));
        }
    });

    it('handles a chart with no aspects', () => {
        const chart = { ...computeAstro(INPUT), aspects: [] };
        const text = astroMeaningItems(chart).find((i) => i.term === '最緊密的相位')!.meaning;
        expect(text).toContain('沒有落在容許度內的主要相位');
    });
});
