import { expect } from 'vitest';
import { astroMeaningItems, charLen, NATAL_LIMITS, splitSentences } from '@/lib/astro/meaning';
import { NATAL_SECTIONS } from '@/lib/astro/natalWeight';
import type { AstroChart } from '@/lib/astro/types';

const JARGON = [
    '刑',
    '剋',
    '入廟',
    '落陷',
    '容許度',
    '四分',
    '三分',
    '對分',
    '六分',
    '合相',
    '相位',
];
const MAINLAND = ['質量', '信息', '視頻', '軟件', '網絡', '屏幕', '鼠標'];
const SIMPLIFIED = /[这个们说时发对还么样会经过实现关于问题应该给让]/;

/** Asserts the card contract on one report (hook, layout, lengths, wording, no repeats). */
export function expectValidReport(chart: AstroChart) {
    const items = astroMeaningItems(chart);
    expect(items.map((i) => i.term)).toEqual(NATAL_SECTIONS.map((s) => s.title));
    const seen = new Map<string, string>();
    for (const it of items) {
        const text = `${it.hook}\n${it.meaning}`;
        expect(it.field.trim().length, it.term).toBeGreaterThan(0);
        expect(text, it.term).not.toMatch(/undefined|null|NaN/);
        expect(charLen(it.hook!), `${it.term} hook ${it.hook}`).toBeLessThanOrEqual(
            NATAL_LIMITS.hook,
        );
        expect(charLen(it.hook!), it.term).toBeGreaterThan(0);

        const lines = it.meaning.split('\n');
        expect(lines, it.term).toHaveLength(7);
        expect(lines[0]).toBe('【解析】');
        expect(lines[3]).toBe('【生活場景】');
        expect(lines[5]).toBe('【給你的建議】');
        for (const [i, max] of [
            [1, NATAL_LIMITS.paragraph],
            [2, NATAL_LIMITS.paragraph],
            [4, NATAL_LIMITS.scene],
            [6, NATAL_LIMITS.advice],
        ] as const) {
            expect(charLen(lines[i]), `${it.term} line ${i}: ${lines[i]}`).toBeGreaterThan(0);
            expect(charLen(lines[i]), `${it.term} line ${i}: ${lines[i]}`).toBeLessThanOrEqual(max);
        }

        for (const word of [...JARGON, ...MAINLAND])
            expect(text, `${it.term}: ${word}`).not.toContain(word);
        expect(text, it.term).not.toMatch(SIMPLIFIED);
        // No mechanical 「你的太陽在XX，代表…」 concatenation.
        expect(text, it.term).not.toMatch(/你的(太陽|月亮|上升|水星|金星|火星|木星|土星)在|代表/);

        for (const s of splitSentences(lines.filter((l) => !l.startsWith('【')).join('\n'))) {
            expect(seen.get(s), `「${s}」 repeats in ${it.term}`).toBeUndefined();
            seen.set(s, it.term);
        }
    }
    return items;
}
