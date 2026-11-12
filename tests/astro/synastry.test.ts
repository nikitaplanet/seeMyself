import { describe, expect, it } from 'vitest';
import { computeAstro } from '@/lib/astro/compute';
import { zodiacPos } from '@/lib/astro/compute';
import {
    analyzeAstroSynastry,
    aspectBetween,
    astroFit,
    astroSynastryItems,
    buildAstroSynastryAiPrompt,
    clampZh,
    houseIn,
    interAspects,
    isKeyPair,
    LIMITS,
    PERSONA_ID,
    PERSONA_TITLE,
    type AstroPartner,
} from '@/lib/astro/synastry';
import {
    allocateSections,
    axisContactsOf,
    EXTRA_FITS,
    EXTRA_ORDER,
    EXTRA_TITLES,
    interactionAxis,
    MAX_PER_SECTION,
    orbBase,
    scoreAspect,
    scoreAxis,
    scoreHouse,
    SECTION_ORDER,
    SECTION_TITLES,
    THEMES,
    weighContacts,
    weighSynastry,
} from '@/lib/astro/synastryWeight';
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
                : Array.from({ length: 12 }, (_, i) => ({
                      ...zodiacPos(asc + i * 30),
                      house: i + 1,
                  })),
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
        expect(
            aspectBetween({ key: 'sun', longitude: 0 }, { key: 'moon', longitude: 7.5 }),
        ).toEqual({
            type: 'conjunction',
            angle: 0,
            orb: 7.5,
        });
        expect(
            aspectBetween({ key: 'sun', longitude: 0 }, { key: 'moon', longitude: 8.5 }),
        ).toBeNull();
    });
    it('planets get 6°, and a pair uses the larger orb', () => {
        expect(
            aspectBetween({ key: 'mars', longitude: 0 }, { key: 'venus', longitude: 7 }),
        ).toBeNull();
        expect(
            aspectBetween({ key: 'mars', longitude: 10 }, { key: 'venus', longitude: 100.5 })?.type,
        ).toBe('square');
        expect(
            aspectBetween({ key: 'northNode', longitude: 0 }, { key: 'mars', longitude: 64 }),
        ).toMatchObject({
            type: 'sextile',
            orb: 4,
        });
        expect(
            aspectBetween({ key: 'northNode', longitude: 0 }, { key: 'chiron', longitude: 4 }),
        ).toBeNull();
    });
    it('wraps around 0° Aries', () => {
        expect(
            aspectBetween({ key: 'sun', longitude: 359 }, { key: 'moon', longitude: 1 }),
        ).toMatchObject({
            type: 'conjunction',
            orb: 2,
        });
        expect(
            aspectBetween({ key: 'venus', longitude: 350 }, { key: 'mars', longitude: 172 }),
        ).toMatchObject({
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

// ---------------------------------------------------------------------------
// Weighting engine (準則 §3B)
// ---------------------------------------------------------------------------

describe('weight rules', () => {
    it('base score by orb tier', () => {
        expect([0.5, 1.5, 2.5, 3.5, 5, 7].map(orbBase)).toEqual([30, 24, 18, 14, 8, 4]);
    });

    it('+35 for personal × personal under 2°, +10 for other personal contacts', () => {
        expect(scoreAspect({ a: 'venus', b: 'mars', orb: 1.5 })).toBe(24 + 35);
        expect(scoreAspect({ a: 'sun', b: 'moon', orb: 0.2 })).toBe(30 + 35);
        // Personal but not tight: only the small personal bonus.
        expect(scoreAspect({ a: 'venus', b: 'mars', orb: 2.5 })).toBe(18 + 10);
        expect(scoreAspect({ a: 'jupiter', b: 'venus', orb: 0.5 })).toBe(30 + 10);
        expect(scoreAspect({ a: 'jupiter', b: 'neptune', orb: 0.5 })).toBe(30);
    });

    it('+30 for Node / Saturn / Pluto tight on a personal planet', () => {
        expect(scoreAspect({ a: 'saturn', b: 'moon', orb: 2.5 })).toBe(18 + 30);
        expect(scoreAspect({ a: 'venus', b: 'northNode', orb: 0.5 })).toBe(30 + 30);
        expect(scoreAspect({ a: 'pluto', b: 'sun', orb: 1 })).toBe(24 + 30);
        expect(scoreAspect({ a: 'saturn', b: 'moon', orb: 3.5 })).toBe(14 + 10);
        expect(scoreAspect({ a: 'saturn', b: 'jupiter', orb: 0.5 })).toBe(30);
    });

    it('+35 for a planet within 3° of the other person’s ASC / DSC / MC / IC', () => {
        expect(scoreAxis('venus', 1)).toBe(24 + 35 + 10);
        expect(scoreAxis('saturn', 0.5)).toBe(30 + 35);
        // ASC 0° → DSC 180°, MC 270°, IC 90°.
        const b = chart({ sun: 50 }, { asc: 0 });
        const list = axisContactsOf(
            'a',
            chart({ venus: 1, mars: 181.5, jupiter: 268, saturn: 93.5, sun: 45 }),
            b,
        );
        expect(list.map((c) => [c.body, c.axis])).toEqual([
            ['venus', 'asc'],
            ['mars', 'dsc'],
            ['jupiter', 'mc'],
        ]);
        expect(list[0].score).toBe(scoreAxis('venus', 1));
    });

    it('house overlays score by planet and house', () => {
        expect(scoreHouse('moon', 4)).toBe(30);
        expect(scoreHouse('moon', 3)).toBe(20);
        expect(scoreHouse('saturn', 7)).toBe(22);
        expect(scoreHouse('jupiter', 9)).toBe(12);
    });

    it('scores stay within 1–100 and come sorted', () => {
        const a = chart(
            { sun: 0, moon: 100, venus: 200, mars: 300, saturn: 180, northNode: 30 },
            { asc: 10 },
        );
        const b = chart({ sun: 0.5, moon: 220, venus: 301, mars: 199, saturn: 90 }, { asc: 100 });
        const list = weighContacts(a, b, analyzeAstroSynastry(a, b));
        expect(list.length).toBeGreaterThan(0);
        for (const c of list) {
            expect(c.score).toBeGreaterThanOrEqual(1);
            expect(c.score).toBeLessThanOrEqual(100);
        }
        expect(list.map((c) => c.score)).toEqual(
            [...list.map((c) => c.score)].sort((x, y) => y - x),
        );
        // Aspects to the Ascendant are left to the axis rule.
        expect(
            list.some((c) => c.kind === 'aspect' && (c.aspect.a === 'asc' || c.aspect.b === 'asc')),
        ).toBe(false);
    });

    it('maps contacts to the five sections: each once, at most 5 per section, by section focus', () => {
        const a = chart({
            sun: 0,
            moon: 100,
            venus: 200,
            mars: 300,
            mercury: 10,
            saturn: 130,
            northNode: 40,
        });
        const b = chart({
            sun: 120,
            moon: 220,
            venus: 30,
            mars: 290,
            mercury: 100,
            saturn: 90,
            uranus: 210,
        });
        const w = weighSynastry(a, b, analyzeAstroSynastry(a, b));
        const ids = SECTION_ORDER.flatMap((s) => w.sections[s].map((c) => c.id));
        expect(new Set(ids).size).toBe(ids.length);
        for (const s of SECTION_ORDER)
            expect(w.sections[s].length).toBeLessThanOrEqual(MAX_PER_SECTION);
        const find = (x: string, y: string) =>
            SECTION_ORDER.find((s) =>
                w.sections[s].some(
                    (c) => c.kind === 'aspect' && c.aspect.a === x && c.aspect.b === y,
                ),
            );
        expect(find('sun', 'sun')).toBe('synastry_highlight'); // trine
        expect(find('mars', 'uranus')).toBe('synastry_friction'); // square
        expect(find('moon', 'moon')).toBe('synastry_intimacy'); // trine
        expect(find('saturn', 'moon')).toBe('synastry_lesson'); // square
        expect(find('mercury', 'mercury')).toBe('synastry_daily'); // square
    });

    it('caps a section at 5 and spills to the next fitting one', () => {
        const contacts = Array.from({ length: 7 }, (_, i) => ({
            kind: 'house' as const,
            id: `h${i}`,
            from: 'a' as const,
            body: 'sun' as const,
            house: 7,
            score: 50 - i,
            theme: 'admire' as const,
            prefs: ['synastry_highlight' as const, 'synastry_daily' as const],
        }));
        const out = allocateSections(contacts);
        expect(out.synastry_highlight.map((c) => c.id)).toEqual(['h0', 'h1', 'h2', 'h3', 'h4']);
        expect(out.synastry_daily.map((c) => c.id)).toEqual(['h5', 'h6']);
    });

    it('互動主軸 is the one or two heaviest themes', () => {
        const a = chart({ venus: 0, mars: 200, moon: 100 });
        const b = chart({ mars: 0.5, venus: 199, moon: 220 });
        const axis = interactionAxis(weighContacts(a, b, analyzeAstroSynastry(a, b)));
        expect(axis.length).toBeGreaterThanOrEqual(1);
        expect(axis.length).toBeLessThanOrEqual(2);
        expect(axis[0].id).toBe('spark');
        expect(interactionAxis([])).toEqual([{ id: 'admire', score: 0 }]);
    });

    it('sections 6–10 re-read the contacts through their own filters (準則 §3B)', () => {
        const a = chart(
            { sun: 0, moon: 100, mercury: 10, mars: 300, jupiter: 50, saturn: 130, neptune: 280 },
            { asc: 0 },
        );
        const b = chart(
            { sun: 120, moon: 220, mercury: 100, venus: 160, mars: 290, saturn: 90, pluto: 200 },
            { asc: 90 },
        );
        const w = weighSynastry(a, b, analyzeAstroSynastry(a, b));
        for (const id of EXTRA_ORDER) {
            expect(w.extras[id].length, id).toBeGreaterThan(0);
            expect(w.extras[id].every(EXTRA_FITS[id]), id).toBe(true);
            const scores = w.extras[id].map((c) => c.score);
            expect([...scores].sort((x, y) => y - x)).toEqual(scores);
        }
        const has = (id: (typeof EXTRA_ORDER)[number], x: string, y: string) =>
            w.extras[id].some((c) => c.kind === 'aspect' && c.aspect.a === x && c.aspect.b === y);
        expect(has('synastry_fight', 'mercury', 'mercury')).toBe(true); // square: 導火線
        expect(has('synastry_fight', 'saturn', 'moon')).toBe(true); // square: 冷戰
        expect(has('synastry_battery', 'moon', 'moon')).toBe(true); // trine: 回血
        expect(has('synastry_battery', 'saturn', 'moon')).toBe(false);
        expect(has('synastry_power', 'sun', 'sun')).toBe(true);
        expect(has('synastry_filter', 'saturn', 'moon')).toBe(true);
        // Pluto's house in the other chart is read by 權力 only; planets in the 2nd / 6th / 10th by 共事.
        expect(
            w.extras.synastry_power.some((c) => c.kind === 'house' && c.body === 'pluto'),
        ).toBe(true);
        expect(w.contacts.some((c) => c.kind === 'house' && c.body === 'pluto')).toBe(false);
        expect(
            w.extras.synastry_work
                .filter((c) => c.kind === 'house')
                .every((c) => c.kind === 'house' && [2, 6, 10].includes(c.house)),
        ).toBe(true);
        expect(scoreHouse('venus', 2)).toBe(30);
        expect(scoreHouse('saturn', 10)).toBe(22);
    });

    it('skips the axes and houses of a person whose birth time is unknown', () => {
        const known = chart({ sun: 10, venus: 200, mars: 95 }, { asc: 0 });
        const unknown = chart({ sun: 1, moon: 182, venus: 91 }, { asc: 90, timeUnknown: true });
        const list = weighContacts(known, unknown, analyzeAstroSynastry(known, unknown));
        // Nothing lands on the unknown person's angles or houses …
        expect(list.some((c) => (c.kind === 'axis' || c.kind === 'house') && c.from === 'a')).toBe(
            false,
        );
        // … and the unknown person's Moon is not used anywhere.
        expect(list.some((c) => c.kind === 'aspect' && c.aspect.b === 'moon')).toBe(false);
        expect(list.some((c) => c.kind !== 'aspect' && c.from === 'b' && c.body === 'moon')).toBe(
            false,
        );
        // The known person's angles still count: 乙's Sun at 1° sits on 甲's ASC.
        expect(
            list.some(
                (c) => c.kind === 'axis' && c.from === 'b' && c.body === 'sun' && c.axis === 'asc',
            ),
        ).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// Report (準則 §4)
// ---------------------------------------------------------------------------

const PLACE = { name: '臺北市', lat: 25.04, lon: 121.53, countryCode: 'TW' };
const real = (date: string, time: string, timeUnknown = false) =>
    computeAstro({ date, time, timezone: 'Asia/Taipei', place: PLACE }, timeUnknown);

const NORMAL: [AstroPartner, AstroPartner] = [
    { name: '小明', chart: real('1990-05-12', '14:30') },
    { name: '小華', chart: real('1992-11-03', '08:15') },
];
const TENSE: [AstroPartner, AstroPartner] = [
    { name: '阿哲', chart: real('1988-03-21', '09:00') },
    { name: '雅婷', chart: real('1985-02-10', '20:00') },
];
const UNKNOWN: [AstroPartner, AstroPartner] = [
    { name: '志豪', chart: real('1991-08-08', '00:00', true) },
    { name: '怡君', chart: real('1993-01-25', '06:40') },
];
// 甲 and 乙: Sun–Moon square, Venus–Mars opposition, Sun–Sun square, Moon–Moon square, Saturn square Sun.
const HARD: [AstroPartner, AstroPartner] = [
    { name: '甲', chart: chart({ sun: 0, moon: 100, venus: 200, mars: 300, saturn: 180 }) },
    { name: '乙', chart: chart({ sun: 90, moon: 190, venus: 140, mars: 20, saturn: 250 }) },
];

const report = ([a, b]: [AstroPartner, AstroPartner]) =>
    astroSynastryItems(a, b, analyzeAstroSynastry(a.chart, b.chart));
const prompt = ([a, b]: [AstroPartner, AstroPartner]) =>
    buildAstroSynastryAiPrompt(a, b, analyzeAstroSynastry(a.chart, b.chart));
/** The first five guideline sections (after 個性互動). */
const sections = (p: [AstroPartner, AstroPartner]) => report(p).slice(1, 6);
/** Guideline sections 6–10 (before the gift). */
const extras = (p: [AstroPartner, AstroPartner]) => report(p).slice(6, 11);
/** Index of the gift card and of 星盤依據, and how many cards come before the gift. */
const GIFT = 11;
const BASIS = 12;
const persona = (p: [AstroPartner, AstroPartner]) => report(p)[0];

/** The labelled blocks of a card, e.g. { 解析: [p1, p2], 相處場景: [s], … }. */
function blocks(meaning: string): Record<string, string[]> {
    const out: Record<string, string[]> = {};
    let cur = '';
    for (const line of meaning.split('\n')) {
        const m = /^【([^】]+)】$/.exec(line);
        if (m) out[(cur = m[1])] = [];
        else out[cur].push(line);
    }
    return out;
}

const ALL_PAIRS = { NORMAL, TENSE, UNKNOWN, HARD };

describe('report: 個性互動 and ten sections in card format', () => {
    it.each(Object.entries(ALL_PAIRS))(
        '%s: 個性互動, sections in order, then gift and 星盤依據',
        (_, pair) => {
            const items = report(pair);
            expect(items[0].term).toBe(PERSONA_TITLE);
            expect(items[0].term).toBe('個性互動');
            expect(items.slice(1, 6).map((i) => i.term)).toEqual(
                SECTION_ORDER.map((s) => SECTION_TITLES[s]),
            );
            expect(items.map((i) => i.term).slice(1, 6)).toEqual([
                '一起時的亮點與發揮特色',
                '兩人需磨合的地方',
                '兩人的內心世界與親密度方式',
                '關係的生命課題',
                '日常相處與溝通模式',
            ]);
            expect(items.slice(6, 11).map((i) => i.term)).toEqual(
                EXTRA_ORDER.map((s) => EXTRA_TITLES[s]),
            );
            expect(items.map((i) => i.term).slice(6, 11)).toEqual([
                '吵架與冷戰模式',
                '兩人內耗與充電說明書',
                '關係中的權力與主導權',
                '一起財運與共事潛力',
                '初見印象 vs 深交後的反轉',
            ]);
            expect(items[GIFT].term).toMatch(/^這段關係的(課題與)?禮物$/);
            expect(items[BASIS].term).toBe('星盤依據');
            expect(items.filter((i) => i.collapsed)).toHaveLength(0);
            expect(items).toHaveLength(13);
        },
    );

    it.each(Object.entries(ALL_PAIRS))(
        '%s: 個性互動 has 3 paragraphs, 2 scenes and one advice within limits',
        (_, pair) => {
            const item = persona(pair);
            expect(item.field.length).toBeGreaterThan(0);
            expect(item.hook).toBeTruthy();
            expect(item.hook!.length).toBeLessThanOrEqual(LIMITS.hook);
            const lines = item.meaning.split('\n');
            expect(lines[0]).toBe('【解析】');
            expect(lines[4]).toBe('【相處場景】');
            expect(lines[7]).toBe('【給兩人的建議】');
            expect(lines).toHaveLength(9);
            const b = blocks(item.meaning);
            expect(b['解析']).toHaveLength(3);
            for (const p of b['解析']) {
                expect(p.length).toBeGreaterThan(20);
                expect(p.length).toBeLessThanOrEqual(LIMITS.paragraph);
            }
            expect(b['相處場景']).toHaveLength(2);
            for (const s of b['相處場景']) {
                expect(s.length).toBeGreaterThan(10);
                expect(s.length).toBeLessThanOrEqual(LIMITS.scene);
            }
            expect(b['給兩人的建議']).toHaveLength(1);
            expect(b['給兩人的建議'][0].length).toBeLessThanOrEqual(LIMITS.advice);
            // About the two together: the analysis names both people, never one profile each.
            const analysis = b['解析'].join('');
            expect(analysis).toMatch(new RegExp(`${pair[0].name}|兩人`));
            expect(analysis).toMatch(new RegExp(`${pair[1].name}|兩人`));
            expect(item.meaning).not.toMatch(/代表/);
        },
    );

    it.each(Object.entries(ALL_PAIRS))('%s: every advice is one plain sentence', (_, pair) => {
        for (const item of report(pair).slice(0, GIFT)) {
            const [advice] = blocks(item.meaning)['給兩人的建議'];
            // No stitched 「順著某某的某特質：」 opener.
            expect(advice, item.term).not.toMatch(/^[^。]{2,14}：/);
        }
    });

    it.each(Object.entries(ALL_PAIRS))(
        '%s: at most two scenes open with a 「甲…、乙…：」 setup, and no refer-back repeats',
        (_, pair) => {
            const items = report(pair).slice(0, GIFT + 1);
            const scenes = items.slice(0, GIFT).flatMap((i) => blocks(i.meaning)['相處場景']);
            expect(scenes.filter((s) => /^[^，。]{2,14}：/.test(s)).length).toBeLessThanOrEqual(2);
            // 「那份執著」「這份執著」: a refer-back to a trait is said at most once per report.
            const all = items.map((i) => i.meaning).join('\n');
            const refs: string[] = all.match(/[那這][份顆股][\u4e00-\u9fff]{2}/g) ?? [];
            expect(refs.filter((r, i) => refs.indexOf(r) !== i)).toEqual([]);
            const tails = refs.map((r) => r.slice(2));
            expect(tails.filter((r, i) => tails.indexOf(r) !== i)).toEqual([]);
        },
    );

    it.each(Object.entries(ALL_PAIRS))('%s: hooks carry no mismatched nature imagery', (_, pair) => {
        for (const item of report(pair).slice(0, GIFT))
            expect(item.hook).not.toMatch(
                /流水|大地|微風|烈火|岩石|強風|暗流|爐火|老屋|深海|火種|種子|風向|潮汐|越燒越旺/,
            );
    });

    it.each(Object.entries(ALL_PAIRS))(
        '%s: hook ≤ 20 字 and the fixed layout within limits',
        (_, pair) => {
            const fit = astroFit(analyzeAstroSynastry(pair[0].chart, pair[1].chart));
            [...sections(pair), ...extras(pair)].forEach((item, i) => {
                expect(item.field.length).toBeGreaterThan(0);
                expect(item.hook).toBeTruthy();
                expect(item.hook!.length).toBeLessThanOrEqual(LIMITS.hook);
                const lines = item.meaning.split('\n');
                const upfront = i === 1 && fit.difficult;
                const head = upfront ? lines.slice(2) : lines;
                if (upfront) expect(lines[0]).toBe('【先說在前面】');
                expect(head[0]).toBe('【解析】');
                expect(head[3]).toBe('【相處場景】');
                expect(head[5]).toBe('【給兩人的建議】');
                expect(head).toHaveLength(7);
                const b = blocks(item.meaning);
                expect(b['解析']).toHaveLength(2);
                for (const p of b['解析']) {
                    expect(p.length).toBeGreaterThan(0);
                    expect(p.length).toBeLessThanOrEqual(LIMITS.paragraph);
                    // Sections 6–10: whole sentences, never cut short by the length limit.
                    if (i >= 5) expect(p.length).toBeGreaterThan(20);
                }
                expect(b['相處場景'][0].length).toBeLessThanOrEqual(LIMITS.scene);
                expect(b['給兩人的建議'][0].length).toBeLessThanOrEqual(LIMITS.advice);
                for (const ls of Object.values(b))
                    for (const l of ls) expect(l.trim()).not.toBe('');
            });
        },
    );

    it.each(Object.entries(ALL_PAIRS))(
        '%s: clean, Taiwan Traditional, names not pronouns',
        (_, pair) => {
            const all = report(pair)
                .map((i) => `${i.term}${i.field}${i.hook ?? ''}${i.meaning}`)
                .join('\n');
            expect(all).not.toMatch(/undefined|null|NaN/);
            expect(all).not.toMatch(/(?<!其)[他她]/);
            // Common simplified-only characters and mainland terms.
            expect(all).not.toMatch(/[们这个说关爱时会对发现应该么开过还没让给为与热亲恋]/);
            expect(all).not.toMatch(/信息|质量|视频|默认|优化|反馈/);
            // No jargon in the five sections (the 星盤依據 card may name aspects).
            const body = report(pair)
                .slice(0, GIFT + 1)
                .map((i) => `${i.hook ?? ''}${i.meaning}`)
                .join('\n');
            expect(body).not.toMatch(/刑剋|入廟|容許度|比較盤|四分|三分|六分|對分|第 \d+ 宮/);
            // No mechanical "X的太陽在XX" concatenation.
            expect(body).not.toMatch(
                /的(太陽|月亮|水星|金星|火星|上升)在(牡羊|金牛|雙子|巨蟹|獅子|處女|天秤|天蠍|射手|摩羯|水瓶|雙魚)/,
            );
            expect(all).toContain(pair[0].name);
            expect(all).toContain(pair[1].name);
        },
    );

    it.each(Object.entries(ALL_PAIRS))('%s: sign and planet names only inside （…）', (_, pair) => {
        // Sign names, planet / point names, and the stiff 「X座式」 form. No plain-language
        // exceptions are needed: none of these words is used as an everyday word in the copy.
        const NAMES =
            /牡羊|金牛|雙子|巨蟹|獅子|處女|天秤|天蠍|射手|摩羯|水瓶|雙魚|太陽|月亮|水星|金星|火星|木星|土星|天王星|海王星|冥王星|北交點|凱龍|上升點|下降點|天頂|天底|座式/;
        for (const item of report(pair).slice(0, GIFT + 1)) {
            let text = `${item.field}\n${item.hook ?? ''}\n${item.meaning}`;
            // Strip parenthesised chart basis (innermost first).
            for (let prev = ''; prev !== text; ) {
                prev = text;
                text = text.replace(/（[^（）]*）/g, '');
            }
            const hit = NAMES.exec(text);
            expect(hit, `${item.term}: 「${hit?.[0]}」 outside parentheses in\n${text}`).toBeNull();
        }
    });

    it.each(Object.entries(ALL_PAIRS))(
        '%s: no sentence or clause repeats across sections',
        (_, pair) => {
            const items = report(pair).slice(0, GIFT + 1);
            const seen = new Map<string, number>();
            items.forEach((item, idx) => {
                const text = `${item.hook ?? ''}\n${item.meaning}`.replace(/【[^】]+】/g, '');
                const parts = new Set(
                    text
                        .split(/[。！？\n]/)
                        .flatMap((s) => [s, ...s.split(/[，；：]/)])
                        .map((s) => s.replace(/（[^）]*）/g, '').trim())
                        // The quoted 互動主軸 words are meant to echo between 亮點 and 磨合.
                        .filter((s) => s.length >= 8 && !/「[^」]+」/.test(s)),
                );
                for (const s of parts) {
                    const prev = seen.get(s);
                    expect(
                        prev === undefined || prev === idx,
                        `「${s}」 repeats in sections ${prev} and ${idx}`,
                    ).toBe(true);
                    seen.set(s, idx);
                }
            });
        },
    );

    it.each(Object.entries(ALL_PAIRS))('%s: 亮點 and 磨合 mirror the 互動主軸', (_, pair) => {
        const [a, b] = pair;
        const w = weighSynastry(a.chart, b.chart, analyzeAstroSynastry(a.chart, b.chart));
        const main = THEMES[w.axis[0].id];
        const [hl, fr] = sections(pair);
        expect(blocks(hl.meaning)['解析'][0]).toContain(`「${main.light}」`);
        const frFirst = blocks(fr.meaning)['解析'][0];
        expect(frFirst).toContain(`「${main.light}」`);
        expect(frFirst).toContain(`「${main.shadow}」`);
        expect(frFirst.indexOf(main.light)).toBeLessThan(frFirst.indexOf(main.shadow));
        const ref = report(pair)[BASIS].meaning;
        expect(ref.split('\n')[0]).toContain(`互動主軸：${main.label}`);
        expect(ref).toContain('【個性互動】');
        for (const id of EXTRA_ORDER) expect(ref).toContain(`【${EXTRA_TITLES[id]}】`);
    });

    it('output differs between pairs', () => {
        const x = sections(NORMAL);
        const y = sections(TENSE);
        const z = sections(UNKNOWN);
        for (let i = 0; i < 5; i++) {
            expect(x[i].meaning).not.toEqual(y[i].meaning);
            expect(x[i].meaning).not.toEqual(z[i].meaning);
            expect(y[i].meaning).not.toEqual(z[i].meaning);
        }
        expect(x[0].hook).not.toEqual(y[0].hook);
        const [ex, ey, ez] = [extras(NORMAL), extras(TENSE), extras(UNKNOWN)];
        for (let i = 0; i < 5; i++) {
            expect(ex[i].meaning).not.toEqual(ey[i].meaning);
            expect(ex[i].meaning).not.toEqual(ez[i].meaning);
            expect(ey[i].meaning).not.toEqual(ez[i].meaning);
            expect(new Set([ex[i].hook, ey[i].hook, ez[i].hook]).size).toBeGreaterThanOrEqual(2);
        }
        const p = [NORMAL, TENSE, UNKNOWN].map((pair) => persona(pair));
        expect(new Set(p.map((i) => i.meaning)).size).toBe(3);
        expect(new Set(p.map((i) => i.hook)).size).toBe(3);
    });

    it('roles follow whose planet it is', () => {
        // 乙 holds Mars, 甲 holds Venus: each is described by their own planet's sign.
        const pair: [AstroPartner, AstroPartner] = [
            { name: '甲', chart: chart({ venus: 0 }) },
            { name: '乙', chart: chart({ mars: 120 }) },
        ];
        const all = sections(pair)
            .map((i) => i.meaning)
            .join('\n');
        // Composed from the signs: 甲's Venus in 牡羊, 乙's Mars in 獅子.
        expect(all).toContain('乙想贏的好勝心');
        expect(all).toContain('甲直接熱烈的愛');
        expect(all).toContain('（甲的金星與乙的火星順向呼應）');
    });

    it('clampZh trims at a clause break', () => {
        expect(clampZh('短句。', 10)).toBe('短句。');
        const long = '第一段很長很長很長，第二段也很長很長很長，第三段還是很長很長很長。';
        const out = clampZh(long, 20);
        expect(out.length).toBeLessThanOrEqual(20);
        expect(out.endsWith('。')).toBe(true);
    });
});

describe('unknown birth time', () => {
    it('skips that person’s axes and houses and says so', () => {
        const items = report(UNKNOWN);
        const ref = items[BASIS].meaning;
        expect(ref).toContain('志豪的出生時間不確定');
        // Nothing lands on 志豪's angles or houses.
        expect(ref).not.toMatch(/→ 志豪的第|志豪的(上升點|下降點|天頂|天底)/);
        expect(ref).not.toMatch(/志豪的月亮/);
        const body = items
            .slice(0, GIFT)
            .map((i) => i.meaning)
            .join('\n');
        expect(body).not.toMatch(/落入志豪的|貼近志豪的/);
        expect(body).not.toMatch(/志豪的月亮/);
        // 個性互動 says plainly that 志豪's first impression is left out, and reads only 怡君's.
        const look = blocks(items[0].meaning)['解析'][2];
        expect(look).toContain('志豪的出生時間不確定');
        expect(look).toContain('怡君的上升');
        expect(items[0].meaning).not.toContain('志豪的上升');
        expect(ref).toContain('志豪的太陽獅子座（火象・固定）；出生時間不確定，不列上升');
    });

    it('works when neither time is known', () => {
        const pair: [AstroPartner, AstroPartner] = [
            { name: '甲', chart: real('1990-05-12', '12:00', true) },
            { name: '乙', chart: real('1992-11-03', '12:00', true) },
        ];
        const w = weighSynastry(
            pair[0].chart,
            pair[1].chart,
            analyzeAstroSynastry(pair[0].chart, pair[1].chart),
        );
        expect(w.contacts.every((c) => c.kind === 'aspect')).toBe(true);
        expect(sections(pair)).toHaveLength(5);
        expect(extras(pair)).toHaveLength(5);
        // No houses on either side: the cards that read houses say so instead of guessing.
        expect(extras(pair)[2].meaning).toContain('宮位資料');
        expect(extras(pair)[3].meaning).toContain('宮位資料');
        const look = blocks(persona(pair).meaning)['解析'][2];
        expect(look).toContain('兩人的出生時間都不確定');
        expect(persona(pair).meaning).not.toContain('上升');
    });
});

describe('honest mode (fit signal)', () => {
    it('flags a clearly difficult pair and says so only in 磨合', () => {
        for (const pair of [HARD, TENSE]) {
            const fit = astroFit(analyzeAstroSynastry(pair[0].chart, pair[1].chart));
            expect(fit.difficult).toBe(true);
            const items = report(pair);
            const fr = items[2].meaning.split('\n');
            expect(fr[0]).toBe('【先說在前面】');
            expect(fr[1]).toContain('坦白說');
            expect(items[2].meaning).toContain('比較吃力');
            for (const i of [0, 1, 3, 4, 5, 6, 7, 8, 9, 10])
                expect(items[i].meaning).not.toContain('【先說在前面】');
            expect(items[GIFT].term).toBe('這段關係的課題與禮物');
            expect(items[GIFT].meaning).toMatch(/值得珍惜|真實的好/);
            expect(prompt(pair)).toContain('比較不合');
        }
    });

    it('a flagged pair leads 磨合 with its core tension', () => {
        const fr = sections(HARD)[1].meaning;
        expect(fr).toMatch(
            /（甲的(太陽|月亮|金星|火星)與乙的(太陽|月亮|金星|火星)(互相拉扯|兩端對望)）/,
        );
    });

    it('does not flag ordinary pairs', () => {
        for (const pair of [NORMAL, UNKNOWN]) {
            const syn = analyzeAstroSynastry(pair[0].chart, pair[1].chart);
            expect(astroFit(syn).difficult).toBe(false);
            const items = report(pair);
            expect(items.some((i) => i.meaning.includes('【先說在前面】'))).toBe(false);
            expect(items[GIFT].term).toBe('這段關係的禮物');
            expect(items[GIFT].meaning.split('\n').length).toBeGreaterThanOrEqual(2);
        }
        expect(astroFit(analyzeAstroSynastry(NORMAL[0].chart, NORMAL[1].chart))).toMatchObject({
            bond: true,
        });
    });
});

describe('AI prompt', () => {
    it('asks for 個性互動 and the ten sections as strict JSON, with the weighted data and 互動主軸', () => {
        const p = prompt(NORMAL);
        expect(p).not.toMatch(/undefined|NaN/);
        // 個性互動 comes first, with its own material and the longer format.
        expect(p).toContain(`### 1. ${PERSONA_TITLE}（section_id: ${PERSONA_ID}）`);
        expect(p.indexOf(`（section_id: ${PERSONA_ID}）`)).toBeLessThan(
            p.indexOf(`（section_id: ${SECTION_ORDER[0]}）`),
        );
        expect(p).toContain(`"section_id": "${PERSONA_ID}"`);
        expect(p).toContain('小明的太陽金牛座（土象・固定）');
        expect(p).toContain('元素分布');
        expect(p).toContain('3 個短段落');
        expect(p).toContain('2 個場景');
        expect(p).toContain('十一個板塊');
        for (const s of SECTION_ORDER) {
            expect(p).toContain(s);
            expect(p).toContain(SECTION_TITLES[s]);
        }
        for (const s of EXTRA_ORDER) {
            expect(p).toContain(`"section_id": "${s}"`);
            expect(p).toContain(EXTRA_TITLES[s]);
        }
        const order = [...SECTION_ORDER, ...EXTRA_ORDER].map((s) =>
            p.indexOf(`（section_id: ${s}）`),
        );
        expect(order.every((i) => i >= 0)).toBe(true);
        expect([...order].sort((x, y) => x - y)).toEqual(order);
        for (const k of [
            'section_id',
            'section_title',
            'hook_quote',
            'core_insight',
            'key_dynamic',
            'actionable_advice',
        ])
            expect(p).toContain(k);
        expect(p).toContain('## 互動主軸');
        expect(p).toMatch(/權重 \d+/);
        expect(p).toContain('20 字以內');
        expect(p).toContain('80 字以內');
        expect(p).toContain('60 字以內');
        expect(p).toContain('50 字以內');
        expect(p).toContain('嚴禁寫成兩份獨立的個人分析');
        expect(p).toContain('禁止條列式拼接');
        expect(p).toContain('源自於雙方行動力與安全感能量的碰撞');
        expect(p).toContain('互為表裡');
        expect(p).toContain('2:1');
        expect(p).not.toContain('比較不合');
    });

    it('flags unknown birth times', () => {
        expect(prompt(UNKNOWN)).toContain('志豪的出生時間不確定');
    });
});

describe('distinctiveness across pairs', () => {
    // 20 real pairs spread over decades, seasons and times of day; two with an unknown birth time.
    const PAIRS: [AstroPartner, AstroPartner][] = Array.from({ length: 20 }, (_, i) => {
        const pad = (n: number) => String(n).padStart(2, '0');
        const d1 = `${1970 + ((i * 13) % 31)}-${pad(1 + ((i * 7) % 12))}-${pad(1 + ((i * 17) % 28))}`;
        const d2 = `${1972 + ((i * 11) % 29)}-${pad(1 + ((i * 5 + 4) % 12))}-${pad(1 + ((i * 19 + 9) % 28))}`;
        const t1 = `${pad((i * 7 + 2) % 24)}:${pad((i * 29) % 60)}`;
        const t2 = `${pad((i * 11 + 15) % 24)}:${pad((i * 37 + 8) % 60)}`;
        return [
            { name: '甲', chart: real(d1, t1, i === 4 || i === 15) },
            { name: '乙', chart: real(d2, t2) },
        ];
    });

    /** Text of 個性互動, the ten sections and the gift card, names replaced, heading lines dropped. */
    function body(items: ReturnType<typeof report>): string {
        return items
            .slice(0, GIFT + 1)
            .map((it) => `${it.hook ?? ''}\n${it.meaning}`)
            .join('\n')
            .split('\n')
            .filter((l) => !/^【[^】]+】$/.test(l))
            .join('\n')
            .replace(/[甲乙]/g, 'X');
    }

    /** Share of reports containing each piece; returns the most shared one. */
    function maxShare(split: RegExp, minLen: number): [string, number] {
        const counts = new Map<string, number>();
        for (const pair of PAIRS) {
            const pieces = new Set(
                body(report(pair))
                    .split(split)
                    .map((x) => x.trim())
                    .filter((x) => x.length >= minLen),
            );
            for (const x of pieces) counts.set(x, (counts.get(x) ?? 0) + 1);
        }
        const [worst, n] = [...counts.entries()].sort((x, y) => y[1] - x[1])[0];
        return [worst, n / PAIRS.length];
    }

    it('no sign or planet name outside （…） in any of the 20 reports', () => {
        const NAMES =
            /牡羊|金牛|雙子|巨蟹|獅子|處女|天秤|天蠍|射手|摩羯|水瓶|雙魚|太陽|月亮|水星|金星|火星|木星|土星|天王星|海王星|冥王星|北交點|凱龍|上升點|下降點|天頂|天底|座式/;
        for (const pair of PAIRS)
            for (const item of report(pair).slice(0, GIFT + 1)) {
                let text = `${item.field}\n${item.hook ?? ''}\n${item.meaning}`;
                for (let prev = ''; prev !== text; ) {
                    prev = text;
                    text = text.replace(/（[^（）]*）/g, '');
                }
                const hit = NAMES.exec(text);
                expect(hit, `${item.term}: 「${hit?.[0]}」 in\n${text}`).toBeNull();
            }
    });

    it('no full sentence appears in more than 15% of the reports', () => {
        const [worst, share] = maxShare(/[。！？\n]/, 6);
        expect(share, `「${worst}」 in ${Math.round(share * 100)}% of reports`).toBeLessThanOrEqual(0.15);
    });

    it('no clause of 10+ characters appears in more than 30% of the reports', () => {
        const [worst, share] = maxShare(/[，；。！？\n]/, 10);
        expect(share, `「${worst}」 in ${Math.round(share * 100)}% of reports`).toBeLessThanOrEqual(0.3);
    });

    it('個性互動 stays distinct: no two of the 20 cards share a hook-and-text, and no advice is stitched', () => {
        const cards = PAIRS.map((p) => report(p)[0]);
        expect(new Set(cards.map((c) => c.meaning.replace(/[甲乙]/g, 'X'))).size).toBe(PAIRS.length);
        const hooks = cards.map((c) => c.hook!);
        for (const h of new Set(hooks))
            expect(hooks.filter((x) => x === h).length, h).toBeLessThanOrEqual(3);
        for (const pair of PAIRS)
            for (const item of report(pair).slice(0, GIFT)) {
                const lines = item.meaning.split('\n');
                expect(lines[lines.length - 1], item.term).not.toMatch(/^[^。]{2,14}：/);
            }
    });

    it('sections 6–10 stay distinct: no two of the 20 reports share a card, hooks at most 3 times', () => {
        for (let i = 6; i < GIFT; i++) {
            const cards = PAIRS.map((p) => report(p)[i]);
            expect(
                new Set(cards.map((c) => c.meaning.replace(/[甲乙]/g, 'X'))).size,
                cards[0].term,
            ).toBe(PAIRS.length);
            const hooks = cards.map((c) => c.hook!);
            for (const h of new Set(hooks))
                expect(hooks.filter((x) => x === h).length, h).toBeLessThanOrEqual(3);
            // Every analysis paragraph names its chart basis in a trailing parenthesis.
            for (const c of cards) {
                const [p1, p2] = c.meaning.split('\n').slice(1, 3);
                expect(p1, c.term).toMatch(/（[^（）]+）。$/);
                if (i !== 8) expect(p2, c.term).toMatch(/（[^（）]+）。$/);
            }
        }
    });

    it('a pair without Neptune or Saturn contacts is told there is little filter', () => {
        const pair: [AstroPartner, AstroPartner] = [
            { name: '甲', chart: chart({ sun: 0, venus: 40, mars: 200 }) },
            { name: '乙', chart: chart({ sun: 120, venus: 100, mars: 20 }) },
        ];
        const [fight, , power, , filter] = extras(pair);
        expect(filter.meaning).toContain('（沒有海王星與個人行星的接觸）');
        expect(filter.meaning).toContain('（沒有土星與個人行星的接觸）');
        expect(filter.hook).toMatch(/^(初見就是本人|沒濾鏡的開場|第一眼就很寫實)，/);
        // 甲's Mars opposite 乙's Mars is the trigger; the Suns in trine decide who leads.
        expect(fight.meaning).toContain('（甲的火星與乙的火星兩端對望）');
        expect(power.meaning).toContain('（甲的太陽與乙的太陽順向呼應）');
    });

    it('a shared Sun–Moon contact still reads differently in the gift card', () => {
        const withSunMoon = PAIRS.filter(([a, b]) =>
            analyzeAstroSynastry(a.chart, b.chart).aspects.some(
                (x) =>
                    x.type !== 'square' &&
                    x.type !== 'opposition' &&
                    ((x.a === 'sun' && x.b === 'moon') || (x.a === 'moon' && x.b === 'sun')),
            ),
        );
        expect(withSunMoon.length).toBeGreaterThanOrEqual(2);
        const gifts = withSunMoon.map((p) => report(p)[GIFT].meaning);
        expect(new Set(gifts).size).toBe(gifts.length);
        // No line of one gift card reappears in another (names replaced).
        const lines = gifts.flatMap((g) => [...new Set(g.replace(/[甲乙]/g, 'X').split('\n'))]);
        expect(lines.filter((l, i) => lines.indexOf(l) !== i)).toEqual([]);
    });

    it('a shared Moon–Mars contact is worded from the signs involved', () => {
        const withMoonMars = PAIRS.filter(([a, b]) =>
            analyzeAstroSynastry(a.chart, b.chart).aspects.some(
                (x) => (x.a === 'moon' && x.b === 'mars') || (x.a === 'mars' && x.b === 'moon'),
            ),
        );
        expect(withMoonMars.length).toBeGreaterThanOrEqual(2);
        const texts = withMoonMars.map((p) => body(report(p)));
        expect(new Set(texts).size).toBe(texts.length);
    });
});
