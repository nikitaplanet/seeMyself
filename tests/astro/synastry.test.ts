import { describe, expect, it } from 'vitest';
import { computeAstro } from '@/lib/astro/compute';
import { zodiacPos } from '@/lib/astro/compute';
import {
    analyzeAstroSynastry,
    aspectBetween,
    astroFit,
    astroSynastryItems,
    buildAstroSynastryAiPrompt,
    houseIn,
    interAspects,
    isKeyPair,
} from '@/lib/astro/synastry';
import type { AstroBody, AstroBodyKey, AstroChart } from '@/lib/astro/types';

function chart(
    lons: Partial<Record<AstroBodyKey, number>>,
    opts: { asc?: number; timeUnknown?: boolean } = {},
): AstroChart {
    const bodies: AstroBody[] = Object.entries(lons).map(([key, lon]) => ({
        ...zodiacPos(lon as number),
        key: key as AstroBodyKey,
        name: key,
        short: key,
        speed: 1,
        retrograde: false,
        house: null,
    }));
    const asc = opts.asc;
    return {
        utc: '2000-01-01T00:00:00Z',
        jd: 0,
        timeUnknown: opts.timeUnknown ?? false,
        nodeMode: 'true',
        ephemeris: 'test',
        bodies,
        angles: asc === undefined ? null : { asc: zodiacPos(asc), mc: zodiacPos(asc + 270) },
        houses:
            asc === undefined
                ? null
                : Array.from({ length: 12 }, (_, i) => ({ ...zodiacPos(asc + i * 30), house: i + 1 })),
        houseSystem: asc === undefined ? null : 'wholeSign',
        houseSystemLabel: null,
        houseNote: null,
        aspects: [],
        chironAvailable: false,
        placeName: null,
    };
}

describe('aspectBetween — orbs', () => {
    it('luminaries get 8°', () => {
        expect(aspectBetween({ key: 'sun', longitude: 0 }, { key: 'moon', longitude: 7.5 })).toEqual({
            type: 'conjunction',
            angle: 0,
            orb: 7.5,
        });
        expect(aspectBetween({ key: 'sun', longitude: 0 }, { key: 'moon', longitude: 8.5 })).toBeNull();
    });
    it('planets get 6°, and a pair uses the larger orb', () => {
        expect(aspectBetween({ key: 'mars', longitude: 0 }, { key: 'venus', longitude: 7 })).toBeNull();
        expect(aspectBetween({ key: 'mars', longitude: 10 }, { key: 'venus', longitude: 100.5 })?.type).toBe('square');
        expect(aspectBetween({ key: 'northNode', longitude: 0 }, { key: 'mars', longitude: 64 })).toMatchObject({
            type: 'sextile',
            orb: 4,
        });
        expect(aspectBetween({ key: 'northNode', longitude: 0 }, { key: 'chiron', longitude: 4 })).toBeNull();
    });
    it('wraps around 0° Aries', () => {
        expect(aspectBetween({ key: 'sun', longitude: 359 }, { key: 'moon', longitude: 1 })).toMatchObject({
            type: 'conjunction',
            orb: 2,
        });
        expect(aspectBetween({ key: 'venus', longitude: 350 }, { key: 'mars', longitude: 172 })).toMatchObject({
            type: 'opposition',
            orb: 2,
        });
    });
});

describe('interAspects', () => {
    const a = chart({ sun: 10, moon: 100, venus: 200, saturn: 300, uranus: 50 }, { asc: 0 });
    const b = chart({ moon: 132, mars: 203, venus: 120, jupiter: 4, neptune: 52 }, { asc: 90 });

    it('finds A × B aspects, key pairs first', () => {
        const list = interAspects(a, b);
        const find = (x: string, y: string) => list.find((s) => s.a === x && s.b === y);
        expect(find('sun', 'moon')).toMatchObject({ type: 'trine', orb: 2, key: true });
        expect(find('venus', 'mars')).toMatchObject({ type: 'conjunction', orb: 3, key: true });
        expect(find('saturn', 'venus')).toMatchObject({ type: 'opposition', orb: 0, key: true });
        expect(find('sun', 'jupiter')).toMatchObject({ type: 'conjunction', key: false });
        const firstNonKey = list.findIndex((s) => !s.key);
        expect(list.slice(firstNonKey).every((s) => !s.key)).toBe(true);
    });

    it('skips outer–outer (generational) pairs', () => {
        expect(interAspects(a, b).some((s) => s.a === 'uranus' && s.b === 'neptune')).toBe(false);
    });

    it('drops Moon and ASC of a person whose birth time is unknown', () => {
        const list = interAspects(chart({ sun: 10, moon: 100 }, { asc: 0, timeUnknown: true }), b);
        expect(list.some((s) => s.a === 'moon' || s.a === 'asc')).toBe(false);
        expect(list.some((s) => s.a === 'sun')).toBe(true);
    });

    it('key pairs', () => {
        expect(isKeyPair('moon', 'sun')).toBe(true);
        expect(isKeyPair('mars', 'venus')).toBe(true);
        expect(isKeyPair('saturn', 'asc')).toBe(true);
        expect(isKeyPair('mars', 'jupiter')).toBe(false);
    });
});

