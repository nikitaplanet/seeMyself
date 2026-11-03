import {
  AUTHORITY_NAMES_ZH,
  CENTER_NAMES_ZH,
  DEFINITION_NAMES_ZH,
  PLANET_NAMES_ZH,
  PLANET_ORDER,
  PLANET_SYMBOLS,
  SIDE_NAMES_ZH,
  TYPE_NAMES_ZH,
} from '@/lib/hd/constants';
import type { Activation, Authority, CenterId, ChartResult, Definition, HDType, Planet, Side } from '@/lib/hd/types';
import { formatMinutes } from '@/lib/ui/chartClient';

// Spec §11.2 item 4 / §8 — birth-time sensitivity, rendered as plain sentences grouped per offset,
// e.g. 「若出生時間早 15 分鐘」→「人生角色會從 4/6 變為 3/6」.

type Change = NonNullable<ChartResult['sensitivity']>['changes'][number];

const MAJOR_ORDER = ['type', 'authority', 'profile', 'definition', 'cross.gates', 'channels', 'definedCenters'];

const isCenter = (s: string): s is CenterId => s in CENTER_NAMES_ZH;

function splitList(v: string | number): string[] {
  return String(v)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function offsetPhrase(min: number): string {
  return `若出生時間${min < 0 ? '早' : '晚'} ${formatMinutes(min)}`;
}

function majorSentence(c: Change): string {
  switch (c.field) {
    case 'type':
      return `類型會從${TYPE_NAMES_ZH[c.from as HDType] ?? c.from}變為${TYPE_NAMES_ZH[c.to as HDType] ?? c.to}`;
    case 'authority':
      return `內在權威會從${AUTHORITY_NAMES_ZH[c.from as Authority] ?? c.from}變為${AUTHORITY_NAMES_ZH[c.to as Authority] ?? c.to}`;
    case 'profile':
      return `人生角色會從 ${c.from} 變為 ${c.to}`;
    case 'definition':
      return `定義型態會從${DEFINITION_NAMES_ZH[c.from as Definition] ?? c.from}變為${DEFINITION_NAMES_ZH[c.to as Definition] ?? c.to}`;
    case 'cross.gates':
      return `輪迴交叉閘門會從（${c.from}）變為（${c.to}）`;
    case 'channels': {
      const before = new Set(splitList(c.from));
      const after = new Set(splitList(c.to));
      const added = [...after].filter((x) => !before.has(x));
      const removed = [...before].filter((x) => !after.has(x));
      const parts: string[] = [];
      if (added.length) parts.push(`多出通道 ${added.join('、')}`);
      if (removed.length) parts.push(`失去通道 ${removed.join('、')}`);
      return parts.length ? parts.join('，') : '已成立的通道會改變';
    }
    case 'definedCenters': {
      const before = new Set(splitList(c.from));
      const after = new Set(splitList(c.to));
      const name = (s: string) => (isCenter(s) ? CENTER_NAMES_ZH[s] : s);
      const added = [...after].filter((x) => !before.has(x)).map(name);
      const removed = [...before].filter((x) => !after.has(x)).map(name);
      const parts: string[] = [];
      if (added.length) parts.push(`${added.join('、')}會變為已定義`);
      if (removed.length) parts.push(`${removed.join('、')}會變為未定義`);
      return parts.length ? parts.join('，') : '已定義中心會改變';
    }
    default:
      return `${c.field} 會從 ${c.from} 變為 ${c.to}`;
  }
}

interface ActivationShift {
  side: Side;
  planet: Planet;
  from: string;
  to: string;
}

/** Merge the separate `.gate` / `.line` changes of one activation into one 「41.3 → 41.4」 item. */
function activationShifts(changes: Change[], base: readonly Activation[]): ActivationShift[] {
  const map = new Map<string, { side: Side; planet: Planet; gate?: number; line?: number }>();
  for (const c of changes) {
    const m = /^activations\.(personality|design)\.(\w+)\.(gate|line)$/.exec(c.field);
    if (!m) continue;
    const key = `${m[1]}.${m[2]}`;
    const entry = map.get(key) ?? { side: m[1] as Side, planet: m[2] as Planet };
    if (m[3] === 'gate') entry.gate = Number(c.to);
    else entry.line = Number(c.to);
    map.set(key, entry);
  }
  const out: ActivationShift[] = [];
  for (const e of map.values()) {
    const a = base.find((x) => x.side === e.side && x.planet === e.planet);
    if (!a) continue;
    out.push({
      side: e.side,
      planet: e.planet,
      from: `${a.gate}.${a.line}`,
      to: `${e.gate ?? a.gate}.${e.line ?? a.line}`,
    });
  }
  const sideRank = (s: Side) => (s === 'personality' ? 0 : 1);
  return out.sort(
    (x, y) => sideRank(x.side) - sideRank(y.side) || PLANET_ORDER.indexOf(x.planet) - PLANET_ORDER.indexOf(y.planet),
  );
}

export function SensitivityPanel({ chart, timeUnknown }: { chart: ChartResult; timeUnknown: boolean }) {
  const report = chart.sensitivity;
  if (!report || report.offsets.length === 0) {
    return (
      <section
        aria-labelledby="sens-title"
        className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-5"
      >
        <h2 id="sens-title" className="text-lg font-semibold">
          出生時間敏感度
        </h2>
        <p className="text-muted">這次計算沒有進行敏感度檢查。</p>
      </section>
    );
  }

  const maxAbs = Math.max(...report.offsets.map((o) => Math.abs(o)));
  const range = formatMinutes(maxAbs);
  const offsets = [...report.offsets].sort((a, b) => a - b);
  const groups = offsets
    .map((off) => {
      const changes = report.changes.filter((c) => c.offsetMinutes === off);
      const major = changes
        .filter((c) => MAJOR_ORDER.includes(c.field))
        .sort((a, b) => MAJOR_ORDER.indexOf(a.field) - MAJOR_ORDER.indexOf(b.field));
      return { off, major, shifts: activationShifts(changes, chart.activations) };
    })
    .filter((g) => g.major.length > 0 || g.shifts.length > 0);

  return (
    <section
      aria-labelledby="sens-title"
      className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-5"
    >
      <h2 id="sens-title" className="text-lg font-semibold">
        出生時間敏感度
      </h2>
      {timeUnknown ? (
        <p className="rounded-md bg-surface-2 px-3 py-2 text-sm">
          你勾選了「出生時間不確定」：結果以當地 12:00 計算。以下比較前後 6 與 12 小時，沒有出現在變動清單中的項目才比較可信。
        </p>
      ) : null}
      <p className={`font-medium ${report.stable ? '' : 'text-warning'}`}>
        {report.stable
          ? `出生時間前後 ${range}內，主要結果（類型、內在權威、人生角色、定義型態）不變。`
          : `出生時間前後 ${range}內，部分主要結果會改變，請確認出生時間是否準確：`}
      </p>
      {groups.length === 0 ? (
        <p className="text-sm text-muted">所有檢查的時間點下，26 個星體的閘門與爻也都相同。</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {groups.map((g) => (
            <li key={g.off} className="flex flex-col gap-1">
              <p className="font-medium">{offsetPhrase(g.off)}：</p>
              <ul className="flex list-disc flex-col gap-0.5 pl-5 text-sm">
                {g.major.map((c) => (
                  <li key={c.field}>{majorSentence(c)}</li>
                ))}
                {g.shifts.length > 0 ? (
                  <li>
                    星體位置變動 {g.shifts.length} 項：
                    <span className="text-muted">
                      {g.shifts
                        .map(
                          (s) =>
                            `${SIDE_NAMES_ZH[s.side]} ${PLANET_SYMBOLS[s.planet]} ${PLANET_NAMES_ZH[s.planet]} ${s.from} → ${s.to}`,
                        )
                        .join('；')}
                    </span>
                  </li>
                ) : null}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
