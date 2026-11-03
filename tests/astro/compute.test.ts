import { describe, expect, it } from 'vitest';
import { computeAstro, findAspects, houseOf, zodiacPos } from '@/lib/astro/compute';
import type { AstroBodyKey } from '@/lib/astro/types';

// Reference chart: Donald Trump, 1946-06-14 10:54 EDT, Jamaica (Queens), New York,
// 40°42′N 73°48′W. Source: Astro-Databank (astro.com), Rodden rating AA (birth certificate).
// Published values (tropical, Placidus): Sun 22°56′ Gemini, Moon 21°12′ Sagittarius,
// ASC 29°55′ Leo, MC 24°22′ Taurus, Mercury 8°51′ Cancer, Mars 26°47′ Leo, Saturn 23°49′ Cancer.
const REFERENCE = {
    date: '1946-06-14',
    time: '10:54',
    timezone: 'America/New_York',
    place: { name: 'Jamaica, Queens', lat: 40.7, lon: -73.8, countryCode: 'US' },
};

/** Absolute angular difference in degrees. */
function delta(a: number, b: number): number {
    const d = Math.abs(a - b) % 360;
    return d > 180 ? 360 - d : d;
}

function body(chart: ReturnType<typeof computeAstro>, key: AstroBodyKey) {
    const b = chart.bodies.find((x) => x.key === key);
    if (!b) throw new Error(`missing ${key}`);
    return b;
}

describe('computeAstro — reference chart', () => {
    const chart = computeAstro(REFERENCE);

    it('converts EDT to UT', () => {
        expect(chart.utc).toBe('1946-06-14T14:54:00Z');
    });

    it('matches published planet positions within 1°', () => {
        const expected: Array<[AstroBodyKey, string, number]> = [
            ['sun', '雙子', 60 + 22 + 56 / 60],
            ['moon', '射手', 240 + 21 + 12 / 60],
            ['mercury', '巨蟹', 90 + 8 + 51 / 60],
            ['mars', '獅子', 120 + 26 + 47 / 60],
            ['saturn', '巨蟹', 90 + 23 + 49 / 60],
        ];
        for (const [key, sign, lon] of expected) {
            const b = body(chart, key);
            expect(b.signName, key).toBe(sign);
            expect(delta(b.longitude, lon), key).toBeLessThan(1);
        }
    });

    it('matches published ASC / MC within 1° using Placidus', () => {
        expect(chart.houseSystem).toBe('placidus');
        expect(chart.houseNote).toBeNull();
        expect(chart.angles?.asc.signName).toBe('獅子');
        expect(delta(chart.angles!.asc.longitude, 120 + 29 + 55 / 60)).toBeLessThan(1);
        expect(chart.angles?.mc.signName).toBe('金牛');
        expect(delta(chart.angles!.mc.longitude, 30 + 24 + 22 / 60)).toBeLessThan(1);
        expect(chart.houses).toHaveLength(12);
        expect(chart.houses![0].longitude).toBeCloseTo(chart.angles!.asc.longitude, 6);
        expect(chart.houses![9].longitude).toBeCloseTo(chart.angles!.mc.longitude, 6);
    });

    it('places bodies in houses (Sun 10th, Moon 4th, Mars 12th)', () => {
        expect(body(chart, 'sun').house).toBe(10);
        expect(body(chart, 'moon').house).toBe(4);
        expect(body(chart, 'mars').house).toBe(12);
        for (const b of chart.bodies) expect(b.house).toBeGreaterThanOrEqual(1);
    });

    it('lists all ten planets plus the north node; Chiron only when the ephemeris has it', () => {
        const keys = chart.bodies.map((b) => b.key);
        expect(keys.slice(0, 11)).toEqual([
            'sun',
            'moon',
            'mercury',
            'venus',
            'mars',
            'jupiter',
            'saturn',
            'uranus',
            'neptune',
            'pluto',
            'northNode',
        ]);
        expect(keys.includes('chiron')).toBe(chart.chironAvailable);
    });

    it('finds the Sun–Moon opposition; every orb is within the widest (luminary) orb', () => {
        const sunMoon = chart.aspects.find((a) => a.a === 'sun' && a.b === 'moon');
        expect(sunMoon?.type).toBe('opposition');
        expect(sunMoon?.orb).toBeCloseTo(1.73, 1);
        for (const a of chart.aspects) expect(a.orb).toBeLessThanOrEqual(8);
    });

    it('formats degree / minute inside the sign', () => {
        const sun = body(chart, 'sun');
        expect(sun.degree).toBe(22);
        expect(sun.minute).toBeGreaterThanOrEqual(54);
        expect(sun.minute).toBeLessThanOrEqual(57);
    });
});

