'use client';

import { useState } from 'react';
import { PLANET_NAMES_ZH, PLANET_ORDER, PLANET_SYMBOLS } from '@/lib/hd/constants';
import type { Activation, Planet, Side } from '@/lib/hd/types';

// Spec §11.2 item 3 — design (red) on the left, personality (black) on the right, 13 rows in the
// §5.3 order. Each row expands to colour / tone / base / longitude. Activations within 30 minutes
// of a line boundary (§8.2) get a warning icon with a text alternative.

const BOUNDARY_WARN_MINUTES = 30;

function find(acts: readonly Activation[], side: Side, planet: Planet): Activation | undefined {
  return acts.find((a) => a.side === side && a.planet === planet);
}

function nearBoundary(a: Activation): boolean {
  return Number.isFinite(a.minutesToLineBoundary) && a.minutesToLineBoundary < BOUNDARY_WARN_MINUTES;
}

function formatLongitude(lon: number): string {
  const d = Math.floor(lon);
  const mFloat = (lon - d) * 60;
  const m = Math.floor(mFloat);
  const s = Math.round((mFloat - m) * 60);
  return `${lon.toFixed(4)}°（${d}°${String(m).padStart(2, '0')}′${String(s === 60 ? 59 : s).padStart(2, '0')}″）`;
}

function Cell({ a }: { a: Activation | undefined }) {
  if (!a) return <span>—</span>;
  const warn = nearBoundary(a);
  return (
    <span className="inline-flex items-center gap-1 tabular-nums">
      <span className="font-semibold">
        {a.gate}.{a.line}
      </span>
      {warn ? (
        <span className="text-warning" title={`距離爻的邊界約 ${Math.round(a.minutesToLineBoundary)} 分鐘`}>
          <span aria-hidden="true">⚠</span>
          <span className="sr-only">（接近爻的邊界，約 {Math.round(a.minutesToLineBoundary)} 分鐘）</span>
        </span>
      ) : null}
    </span>
  );
}

function Details({ a, label }: { a: Activation | undefined; label: string }) {
  if (!a) return null;
  return (
    <div className="flex flex-col gap-1">
      <p className="font-medium">{label}</p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
        <dt className="text-muted">顏色</dt>
        <dd>{a.color}</dd>
        <dt className="text-muted">調性</dt>
        <dd>{a.tone}</dd>
        <dt className="text-muted">基調</dt>
        <dd>{a.base}</dd>
        <dt className="text-muted">黃經</dt>
        <dd className="tabular-nums">{formatLongitude(a.longitude)}</dd>
        <dt className="text-muted">速度</dt>
        <dd className="tabular-nums">
          {a.speed.toFixed(4)}°／日{a.speed < 0 ? '（逆行）' : ''}
        </dd>
        <dt className="text-muted">距爻邊界</dt>
        <dd className="tabular-nums">
          {Number.isFinite(a.minutesToLineBoundary) ? `約 ${Math.round(a.minutesToLineBoundary)} 分鐘` : '—'}
        </dd>
      </dl>
    </div>
  );
}

export function ActivationTable({ activations }: { activations: readonly Activation[] }) {
  const [open, setOpen] = useState<Set<Planet>>(() => new Set());
  const anyWarn = activations.some(nearBoundary);

  function toggle(p: Planet) {
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(p)) n.delete(p);
      else n.add(p);
      return n;
    });
  }

  return (
    <section
      aria-labelledby="activations-title"
      className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-5"
    >
      <div className="flex flex-col gap-1">
        <h2 id="activations-title" className="text-lg font-semibold">
          星體啟動
        </h2>
        <p className="text-sm text-muted">
          格式為「閘門.爻」。點選星體可展開顏色、調性、基調與黃經。
          {anyWarn ? ' ⚠ 表示距離爻的邊界不到 30 分鐘，出生時間稍有誤差就可能改變。' : ''}
        </p>
      </div>
      <table className="w-full border-collapse text-center">
        <caption className="sr-only">設計與個性的 13 個星體啟動</caption>
        <thead>
          <tr className="border-b border-border text-sm">
            <th scope="col" className="w-1/3 py-2 font-semibold text-design">
              設計
            </th>
            <th scope="col" className="w-1/3 py-2 font-semibold">
              星體
            </th>
            <th scope="col" className="w-1/3 py-2 font-semibold text-personality">
              個性
            </th>
          </tr>
        </thead>
        {PLANET_ORDER.map((planet) => {
          const d = find(activations, 'design', planet);
          const p = find(activations, 'personality', planet);
          const isOpen = open.has(planet);
          const detailId = `act-detail-${planet}`;
          return (
            <tbody key={planet} className="border-b border-border last:border-b-0">
              <tr>
                <td className="py-1.5 text-design">
                  <Cell a={d} />
                </td>
                <th scope="row" className="py-1.5 font-normal">
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    aria-controls={detailId}
                    onClick={() => toggle(planet)}
                    className="inline-flex items-center gap-1.5 rounded px-2 py-0.5 hover:bg-surface-2"
                  >
                    <span aria-hidden="true" className="text-lg leading-none">
                      {PLANET_SYMBOLS[planet]}
                    </span>
                    <span className="text-sm">{PLANET_NAMES_ZH[planet]}</span>
                    <span aria-hidden="true" className="text-xs text-muted">
                      {isOpen ? '▴' : '▾'}
                    </span>
                  </button>
                </th>
                <td className="py-1.5 text-personality">
                  <Cell a={p} />
                </td>
              </tr>
              <tr id={detailId} hidden={!isOpen}>
                <td colSpan={3} className="pb-3">
                  {isOpen ? (
                    <div className="grid grid-cols-2 gap-4 rounded-md bg-surface-2 p-3 text-left text-sm">
                      <Details a={d} label="設計" />
                      <Details a={p} label="個性" />
                    </div>
                  ) : null}
                </td>
              </tr>
            </tbody>
          );
        })}
      </table>
    </section>
  );
}
