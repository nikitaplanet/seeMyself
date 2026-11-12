import { describe, expect, it } from 'vitest';
import { computeAstro } from '@/lib/astro/compute';
import { natalReport, REPEAT_ALLOWED, repeatedWord, splitSentences } from '@/lib/astro/meaning';
import { expectValidReport } from './natalHelpers';
import { VARIED_CHARTS } from './natalCharts';

// Distinctiveness across people, over thirty varied real charts: no full sentence (or hook) may
// appear in more than 15% of the reports, and no clause of 10+ characters (split on ，；。 and the
// other sentence punctuation) in more than 30%. Section titles, field labels and 【】 headings are
// excluded.
const MAX_SHARE = 0.15;
const MAX_CLAUSE_SHARE = 0.3;

function reportUnits(chart: ReturnType<typeof computeAstro>) {
    const sentences = new Set<string>();
    const clauses = new Set<string>();
    for (const s of natalReport(chart)) {
        for (const t of [s.hook, ...[...s.insight, s.scene, s.advice].flatMap(splitSentences)]) {
            sentences.add(t);
            for (const c of t.split(/[，；。：、（）「」！？]/)) {
                if ([...c.trim()].length >= 10) clauses.add(c.trim());
            }
        }
    }
    return { sentences, clauses };
}

function maxShare(sets: Set<string>[]): [string, number] {
    const counts = new Map<string, number>();
    for (const set of sets) for (const s of set) counts.set(s, (counts.get(s) ?? 0) + 1);
    return [...counts].sort((a, b) => b[1] - a[1])[0];
}

describe('natal report — distinctiveness across 30 charts', () => {
    const reports = VARIED_CHARTS.map(([name, input, timeUnknown]) => ({
        name,
        chart: computeAstro(input, timeUnknown),
    }));

    it('every report meets the card contract', () => {
        for (const r of reports) expectValidReport(r.chart);
    });

    it(`no sentence appears in more than ${MAX_SHARE * 100}% of reports`, () => {
        const [worst, n] = maxShare(reports.map((r) => reportUnits(r.chart).sentences));
        expect(n / reports.length, `「${worst}」 in ${n}/${reports.length}`).toBeLessThanOrEqual(
            MAX_SHARE,
        );
    });

    it(`no 10+ character clause appears in more than ${MAX_CLAUSE_SHARE * 100}% of reports`, () => {
        const [worst, n] = maxShare(reports.map((r) => reportUnits(r.chart).clauses));
        expect(n / reports.length, `「${worst}」 in ${n}/${reports.length}`).toBeLessThanOrEqual(
            MAX_CLAUSE_SHARE,
        );
    });

    // A sign phrase and an aspect phrase must not bring the same word into one sentence
    // (「責任感替你的踏實加了分，讓你踏實、經得起檢驗」). A word is two adjacent Han characters;
    // the parenthesised chart basis is left out. Exceptions: pairs containing a function
    // character (FUNCTION_CHARS in meaning.ts: pronouns, particles, adverbs such as 你 的 會 也
    // 就 很 不 一 …) are not content words, and REPEAT_ALLOWED lists whole words that may
    // repeat, which is empty.
    it('no sentence uses the same two-character content word twice', () => {
        expect([...REPEAT_ALLOWED]).toEqual([]);
        const INPUT_1990 = {
            date: '1990-05-12',
            time: '14:30',
            timezone: 'Asia/Taipei',
            place: { name: '臺北市', lat: 25.04776, lon: 121.53185, countryCode: 'TW' },
        };
        const all = [...reports, { name: '1990-05-12 臺北', chart: computeAstro(INPUT_1990) }];
        const found: string[] = [];
        for (const r of all) {
            for (const s of natalReport(r.chart)) {
                const texts = [
                    s.hook,
                    ...[...s.insight, s.scene, s.advice].flatMap(splitSentences),
                ];
                for (const t of texts) {
                    const w = repeatedWord(t);
                    if (w) found.push(`${r.name}｜${w}｜${t}`);
                }
            }
        }
        expect(found).toEqual([]);
    });

    it('detects a repeated content word but not repeated function words', () => {
        expect(
            repeatedWord('責任感替你的踏實加了分，讓你踏實、經得起檢驗（太陽與土星的順暢角度）。'),
        ).toBe('踏實');
        expect(repeatedWord('你的想法很多，你的行動也很快。')).toBeNull();
        expect(repeatedWord('你很穩重（土星摩羯、土星摩羯）。')).toBeNull();
    });

    it('two people with the same Sun sign still read differently', () => {
        const bySun = new Map<number, typeof reports>();
        for (const r of reports) {
            const sun = r.chart.bodies.find((b) => b.key === 'sun')!.sign;
            bySun.set(sun, [...(bySun.get(sun) ?? []), r]);
        }
        let pairs = 0;
        for (const group of bySun.values()) {
            for (let i = 1; i < group.length; i++) {
                pairs++;
                const a = natalReport(group[0].chart)[0];
                const b = natalReport(group[i].chart)[0];
                expect(a.hook).not.toBe(b.hook);
                const sa = new Set([...a.insight].flatMap(splitSentences));
                expect([...b.insight].flatMap(splitSentences).filter((s) => sa.has(s))).toEqual([]);
            }
        }
        expect(pairs).toBeGreaterThan(0);
    });
});