describe('house overlays', () => {
    it('houseIn follows the cusps', () => {
        const cusps = Array.from({ length: 12 }, (_, i) => (90 + i * 30) % 360);
        expect(houseIn(95, cusps)).toBe(1);
        expect(houseIn(89, cusps)).toBe(12);
        expect(houseIn(275, cusps)).toBe(7);
    });
    it('places each person in the other’s houses; none when the time is unknown', () => {
        const a = chart({ sun: 10, venus: 200 }, { asc: 0 });
        const b = chart({ sun: 95 }, { asc: 90 });
        const syn = analyzeAstroSynastry(a, b);
        expect(syn.overlays).toContainEqual({ from: 'a', body: 'sun', house: 10 });
        expect(syn.overlays).toContainEqual({ from: 'b', body: 'sun', house: 4 });
        const unknown = analyzeAstroSynastry(a, chart({ sun: 95 }, { asc: 90, timeUnknown: true }));
        expect(unknown.overlays.some((o) => o.from === 'a')).toBe(false);
    });
});

describe('report from real charts', () => {
    const PLACE = { name: '臺北市', lat: 25.04, lon: 121.53, countryCode: 'TW' };
    const a = computeAstro({ date: '1990-05-12', time: '14:30', timezone: 'Asia/Taipei', place: PLACE });
    const b = computeAstro({ date: '1992-11-03', time: '08:15', timezone: 'Asia/Taipei', place: PLACE });
    const syn = analyzeAstroSynastry(a, b);

    it('is clean and mentions both people', () => {
        const items = astroSynastryItems({ name: '甲', chart: a }, { name: '乙', chart: b }, syn);
        const all = items.map((i) => `${i.term}${i.field}${i.meaning}`).join('\n');
        expect(all).not.toMatch(/undefined|null|NaN/);
        expect(all).toContain('甲的');
        expect(all).toContain('乙的');
        expect(items.map((i) => i.term)).toEqual([
            '重點相位',
            '其他相位',
            '和諧與張力',
            '宮位疊加',
            '日常相處',
            '相處建議',
            '這段關係的禮物',
        ]);
        const prompt = buildAstroSynastryAiPrompt({ name: '甲', chart: a }, { name: '乙', chart: b }, syn);
        expect(prompt).toContain('## 比對相位');
        expect(prompt).not.toMatch(/undefined|NaN/);
    });

    it('prompt asks for the four daily-life themes', () => {
        const prompt = buildAstroSynastryAiPrompt({ name: '甲', chart: a }, { name: '乙', chart: b }, syn);
        for (const t of ['個性', '兩人思考方式', '處理矛盾的方法', '感受親密及愛的方式']) expect(prompt).toContain(t);
        expect(prompt).toContain('語氣以鼓勵、先講優點為主');
        expect(prompt).toContain('2:1');
        expect(prompt).toContain('這段關係的禮物');
        expect(prompt).not.toContain('比較不合');
    });
});

