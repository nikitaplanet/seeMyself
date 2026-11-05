import { describe, expect, it } from 'vitest';
import { computeAstro } from '@/lib/astro/compute';
import { zodiacPos } from '@/lib/astro/compute';
import {
    analyzeAstroSynastry,
    aspectBetween,
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
        expect(items.map((i) => i.term)).toEqual(['重點相位', '其他相位', '和諧與張力', '宮位疊加', '相處建議']);
        const prompt = buildAstroSynastryAiPrompt({ name: '甲', chart: a }, { name: '乙', chart: b }, syn);
        expect(prompt).toContain('## 比對相位');
        expect(prompt).not.toMatch(/undefined|NaN/);
    });
});
