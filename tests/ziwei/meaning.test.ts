import { describe, expect, it } from 'vitest';
import { computeZiwei } from '@/lib/ziwei/compute';
import {
    ZIWEI_COPY,
    ZIWEI_LIMITS,
    ziweiMeaningItems,
    ziweiNatalReport,
} from '@/lib/ziwei/meaning';
import { analyzeZiweiSynastry, ziweiSynastryItems } from '@/lib/ziwei/synastry';
import { ZIWEI_PAIR_COPY } from '@/lib/ziwei/synastryCards';

const PLACE = { name: '臺北市', lat: 25.04, lon: 121.53, countryCode: 'TW' };
const mk = (date: string, time: string, gender: 'male' | 'female' = 'female') =>
    computeZiwei({ date, time, timezone: 'Asia/Taipei', place: PLACE, gender });
const len = (s: string) => [...s].length;

const BIRTHS: Array<[string, string]> = [
    ['1990-05-12', '14:30'],
    ['1993-06-21', '11:18'],
    ['1985-01-20', '23:40'],
    ['1998-07-07', '03:10'],
    ['1980-01-15', '18:00'],
    ['1984-10-05', '18:00'],
    ['1992-11-03', '08:15'],
    ['1976-03-28', '05:50'],
    ['2001-09-09', '21:05'],
    ['1969-12-31', '09:45'],
    ['1988-08-08', '16:20'],
    ['1995-02-14', '01:30'],
];
const CHARTS = BIRTHS.map(([d, t], i) => mk(d, t, i % 2 ? 'male' : 'female'));

const TITLES = [
    '個性與日常特色',
    '思考方式',
    '面對壓力',
    '感情模式',
    '工作與天賦',
    '核心優缺點',
    '面具與真實的反差',
    '內耗與充電說明書',
    '金錢觀與安全感',
    '原生家庭與依附模式',
    '天賦盲區',
];
const JARGON = /廟旺|化忌沖|空劫|剋夫|剋妻|破財|無子|刑剋|孤寡/;
const MAINLAND = /質量|視頻|信息|軟件|網絡|屏幕|默認|数据|这|们/;

