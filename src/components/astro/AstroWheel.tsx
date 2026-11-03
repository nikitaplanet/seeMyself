import { ASPECT_NAMES, BODY_NAMES, formatDegMin, SIGN_NAMES } from '@/lib/astro/labels';
import type { AspectType, AstroChart } from '@/lib/astro/types';

// SVG natal chart wheel. Standard orientation: ASC on the left, zodiac running counter-clockwise,
// MC near the top. Without houses (time unknown / no place) 0° 牡羊 sits on the left instead.
// Colours come from CSS tokens / currentColor so the wheel follows the page theme.

const SIZE = 400;
const C = SIZE / 2;
const R_OUT = 196;
const R_SIGN_IN = 166;
const R_HOUSE_IN = 146;
/** Minimum angular gap between planet labels on the wheel, in degrees. */
const LABEL_MIN_SEP = 9;

export const ASPECT_COLORS: Record<AspectType, string> = {
    conjunction: 'var(--astro-conjunction)',
    sextile: 'var(--astro-sextile)',
    square: 'var(--astro-square)',
    trine: 'var(--astro-trine)',
    opposition: 'var(--astro-opposition)',
};

function norm(deg: number): number {
    return ((deg % 360) + 360) % 360;
}

/** Spreads label angles apart so neighbours are at least `minSep` degrees away (circular). */
export function spreadAngles(angles: number[], minSep: number): number[] {
    const n = angles.length;
    if (n < 2) return [...angles];
    const order = angles.map((a, i) => ({ a: norm(a), i })).sort((x, y) => x.a - y.a);
    const disp = order.map((o) => o.a);
    const sep = Math.min(minSep, 360 / n);
    for (let iter = 0; iter < 100; iter++) {
        let moved = false;
        for (let k = 0; k < n; k++) {
            const j = (k + 1) % n;
            const gap = j === 0 ? disp[0] + 360 - disp[k] : disp[j] - disp[k];
            if (gap < sep - 1e-6) {
                const push = (sep - gap) / 2;
                disp[k] -= push;
                disp[j] += push;
                moved = true;
            }
        }
        if (!moved) break;
    }
    const out = new Array<number>(n);
    order.forEach((o, k) => {
        out[o.i] = norm(disp[k]);
    });
    return out;
}

