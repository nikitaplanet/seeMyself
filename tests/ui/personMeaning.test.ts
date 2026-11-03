import { describe, expect, it } from 'vitest';
import { computeBazi } from '@/lib/bazi/compute';
import type { BaziChart, WuXing } from '@/lib/bazi/types';
import { computeChart } from '@/lib/hd/chart';
import {
    AUTHORITY_NAMES_ZH,
    CENTER_ORDER,
    CHANNELS,
    CROSS_ANGLE_NAMES_ZH,
    DEFINITION_NAMES_ZH,
    TYPE_NAMES_ZH,
} from '@/lib/hd/constants';
import { swephProvider } from '@/lib/hd/ephemeris/sweph-provider';
import type { Authority, ChartResult, CrossAngle, Definition, HDType } from '@/lib/hd/types';
import {
    baziMeaningItems,
    hdMeaningItems,
    type MeaningItem,
    ziweiMeaningItems,
} from '@/lib/ui/personMeaning';
import { computeZiwei } from '@/lib/ziwei/compute';
import type { ZiweiChart } from '@/lib/ziwei/types';

const SAMPLES = [
    { date: '1990-05-12', time: '14:30' },
    { date: '1993-06-21', time: '11:18' },
] as const;

const PLACE = {
    name: '臺北市',
    lat: 25.04776,
    lon: 121.53185,
    countryCode: 'TW',
};

const PROFILES = [
    [1, 3],
    [1, 4],
    [2, 4],
    [2, 5],
    [3, 5],
    [3, 6],
    [4, 6],
    [4, 1],
    [5, 1],
    [5, 2],
    [6, 2],
    [6, 3],
] as const;

function hd(date: string, time: string): ChartResult {
    return computeChart({ date, time, timezone: 'Asia/Taipei' }, swephProvider);
}

function birth(date: string, time: string) {
    return { date, time, timezone: 'Asia/Taipei', place: PLACE, gender: 'female' as const };
}

/** Every item is filled, has no template leaks, and reads as a real paragraph. */
function expectRich(items: MeaningItem[]) {
    expect(items.length).toBeGreaterThan(0);
    for (const it of items) {
        expect(it.meaning.trim().length, it.term).toBeGreaterThan(0);
        expect(it.meaning, it.term).not.toMatch(/undefined|null|NaN|\[object/);
        // Pre-expansion single-paragraph items topped out around 45 characters.
        expect(it.meaning.length, `${it.term}: ${it.meaning}`).toBeGreaterThanOrEqual(60);
    }
}

describe('hdMeaningItems', () => {
    it.each(SAMPLES)('gives rich meanings for $date', ({ date, time }) => {
        expectRich(hdMeaningItems(hd(date, time)));
    });

    it('covers every type, authority, definition, angle, profile, center and channel', () => {
        const base = hd(SAMPLES[0].date, SAMPLES[0].time);
        const types = Object.keys(TYPE_NAMES_ZH) as HDType[];
        const auths = Object.keys(AUTHORITY_NAMES_ZH) as Authority[];
        const defs = Object.keys(DEFINITION_NAMES_ZH) as Definition[];
        const angles = Object.keys(CROSS_ANGLE_NAMES_ZH) as CrossAngle[];
        const channels = CHANNELS.map(([a, b]) => ({
            ...base.channels[0],
            id: `${a}-${b}`,
        }));
        for (let i = 0; i < 12; i++) {
            const [personality, design] = PROFILES[i];
            const chart: ChartResult = {
                ...base,
                type: types[i % types.length],
                authority: auths[i % auths.length],
                definition: defs[i % defs.length],
                cross: { ...base.cross, angle: angles[i % angles.length] },
                profile: { ...base.profile, personality, design },
                definedCenters: i % 2 === 0 ? [...CENTER_ORDER] : [],
                channels,
            };
            const items = hdMeaningItems(chart);
            expectRich(items);
            const text = items.map((x) => x.meaning).join('\n');
            expect(text).not.toContain('影響學習與被看見的方式。');
            expect(text).not.toContain('這是兩個中心之間已接通的固定能力。');
        }
    });
});

describe('ziweiMeaningItems', () => {
    it.each(SAMPLES)('gives rich meanings for $date', ({ date, time }) => {
        const items = ziweiMeaningItems(computeZiwei(birth(date, time)));
        expectRich(items);
        const sihua = items.find((x) => x.term === '生年四化');
        expect(sihua?.meaning.split('\n')).toHaveLength(4);
        expect(sihua?.meaning).toMatch(/（落.+宮）/);
    });

    it('borrows the opposite palace when the soul palace has no major star', () => {
        const chart = computeZiwei(birth(SAMPLES[0].date, SAMPLES[0].time));
        const palaces = chart.palaces.map((p) => (p.isSoulPalace ? { ...p, majorStars: [] } : p));
        const empty: ZiweiChart = { ...chart, palaces };
        const soul = ziweiMeaningItems(empty)[0];
        expect(soul.meaning).toMatch(/借對宮/);
        expectRich([soul]);
    });
});

describe('baziMeaningItems', () => {
    it.each(SAMPLES)('gives rich meanings for $date', ({ date, time }) => {
        const items = baziMeaningItems(computeBazi(birth(date, time)));
        expectRich(items);
        // 日柱天干是日主，不應被當成十神列出。
        expect(items.find((x) => x.term === '十神')?.meaning).not.toMatch(/元[男女]/);
    });

    it('covers every stem, strength, structure and dominant element', () => {
        const base = computeBazi(birth(SAMPLES[1].date, SAMPLES[1].time));
        const stems = '甲乙丙丁戊己庚辛壬癸'.split('');
        const strengths = ['身弱', '身旺', '中和'];
        const geJus = [
            '正官格',
            '七殺格',
            '正財格',
            '偏財格',
            '食神格',
            '傷官格',
            '正印格',
            '偏印格',
            '建祿格',
        ];
        const wxs: WuXing[] = ['木', '火', '土', '金', '水'];
        for (let i = 0; i < 10; i++) {
            const chart: BaziChart = {
                ...base,
                dayMaster: `${stems[i]}木`,
                strength: strengths[i % 3],
                geJu: geJus[i % geJus.length],
                wuXing: base.wuXing.map((w) => ({ ...w, percent: w.wx === wxs[i % 5] ? 90 : 2 })),
            };
            const items = baziMeaningItems(chart);
            expectRich(items);
            const text = items.map((x) => x.meaning).join('\n');
            expect(text).not.toContain('格局是看盤的骨架');
        }
    });
});
