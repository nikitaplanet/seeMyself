import { describe, expect, it } from 'vitest';
import { computeAstro } from '@/lib/astro/compute';
import { natalReport, splitSentences } from '@/lib/astro/meaning';
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