export function AstroWheel({ chart }: { chart: AstroChart }) {
    const hasHouses = chart.houses !== null && chart.angles !== null;
    const anchor = chart.angles?.asc.longitude ?? 0;
    const rInner = hasHouses ? R_HOUSE_IN : R_SIGN_IN;
    const rLabel = rInner - 20;
    const rAspect = rInner - 38;

    function xy(lon: number, r: number): [number, number] {
        const phi = ((180 + lon - anchor) * Math.PI) / 180;
        return [C + r * Math.cos(phi), C - r * Math.sin(phi)];
    }
    function f(n: number): string {
        return n.toFixed(2);
    }

    const signs = SIGN_NAMES.map((name, i) => {
        const start = i * 30;
        const [x1, y1] = xy(start, R_OUT);
        const [x2, y2] = xy(start, R_SIGN_IN);
        const [lx, ly] = xy(start + 15, (R_OUT + R_SIGN_IN) / 2);
        return { name, start, x1, y1, x2, y2, lx, ly };
    });

    const ticks: Array<[number, number, number, number]> = [];
    for (let d = 0; d < 360; d += 5) {
        if (d % 30 === 0) continue;
        const [x1, y1] = xy(d, R_SIGN_IN);
        const [x2, y2] = xy(d, R_SIGN_IN + (d % 10 === 0 ? 6 : 3));
        ticks.push([x1, y1, x2, y2]);
    }

    const labelAngles = spreadAngles(
        chart.bodies.map((b) => b.longitude),
        LABEL_MIN_SEP,
    );
    const lonOf = new Map(chart.bodies.map((b) => [b.key, b.longitude]));

    const summary = chart.angles
        ? `星盤圖：上升${chart.angles.asc.signName}，${chart.bodies
              .map((b) => `${b.name}${b.signName}`)
              .join('、')}`
        : `星盤圖（無宮位）：${chart.bodies.map((b) => `${b.name}${b.signName}`).join('、')}`;

    return (
        <svg
            viewBox={`-24 -24 ${SIZE + 48} ${SIZE + 48}`}
            role="img"
            aria-label={summary}
            className="mx-auto block h-auto w-full max-w-[520px] text-fg"
        >
            {/* zodiac band */}
            {signs.map((s, i) => {
                const [ox1, oy1] = xy(s.start, R_OUT);
                const [ox2, oy2] = xy(s.start + 30, R_OUT);
                const [ix2, iy2] = xy(s.start + 30, R_SIGN_IN);
                const [ix1, iy1] = xy(s.start, R_SIGN_IN);
                const d = [
                    `M ${f(ox1)} ${f(oy1)}`,
                    `A ${R_OUT} ${R_OUT} 0 0 0 ${f(ox2)} ${f(oy2)}`,
                    `L ${f(ix2)} ${f(iy2)}`,
                    `A ${R_SIGN_IN} ${R_SIGN_IN} 0 0 1 ${f(ix1)} ${f(iy1)}`,
                    'Z',
                ].join(' ');
                return (
                    <path
                        key={s.name}
                        d={d}
                        style={{
                            fill: i % 2 === 0 ? 'var(--app-surface-2)' : 'var(--app-surface)',
                        }}
                    />
                );
            })}
            <circle cx={C} cy={C} r={R_OUT} fill="none" stroke="currentColor" strokeOpacity={0.5} />
            <circle
                cx={C}
                cy={C}
                r={R_SIGN_IN}
                fill="none"
                stroke="currentColor"
                strokeOpacity={0.5}
            />
            {signs.map((s) => (
                <g key={`l-${s.name}`}>
                    <line
                        x1={f(s.x1)}
                        y1={f(s.y1)}
                        x2={f(s.x2)}
                        y2={f(s.y2)}
                        stroke="currentColor"
                        strokeOpacity={0.5}
                    />
                    <text
                        x={f(s.lx)}
                        y={f(s.ly)}
                        textAnchor="middle"
                        dominantBaseline="central"
                        fontSize={12}
                        fill="currentColor"
                    >
                        {s.name}
                    </text>
                </g>
            ))}
            {ticks.map(([x1, y1, x2, y2]) => (
                <line
                    key={`t-${f(x1)}-${f(y1)}`}
                    x1={f(x1)}
                    y1={f(y1)}
                    x2={f(x2)}
                    y2={f(y2)}
                    stroke="currentColor"
                    strokeOpacity={0.35}
                />
            ))}

            {/* houses */}
            {hasHouses && chart.houses && chart.angles ? (
                <g>
                    <circle
                        cx={C}
                        cy={C}
                        r={R_HOUSE_IN}
                        fill="none"
                        stroke="currentColor"
                        strokeOpacity={0.35}
                    />
                    {chart.houses.map((h, i) => {
                        const angular = h.house === 1 || h.house === 10;
                        const opposite = h.house === 7 || h.house === 4;
                        const [x1, y1] = xy(h.longitude, rAspect);
                        const [x2, y2] = xy(h.longitude, angular ? R_OUT : R_SIGN_IN);
                        const next = chart.houses![(i + 1) % 12].longitude;
                        const mid = h.longitude + norm(next - h.longitude) / 2;
                        const [nx, ny] = xy(mid, (R_SIGN_IN + R_HOUSE_IN) / 2);
                        return (
                            <g key={`h-${h.house}`}>
                                <line
                                    x1={f(x1)}
                                    y1={f(y1)}
                                    x2={f(x2)}
                                    y2={f(y2)}
                                    stroke="currentColor"
                                    strokeOpacity={angular || opposite ? 0.9 : 0.35}
                                    strokeWidth={angular || opposite ? 1.6 : 1}
                                />
                                <text
                                    x={f(nx)}
                                    y={f(ny)}
                                    textAnchor="middle"
                                    dominantBaseline="central"
                                    fontSize={10}
                                    fill="currentColor"
                                    fillOpacity={0.65}
                                >
                                    {h.house}
                                </text>
                            </g>
                        );
                    })}
                    {(
                        [
                            ['ASC', chart.angles.asc.longitude],
                            ['MC', chart.angles.mc.longitude],
                        ] as const
                    ).map(([label, lon]) => {
                        const [x, y] = xy(lon, R_OUT + 13);
                        return (
                            <text
                                key={label}
                                x={f(x)}
                                y={f(y)}
                                textAnchor="middle"
                                dominantBaseline="central"
                                fontSize={11}
                                fontWeight={600}
                                fill="currentColor"
                            >
                                {label}
                            </text>
                        );
                    })}
                </g>
            ) : null}

            {/* aspects */}
            <circle
                cx={C}
                cy={C}
                r={rAspect}
                fill="none"
                stroke="currentColor"
                strokeOpacity={0.35}
            />
            {chart.aspects
                .filter((a) => a.type !== 'conjunction')
                .map((a) => {
                    const [x1, y1] = xy(lonOf.get(a.a) ?? 0, rAspect);
                    const [x2, y2] = xy(lonOf.get(a.b) ?? 0, rAspect);
                    return (
                        <line
                            key={`${a.a}-${a.b}`}
                            x1={f(x1)}
                            y1={f(y1)}
                            x2={f(x2)}
                            y2={f(y2)}
                            style={{ stroke: ASPECT_COLORS[a.type] }}
                            strokeWidth={a.orb < 2 ? 1.6 : 1}
                            strokeOpacity={0.85}
                        >
                            <title>
                                {`${BODY_NAMES[a.a]} ${ASPECT_NAMES[a.type]} ${BODY_NAMES[a.b]}（${a.orb.toFixed(1)}°）`}
                            </title>
                        </line>
                    );
                })}

            {/* planets */}
            {chart.bodies.map((b, i) => {
                const [tx1, ty1] = xy(b.longitude, rInner);
                const [tx2, ty2] = xy(b.longitude, rInner - 6);
                const [lx, ly] = xy(labelAngles[i], rLabel);
                const [px, py] = xy(b.longitude, rAspect);
                return (
                    <g key={b.key}>
                        <title>
                            {`${b.name} ${b.signName} ${formatDegMin(b.degree, b.minute)}${b.house ? ` 第${b.house}宮` : ''}${b.retrograde ? ' 逆行' : ''}`}
                        </title>
                        <line
                            x1={f(tx1)}
                            y1={f(ty1)}
                            x2={f(tx2)}
                            y2={f(ty2)}
                            stroke="currentColor"
                            strokeWidth={1.5}
                        />
                        <line
                            x1={f(tx2)}
                            y1={f(ty2)}
                            x2={f(lx)}
                            y2={f(ly)}
                            stroke="currentColor"
                            strokeOpacity={0.3}
                        />
                        <circle cx={f(px)} cy={f(py)} r={2} fill="currentColor" />
                        <circle
                            cx={f(lx)}
                            cy={f(ly)}
                            r={9}
                            style={{ fill: 'var(--app-surface)' }}
                            stroke="currentColor"
                            strokeOpacity={0.4}
                        />
                        <text
                            x={f(lx)}
                            y={f(ly)}
                            textAnchor="middle"
                            dominantBaseline="central"
                            fontSize={11}
                            fontWeight={600}
                            fill="currentColor"
                        >
                            {b.short}
                        </text>
                        {b.retrograde ? (
                            <text
                                x={f(lx + 8)}
                                y={f(ly - 8)}
                                textAnchor="middle"
                                dominantBaseline="central"
                                fontSize={8}
                                style={{ fill: 'var(--app-danger)' }}
                            >
                                ℞
                            </text>
                        ) : null}
                    </g>
                );
            })}
        </svg>
    );
}
