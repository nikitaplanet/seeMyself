'use client';

import { CHANG_SHENG_COLOR, WX_CARD_BG, WX_COLOR, wxColorOf } from '@/lib/bazi/labels';
import { buildBaziAiPrompt } from '@/lib/bazi/prompt';
import type { BaziChart, BaziPillar } from '@/lib/bazi/types';
import { AiPromptCard } from '../AiPromptCard';
import { BaziMeaningCard } from '../ChartMeaningCard';

export function BaziView({
    chart,
    timeUnknown,
    error,
}: {
    chart: BaziChart | null | undefined;
    timeUnknown: boolean;
    error?: string | null;
}) {
    if (error && !chart) {
        return (
            <p role="alert" className="rounded-md border border-danger px-3 py-2 text-danger">
                {error}
            </p>
        );
    }
    if (!chart) {
        return (
            <p className="rounded-md border border-border bg-surface px-4 py-6 text-muted">
                這份資料沒有八字命盤。請回到輸入頁選擇性別後重新排盤。
            </p>
        );
    }
    return (
        <div className="flex flex-col gap-6">
            {timeUnknown ? (
                <p className="rounded-md border border-border bg-surface-2 px-3 py-2 text-sm text-muted">
                    出生時間不確定，八字先以午時（11:00～12:59）排盤；時辰一改，四柱與大運會整盤重排。
                </p>
            ) : null}
            {error ? (
                <p role="alert" className="rounded-md border border-danger px-3 py-2 text-danger">
                    {error}
                </p>
            ) : null}
            <BasicInfo chart={chart} />
            <PillarTable chart={chart} />
            <DaYunTable chart={chart} />
            <WuXingPanel chart={chart} />
            <YongShenPanel chart={chart} />
            <ChengguPanel chart={chart} />
            <BaziMeaningCard chart={chart} />
            <AiPromptCard
                heading="提供給 AI 的提示詞"
                description="複製後可貼到 ChatGPT、Claude 等，請它依這份八字命盤做解讀。內容含出生資料。"
                text={buildBaziAiPrompt(chart)}
            />
        </div>
    );
}

const BAZI_NOTE = '#fbf3d5';
const BAZI_TIAO = '#efe6f4';
const BAZI_XI = '#e7f3ea';
const BAZI_YONG = '#e4eef8';
const BAZI_JI = '#f8eaea';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <section className="surface-card overflow-hidden">
            <h2 className="bg-accent px-4 py-2.5 font-serif text-sm font-medium tracking-wide text-accent-fg">
                {title}
            </h2>
            <div className="flex flex-col gap-3 p-4 sm:p-5">{children}</div>
        </section>
    );
}

