'use client';

import { useId, useMemo, useState } from 'react';
import {
    AUTHORITY_NAMES_ZH,
    CENTER_NAMES_ZH,
    CENTER_ORDER,
    CHANNELS,
    GATE_CENTER,
    PLANET_NAMES_ZH,
    PLANET_ORDER,
    PLANET_SYMBOLS,
    SIDE_NAMES_ZH,
    TYPE_NAMES_ZH,
} from '@/lib/hd/constants';
import type { Activation, ChartResult, Side } from '@/lib/hd/types';
import { Center } from './Center';
import { BothSidesPattern, ChannelHalf, ChannelTrack, gateState } from './Channel';
import { CENTERS, GATE_LABEL_RADIUS, GATE_POINTS, VIEWBOX, gateLabelPoint } from './layout';

// Spec §10 — the BodyGraph. Pure geometry from layout.ts, coloured from the ChartResult.
//
// Accessibility (§10.5): the drawing itself is one `role="img"` with a text summary. Activated gates
// get a separate transparent overlay <svg> with keyboard-focusable buttons, because interactive
// children inside role="img" are not exposed to assistive technology.

type GraphChart = Pick<
    ChartResult,
    'activations' | 'activeGates' | 'definedCenters' | 'type' | 'authority' | 'profile'
>;

const SIDE_ORDER: readonly Side[] = ['personality', 'design'];

export function activationLabel(a: Activation): string {
    return `${SIDE_NAMES_ZH[a.side]} ${PLANET_SYMBOLS[a.planet]} ${PLANET_NAMES_ZH[a.planet]} ${a.gate}.${a.line}`;
}

function gateActivations(activations: readonly Activation[], gate: number): Activation[] {
    return activations
        .filter((a) => a.gate === gate)
        .sort(
            (a, b) =>
                SIDE_ORDER.indexOf(a.side) - SIDE_ORDER.indexOf(b.side) ||
                PLANET_ORDER.indexOf(a.planet) - PLANET_ORDER.indexOf(b.planet),
        );
}

export function bodyGraphSummary(chart: GraphChart): string {
    const defined = CENTER_ORDER.filter((c) => chart.definedCenters.includes(c)).map(
        (c) => CENTER_NAMES_ZH[c],
    );
    const centers = defined.length > 0 ? `已定義中心：${defined.join('、')}` : '沒有已定義中心';
    return `人體圖：${TYPE_NAMES_ZH[chart.type]}，${AUTHORITY_NAMES_ZH[chart.authority]}，人生角色 ${chart.profile.personality}/${chart.profile.design}，${centers}。`;
}

interface TooltipState {
    gate: number;
    pinned: boolean;
}