describe('日常相處 and pair-specific copy', () => {
    // Pair 1: fire Sun / earth Venus vs water Sun / air Venus. Pair 2: everything earth vs earth.
    const p1a = chart({ sun: 5, mercury: 10, venus: 40, mars: 0, moon: 100 }, { asc: 0 });
    const p1b = chart({ sun: 95, mercury: 100, venus: 70, mars: 110, moon: 190 }, { asc: 90 });
    const p2a = chart({ sun: 35, mercury: 40, venus: 45, mars: 50, moon: 160 }, { asc: 30 });
    const p2b = chart({ sun: 275, mercury: 280, venus: 285, mars: 290, moon: 150 }, { asc: 270 });
    const daily = (x: AstroChart, y: AstroChart) =>
        astroSynastryItems({ name: '甲', chart: x }, { name: '乙', chart: y }, analyzeAstroSynastry(x, y)).find(
            (i) => i.term === '日常相處',
        )!.meaning;

    it('exists, covers the four themes and differs between pairs', () => {
        const d1 = daily(p1a, p1b);
        const d2 = daily(p2a, p2b);
        for (const t of ['【個性】', '【思考方式】', '【處理矛盾】', '【感受親密與愛】']) {
            expect(d1).toContain(t);
            expect(d2).toContain(t);
        }
        // Each heading sits alone on its line and is followed by 2+ separate paragraph lines.
        for (const d of [d1, d2]) {
            const lines = d.split('\n');
            for (const t of ['【個性】', '【思考方式】', '【處理矛盾】', '【感受親密與愛】']) {
                const i = lines.indexOf(t);
                expect(i).toBeGreaterThanOrEqual(0);
                expect(lines[i + 1]).toBeTruthy();
                expect(lines[i + 2]).toBeTruthy();
                expect(lines[i + 1].startsWith('【')).toBe(false);
                expect(lines[i + 2].startsWith('【')).toBe(false);
            }
            const order = ['【個性】', '【思考方式】', '【處理矛盾】', '【感受親密與愛】'].map((t) => lines.indexOf(t));
            expect([...order].sort((x, y) => x - y)).toEqual(order);
        }
        expect(d1).not.toEqual(d2);
        expect(d1).toContain('甲太陽在牡羊');
        expect(d2).toContain('乙太陽在摩羯');
        expect(d2).toContain('兩人的金星都是土象');
        expect(d1).not.toMatch(/undefined|NaN/);
    });

    it('hedges the Moon and ASC when a birth time is unknown', () => {
        const d = daily(chart({ sun: 5, mercury: 10, venus: 40, mars: 0, moon: 92 }, { timeUnknown: true }), p1b);
        expect(d).toContain('甲的出生時間不確定，上升無法判斷');
        expect(d).toContain('月亮可能在雙子或巨蟹');
    });

    it('aspect notes depend on the pair and the aspect family', () => {
        const items = (x: AstroChart, y: AstroChart) =>
            astroSynastryItems({ name: '甲', chart: x }, { name: '乙', chart: y }, analyzeAstroSynastry(x, y))[0].meaning;
        const venusMarsSoft = items(chart({ venus: 0 }), chart({ mars: 120 }));
        const venusMarsHard = items(chart({ venus: 0 }), chart({ mars: 90 }));
        const sunMoonSoft = items(chart({ sun: 0 }), chart({ moon: 120 }));
        const body = (s: string) => s.split('：').slice(1).join('：');
        expect(body(venusMarsSoft)).not.toEqual(body(venusMarsHard));
        expect(body(venusMarsSoft)).not.toEqual(body(sunMoonSoft));
        // Roles follow whose planet it is: 乙 holds Mars, so 乙 is the one who pursues.
        expect(venusMarsSoft).toContain('乙的主動');
    });

    it('easy aspects name a cost, tense ones a gift, and daily tags do not repeat', () => {
        const first = (x: AstroChart, y: AstroChart) =>
            astroSynastryItems({ name: '甲', chart: x }, { name: '乙', chart: y }, analyzeAstroSynastry(x, y))[0].meaning;
        const soft = first(chart({ moon: 0 }), chart({ moon: 120 }));
        expect(soft).toContain('難開口的事');
        // Strength first: the growth point comes after the warm sentence.
        expect(soft.indexOf('住在一起舒服')).toBeLessThan(soft.indexOf('難開口的事'));
        expect(first(chart({ saturn: 0 }), chart({ venus: 90 }))).toContain('經得起考驗');
        // 甲's Saturn squares 乙's Mars and Moon, 甲's Mars squares 乙's Saturn: three hard tags in 處理矛盾.
        const d = astroSynastryItems(
            { name: '甲', chart: chart({ saturn: 0, mars: 200, sun: 40, mercury: 40, venus: 40 }) },
            { name: '乙', chart: chart({ mars: 90, moon: 270, saturn: 290, sun: 40, mercury: 40, venus: 40 }) },
            analyzeAstroSynastry(
                chart({ saturn: 0, mars: 200, sun: 40, mercury: 40, venus: 40 }),
                chart({ mars: 90, moon: 270, saturn: 290, sun: 40, mercury: 40, venus: 40 }),
            ),
        ).find((i) => i.term === '日常相處')!.meaning;
        const tags = d.split('\n').filter((l) => l.startsWith('・相位加碼')).map((l) => l.split('——')[1]);
        expect(tags.length).toBeGreaterThan(1);
        expect(new Set(tags).size).toBe(tags.length);
    });

    it('closing gift is built from the pair and differs between pairs', () => {
        const gift = (x: AstroChart, y: AstroChart) =>
            astroSynastryItems({ name: '甲', chart: x }, { name: '乙', chart: y }, analyzeAstroSynastry(x, y)).at(-1)!;
        const g1 = gift(p1a, p1b);
        const g2 = gift(p2a, p2b);
        expect(g1.term).toBe('這段關係的禮物');
        expect(g1.meaning).not.toEqual(g2.meaning);
        expect(g1.meaning).toContain('最珍貴的');
        expect(g1.meaning).not.toMatch(/undefined|NaN/);
        expect(g1.meaning.split('\n').length).toBeGreaterThanOrEqual(2);
        const sentences = g1.meaning.split('。').filter(Boolean).length;
        expect(sentences).toBeGreaterThanOrEqual(2);
        expect(sentences).toBeLessThanOrEqual(3);
        // Only tense contacts: still names something real to treasure.
        const tense = gift(chart({ sun: 0, venus: 10 }), chart({ moon: 90, mars: 190 }));
        expect(tense.meaning).toMatch(/最珍貴的|值得珍惜/);
    });
});