describe('ziweiNatalReport', () => {
    it('gives the eleven guideline themes in order, each within the card budgets', () => {
        for (const chart of CHARTS) {
            const report = ziweiNatalReport(chart);
            expect(report.map((s) => s.title)).toEqual(TITLES);
            for (const s of report) {
                expect(len(s.hook), `${s.title} hook: ${s.hook}`).toBeLessThanOrEqual(ZIWEI_LIMITS.hook);
                expect(s.insight.filter(Boolean)).toHaveLength(2);
                for (const p of s.insight)
                    expect(len(p), `${s.title}: ${p}`).toBeLessThanOrEqual(ZIWEI_LIMITS.paragraph);
                expect(len(s.scene), `${s.title}: ${s.scene}`).toBeLessThanOrEqual(ZIWEI_LIMITS.scene);
                expect(len(s.advice), `${s.title}: ${s.advice}`).toBeLessThanOrEqual(ZIWEI_LIMITS.advice);
                const text = [s.hook, ...s.insight, s.scene, s.advice].join('\n');
                expect(text).not.toMatch(/undefined|null|NaN|\[object/);
                expect(text).not.toMatch(JARGON);
                expect(text).not.toMatch(MAINLAND);
            }
        }
    });

    it('every copy table entry fits its budget (basis parenthesis included)', () => {
        const BASIS = 13; // 「（事業宮借對宮天機、太陰）」
        for (const [name, table] of Object.entries(ZIWEI_COPY.cards)) {
            for (const [star, c] of Object.entries(table)) {
                const where = `${name}.${star}`;
                expect(len(c.hook), where).toBeLessThanOrEqual(ZIWEI_LIMITS.hook);
                expect(len(c.scene), where).toBeLessThanOrEqual(ZIWEI_LIMITS.scene);
                expect(len(c.advice), where).toBeLessThanOrEqual(ZIWEI_LIMITS.advice);
                const extra = name === 'SELF' ? Math.max(...Object.values(ZIWEI_COPY.STAR_ALSO).map(len)) + 1 : 0;
                expect(len(c.p) + extra + BASIS, `${where}: ${c.p}`).toBeLessThanOrEqual(ZIWEI_LIMITS.paragraph);
            }
        }
        for (const [name, table] of Object.entries(ZIWEI_COPY.paragraphs))
            for (const [k, p] of Object.entries(table))
                expect(len(p) + BASIS, `${name}.${k}: ${p}`).toBeLessThanOrEqual(ZIWEI_LIMITS.paragraph);
        for (const [k, v] of Object.entries(ZIWEI_COPY.LU_STAR)) {
            expect(len(v.hook), k).toBeLessThanOrEqual(ZIWEI_LIMITS.hook);
            expect(len(v.p) + 6, k).toBeLessThanOrEqual(ZIWEI_LIMITS.paragraph);
        }
        for (const [k, v] of Object.entries(ZIWEI_COPY.JI_STAR)) {
            expect(len(v.p) + 6, k).toBeLessThanOrEqual(ZIWEI_LIMITS.paragraph);
            expect(len(v.scene), k).toBeLessThanOrEqual(ZIWEI_LIMITS.scene);
            expect(len(v.advice), k).toBeLessThanOrEqual(ZIWEI_LIMITS.advice);
        }
        const roles = (t: Record<string, { role: string }>) => Math.max(...Object.values(t).map((v) => len(v.role)));
        expect(4 + roles(ZIWEI_COPY.OUTER) + 1 + roles(ZIWEI_COPY.INNER)).toBeLessThanOrEqual(ZIWEI_LIMITS.hook);
        for (const [k, v] of Object.entries(ZIWEI_COPY.OUTER))
            expect(len(v.line) + BASIS, k).toBeLessThanOrEqual(ZIWEI_LIMITS.paragraph);
        for (const [k, v] of Object.entries(ZIWEI_COPY.INNER)) {
            expect(len(v.line) + BASIS, k).toBeLessThanOrEqual(ZIWEI_LIMITS.paragraph);
            expect(len(v.scene), k).toBeLessThanOrEqual(ZIWEI_LIMITS.scene);
            expect(len(v.advice), k).toBeLessThanOrEqual(ZIWEI_LIMITS.advice);
        }
        for (const [k, v] of Object.entries(ZIWEI_COPY.FAMILY)) {
            expect(len(v.hook), k).toBeLessThanOrEqual(ZIWEI_LIMITS.hook);
            expect(len(v.p1) + BASIS, k).toBeLessThanOrEqual(ZIWEI_LIMITS.paragraph);
            expect(len(v.p2), k).toBeLessThanOrEqual(ZIWEI_LIMITS.paragraph);
            expect(len(v.scene), k).toBeLessThanOrEqual(ZIWEI_LIMITS.scene);
            expect(len(v.advice), k).toBeLessThanOrEqual(ZIWEI_LIMITS.advice);
        }
    });

    it('does not repeat a sentence across cards, and different charts read differently', () => {
        const texts = CHARTS.map((chart) => {
            const report = ziweiNatalReport(chart);
            const sentences = report.flatMap((s) => [...s.insight, s.scene, s.advice]);
            expect(new Set(sentences).size).toBe(sentences.length);
            expect(new Set(report.map((s) => s.hook)).size).toBe(report.length);
            return report.map((s) => [s.hook, ...s.insight].join('|'));
        });
        for (let i = 0; i < texts.length; i++)
            for (let j = i + 1; j < texts.length; j++) {
                const same = texts[i].filter((t, k) => t === texts[j][k]).length;
                expect(same, `${BIRTHS[i][0]} vs ${BIRTHS[j][0]}`).toBeLessThanOrEqual(3);
            }
    });

    it('items: eleven cards with hooks, then folded references', () => {
        const items = ziweiMeaningItems(CHARTS[0]);
        expect(items.map((i) => i.term)).toEqual([...TITLES, '十二宮主星', '生年四化']);
        for (const it of items.slice(0, 11)) {
            expect(it.hook).toBeTruthy();
            expect(it.meaning.split('\n').filter((l) => l.startsWith('【'))).toEqual([
                '【解析】',
                '【生活場景】',
                '【給你的建議】',
            ]);
            expect(it.meaning).toMatch(/（.+）/);
        }
        expect(items.at(-2)!.collapsed).toBeFalsy();
        expect(items.at(-2)!.meaning.split('\n')).toHaveLength(12);
        expect(items.at(-1)!.collapsed).toBeFalsy();
        expect(items.map((i) => i.meaning).join('\n')).not.toMatch(/僕役|官祿/);
    });

    it('flags an uncertain birth time', () => {
        const items = ziweiMeaningItems({ ...CHARTS[0], timeUnknown: true });
        expect(items[0].field).toContain('出生時間不確定');
    });
});

describe('紫微合盤主題卡片', () => {
    const NEW = ['吵架與冷戰', '兩人內耗與充電', '權力與主導權', '財運與共事', '初見與深交'];
    const pairs: Array<[number, number]> = [
        [0, 6],
        [2, 3],
        [4, 5],
        [1, 7],
        [8, 9],
        [10, 11],
    ];
    const reports = pairs.map(([i, j]) =>
        ziweiSynastryItems(
            { name: '甲', chart: CHARTS[i], timeUnknown: false },
            { name: '乙', chart: CHARTS[j], timeUnknown: false },
            analyzeZiweiSynastry(CHARTS[i], CHARTS[j]),
        ),
    );

    it('adds the cards in guideline order around 日常相處', () => {
        for (const items of reports) {
            const terms = items.map((i) => i.term);
            expect(terms[0]).toBe('一起時的亮點');
            const at = terms.indexOf('日常相處');
            expect(terms.slice(at + 1, at + 6)).toEqual(NEW);
        }
    });

    it('cards follow the layout and budgets', () => {
        for (const items of reports) {
            for (const it of items.filter((i) => i.term === '一起時的亮點' || NEW.includes(i.term))) {
                expect(len(it.hook ?? ''), `${it.term}: ${it.hook}`).toBeLessThanOrEqual(20);
                expect(len(it.hook ?? '')).toBeGreaterThan(0);
                const lines = it.meaning.split('\n');
                expect(lines.filter((l) => l.startsWith('【'))).toEqual(['【解析】', '【相處場景】', '【給兩人的建議】']);
                expect(lines).toHaveLength(7);
                const [, p1, p2, , scene, , advice] = lines;
                for (const p of [p1, p2]) expect(len(p), `${it.term}: ${p}`).toBeLessThanOrEqual(80);
                expect(len(scene), `${it.term}: ${scene}`).toBeLessThanOrEqual(60);
                expect(len(advice), `${it.term}: ${advice}`).toBeLessThanOrEqual(50);
                expect(it.meaning).not.toMatch(/undefined|null|NaN|\[object/);
                expect(it.meaning).not.toMatch(/[^其]他|她/);
            }
        }
    });

    it('copy tables fit the budgets with one-character names', () => {
        for (const table of [ZIWEI_PAIR_COPY.HIGHLIGHT, ZIWEI_PAIR_COPY.BATTERY, ZIWEI_PAIR_COPY.POWER, ZIWEI_PAIR_COPY.MONEY]) {
            for (const [k, fn] of Object.entries(table)) {
                const c = fn('甲', '乙');
                expect(len(c.hook), k).toBeLessThanOrEqual(20);
                // 「（甲命宮借對宮紫微天府、乙命宮借對宮武曲七殺）」
                expect(len(c.p1) + 24, `${k}: ${c.p1}`).toBeLessThanOrEqual(80);
                if (c.p2) expect(len(c.p2), k).toBeLessThanOrEqual(80);
                expect(len(c.scene), `${k}: ${c.scene}`).toBeLessThanOrEqual(60);
                expect(len(c.advice), `${k}: ${c.advice}`).toBeLessThanOrEqual(50);
            }
        }
        for (const table of [ZIWEI_PAIR_COPY.FIGHT, ZIWEI_PAIR_COPY.FIRST]) {
            for (const [k, fn] of Object.entries(table)) {
                const c = fn('甲', '乙');
                expect(len(c.hook), k).toBeLessThanOrEqual(20);
                expect(len(c.scene), `${k}: ${c.scene}`).toBeLessThanOrEqual(60);
                expect(len(c.advice), `${k}: ${c.advice}`).toBeLessThanOrEqual(50);
            }
        }
        const max = (t: Record<string, string>) => Math.max(...Object.values(t).map(len));
        // 「甲的地雷是…；乙的地雷是…。踩到時先別解釋，承認「我碰到你在意的事了」。」＋依據
        expect(12 + 2 * max(ZIWEI_PAIR_COPY.MINE) + 23 + 14).toBeLessThanOrEqual(80);
        expect(18 + 2 * max(ZIWEI_PAIR_COPY.ICE) + 24).toBeLessThanOrEqual(80);
        expect(16 + 2 * max(ZIWEI_PAIR_COPY.LOW) + 15).toBeLessThanOrEqual(80);
    });

    it('different pairs do not read alike', () => {
        const bodies = reports.map((items) =>
            items
                .filter((i) => i.term === '一起時的亮點' || NEW.includes(i.term))
                .map((i) => i.meaning),
        );
        for (let i = 0; i < bodies.length; i++)
            for (let j = i + 1; j < bodies.length; j++)
                expect(bodies[i].filter((t, k) => t === bodies[j][k]).length).toBe(0);
    });

    it('difficult pair gets honest wording in 吵架與冷戰 only', () => {
        const hard = reports[2].find((i) => i.term === '吵架與冷戰')!;
        expect(hard.meaning).toContain('坦白說');
        for (const k of [0, 1]) expect(reports[k].find((i) => i.term === '吵架與冷戰')!.meaning).not.toContain('坦白說');
    });
});