function BasicInfo({ chart }: { chart: BaziChart }) {
    const pairs: [string, string, boolean?][] = [
        ['坤造', chart.gender === 'female' ? '女' : '男'],
        ['陰陽', chart.yinYang, true],
        ['生肖', chart.shengXiao],
        ['星座', chart.xingZuo],
        ['節氣', chart.jieQi],
        ['季節', chart.season],
        ['日主', chart.dayMaster],
        ['司令', chart.siLing],
        ['命格', chart.geJu],
        ['強弱', chart.strength],
        ['旺衰', chart.wangShuai],
        ['骨重', `${chart.boneLiang}兩${chart.boneQian}錢`],
        ['命宮', chart.mingGong, true],
        ['身宮', chart.shenGong],
        ['胎元', chart.taiYuan],
        ['胎息', chart.taiXi],
    ];
    if (chart.gender === 'male') pairs[0] = ['乾造', '男'];
    return (
        <Section title="基本資訊">
            <dl className="grid grid-cols-1 overflow-hidden rounded-md border border-border sm:grid-cols-2 lg:grid-cols-4">
                <div className="flex flex-col gap-0.5 border-b border-border px-3 py-2.5 sm:col-span-2 lg:col-span-4">
                    <dt className="text-xs text-muted">公曆</dt>
                    <dd className="font-medium">{chart.solarLabel}</dd>
                </div>
                <div className="flex flex-col gap-0.5 border-b border-border px-3 py-2.5 sm:col-span-2 lg:col-span-4">
                    <dt className="text-xs text-muted">農曆</dt>
                    <dd className="font-medium">{chart.lunarLabel}</dd>
                </div>
                {pairs.map(([label, value, accent]) => (
                    <div
                        key={label}
                        className="flex flex-col gap-0.5 border-b border-border px-3 py-2.5 last:border-b-0 sm:odd:border-r lg:border-r lg:[&:nth-child(4n)]:border-r-0"
                    >
                        <dt className="text-xs text-muted">{label}</dt>
                        <dd className={`font-medium ${accent ? 'text-danger' : ''}`}>{value}</dd>
                    </div>
                ))}
            </dl>
            <p
                className="flex flex-col gap-1 rounded-md px-3 py-2 text-sm sm:flex-row sm:flex-wrap sm:items-baseline sm:justify-between"
                style={{ background: BAZI_NOTE }}
            >
                <span>起運時間：{chart.yunStartLabel}</span>
                <span className="text-muted">起運說明：{chart.yunStartNote}</span>
            </p>
        </Section>
    );
}

