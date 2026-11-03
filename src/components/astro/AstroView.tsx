'use client';

import { ASPECT_NAMES, ASPECT_ORBS, BODY_NAMES, formatDegMin } from '@/lib/astro/labels';
import { buildAstroAiPrompt } from '@/lib/astro/prompt';
import type { AstroChart, AstroZodiacPos } from '@/lib/astro/types';
import { AiPromptCard } from '../AiPromptCard';
import { AstroMeaningCard } from '../ChartMeaningCard';
import { ASPECT_COLORS, AstroWheel } from './AstroWheel';

export function AstroView({
    chart,
    timeUnknown,
    error,
}: {
    chart: AstroChart | null | undefined;
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
                這份資料沒有星盤。請回到輸入頁重新排盤。
            </p>
        );
    }
    return (
        <div className="flex flex-col gap-6">
            {timeUnknown ? (
                <p className="rounded-md border border-border bg-surface-2 px-3 py-2 text-sm text-muted">
                    出生時間不確定，星盤先以當地 12:00 推算：不顯示上升、天頂與宮位；月亮一天約移動
                    13°，位置可能偏差約 ±7°，星座也可能不同。
                </p>
            ) : chart.houseNote ? (
                <p className="rounded-md border border-border bg-surface-2 px-3 py-2 text-sm text-muted">
                    {chart.houseNote}
                </p>
            ) : null}
            {error ? (
                <p role="alert" className="rounded-md border border-danger px-3 py-2 text-danger">
                    {error}
                </p>
            ) : null}
            {chart.angles && chart.houses ? <HouseTable chart={chart} /> : null}
            <Section title="本命星盤">
                <AstroWheel chart={chart} />
                <AspectLegend />
            </Section>
            <BodyTable chart={chart} />
            <AspectTable chart={chart} />
            <AstroMeaningCard chart={chart} />
            <AiPromptCard
                heading="提供給 AI 的提示詞"
                description="複製後可貼到 ChatGPT、Claude 等，請它依這份本命星盤做解讀。內容含出生資料。"
                text={buildAstroAiPrompt(chart)}
            />
        </div>
    );
}

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

function posText(p: AstroZodiacPos): string {
    return `${p.signName} ${formatDegMin(p.degree, p.minute)}`;
}

const TH = 'border border-border bg-surface-2 px-2 py-2 font-medium';
const TD = 'border border-border px-2 py-2';

function AspectLegend() {
    const types = ['conjunction', 'sextile', 'square', 'trine', 'opposition'] as const;
    return (
        <ul
            className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-sm text-muted"
            aria-label="相位圖例"
        >
            {types.map((t) => (
                <li key={t} className="flex items-center gap-1.5">
                    <span
                        aria-hidden="true"
                        className="inline-block h-0.5 w-6"
                        style={{ background: ASPECT_COLORS[t] }}
                    />
                    {ASPECT_NAMES[t]}
                </li>
            ))}
            <li>合相不畫線</li>
        </ul>
    );
}

function BodyTable({ chart }: { chart: AstroChart }) {
    const showHouse = chart.houses !== null;
    return (
        <Section title="行星位置">
            <div className="overflow-x-auto">
                <table className="w-full min-w-[20rem] border-collapse text-center text-sm">
                    <thead>
                        <tr>
                            <th className={TH}>行星</th>
                            <th className={TH}>星座</th>
                            <th className={TH}>度數</th>
                            {showHouse ? <th className={TH}>宮位</th> : null}
                            <th className={TH}>逆行</th>
                        </tr>
                    </thead>
                    <tbody>
                        {chart.bodies.map((b) => (
                            <tr key={b.key}>
                                <th scope="row" className={`${TD} font-medium`}>
                                    {b.name}
                                    {timeNote(chart, b.key)}
                                </th>
                                <td className={TD}>{b.signName}</td>
                                <td className={`${TD} tabular-nums`}>
                                    {formatDegMin(b.degree, b.minute)}
                                </td>
                                {showHouse ? (
                                    <td className={`${TD} tabular-nums`}>
                                        {b.house !== null ? `第 ${b.house} 宮` : '—'}
                                    </td>
                                ) : null}
                                <td className={`${TD} text-danger`}>
                                    {b.retrograde ? '℞ 逆行' : ''}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <p className="text-xs text-muted">
                回歸黃道、地心座標；北交點採用
                {chart.nodeMode === 'mean' ? '平均交點' : '真實交點'}。
            </p>
        </Section>
    );
}

function timeNote(chart: AstroChart, key: string): React.ReactNode {
    if (!chart.timeUnknown || key !== 'moon') return null;
    return <span className="block text-xs font-normal text-muted">（概略位置）</span>;
}

function HouseTable({ chart }: { chart: AstroChart }) {
    if (!chart.angles || !chart.houses) return null;
    const angles: [string, AstroZodiacPos][] = [
        ['上升 ASC', chart.angles.asc],
        ['天頂 MC', chart.angles.mc],
    ];
    return (
        <Section title="軸點與宮位">
            <dl className="grid grid-cols-2 overflow-hidden rounded-md border border-border">
                {angles.map(([label, p]) => (
                    <div
                        key={label}
                        className="flex flex-col gap-0.5 px-3 py-2.5 odd:border-r odd:border-border"
                    >
                        <dt className="text-xs text-muted">{label}</dt>
                        <dd className="font-medium tabular-nums">{posText(p)}</dd>
                    </div>
                ))}
            </dl>
            <ol className="grid grid-cols-2 overflow-hidden rounded-md border border-border text-sm sm:grid-cols-3 lg:grid-cols-4">
                {chart.houses.map((h) => (
                    <li
                        key={h.house}
                        className="flex items-baseline justify-between gap-2 border-b border-r border-border px-3 py-2"
                    >
                        <span className="text-muted">第 {h.house} 宮</span>
                        <span className="tabular-nums">{posText(h)}</span>
                    </li>
                ))}
            </ol>
            <p className="text-xs text-muted">宮位制：{chart.houseSystemLabel}</p>
        </Section>
    );
}

function AspectTable({ chart }: { chart: AstroChart }) {
    const aspects = [...chart.aspects].sort((x, y) => x.orb - y.orb);
    return (
        <Section title="主要相位">
            {aspects.length === 0 ? (
                <p className="text-muted">沒有主要相位。</p>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[20rem] border-collapse text-center text-sm">
                        <thead>
                            <tr>
                                <th className={TH}>行星</th>
                                <th className={TH}>相位</th>
                                <th className={TH}>行星</th>
                                <th className={TH}>容許度</th>
                            </tr>
                        </thead>
                        <tbody>
                            {aspects.map((a) => (
                                <tr key={`${a.a}-${a.b}`}>
                                    <td className={TD}>{BODY_NAMES[a.a]}</td>
                                    <td className={`${TD} font-medium`}>
                                        <span
                                            aria-hidden="true"
                                            className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle"
                                            style={{ background: ASPECT_COLORS[a.type] }}
                                        />
                                        {a.name} {a.angle}°
                                    </td>
                                    <td className={TD}>{BODY_NAMES[a.b]}</td>
                                    <td className={`${TD} tabular-nums`}>{a.orb.toFixed(1)}°</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
            <p className="text-xs text-muted">
                容許度：太陽、月亮 {ASPECT_ORBS.luminary}°，其他行星 {ASPECT_ORBS.planet}°，北交點
                {chart.chironAvailable ? '、凱龍' : ''} {ASPECT_ORBS.point}°（兩者取較寬者）。
                {chart.timeUnknown ? '出生時間不確定，與月亮有關的相位僅供參考。' : ''}
            </p>
        </Section>
    );
}