export function BodyGraph({ chart }: { chart: GraphChart }) {
    const [tip, setTip] = useState<TooltipState | null>(null);
    const tooltipId = useId();

    const activeGateList = useMemo(
        () =>
            Object.keys(chart.activeGates)
                .map(Number)
                .sort((a, b) => a - b),
        [chart.activeGates],
    );
    const defined = new Set(chart.definedCenters);
    const allGates = Object.keys(GATE_POINTS).map(Number);
    const viewBox = `0 0 ${VIEWBOX.width} ${VIEWBOX.height}`;

    const tipActs = tip ? gateActivations(chart.activations, tip.gate) : [];
    const tipPoint = tip ? GATE_POINTS[tip.gate] : null;

    return (
        <figure className="relative mx-auto w-full max-w-[480px]">
            <svg
                viewBox={viewBox}
                width="100%"
                role="img"
                aria-label={bodyGraphSummary(chart)}
                className="block h-auto w-full"
                style={{ fontFamily: 'var(--font-sans)' }}
            >
                <defs>
                    <BothSidesPattern />
                </defs>

                <g data-layer="channel-tracks">
                    {CHANNELS.map(([a, b]) => (
                        <ChannelTrack key={`${a}-${b}`} from={GATE_POINTS[a]} to={GATE_POINTS[b]} />
                    ))}
                </g>
                <g data-layer="channel-halves">
                    {CHANNELS.map(([a, b]) => (
                        <g key={`${a}-${b}`} data-channel={`${a}-${b}`}>
                            <ChannelHalf
                                from={GATE_POINTS[a]}
                                to={GATE_POINTS[b]}
                                state={gateState(chart.activeGates[a])}
                            />
                            <ChannelHalf
                                from={GATE_POINTS[b]}
                                to={GATE_POINTS[a]}
                                state={gateState(chart.activeGates[b])}
                            />
                        </g>
                    ))}
                </g>
                <g data-layer="centers">
                    {CENTERS.map((c) => (
                        <Center key={c.id} layout={c} defined={defined.has(c.id)} />
                    ))}
                </g>
                <g data-layer="gate-labels">
                    {allGates.map((gate) => {
                        const p = gateLabelPoint(gate, GATE_CENTER[gate]);
                        const active = chart.activeGates[gate] !== undefined;
                        return (
                            <g key={gate} data-gate={gate} data-active={active ? 'true' : 'false'}>
                                <circle
                                    cx={p.x}
                                    cy={p.y}
                                    r={GATE_LABEL_RADIUS}
                                    style={
                                        active
                                            ? {
                                                  fill: 'var(--hd-gate-on)',
                                                  stroke: 'var(--hd-gate-on)',
                                                  strokeWidth: 1,
                                              }
                                            : { fill: 'var(--hd-gate-off)', stroke: 'none' }
                                    }
                                />
                                <text
                                    x={p.x}
                                    y={p.y}
                                    textAnchor="middle"
                                    dominantBaseline="central"
                                    style={{
                                        fontSize: 7,
                                        fontWeight: active ? 700 : 500,
                                        fill: active
                                            ? 'var(--hd-gate-on-text)'
                                            : 'var(--hd-gate-off-text)',
                                    }}
                                >
                                    {gate}
                                </text>
                            </g>
                        );
                    })}
                </g>
            </svg>

            {/* Interactive overlay: one focusable button per activated gate. */}
            <svg
                viewBox={viewBox}
                className="absolute inset-0 h-full w-full"
                role="group"
                aria-label="已啟動的閘門（按 Tab 逐一檢視）"
            >
                {activeGateList.map((gate) => {
                    const p = gateLabelPoint(gate, GATE_CENTER[gate]);
                    const acts = gateActivations(chart.activations, gate);
                    const label = `閘門 ${gate}：${acts.map(activationLabel).join('、')}`;
                    const isOpen = tip?.gate === gate;
                    return (
                        <g
                            key={gate}
                            role="button"
                            tabIndex={0}
                            aria-label={label}
                            aria-describedby={isOpen ? tooltipId : undefined}
                            aria-pressed={isOpen && tip?.pinned ? true : undefined}
                            className="hd-gate-hit cursor-pointer"
                            onMouseEnter={() =>
                                setTip((t) => (t?.pinned ? t : { gate, pinned: false }))
                            }
                            onMouseLeave={() => setTip((t) => (t && !t.pinned ? null : t))}
                            onFocus={() => setTip({ gate, pinned: false })}
                            onBlur={() => setTip((t) => (t?.gate === gate ? null : t))}
                            onClick={() =>
                                setTip((t) =>
                                    t?.gate === gate && t.pinned ? null : { gate, pinned: true },
                                )
                            }
                            onKeyDown={(e) => {
                                if (e.key === 'Escape') setTip(null);
                                if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    setTip((t) =>
                                        t?.gate === gate && t.pinned
                                            ? null
                                            : { gate, pinned: true },
                                    );
                                }
                            }}
                        >
                            <circle cx={p.x} cy={p.y} r={GATE_LABEL_RADIUS + 3} />
                        </g>
                    );
                })}
            </svg>

            {tip && tipPoint && (
                <div
                    id={tooltipId}
                    role="tooltip"
                    className="pointer-events-none absolute z-10 w-max max-w-[16rem] rounded-md border border-border bg-surface px-3 py-2 text-sm"
                    style={{
                        left: `${Math.min(80, Math.max(20, (tipPoint.x / VIEWBOX.width) * 100))}%`,
                        top: `${(tipPoint.y / VIEWBOX.height) * 100}%`,
                        transform: 'translate(-50%, calc(-100% - 14px))',
                    }}
                >
                    <div className="flex flex-col gap-1">
                        <p className="font-semibold">閘門 {tip.gate}</p>
                        <ul className="flex flex-col gap-0.5">
                            {tipActs.map((a) => (
                                <li
                                    key={`${a.side}-${a.planet}`}
                                    className={
                                        a.side === 'design' ? 'text-design' : 'text-personality'
                                    }
                                >
                                    {activationLabel(a)}
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            )}
        </figure>
    );
}