describe('computeAstro — timeUnknown / missing place / polar latitude', () => {
    it('omits houses, ASC and MC when the birth time is unknown, keeps signs and aspects', () => {
        const chart = computeAstro(REFERENCE, true);
        expect(chart.timeUnknown).toBe(true);
        expect(chart.utc).toBe('1946-06-14T16:00:00Z'); // 12:00 EDT
        expect(chart.angles).toBeNull();
        expect(chart.houses).toBeNull();
        expect(chart.houseSystem).toBeNull();
        expect(chart.houseNote).toContain('出生時間不確定');
        expect(chart.bodies.every((b) => b.house === null)).toBe(true);
        expect(body(chart, 'sun').signName).toBe('雙子');
        expect(chart.aspects.length).toBeGreaterThan(0);
    });

    it('omits houses when no place is given', () => {
        const { place: _place, ...noPlace } = REFERENCE;
        void _place;
        const chart = computeAstro(noPlace);
        expect(chart.houses).toBeNull();
        expect(chart.angles).toBeNull();
        expect(chart.houseNote).toContain('出生地點');
    });

    it('falls back from Placidus to Porphyry inside the polar circle', () => {
        const chart = computeAstro({
            date: '1990-12-21',
            time: '12:00',
            timezone: 'Arctic/Longyearbyen',
            place: { name: 'Longyearbyen', lat: 78.22, lon: 15.65, countryCode: 'SJ' },
        });
        expect(chart.houseSystem).toBe('porphyry');
        expect(chart.houses).toHaveLength(12);
        expect(chart.houseNote).toContain('波菲利');
    });

    it('follows nodeMode for the north node', () => {
        const t = computeAstro(REFERENCE);
        const m = computeAstro({ ...REFERENCE, options: { nodeMode: 'mean' } });
        expect(t.nodeMode).toBe('true');
        expect(m.nodeMode).toBe('mean');
        const dt = delta(body(t, 'northNode').longitude, body(m, 'northNode').longitude);
        expect(dt).toBeGreaterThan(0);
        expect(dt).toBeLessThan(2.5);
        expect(body(m, 'northNode').retrograde).toBe(false);
    });
});

describe('aspect detection', () => {
    it('detects each major aspect with luminary / planet / point orbs', () => {
        const aspects = findAspects([
            { key: 'sun', longitude: 0 },
            { key: 'moon', longitude: 187.5 }, // opposition, 7.5° — only inside the luminary orb
            { key: 'mercury', longitude: 61 }, // sun sextile (1°)
            { key: 'venus', longitude: 151 }, // mercury square (0°)
            { key: 'mars', longitude: 271 }, // venus trine (0°); mercury is 150° away → no aspect
        ]);
        const find = (a: AstroBodyKey, b: AstroBodyKey) =>
            aspects.find((x) => x.a === a && x.b === b);
        expect(find('sun', 'moon')).toMatchObject({ type: 'opposition', name: '對分', orb: 7.5 });
        expect(find('sun', 'mercury')).toMatchObject({ type: 'sextile', name: '六分', orb: 1 });
        expect(find('mercury', 'venus')).toMatchObject({ type: 'square', name: '四分', orb: 0 });
        expect(find('venus', 'mars')).toMatchObject({ type: 'trine', name: '三分', orb: 0 });
        expect(find('mercury', 'mars')).toBeUndefined(); // 150°: not a major aspect
    });

    it('uses the 6° planet orb and 3° point orb, wrapping across 0°', () => {
        const aspects = findAspects([
            { key: 'mars', longitude: 358 },
            { key: 'jupiter', longitude: 3 }, // conjunction across 0°, 5°
            { key: 'saturn', longitude: 97 }, // jupiter square (4°); mars is 99° away → 9° off, no aspect
            { key: 'northNode', longitude: 7 }, // jupiter conjunction (4°): the larger 6° planet orb applies
            { key: 'chiron', longitude: 104 }, // northNode is 97° away → 7° off, beyond both orbs
        ]);
        const pairs = aspects.map((a) => `${a.a}-${a.b}-${a.type}`);
        expect(pairs).toContain('mars-jupiter-conjunction');
        expect(pairs).toContain('jupiter-saturn-square');
        expect(pairs).toContain('jupiter-northNode-conjunction');
        expect(pairs).not.toContain('mars-saturn-square');
        expect(pairs).not.toContain('northNode-chiron-square');
    });
});

describe('helpers', () => {
    it('zodiacPos truncates to arc-minutes and never rolls into the next sign', () => {
        expect(zodiacPos(29.99999)).toMatchObject({ signName: '牡羊', degree: 29, minute: 59 });
        expect(zodiacPos(30)).toMatchObject({ signName: '金牛', degree: 0, minute: 0 });
        expect(zodiacPos(-0.5)).toMatchObject({ signName: '雙魚', degree: 29, minute: 30 });
    });

    it('houseOf handles cusps that wrap past 0°', () => {
        const cusps = [350, 20, 50, 80, 110, 140, 170, 200, 230, 260, 290, 320];
        expect(houseOf(355, cusps)).toBe(1);
        expect(houseOf(5, cusps)).toBe(1);
        expect(houseOf(20, cusps)).toBe(2);
        expect(houseOf(345, cusps)).toBe(12);
    });
});
