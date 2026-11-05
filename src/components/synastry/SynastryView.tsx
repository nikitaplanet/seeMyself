'use client';

import Link from 'next/link';
import { useId, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import {
    analyzeAstroSynastry,
    astroSynastryItems,
    buildAstroSynastryAiPrompt,
    POINT_NAMES,
    type InterAspect,
} from '@/lib/astro/synastry';
import { formatDegMin } from '@/lib/astro/labels';
import type { AstroChart } from '@/lib/astro/types';
import {
    analyzeBaziSynastry,
    baziSynastryItems,
    BRANCH_RELATION_NAMES,
    buildBaziSynastryAiPrompt,
    PILLAR_NAMES,
} from '@/lib/bazi/synastry';
import { wxColorOf } from '@/lib/bazi/labels';
import type { BaziChart } from '@/lib/bazi/types';
import { CHART_KIND_NAMES_ZH } from '@/lib/charts/mapping';
import {
    AUTHORITY_NAMES_ZH,
    CENTER_NAMES_ZH,
    DEFINITION_NAMES_ZH,
    TYPE_NAMES_ZH,
} from '@/lib/hd/constants';
import {
    analyzeHdSynastry,
    buildHdSynastryAiPrompt,
    channelLabel,
    channelShortMeaning,
    chartGates,
    compositeGraphData,
    hdSynastryItems,
    SYNASTRY_CHANNEL_KIND_FIELD,
    SYNASTRY_CHANNEL_KIND_NAMES_ZH,
    SYNASTRY_CHANNEL_KINDS,
    type HdSynastry,
} from '@/lib/hd/synastry';
import {
    parseStoredSynastry,
    readStoredSynastryRaw,
    subscribeStoredSynastry,
    type SynastryPerson,
} from '@/lib/ui/chartClient';
import { rememberChartsView } from '@/lib/ui/chartsView';
import { displayPalaceName } from '@/lib/ziwei/labels';
import {
    analyzeZiweiSynastry,
    buildZiweiSynastryAiPrompt,
    ziweiSynastryItems,
} from '@/lib/ziwei/synastry';
import type { ZiweiChart } from '@/lib/ziwei/types';
import { AiPromptCard } from '../AiPromptCard';
import { BodyGraph } from '../BodyGraph/BodyGraph';
import { ChartMeaningCard } from '../ChartMeaningCard';
import { TabButton } from '../TabButton';

// /charts/synastry — 雙人合盤. Both people's computed charts arrive through sessionStorage (never
// the URL), written by the 雙人合盤 tab on /charts. Layout and tabs mirror the single result page
// (ChartView); every analysis is pure client-side logic in src/lib/*/synastry.ts.

type Tab = 'hd' | 'ziwei' | 'bazi' | 'astro';

const TABS: Array<[Tab, string]> = [
    ['hd', '人類圖'],
    ['ziwei', '紫微斗數'],
    ['bazi', '八字'],
    ['astro', '星盤'],
];

const serverSnapshot = (): string | null | undefined => undefined;

export function SynastryView() {
    const raw = useSyncExternalStore<string | null | undefined>(
        subscribeStoredSynastry,
        readStoredSynastryRaw,
        serverSnapshot,
    );
    const stored = useMemo(
        () => (raw === undefined ? undefined : parseStoredSynastry(raw)),
        [raw],
    );
    const [tab, setTab] = useState<Tab>('hd');
    const ids = useId();

    if (stored === undefined) return <SynastrySkeleton />;
    if (stored === null) return <EmptyState />;

    const { a, b } = stored;
    const tabId = (t: Tab) => `${ids}-tab-${t}`;
    const panelId = `${ids}-panel`;

    return (
        <div className="flex flex-col gap-6">
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                <h1 className="min-w-0 break-words font-serif text-3xl font-medium tracking-wide">
                    {a.name} × {b.name} 雙人合盤
                </h1>
                <Link
                    href="/charts"
                    onClick={() => rememberChartsView('synastry')}
                    className="text-sm underline hover:text-accent"
                >
                    回命盤列表
                </Link>
            </div>
            <PeopleStrip a={a} b={b} />

            <div role="tablist" aria-label="命盤種類" className="tab-pill w-fit max-w-full">
                {TABS.map(([key, label]) => (
                    <TabButton
                        key={key}
                        id={tabId(key)}
                        controls={panelId}
                        selected={tab === key}
                        onClick={() => setTab(key)}
                    >
                        {label}
                    </TabButton>
                ))}
            </div>

            <div role="tabpanel" id={panelId} aria-labelledby={tabId(tab)}>
                {tab === 'ziwei' ? (
                    <ZiweiTab a={a} b={b} />
                ) : tab === 'bazi' ? (
                    <BaziTab a={a} b={b} />
                ) : tab === 'astro' ? (
                    <AstroTab a={a} b={b} />
                ) : (
                    <HdTab a={a} b={b} />
                )}
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Shared bits
// ---------------------------------------------------------------------------

function TimeUnknownBadge() {
    return (
        <span className="rounded-sm bg-surface-2 px-1.5 py-0.5 text-xs text-muted">
            時間不確定
        </span>
    );
}

function PeopleStrip({ a, b }: { a: SynastryPerson; b: SynastryPerson }) {
    return (
        <ul className="flex flex-wrap gap-2" aria-label="合盤的兩位">
            {[a, b].map((p, i) => (
                <li
                    key={p.id}
                    className="flex min-w-0 items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-sm"
                >
                    <span
                        aria-hidden="true"
                        className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${i === 0 ? 'bg-personality' : 'bg-design'}`}
                    />
                    <span className="break-all font-medium">{p.name}</span>
                    <span className="text-muted">
                        {CHART_KIND_NAMES_ZH[p.kind]} · {p.input.date}
                    </span>
                    {p.timeUnknown ? <TimeUnknownBadge /> : null}
                </li>
            ))}
        </ul>
    );
}

function Note({ children }: { children: ReactNode }) {
    return (
        <p className="rounded-md border border-border bg-surface-2 px-3 py-2 text-sm text-muted">
            {children}
        </p>
    );
}

function Card({ title, children }: { title: string; children: ReactNode }) {
    const id = useId();
    return (
        <section aria-labelledby={id} className="surface-card flex flex-col gap-3 p-4 sm:p-5">
            <h2 id={id} className="text-lg font-semibold">
                {title}
            </h2>
            {children}
        </section>
    );
}

function ReportCard({ items }: { items: Parameters<typeof ChartMeaningCard>[0]['items'] }) {
    return (
        <ChartMeaningCard
            heading="合盤報告書"
            lead="依兩人的排盤資料比對而成；標題旁是欄位含義。這是互動傾向的說明，不是合不合的判決。"
            items={items}
        />
    );
}

/** One person's chart for this system is missing (no gender / API error). */
function Unavailable({
    system,
    people,
}: {
    system: string;
    people: Array<{ person: SynastryPerson; error: string | null; needsGender: boolean }>;
}) {
    return (
        <div role="alert" className="flex flex-col gap-2 rounded-md border border-danger px-4 py-3">
            <p className="font-medium text-danger">無法排出{system}合盤</p>
            <ul className="flex flex-col gap-1 text-sm">
                {people.map(({ person, error, needsGender }) => (
                    <li key={person.id}>
                        {person.name}：
                        {needsGender
                            ? `這份命盤沒有填寫性別，${system}需要性別才能排盤。`
                            : (error ?? `沒有${system}資料。`)}
                    </li>
                ))}
            </ul>
        </div>
    );
}

function missing<T>(
    pairs: Array<[SynastryPerson, T | null, string | null]>,
): Array<{ person: SynastryPerson; error: string | null; needsGender: boolean }> {
    return pairs
        .filter(([, chart]) => !chart)
        .map(([person, , error]) => ({
            person,
            error,
            needsGender: !person.input.gender,
        }));
}

function timeUnknownNames(a: SynastryPerson, b: SynastryPerson): string {
    return [a, b]
        .filter((p) => p.timeUnknown)
        .map((p) => p.name)
        .join('、');
}

// ---------------------------------------------------------------------------
// 人類圖
// ---------------------------------------------------------------------------

function HdTab({ a, b }: { a: SynastryPerson; b: SynastryPerson }) {
    const syn = useMemo(
        () => analyzeHdSynastry(chartGates(a.result), chartGates(b.result)),
        [a.result, b.result],
    );
    const graph = compositeGraphData(a.result, b.result, syn);
    const pa = { name: a.name, chart: a.result };
    const pb = { name: b.name, chart: b.result };
    const unknown = timeUnknownNames(a, b);
    const defined = syn.composite.definedCenters.map((c) => CENTER_NAMES_ZH[c]).join('、');

    return (
        <div className="flex flex-col gap-6">
            {unknown ? (
                <Note>
                    {unknown}的出生時間不確定（以當地 12:00 計算），月亮等移動快的閘門可能不同，合盤通道請保守看待。
                </Note>
            ) : null}
            <div className="grid gap-6 lg:grid-cols-2">
                <div className="flex flex-col gap-6">
                    <HdPairTable a={a} b={b} syn={syn} />
                    <Card title="合盤人體圖">
                        <CompositeLegend a={a.name} b={b.name} />
                        <BodyGraph
                            chart={graph}
                            sideNames={{ personality: a.name, design: b.name }}
                            label={`${a.name}與${b.name}的合盤人體圖：${TYPE_NAMES_ZH[syn.composite.type]}，${defined ? `已定義中心：${defined}` : '沒有已定義中心'}。`}
                        />
                    </Card>
                </div>
                <ChannelGroups syn={syn} a={a} b={b} />
            </div>
            <ReportCard items={hdSynastryItems(pa, pb, syn)} />
            <AiPromptCard
                heading="提供給 AI 的提示詞"
                description="複製後可貼到 ChatGPT、Claude 等，請它依兩人的人類圖做關係解讀。內容含兩人的出生資料。"
                text={buildHdSynastryAiPrompt(
                    { ...pa, timeUnknown: a.timeUnknown },
                    { ...pb, timeUnknown: b.timeUnknown },
                    syn,
                )}
            />
        </div>
    );
}

function HdPairTable({ a, b, syn }: { a: SynastryPerson; b: SynastryPerson; syn: HdSynastry }) {
    const rows: Array<[string, string, string, string]> = [
        [
            '類型',
            TYPE_NAMES_ZH[a.result.type],
            TYPE_NAMES_ZH[b.result.type],
            TYPE_NAMES_ZH[syn.composite.type],
        ],
        ['策略', a.result.strategy, b.result.strategy, syn.composite.strategy],
        [
            '內在權威',
            AUTHORITY_NAMES_ZH[a.result.authority],
            AUTHORITY_NAMES_ZH[b.result.authority],
            AUTHORITY_NAMES_ZH[syn.composite.authority],
        ],
        [
            '人生角色',
            `${a.result.profile.personality}/${a.result.profile.design}`,
            `${b.result.profile.personality}/${b.result.profile.design}`,
            '—',
        ],
        [
            '定義型態',
            DEFINITION_NAMES_ZH[a.result.definition],
            DEFINITION_NAMES_ZH[b.result.definition],
            DEFINITION_NAMES_ZH[syn.composite.definition],
        ],
        [
            '已定義中心',
            `${a.result.definedCenters.length} 個`,
            `${b.result.definedCenters.length} 個`,
            `${syn.composite.definedCenters.length} 個`,
        ],
    ];
    return (
        <Card title="兩人與合盤">
            <div className="overflow-x-auto">
                <table className="w-full min-w-[22rem] border-collapse text-sm">
                    <thead>
                        <tr className="border-b border-border text-left">
                            <th scope="col" className="py-2 pr-3 font-medium text-muted">
                                <span className="sr-only">項目</span>
                            </th>
                            <th scope="col" className="break-all py-2 pr-3 font-semibold">
                                {a.name}
                            </th>
                            <th scope="col" className="break-all py-2 pr-3 font-semibold">
                                {b.name}
                            </th>
                            <th scope="col" className="py-2 font-semibold">
                                合盤
                            </th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                        {rows.map(([label, x, y, z]) => (
                            <tr key={label}>
                                <th scope="row" className="py-2 pr-3 text-left font-normal text-muted">
                                    {label}
                                </th>
                                <td className="py-2 pr-3">{x}</td>
                                <td className="py-2 pr-3">{y}</td>
                                <td className="py-2 font-medium">{z}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            {syn.newCenters.length > 0 ? (
                <p className="text-sm">
                    只有在一起才被定義：
                    <span className="font-medium">
                        {syn.newCenters.map((c) => CENTER_NAMES_ZH[c]).join('、')}
                    </span>
                </p>
            ) : null}
        </Card>
    );
}

function CompositeLegend({ a, b }: { a: string; b: string }) {
    return (
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted" aria-label="圖例">
            <li className="flex items-center gap-1.5">
                <span aria-hidden="true" className="inline-block h-1.5 w-6 bg-personality" />
                {a}
            </li>
            <li className="flex items-center gap-1.5">
                <span aria-hidden="true" className="inline-block h-1.5 w-6 bg-design" />
                {b}
            </li>
            <li className="flex items-center gap-1.5">
                <svg aria-hidden="true" width="24" height="6" className="inline-block">
                    <defs>
                        <pattern
                            id="synastry-legend-both"
                            patternUnits="userSpaceOnUse"
                            width="6"
                            height="6"
                            patternTransform="rotate(45)"
                        >
                            <rect width="3" height="6" style={{ fill: 'var(--hd-personality)' }} />
                            <rect x="3" width="3" height="6" style={{ fill: 'var(--hd-design)' }} />
                        </pattern>
                    </defs>
                    <rect width="24" height="6" fill="url(#synastry-legend-both)" />
                </svg>
                兩人皆有
            </li>
        </ul>
    );
}

function ChannelGroups({
    syn,
    a,
    b,
}: {
    syn: HdSynastry;
    a: SynastryPerson;
    b: SynastryPerson;
}) {
    return (
        <Card title="合盤通道">
            <div className="flex flex-col gap-5">
                {SYNASTRY_CHANNEL_KINDS.map((kind) => {
                    const list = syn.channels.filter((c) => c.kind === kind);
                    return (
                        <div key={kind} className="flex flex-col gap-1.5">
                            <h3 className="font-medium">
                                {SYNASTRY_CHANNEL_KIND_NAMES_ZH[kind]}{' '}
                                <span className="text-sm font-normal text-muted">
                                    ({list.length})
                                </span>
                            </h3>
                            <p className="text-sm text-muted">{SYNASTRY_CHANNEL_KIND_FIELD[kind]}</p>
                            {list.length === 0 ? (
                                <p className="text-sm text-muted">（無）</p>
                            ) : (
                                <ul className="flex flex-col divide-y divide-border">
                                    {list.map((c) => (
                                        <li key={c.channel.id} className="flex flex-col gap-0.5 py-2">
                                            <div className="flex flex-wrap items-baseline gap-x-3">
                                                <span className="font-semibold tabular-nums">
                                                    {channelLabel(c.channel)}
                                                </span>
                                                <span className="text-sm text-muted">
                                                    {CENTER_NAMES_ZH[c.channel.centers[0]]} —{' '}
                                                    {CENTER_NAMES_ZH[c.channel.centers[1]]}
                                                </span>
                                            </div>
                                            <p className="text-sm">
                                                {c.kind === 'electromagnetic' ? (
                                                    <>
                                                        <span className="text-personality">
                                                            {a.name} {c.gateA}
                                                        </span>
                                                        {' × '}
                                                        <span className="text-design">
                                                            {b.name} {c.gateB}
                                                        </span>
                                                    </>
                                                ) : c.holder ? (
                                                    <span
                                                        className={
                                                            c.holder === 'a'
                                                                ? 'text-personality'
                                                                : 'text-design'
                                                        }
                                                    >
                                                        {c.holder === 'a' ? a.name : b.name}擁有
                                                    </span>
                                                ) : (
                                                    '兩人皆有'
                                                )}
                                                <span className="text-muted">
                                                    {' · '}
                                                    {channelShortMeaning(c.channel.id)}
                                                </span>
                                            </p>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    );
                })}
            </div>
        </Card>
    );
}

// ---------------------------------------------------------------------------
// 紫微斗數
// ---------------------------------------------------------------------------

function ZiweiTab({ a, b }: { a: SynastryPerson; b: SynastryPerson }) {
    if (!a.ziwei || !b.ziwei) {
        return (
            <Unavailable
                system="紫微斗數"
                people={missing([
                    [a, a.ziwei, a.ziweiError],
                    [b, b.ziwei, b.ziweiError],
                ])}
            />
        );
    }
    return <ZiweiPanel a={a} b={b} za={a.ziwei} zb={b.ziwei} />;
}

function ZiweiPanel({
    a,
    b,
    za,
    zb,
}: {
    a: SynastryPerson;
    b: SynastryPerson;
    za: ZiweiChart;
    zb: ZiweiChart;
}) {
    const syn = useMemo(() => analyzeZiweiSynastry(za, zb), [za, zb]);
    const pa = { name: a.name, chart: za, timeUnknown: a.timeUnknown };
    const pb = { name: b.name, chart: zb, timeUnknown: b.timeUnknown };
    const unknown = timeUnknownNames(a, b);
    return (
        <div className="flex flex-col gap-6">
            {unknown ? (
                <Note>
                    {unknown}的出生時間不確定，紫微先以午時排盤；時辰一改，命宮與各星落宮都會不同，宮位對照僅供參考。
                </Note>
            ) : null}
            <div className="grid gap-6 md:grid-cols-2">
                <ZiweiPersonCard name={a.name} chart={za} dot="bg-personality" />
                <ZiweiPersonCard name={b.name} chart={zb} dot="bg-design" />
            </div>
            <Card title="四化互飛">
                <p className="text-sm text-muted">
                    一人的生年四化星落在另一人盤中的宮位。★ 為命宮、夫妻宮、交友宮、福德宮。
                </p>
                <ul className="flex flex-col divide-y divide-border">
                    {syn.flights.map((f) => {
                        const [from, to] = f.from === 'a' ? [a.name, b.name] : [b.name, a.name];
                        return (
                            <li
                                key={`${f.from}-${f.mutagen}-${f.star}`}
                                className="flex flex-wrap items-baseline gap-x-2 py-2 text-sm"
                            >
                                <span
                                    className={f.from === 'a' ? 'text-personality' : 'text-design'}
                                >
                                    {from}
                                </span>
                                <span className={`font-medium ${MUTAGEN_CLASS[f.mutagen] ?? ''}`}>
                                    {f.star}化{f.mutagen}
                                </span>
                                <span aria-hidden="true" className="text-muted">
                                    →
                                </span>
                                <span>
                                    {to}的{f.palace ? displayPalaceName(f.palace) : '（盤上無此星）'}
                                </span>
                                {f.key ? (
                                    <span className="text-accent" aria-label="關係宮位">
                                        ★
                                    </span>
                                ) : null}
                            </li>
                        );
                    })}
                </ul>
            </Card>
            <ReportCard items={ziweiSynastryItems(pa, pb, syn)} />
            <AiPromptCard
                heading="提供給 AI 的提示詞"
                description="複製後可貼到 ChatGPT、Claude 等，請它依兩人的紫微斗數命盤做合盤解讀。內容含兩人的出生資料。"
                text={buildZiweiSynastryAiPrompt(pa, pb, syn)}
            />
        </div>
    );
}

const MUTAGEN_CLASS: Record<string, string> = {
    祿: 'ziwei-lu',
    權: 'ziwei-quan',
    科: 'ziwei-ke',
    忌: 'ziwei-ji',
};

function ZiweiPersonCard({ name, chart, dot }: { name: string; chart: ZiweiChart; dot: string }) {
    const soul = chart.palaces.find((p) => p.isSoulPalace);
    const body = chart.palaces.find((p) => p.isBodyPalace);
    const rows: Array<[string, ReactNode]> = [
        [
            '命宮',
            soul
                ? `${soul.heavenlyStem}${soul.earthlyBranch}・${soul.majorStars.map((s) => `${s.name}${s.mutagen ? `化${s.mutagen}` : ''}`).join('、') || '空宮'}`
                : '—',
        ],
        ['身宮', body ? displayPalaceName(body.name) : '—'],
        ['五行局', chart.fiveElementsLabel],
        ['命主／身主', `${chart.soul}／${chart.body}`],
        [
            '生年四化',
            chart.mutagens.map((m) => (
                <span key={m.mutagen} className={`mr-2 ${MUTAGEN_CLASS[m.mutagen] ?? ''}`}>
                    {m.star}化{m.mutagen}
                </span>
            )),
        ],
    ];
    return (
        <PersonCard name={name} dot={dot}>
            <dl className="grid grid-cols-[5.5rem_1fr] gap-x-3 gap-y-2 text-sm">
                {rows.map(([k, v]) => (
                    <div key={k} className="contents">
                        <dt className="text-muted">{k}</dt>
                        <dd>{v}</dd>
                    </div>
                ))}
            </dl>
        </PersonCard>
    );
}

function PersonCard({ name, dot, children }: { name: string; dot: string; children: ReactNode }) {
    const id = useId();
    return (
        <section aria-labelledby={id} className="surface-card flex min-w-0 flex-col gap-3 p-4 sm:p-5">
            <h2 id={id} className="flex items-center gap-2 text-lg font-semibold">
                <span aria-hidden="true" className={`inline-block h-2.5 w-2.5 rounded-full ${dot}`} />
                <span className="break-all">{name}</span>
            </h2>
            {children}
        </section>
    );
}

// ---------------------------------------------------------------------------
// 八字
// ---------------------------------------------------------------------------

function BaziTab({ a, b }: { a: SynastryPerson; b: SynastryPerson }) {
    if (!a.bazi || !b.bazi) {
        return (
            <Unavailable
                system="八字"
                people={missing([
                    [a, a.bazi, a.baziError],
                    [b, b.bazi, b.baziError],
                ])}
            />
        );
    }
    return <BaziPanel a={a} b={b} ba={a.bazi} bb={b.bazi} />;
}

function BaziPanel({
    a,
    b,
    ba,
    bb,
}: {
    a: SynastryPerson;
    b: SynastryPerson;
    ba: BaziChart;
    bb: BaziChart;
}) {
    const syn = useMemo(() => analyzeBaziSynastry(ba, bb), [ba, bb]);
    const pa = { name: a.name, chart: ba };
    const pb = { name: b.name, chart: bb };
    const unknown = timeUnknownNames(a, b);
    return (
        <div className="flex flex-col gap-6">
            {unknown ? (
                <Note>
                    {unknown}的出生時間不確定，八字先以午時排盤，時柱不列入合盤比對。
                </Note>
            ) : null}
            <div className="grid gap-6 md:grid-cols-2">
                <BaziPersonCard name={a.name} chart={ba} dot="bg-personality" />
                <BaziPersonCard name={b.name} chart={bb} dot="bg-design" />
            </div>
            <Card title="地支互動">
                <p className="text-sm">
                    日主 {syn.dayGanA} × {syn.dayGanB}：對{a.name}而言{b.name}是「
                    {syn.tenGodBForA}」，對{b.name}而言{a.name}是「{syn.tenGodAForB}」。
                </p>
                {syn.branchPairs.length === 0 ? (
                    <p className="text-sm text-muted">兩盤地支之間沒有明顯的合沖刑害。</p>
                ) : (
                    <ul className="flex flex-col divide-y divide-border">
                        {syn.branchPairs.map((p) => (
                            <li
                                key={`${p.pillarA}-${p.pillarB}`}
                                className="flex flex-wrap items-baseline gap-x-3 py-2 text-sm"
                            >
                                <span>
                                    <span className="text-personality">
                                        {a.name}
                                        {PILLAR_NAMES[p.pillarA]}
                                    </span>{' '}
                                    {p.zhiA} ×{' '}
                                    <span className="text-design">
                                        {b.name}
                                        {PILLAR_NAMES[p.pillarB]}
                                    </span>{' '}
                                    {p.zhiB}
                                </span>
                                <span className="font-medium">
                                    {p.relations
                                        .map((r) =>
                                            r.kind === 'banHe'
                                                ? `半合（${r.wx}局）`
                                                : BRANCH_RELATION_NAMES[r.kind],
                                        )
                                        .join('、')}
                                </span>
                                {p === syn.dayPair ? (
                                    <span className="text-xs text-muted">夫妻宮</span>
                                ) : p === syn.yearPair ? (
                                    <span className="text-xs text-muted">生肖</span>
                                ) : null}
                            </li>
                        ))}
                    </ul>
                )}
                {syn.sanHe.length > 0 ? (
                    <p className="text-sm">
                        兩盤合成三合：{syn.sanHe.map((wx) => `${wx}局`).join('、')}
                    </p>
                ) : null}
            </Card>
            <ReportCard items={baziSynastryItems(pa, pb, syn)} />
            <AiPromptCard
                heading="提供給 AI 的提示詞"
                description="複製後可貼到 ChatGPT、Claude 等，請它依兩人的八字做合盤解讀。內容含兩人的出生資料。"
                text={buildBaziSynastryAiPrompt(pa, pb, syn)}
            />
        </div>
    );
}

function BaziPersonCard({ name, chart, dot }: { name: string; chart: BaziChart; dot: string }) {
    return (
        <PersonCard name={name} dot={dot}>
            <table className="w-full border-collapse text-center text-sm">
                <thead>
                    <tr className="bg-surface-2">
                        {chart.pillars.map((p) => (
                            <th key={p.key} scope="col" className="border border-border px-1 py-1.5 font-medium">
                                {p.label}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {(['gan', 'zhi'] as const).map((row) => (
                        <tr key={row}>
                            {chart.pillars.map((p) => {
                                const dim = chart.timeUnknown && p.key === 'time';
                                return (
                                    <td
                                        key={p.key}
                                        className={`border border-border px-1 py-1.5 text-2xl font-bold ${dim ? 'opacity-40' : ''}`}
                                        style={{ color: wxColorOf(p[row]) }}
                                    >
                                        {p[row]}
                                    </td>
                                );
                            })}
                        </tr>
                    ))}
                </tbody>
            </table>
            <p className="text-sm text-muted">
                日主 {chart.dayMaster}（{chart.strength}）· 生肖 {chart.shengXiao} · 喜用{' '}
                {chart.xiShen}／{chart.yongShen}
            </p>
        </PersonCard>
    );
}

// ---------------------------------------------------------------------------
// 星盤
// ---------------------------------------------------------------------------

function AstroTab({ a, b }: { a: SynastryPerson; b: SynastryPerson }) {
    if (!a.astro || !b.astro) {
        return (
            <Unavailable
                system="星盤"
                people={missing([
                    [a, a.astro, a.astroError],
                    [b, b.astro, b.astroError],
                ]).map((m) => ({ ...m, needsGender: false }))}
            />
        );
    }
    return <AstroPanel a={a} b={b} ca={a.astro} cb={b.astro} />;
}

function AstroPanel({
    a,
    b,
    ca,
    cb,
}: {
    a: SynastryPerson;
    b: SynastryPerson;
    ca: AstroChart;
    cb: AstroChart;
}) {
    const syn = useMemo(() => analyzeAstroSynastry(ca, cb), [ca, cb]);
    const pa = { name: a.name, chart: ca };
    const pb = { name: b.name, chart: cb };
    const unknown = timeUnknownNames(a, b);
    const key = syn.aspects.filter((x) => x.key);
    const rest = syn.aspects.filter((x) => !x.key);
    return (
        <div className="flex flex-col gap-6">
            {unknown ? (
                <Note>
                    {unknown}的出生時間不確定：月亮可能偏差約 ±7°，也沒有上升與宮位，這些都不列入比對。
                </Note>
            ) : null}
            <div className="grid gap-6 md:grid-cols-2">
                <AstroPersonCard name={a.name} chart={ca} dot="bg-personality" />
                <AstroPersonCard name={b.name} chart={cb} dot="bg-design" />
            </div>
            <Card title="比對相位">
                <p className="text-sm text-muted">
                    容許度：太陽／月亮 8°、行星 6°、交點／凱龍／上升 3°（取兩者較大者）；外行星彼此之間的同世代相位不列。
                </p>
                <AspectTable aspects={key} a={a.name} b={b.name} caption="重點相位" />
                {rest.length > 0 ? (
                    <details className="group">
                        <summary className="cursor-pointer text-sm underline hover:text-accent">
                            其他相位（{rest.length} 組）
                        </summary>
                        <div className="pt-3">
                            <AspectTable aspects={rest} a={a.name} b={b.name} caption="其他相位" />
                        </div>
                    </details>
                ) : null}
            </Card>
            <ReportCard items={astroSynastryItems(pa, pb, syn)} />
            <AiPromptCard
                heading="提供給 AI 的提示詞"
                description="複製後可貼到 ChatGPT、Claude 等，請它依兩人的星盤做比對解讀。內容含兩人的出生資料。"
                text={buildAstroSynastryAiPrompt(pa, pb, syn)}
            />
        </div>
    );
}

function AstroPersonCard({
    name,
    chart,
    dot,
}: {
    name: string;
    chart: AstroChart;
    dot: string;
}) {
    const pick = (k: string) => chart.bodies.find((x) => x.key === k);
    const sun = pick('sun');
    const moon = pick('moon');
    const venus = pick('venus');
    const mars = pick('mars');
    const pos = (x?: { signName: string; degree: number; minute: number }) =>
        x ? `${x.signName} ${formatDegMin(x.degree, x.minute)}` : '—';
    const rows: Array<[string, string]> = [
        ['太陽', pos(sun)],
        ['月亮', chart.timeUnknown ? `${pos(moon)}（時間不確定）` : pos(moon)],
        ['上升', chart.angles && !chart.timeUnknown ? pos(chart.angles.asc) : '—'],
        ['金星', pos(venus)],
        ['火星', pos(mars)],
    ];
    return (
        <PersonCard name={name} dot={dot}>
            <dl className="grid grid-cols-[4rem_1fr] gap-x-3 gap-y-2 text-sm">
                {rows.map(([k, v]) => (
                    <div key={k} className="contents">
                        <dt className="text-muted">{k}</dt>
                        <dd>{v}</dd>
                    </div>
                ))}
            </dl>
        </PersonCard>
    );
}

function AspectTable({
    aspects,
    a,
    b,
    caption,
}: {
    aspects: InterAspect[];
    a: string;
    b: string;
    caption: string;
}) {
    if (aspects.length === 0) {
        return <p className="text-sm text-muted">重點組合之間沒有形成主要相位。</p>;
    }
    return (
        <div className="overflow-x-auto">
            <table className="w-full min-w-[20rem] border-collapse text-sm">
                <caption className="sr-only">{caption}</caption>
                <thead>
                    <tr className="border-b border-border text-left">
                        <th scope="col" className="break-all py-2 pr-3 font-semibold text-personality">
                            {a}
                        </th>
                        <th scope="col" className="py-2 pr-3 font-medium text-muted">
                            相位
                        </th>
                        <th scope="col" className="break-all py-2 pr-3 font-semibold text-design">
                            {b}
                        </th>
                        <th scope="col" className="py-2 text-right font-medium text-muted">
                            容許度
                        </th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-border">
                    {aspects.map((x) => (
                        <tr key={`${x.a}-${x.b}`}>
                            <td className="py-2 pr-3">{POINT_NAMES[x.a]}</td>
                            <td className="py-2 pr-3 font-medium">{x.name}</td>
                            <td className="py-2 pr-3">{POINT_NAMES[x.b]}</td>
                            <td className="py-2 text-right tabular-nums">{x.orb.toFixed(1)}°</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Empty / loading
// ---------------------------------------------------------------------------

function EmptyState() {
    return (
        <div className="surface-card mx-auto flex max-w-xl flex-col items-center gap-6 p-8 text-center">
            <div className="flex flex-col items-center gap-3">
                <h1 className="font-serif text-2xl font-medium">目前沒有合盤資料</h1>
                <p className="text-muted">
                    為了保護隱私，合盤結果只暫存在原本的瀏覽器分頁中；關閉分頁或直接開啟這個網址時，就不會有資料。請到命盤列表的「雙人合盤」選擇兩份命盤。
                </p>
            </div>
            <Link
                href="/charts"
                onClick={() => rememberChartsView('synastry')}
                className="btn-primary px-6 py-2.5 text-sm"
            >
                選擇兩份命盤
            </Link>
        </div>
    );
}

function SynastrySkeleton() {
    const block = 'hd-skeleton rounded-lg bg-surface-2';
    return (
        <div aria-busy="true" aria-live="polite" className="flex flex-col gap-6">
            <p className="sr-only">正在載入合盤結果…</p>
            <div className={`${block} h-8 w-56`} />
            <div className={`${block} h-8 w-72`} />
            <div className="grid gap-6 lg:grid-cols-2">
                <div className="flex flex-col gap-6">
                    <div className={`${block} h-56`} />
                    <div className={`${block} mx-auto aspect-[400/640] w-full max-w-[480px]`} />
                </div>
                <div className={`${block} h-96`} />
            </div>
        </div>
    );
}
