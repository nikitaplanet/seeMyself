import { describe, expect, it } from 'vitest';
import { computeAstro } from '@/lib/astro/compute';
import {
    natalConfigs,
    NATAL_SECTIONS,
    orbBonus,
    weighNatal,
    WEIGHT,
} from '@/lib/astro/natalWeight';
import type { AstroBody, AstroChart } from '@/lib/astro/types';

const INPUT = {
    date: '1993-06-21',
    time: '11:18',
    timezone: 'Asia/Taipei',
    place: { name: '臺北市', lat: 25.04776, lon: 121.53185, countryCode: 'TW' },
};

function withBodies(chart: AstroChart, patch: (b: AstroBody) => AstroBody): AstroChart {
    return { ...chart, bodies: chart.bodies.map(patch) };
}

describe('natal weighting — rules', () => {
    it('applies the orb tiers', () => {
        expect(orbBonus(0)).toBe(35);
        expect(orbBonus(1.49)).toBe(35);
        expect(orbBonus(1.5)).toBe(20);
        expect(orbBonus(4)).toBe(20);
        expect(orbBonus(4.5)).toBe(10);
        expect(orbBonus(5.01)).toBe(5);
    });

    it('scores aspects by orb and adds +30 for the big three / chart ruler', () => {
        const base = computeAstro(INPUT);
        const chart: AstroChart = {
            ...base,
            aspects: [
                { a: 'venus', b: 'saturn', type: 'trine', name: '三分', angle: 120, orb: 1.0 },
                { a: 'venus', b: 'jupiter', type: 'square', name: '四分', angle: 90, orb: 3.0 },
                { a: 'venus', b: 'pluto', type: 'opposition', name: '對分', angle: 180, orb: 5.5 },
                { a: 'sun', b: 'jupiter', type: 'trine', name: '三分', angle: 120, orb: 1.0 },
            ],
        };
        const w = new Map(natalConfigs(chart).configs.map((c) => [c.id, c.weight]));
        expect(w.get('aspect:venus-saturn')).toBe(WEIGHT.base + 35);
        expect(w.get('aspect:venus-jupiter')).toBe(WEIGHT.base + 20);
        expect(w.get('aspect:venus-pluto')).toBe(WEIGHT.base + 5);
        expect(w.get('aspect:sun-jupiter')).toBe(WEIGHT.base + 35 + 30);
        expect(w.get('placement:sun')).toBe(WEIGHT.base + 30);
        expect(w.get('placement:asc')).toBe(WEIGHT.base + 30);
        // ASC 處女 → chart ruler Mercury.
        expect(natalConfigs(chart).ruler).toBe('mercury');
        expect(w.get('placement:mercury')).toBe(WEIGHT.base + 30);
    });

    it('adds +30 for a planet within 3° of an angle', () => {
        const base = computeAstro(INPUT);
        const asc = base.angles!.asc.longitude;
        const chart = withBodies(base, (b) =>
            b.key === 'venus' ? { ...b, longitude: (asc + 1) % 360 } : b,
        );
        const axis = natalConfigs(chart).configs.find((c) => c.id === 'axis:venus-asc');
        expect(axis?.weight).toBe(WEIGHT.base + WEIGHT.axis + 35);
        const near = withBodies(base, (b) =>
            b.key === 'venus' ? { ...b, longitude: (asc + 3.5) % 360 } : b,
        );
        expect(natalConfigs(near).configs.some((c) => c.id === 'axis:venus-asc')).toBe(false);
    });

    it('adds +25 for a stellium of three planets in one sign', () => {
        const base = computeAstro(INPUT);
        const chart = withBodies(base, (b) =>
            ['mars', 'jupiter', 'saturn'].includes(b.key)
                ? { ...b, sign: 7 }
                : b.sign === 7
                  ? { ...b, sign: 8 }
                  : b,
        );
        const st = natalConfigs(chart).configs.find((c) => c.id === 'stellium:sign:7');
        expect(st?.weight).toBe(WEIGHT.base + WEIGHT.stellium);
        expect(st?.kind === 'stellium' && st.bodies).toEqual(['mars', 'jupiter', 'saturn']);
    });

    it('skips houses, axes, the ruler and Moon aspects when the time is unknown', () => {
        const { configs, ruler, housesKnown } = natalConfigs(computeAstro(INPUT, true));
        expect(housesKnown).toBe(false);
        expect(ruler).toBeNull();
        expect(configs.some((c) => c.kind === 'house' || c.kind === 'axis')).toBe(false);
        expect(configs.some((c) => c.kind === 'stellium' && c.scope === 'house')).toBe(false);
        expect(configs.some((c) => c.id === 'placement:asc')).toBe(false);
        expect(
            configs.some(
                (c) => c.kind === 'aspect' && (c.aspect.a === 'moon' || c.aspect.b === 'moon'),
            ),
        ).toBe(false);
    });
});

describe('natal weighting — section mapping', () => {
    const w = weighNatal(computeAstro(INPUT));

    it('keeps at most 5 configurations per section, highest weight first', () => {
        for (const s of NATAL_SECTIONS) {
            const cs = w.sections[s.id];
            expect(cs.length, s.id).toBeGreaterThan(0);
            expect(cs.length, s.id).toBeLessThanOrEqual(5);
            for (let i = 1; i < cs.length; i++)
                expect(cs[i - 1].weight).toBeGreaterThanOrEqual(cs[i].weight);
            for (const c of cs) {
                expect(c.weight).toBeGreaterThanOrEqual(1);
                expect(c.weight).toBeLessThanOrEqual(100);
            }
        }
    });

    it('anchors each section on its planets', () => {
        const ids = (id: keyof typeof w.sections) => w.sections[id].map((c) => c.id);
        expect(ids('natal_personality')).toEqual(
            expect.arrayContaining(['placement:asc', 'placement:sun']),
        );
        expect(ids('natal_logic')).toContain('placement:mercury');
        expect(ids('natal_stress')).toEqual(
            expect.arrayContaining(['placement:moon', 'placement:mars']),
        );
        expect(ids('natal_love')).toEqual(expect.arrayContaining(['placement:venus', 'house:7']));
        expect(ids('natal_career')).toContain('house:10');
        for (const c of w.sections.natal_core) expect(['aspect', 'axis']).toContain(c.kind);
        expect(ids('natal_mask')).toEqual(
            expect.arrayContaining(['placement:asc', 'placement:moon', 'house:12']),
        );
        expect(ids('natal_battery')).toEqual(
            expect.arrayContaining(['placement:moon', 'house:6', 'house:12']),
        );
        expect(ids('natal_money')).toEqual(
            expect.arrayContaining(['house:2', 'house:8', 'placement:venus', 'placement:jupiter']),
        );
        expect(ids('natal_family')).toEqual(expect.arrayContaining(['house:4', 'placement:moon']));
        expect(ids('natal_gift')).toEqual(
            expect.arrayContaining(['placement:jupiter', 'placement:northNode']),
        );
        for (const c of w.sections.natal_logic) {
            if (c.kind === 'aspect') expect([c.aspect.a, c.aspect.b]).toContain('mercury');
        }
        for (const c of w.sections.natal_stress) {
            if (c.kind === 'aspect') expect(['square', 'opposition']).toContain(c.aspect.type);
        }
    });
});
