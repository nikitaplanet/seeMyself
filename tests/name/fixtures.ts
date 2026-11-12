import type { Grid, GridKey, NameAnalysis, NameChar, Wuxing, Zodiac } from '@/lib/name/types';

// 手工組的 NameAnalysis：五格依 spec §3A 的公式由筆畫算出，不依賴 analyze.ts。

export type CharSpec = [char: string, strokes: number, wuxing: Wuxing, roots: string[]];

const WX: Wuxing[] = ['水', '木', '木', '火', '火', '土', '土', '金', '金', '水'];

function gridOf(key: GridKey, strokes: number): Grid {
    let n = strokes;
    while (n > 81) n -= 80;
    return { key, strokes, number: n, wuxing: WX[strokes % 10] };
}

export function makeAnalysis(
    surname: CharSpec[],
    given: CharSpec[],
    zodiac?: Zodiac,
): NameAnalysis {
    const s: NameChar[] = surname.map(([char, strokes, wuxing, roots]) => ({
        char,
        strokes,
        wuxing,
        roots,
        position: 'surname',
    }));
    const g: NameChar[] = given.map(([char, strokes, wuxing, roots], i) => ({
        char,
        strokes,
        wuxing,
        roots,
        position: i === 0 ? 'given1' : 'given2',
    }));
    const sum = (cs: NameChar[]) => cs.reduce((t, c) => t + c.strokes, 0);
    const tian = s.length === 1 ? s[0].strokes + 1 : sum(s);
    const ren = s[s.length - 1].strokes + g[0].strokes;
    const di = g.length === 1 ? g[0].strokes + 1 : sum(g);
    const zong = sum(s) + sum(g);
    const wai = s.length === 1 && g.length === 1 ? 2 : zong - ren + 1;
    const grids = {
        tian: gridOf('tian', tian),
        ren: gridOf('ren', ren),
        di: gridOf('di', di),
        wai: gridOf('wai', wai),
        zong: gridOf('zong', zong),
    };
    return {
        surname: s,
        given: g,
        grids,
        sancai: [grids.tian.wuxing, grids.ren.wuxing, grids.di.wuxing],
        ...(zodiac ? { zodiac } : {}),
    };
}

const SURNAMES: CharSpec[] = [
    ['王', 4, '土', ['王']],
    ['林', 8, '木', ['木']],
    ['陳', 16, '火', ['阜', '東', '木', '日']],
    ['張', 11, '火', ['弓', '長']],
    ['李', 7, '木', ['木', '子']],
    ['黃', 12, '土', ['田', '艸']],
    ['吳', 7, '木', ['口', '大']],
    ['劉', 15, '火', ['卯', '金', '刀']],
    ['蔡', 17, '木', ['艸', '示']],
    ['楊', 13, '木', ['木', '日']],
];

const GIVEN: CharSpec[] = [
    ['怡', 9, '土', ['心', '口']],
    ['君', 7, '木', ['君', '口']],
    ['雅', 12, '木', ['隹', '牙']],
    ['婷', 12, '火', ['女', '亭', '口']],
    ['志', 7, '火', ['士', '心']],
    ['明', 8, '火', ['日', '月']],
    ['家', 10, '木', ['宀', '豕']],
    ['豪', 14, '水', ['豕', '口', '冖']],
    ['淑', 12, '水', ['水', '又', '小']],
    ['芬', 10, '木', ['艸', '八', '刀']],
    ['俊', 9, '火', ['人', '夂']],
    ['宏', 7, '水', ['宀', '厶']],
    ['琳', 13, '木', ['玉', '木']],
    ['山', 3, '土', ['山']],
    ['馬', 10, '水', ['馬']],
    ['一', 1, '土', []],
    ['麗', 19, '火', ['鹿']],
    ['穎', 16, '木', ['禾', '頁']],
    ['德', 15, '火', ['彳', '心', '目']],
    ['龍', 16, '火', ['龍']],
];

const ZODIACS: Zodiac[] = ['鼠', '牛', '虎', '兔', '龍', '蛇', '馬', '羊', '猴', '雞', '狗', '豬'];

export interface Fixture {
    name: string;
    analysis: NameAnalysis;
}

const nameOf = (a: NameAnalysis) => [...a.surname, ...a.given].map((c) => c.char).join('');

/** 單姓雙名的展開：10 姓 × 名一 × 名二，生肖輪流（每三個有一個沒有生肖）。 */
export function spreadFixtures(): Fixture[] {
    const out: Fixture[] = [];
    let i = 0;
    for (const s of SURNAMES)
        for (let j = 0; j < GIVEN.length; j += 1) {
            const g1 = GIVEN[(j * 3 + i) % GIVEN.length];
            const g2 = GIVEN[(j * 7 + 5 + i) % GIVEN.length];
            const zodiac = i % 7 === 6 ? undefined : ZODIACS[i % 12];
            const single = i % 5 === 4;
            const analysis = makeAnalysis([s], single ? [g1] : [g1, g2], zodiac);
            out.push({ name: nameOf(analysis), analysis });
            i += 1;
        }
    // 複姓（雙名、單名）
    const compound: CharSpec[][] = [
        [
            ['歐', 15, '土', ['區', '欠']],
            ['陽', 17, '土', ['阜', '日']],
        ],
        [
            ['司', 5, '金', ['口']],
            ['馬', 10, '水', ['馬']],
        ],
    ];
    compound.forEach((s, k) => {
        for (const given of [[GIVEN[k], GIVEN[k + 6]], [GIVEN[k + 9]]]) {
            const analysis = makeAnalysis(s, given, k ? '馬' : undefined);
            out.push({ name: nameOf(analysis), analysis });
        }
    });
    // 單姓單名（外格固定 2、人格與總格同數）
    for (const [s, g, z] of [
        [SURNAMES[0], GIVEN[5], '虎'],
        [SURNAMES[3], GIVEN[15], undefined],
        [SURNAMES[7], GIVEN[13], '雞'],
    ] as [CharSpec, CharSpec, Zodiac | undefined][]) {
        const analysis = makeAnalysis([s], [g], z);
        out.push({ name: nameOf(analysis), analysis });
    }
    return out;
}
