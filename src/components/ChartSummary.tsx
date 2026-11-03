import {
  AUTHORITY_NAMES_ZH,
  CENTER_NAMES_ZH,
  CENTER_ORDER,
  CROSS_ANGLE_NAMES_ZH,
  DEFINITION_NAMES_ZH,
  TYPE_NAMES_ZH,
} from '@/lib/hd/constants';
import type { NodeMode } from '@/lib/hd/types';
import { formatUtc, type StoredChart } from '@/lib/ui/chartClient';

// Spec §11.2 item 1 — summary card.

export const NODE_MODE_NAMES_ZH: Record<NodeMode, string> = { true: '真交點', mean: '平交點' };

interface Props {
  stored: StoredChart;
  busy: boolean;
  onToggleNodeMode: () => void;
}

export function ChartSummary({ stored, busy, onToggleNodeMode }: Props) {
  const { result: chart, input } = stored;
  const [pSun, pEarth, dSun, dEarth] = chart.cross.gates;
  const nodeMode = chart.meta.nodeMode;
  const other: NodeMode = nodeMode === 'true' ? 'mean' : 'true';
  const defined = CENTER_ORDER.filter((c) => chart.definedCenters.includes(c));

  const rows: Array<[string, React.ReactNode]> = [
    ['類型', TYPE_NAMES_ZH[chart.type]],
    ['策略', chart.strategy],
    ['內在權威', AUTHORITY_NAMES_ZH[chart.authority]],
    ['人生角色', `${chart.profile.personality}/${chart.profile.design}`],
    ['定義型態', DEFINITION_NAMES_ZH[chart.definition]],
    [
      '輪迴交叉',
      <>
        {CROSS_ANGLE_NAMES_ZH[chart.cross.angle]}（{pSun}/{pEarth} | {dSun}/{dEarth}）
        {chart.cross.name ? <span className="block">{chart.cross.name}</span> : null}
      </>,
    ],
    ['已定義中心', defined.length > 0 ? defined.map((c) => CENTER_NAMES_ZH[c]).join('、') : '無（所有中心皆未定義）'],
  ];

  return (
    <section
      aria-labelledby="summary-title"
      className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-5"
    >
      <h2 id="summary-title" className="text-xl font-semibold">
        {TYPE_NAMES_ZH[chart.type]} · {chart.profile.personality}/{chart.profile.design}
      </h2>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-muted">{k}</dt>
            <dd className="font-medium">{v}</dd>
          </div>
        ))}
      </dl>

      <div className="flex flex-col gap-2 border-t border-border pt-4">
        <h3 className="font-semibold">出生資料</h3>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
          <dt className="text-muted">當地時間</dt>
          <dd className="flex flex-col gap-0.5">
            <span>
              {input.date} {stored.timeUnknown ? '時間不確定（以 12:00 計算）' : input.time}
            </span>
            <span className="text-muted">
              {stored.placeLabel ? `${stored.placeLabel} · ` : ''}
              {input.timezone}
            </span>
          </dd>
          <dt className="text-muted">個性（出生）</dt>
          <dd>
            <time dateTime={chart.utc.personality}>{formatUtc(chart.utc.personality)}</time>
          </dd>
          <dt className="text-muted">設計</dt>
          <dd className="flex flex-col gap-0.5">
            <time dateTime={chart.utc.design}>{formatUtc(chart.utc.design)}</time>
            <span className="text-muted">太陽黃經回推 88° 的時刻</span>
          </dd>
          <dt className="text-muted">交點模式</dt>
          <dd className="flex flex-wrap items-center gap-3">
            <span className="font-medium">{NODE_MODE_NAMES_ZH[nodeMode]}</span>
            <button
              type="button"
              onClick={onToggleNodeMode}
              disabled={busy}
              className="rounded-md border border-border px-2 py-0.5 text-sm hover:bg-surface-2 disabled:opacity-60"
            >
              {busy ? '重新計算中…' : `改用${NODE_MODE_NAMES_ZH[other]}`}
            </button>
          </dd>
        </dl>
      </div>
    </section>
  );
}