describe('fit signal', () => {
    // 甲 and 乙: Sun–Moon square, Venus–Mars opposition, Sun–Sun square, Moon–Moon square, Saturn square Sun.
    const hardA = chart({ sun: 0, moon: 100, venus: 200, mars: 300, saturn: 180 });
    const hardB = chart({ sun: 90, moon: 190, venus: 140, mars: 20, saturn: 250 });

    it('flags a clearly difficult pair and says so honestly', () => {
        const syn = analyzeAstroSynastry(hardA, hardB);
        const fit = astroFit(syn);
        expect(fit.difficult).toBe(true);
        expect(fit.coreTense).toBeGreaterThanOrEqual(3);
        expect(fit.bond).toBe(false);
        const items = astroSynastryItems({ name: '甲', chart: hardA }, { name: '乙', chart: hardB }, syn);
        const daily = items.find((i) => i.term === '日常相處')!.meaning;
        expect(daily.split('\n')[0]).toBe('【先說在前面】');
        expect(daily.split('\n')[1]).toContain('比較不合');
        expect(daily).toContain('比較不合');
        const last = items.at(-1)!;
        expect(last.term).toBe('這段關係的課題與禮物');
        expect(last.meaning).toContain('需要');
        expect(last.meaning).toContain('值得珍惜');
        expect(items.find((i) => i.term === '相處建議')!.meaning).toContain('三個實際的做法');
        const prompt = buildAstroSynastryAiPrompt({ name: '甲', chart: hardA }, { name: '乙', chart: hardB }, syn);
        expect(prompt).toContain('比較不合');
    });

    it('does not flag an ordinary pair, even one with some tension', () => {
        for (const [x, y] of [
            [
                chart({ sun: 5, mercury: 10, venus: 40, mars: 0, moon: 100 }, { asc: 0 }),
                chart({ sun: 95, mercury: 100, venus: 70, mars: 110, moon: 190 }, { asc: 90 }),
            ],
            [
                chart({ sun: 35, mercury: 40, venus: 45, mars: 50, moon: 160 }, { asc: 30 }),
                chart({ sun: 275, mercury: 280, venus: 285, mars: 290, moon: 150 }, { asc: 270 }),
            ],
        ]) {
            const syn = analyzeAstroSynastry(x, y);
            expect(astroFit(syn).difficult).toBe(false);
            const items = astroSynastryItems({ name: '甲', chart: x }, { name: '乙', chart: y }, syn);
            expect(items.find((i) => i.term === '日常相處')!.meaning).not.toContain('【先說在前面】');
            expect(items.at(-1)!.term).toBe('這段關係的禮物');
        }
        const PLACE = { name: '臺北市', lat: 25.04, lon: 121.53, countryCode: 'TW' };
        const real = analyzeAstroSynastry(
            computeAstro({ date: '1990-05-12', time: '14:30', timezone: 'Asia/Taipei', place: PLACE }),
            computeAstro({ date: '1992-11-03', time: '08:15', timezone: 'Asia/Taipei', place: PLACE }),
        );
        expect(astroFit(real)).toMatchObject({ difficult: false, bond: true });
    });
});