function PillarTable({ chart }: { chart: BaziChart }) {
    const rows: {
        label: string;
        cell: (p: BaziPillar) => React.ReactNode;
    }[] = [
        { label: '主星', cell: (p) => p.ganTenGod },
        {
            label: '天干',
            cell: (p) => (
                <span className="text-2xl font-bold" style={{ color: wxColorOf(p.gan) }}>
                    {p.gan}
                </span>
            ),
        },
        {
            label: '地支',
            cell: (p) => (
                <span className="text-2xl font-bold" style={{ color: wxColorOf(p.zhi) }}>
                    {p.zhi}
                </span>
            ),
        },
        {
            label: '藏干',
            cell: (p) => (
                <span className="block text-xs leading-5">
                    {p.hidden.map((h) => (
                        <span key={`${h.gan}${h.tenGod}`} className="block">
                            ({h.gan}){h.tenGod}
                        </span>
                    ))}
                </span>
            ),
        },
        { label: '地勢', cell: (p) => p.diShi },
        {
            label: '自坐',
            cell: (p) => <span style={{ color: CHANG_SHENG_COLOR[p.ziZuo] }}>{p.ziZuo}</span>,
        },
        { label: '空亡', cell: (p) => p.xunKong },
        { label: '納音', cell: (p) => p.naYin },
        {
            label: '神煞',
            cell: (p) => (
                <span className="block text-xs leading-5">
                    {p.shensha.map((s) => (
                        <span key={s} className="block">
                            {s}
                        </span>
                    ))}
                </span>
            ),
        },
    ];
    return (
        <Section title="八字四柱">
            <div className="overflow-x-auto">
                <table className="w-full min-w-[36rem] border-collapse text-center text-sm">
                    <thead>
                        <tr className="bg-surface-2">
                            <th className="border border-border px-2 py-2 font-medium">
                                {chart.gender === 'female' ? '坤造' : '乾造'}
                            </th>
                            {chart.pillars.map((p) => (
                                <th
                                    key={p.key}
                                    className="border border-border px-2 py-2 font-medium"
                                >
                                    {p.label}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((row) => (
                            <tr key={row.label}>
                                <th className="border border-border bg-surface-2 px-2 py-2 text-left font-medium">
                                    {row.label}
                                </th>
                                {chart.pillars.map((p) => (
                                    <td key={p.key} className="border border-border px-2 py-2">
                                        {row.cell(p)}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            {chart.stemNotes || chart.branchNotes ? (
                <p className="rounded-md px-3 py-2 text-sm" style={{ background: BAZI_NOTE }}>
                    {chart.stemNotes}
                    {chart.stemNotes && chart.branchNotes ? ' ' : ''}
                    {chart.branchNotes}
                </p>
            ) : null}
        </Section>
    );
}

function DaYunTable({ chart }: { chart: BaziChart }) {
    const cols = chart.daYun;
    const yearRows = Math.max(0, ...cols.map((d) => d.years.length));
    return (
        <Section title="大運・流年">
            <div className="overflow-x-auto">
                <table className="w-full min-w-[52rem] border-collapse text-center text-sm">
                    <thead>
                        <tr>
                            <th className="border border-border bg-surface-2 px-2 py-2 font-medium">
                                {' '}
                            </th>
                            {cols.map((d) => (
                                <th
                                    key={d.ganZhi}
                                    className="border border-border px-2 py-2 font-medium"
                                    style={{ color: wxColorOf(d.gan) }}
                                >
                                    {d.tenGod}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <th className="border border-border bg-surface-2 px-2 py-2 font-medium">
                                大運
                            </th>
                            {cols.map((d) => (
                                <td
                                    key={d.ganZhi}
                                    className="border border-border px-2 py-2 text-base font-semibold"
                                >
                                    <span style={{ color: wxColorOf(d.gan) }}>{d.gan}</span>
                                    <span style={{ color: wxColorOf(d.zhi) }}>{d.zhi}</span>
                                </td>
                            ))}
                        </tr>
                        <tr>
                            <th className="border border-border bg-surface-2 px-2 py-2 font-medium">
                                地勢
                            </th>
                            {cols.map((d) => (
                                <td key={d.ganZhi} className="border border-border px-2 py-2">
                                    {d.diShi}
                                </td>
                            ))}
                        </tr>
                        <tr>
                            <th className="border border-border bg-surface-2 px-2 py-2 font-medium">
                                年齡
                            </th>
                            {cols.map((d) => (
                                <td
                                    key={d.ganZhi}
                                    className="border border-border px-2 py-2 tabular-nums"
                                >
                                    {d.startAge}
                                </td>
                            ))}
                        </tr>
                        <tr>
                            <th className="border border-border bg-surface-2 px-2 py-2 font-medium">
                                起止
                            </th>
                            {cols.map((d) => (
                                <td
                                    key={d.ganZhi}
                                    className="border border-border px-2 py-1 text-xs tabular-nums"
                                >
                                    {d.startYear}-{d.endYear}
                                </td>
                            ))}
                        </tr>
                        {Array.from({ length: yearRows }, (_, i) => (
                            <tr key={i}>
                                <th className="border border-border bg-surface-2 px-2 py-2 font-medium">
                                    第{i + 1}年
                                </th>
                                {cols.map((d) => {
                                    const y = d.years[i];
                                    return (
                                        <td
                                            key={d.ganZhi}
                                            className="border border-border px-2 py-2"
                                        >
                                            {y ? (
                                                <>
                                                    <span style={{ color: wxColorOf(y.ganZhi[0]) }}>
                                                        {y.ganZhi[0]}
                                                    </span>
                                                    <span style={{ color: wxColorOf(y.ganZhi[1]) }}>
                                                        {y.ganZhi[1]}
                                                    </span>
                                                </>
                                            ) : null}
                                        </td>
                                    );
                                })}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </Section>
    );
}

function WuXingPanel({ chart }: { chart: BaziChart }) {
    const max = Math.max(20, ...chart.wuXing.map((s) => s.percent));
    return (
        <Section title="五行分析">
            <div className="flex flex-col gap-4">
                <h3 className="text-center text-sm font-semibold">五行力量分布</h3>
                <div className="mx-auto flex h-56 max-w-xl items-end justify-around gap-2 px-2">
                    {chart.wuXing.map((s) => (
                        <div key={s.wx} className="flex h-full w-16 flex-col items-center gap-2">
                            <div className="flex min-h-0 w-full flex-1 flex-col justify-end gap-1">
                                <span className="text-sm font-semibold tabular-nums">
                                    {s.percent}%
                                </span>
                                <div
                                    className="mx-auto w-10 rounded-t-sm"
                                    style={{
                                        height: `${Math.max(s.percent === 0 ? 2 : (s.percent / max) * 100, 2)}%`,
                                        background: WX_COLOR[s.wx],
                                    }}
                                />
                            </div>
                            <div className="text-sm">{s.wx}</div>
                        </div>
                    ))}
                </div>
            </div>
            <div className="flex flex-col gap-2">
                <h3 className="text-sm font-semibold">五行旺衰</h3>
                <ul className="grid gap-2 sm:grid-cols-5">
                    {chart.wuXing.map((s) => (
                        <li
                            key={s.wx}
                            className="flex flex-col gap-1 rounded-md px-3 py-3 text-center"
                            style={{ background: WX_CARD_BG[s.wx] }}
                        >
                            <div className="text-sm">
                                {s.wx}（{s.gods}）
                            </div>
                            <div className="text-lg font-semibold">{s.stage}</div>
                        </li>
                    ))}
                </ul>
            </div>
            <p className="flex flex-wrap gap-2 text-sm">
                <span className="rounded-md px-2 py-0.5" style={{ background: BAZI_XI }}>
                    幫輔：{chart.helpers}
                </span>
                <span className="rounded-md px-2 py-0.5" style={{ background: BAZI_NOTE }}>
                    克洩耗：{chart.drainers}
                </span>
            </p>
        </Section>
    );
}

function YongShenPanel({ chart }: { chart: BaziChart }) {
    return (
        <Section title="用神分析">
            <p
                className="rounded-md px-3 py-2 text-sm font-medium"
                style={{ background: BAZI_NOTE }}
            >
                {chart.yongShenSummary}
            </p>
            <p className="text-sm leading-relaxed">{chart.yongShenBody}</p>
            <p
                className="rounded-md px-3 py-2 text-sm leading-relaxed"
                style={{ background: BAZI_TIAO }}
            >
                調候用神：{chart.tiaoHou}
            </p>
            <ul className="grid gap-2 sm:grid-cols-3">
                <GodCard label="喜神" value={chart.xiShen} tone="xi" />
                <GodCard label="用神" value={chart.yongShen} tone="yong" />
                <GodCard label="忌神" value={chart.jiShen} tone="ji" />
            </ul>
        </Section>
    );
}

function GodCard({
    label,
    value,
    tone,
}: {
    label: string;
    value: string;
    tone: 'xi' | 'yong' | 'ji';
}) {
    const bg = tone === 'xi' ? BAZI_XI : tone === 'yong' ? BAZI_YONG : BAZI_JI;
    return (
        <li
            className="flex flex-col gap-1 rounded-md px-3 py-3 text-center"
            style={{ background: bg }}
        >
            <div className="text-xs text-muted">{label}</div>
            <div className="font-semibold">{value}</div>
        </li>
    );
}

function ChengguPanel({ chart }: { chart: BaziChart }) {
    return (
        <Section title="袁天罡稱骨">
            <div className="inline-flex flex-col gap-1 rounded-md border border-border bg-surface-2 px-4 py-3 text-center">
                <div className="text-xs text-muted">骨重</div>
                <div className="text-lg font-semibold">
                    {chart.boneLiang}兩{chart.boneQian}錢
                </div>
            </div>
            {chart.boneVerse ? (
                <p className="text-sm leading-relaxed">
                    <span className="font-medium">批註：</span>
                    {chart.boneVerse}
                </p>
            ) : null}
            {chart.boneNote ? (
                <p className="text-sm leading-relaxed">
                    <span className="font-medium">斷命：</span>
                    {chart.boneNote}
                </p>
            ) : null}
        </Section>
    );
}
