import { describe, expect, it } from 'vitest';
import { charLen } from '@/lib/astro/meaning';
import * as KB from '@/lib/astro/natalKb';

describe('natal knowledge base', () => {
    it('has 12 entries per sign table and guideline-sized core fields', () => {
        for (const table of [
            KB.SIGN_KB,
            KB.ASC_KB,
            KB.SUN_KB,
            KB.MERCURY_KB,
            KB.MOON_KB,
            KB.MARS_KB,
            KB.VENUS_KB,
            KB.JUPITER_KB,
            KB.SATURN_KB,
            KB.HOUSE_KB,
        ]) {
            expect(table).toHaveLength(12);
        }
        for (const e of KB.SIGN_KB) {
            expect(e.keywords).toHaveLength(3);
            expect(charLen(e.light_side)).toBeLessThanOrEqual(50);
            expect(charLen(e.shadow_side)).toBeLessThanOrEqual(50);
        }
    });

    it('keeps every hook-sized fragment within 20 字', () => {
        const hooks = [
            ...KB.MERCURY_KB.map((e) => e.hook),
            ...KB.VENUS_KB.map((e) => e.hook),
            ...KB.SIGN_KB.map((e) => e.careerHook),
            ...Object.values(KB.BODY_VOICE).flatMap((v) => [v.stressHook, v.mindSoft, v.mindHard]),
            ...KB.ELEMENT_STRESS_HOOK,
        ];
        for (const h of hooks) expect(charLen(h), h).toBeLessThanOrEqual(20);
    });

    it('never stores the same sentence twice', () => {
        const all: string[] = [];
        const walk = (v: unknown) => {
            if (typeof v === 'string') {
                if (charLen(v) > 12) all.push(v);
            } else if (v && typeof v === 'object') Object.values(v).forEach(walk);
        };
        walk(KB);
        const dup = all.filter((s, i) => all.indexOf(s) !== i);
        expect(dup).toEqual([]);
    });
});
