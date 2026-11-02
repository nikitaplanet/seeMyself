'use client';

import Link from 'next/link';
import { useMemo, useState, useSyncExternalStore } from 'react';
import { CENTER_NAMES_ZH } from '@/lib/hd/constants';
import { buildHdAiPrompt } from '@/lib/hd/prompt';
import type { BirthInput, ChartResult, NodeMode } from '@/lib/hd/types';
import {
  parseStoredChart,
  postChart,
  readStoredChartRaw,
  saveStoredChart,
  subscribeStoredChart,
} from '@/lib/ui/chartClient';
import { ActivationTable } from './ActivationTable';
import { AiPromptCard } from './AiPromptCard';
import { BodyGraph } from './BodyGraph/BodyGraph';
import { ChartSummary } from './ChartSummary';
import { SaveChartButton } from './charts/SaveChartButton';
import { SensitivityPanel } from './SensitivityPanel';
import { ZiweiView } from './ziwei/ZiweiView';

// Spec §11.2 — the result page. The chart arrives through sessionStorage (never the URL). During
// prerender / SSR there is no sessionStorage, so the server snapshot is `undefined` and a skeleton
// is shown; the client then reads the stored chart (or shows the empty state).

const serverSnapshot = (): string | null | undefined => undefined;

export function ChartView() {
  const raw = useSyncExternalStore<string | null | undefined>(
    subscribeStoredChart,
    readStoredChartRaw,
    serverSnapshot,
  );
  const stored = useMemo(
    () => (raw === undefined ? undefined : parseStoredChart(raw)),
    [raw],
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'hd' | 'ziwei'>('hd');

  if (stored === undefined) return <ChartSkeleton />;
  if (stored === null) return <EmptyState />;

  const chart = stored.result;

  async function toggleNodeMode() {
    if (!stored || busy) return;
    const next: NodeMode = chart.meta.nodeMode === 'true' ? 'mean' : 'true';
    const input: BirthInput = {
      ...stored.input,
      options: { ...stored.input.options, nodeMode: next },
    };
    setBusy(true);
    setError(null);
    const res = await postChart(input);
    setBusy(false);
    if (res.ok) saveStoredChart({ ...stored, input, result: res.chart });
    else setError(res.error.message);
  }

  return (
    <div aria-busy={busy}>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h1 className="text-2xl font-bold">
          排盤結果
          {stored.saved ? (
            <span className="ml-2 text-lg font-medium text-muted">
              · {stored.saved.name}
            </span>
          ) : null}
        </h1>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <SaveChartButton stored={stored} />
          <Link href="/" className="text-sm underline hover:text-accent">
            重新輸入出生資料
          </Link>
        </div>
      </div>
      {error ? (
        <p
          role="alert"
          className="mb-4 rounded-md border border-danger px-3 py-2 text-danger"
        >
          {error}
        </p>
      ) : null}

      <div
        role="tablist"
        aria-label="命盤種類"
        className="mb-6 flex gap-1 border-b border-border"
      >
        <TabButton selected={tab === 'hd'} onClick={() => setTab('hd')}>
          人類圖
        </TabButton>
        <TabButton selected={tab === 'ziwei'} onClick={() => setTab('ziwei')}>
          紫微斗數
        </TabButton>
      </div>

      {tab === 'ziwei' ? (
        <ZiweiView
          chart={stored.ziwei}
          timeUnknown={stored.timeUnknown}
          error={stored.ziweiError}
          input={stored.input}
        />
      ) : (
        <div
          className={`space-y-6 ${busy ? 'opacity-60 transition-opacity' : ''}`}
        >
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-6">
              <ChartSummary
                stored={stored}
                busy={busy}
                onToggleNodeMode={toggleNodeMode}
              />
              <section
                aria-labelledby="graph-title"
                className="rounded-lg border border-border bg-surface p-4"
              >
                <h2 id="graph-title" className="text-lg font-semibold">
                  人體圖
                </h2>
                <GraphLegend />
                <BodyGraph chart={chart} />
              </section>
            </div>
            <div className="space-y-6">
              <ActivationTable activations={chart.activations} />
              <SensitivityPanel
                chart={chart}
                timeUnknown={stored.timeUnknown}
              />
              <ChannelList chart={chart} />
            </div>
          </div>
          <AiPromptCard
            heading="提供給 AI 的提示詞"
            description="複製後可貼到 ChatGPT、Claude 等，請它依這份人類圖做解讀。內容含出生資料。"
            text={buildHdAiPrompt({
              input: stored.input,
              result: stored.result,
              timeUnknown: stored.timeUnknown,
              placeLabel: stored.placeLabel,
            })}
          />
        </div>
      )}
    </div>
  );
}

function TabButton({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      onClick={onClick}
      className={`cursor-pointer -mb-px border-b-2 px-4 py-2 text-sm font-medium ${
        selected
          ? 'border-accent text-accent'
          : 'border-transparent text-muted hover:text-fg'
      }`}
    >
      {children}
    </button>
  );
}

function GraphLegend() {
  return (
    <ul
      className="mb-2 mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted"
      aria-label="圖例"
    >
      <li className="flex items-center gap-1.5">
        <span
          aria-hidden="true"
          className="inline-block h-1.5 w-6 bg-personality"
        />
        個性
      </li>
      <li className="flex items-center gap-1.5">
        <span aria-hidden="true" className="inline-block h-1.5 w-6 bg-design" />
        設計
      </li>
      <li className="flex items-center gap-1.5">
        <svg aria-hidden="true" width="24" height="6" className="inline-block">
          <defs>
            <pattern
              id="legend-both"
              patternUnits="userSpaceOnUse"
              width="6"
              height="6"
              patternTransform="rotate(45)"
            >
              <rect
                width="3"
                height="6"
                style={{ fill: 'var(--hd-personality)' }}
              />
              <rect
                x="3"
                width="3"
                height="6"
                style={{ fill: 'var(--hd-design)' }}
              />
            </pattern>
          </defs>
          <rect width="24" height="6" fill="url(#legend-both)" />
        </svg>
        兩側皆有
      </li>
      <li className="flex items-center gap-1.5">
        <span
          aria-hidden="true"
          className="inline-flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold"
          style={{
            background: 'var(--hd-gate-on)',
            color: 'var(--hd-gate-on-text)',
          }}
        >
          1
        </span>
        已啟動閘門（可點選或用 Tab 檢視）
      </li>
    </ul>
  );
}

function ChannelList({ chart }: { chart: ChartResult }) {
  return (
    <section
      aria-labelledby="channels-title"
      className="rounded-lg border border-border bg-surface p-5"
    >
      <h2 id="channels-title" className="text-lg font-semibold">
        已成立的通道
      </h2>
      {chart.channels.length === 0 ? (
        <p className="mt-2 text-muted">沒有已成立的通道。</p>
      ) : (
        <ul className="mt-2 divide-y divide-border">
          {chart.channels.map(c => (
            <li
              key={c.id}
              className="flex flex-wrap items-baseline gap-x-3 py-2"
            >
              <span className="w-14 font-semibold tabular-nums">{c.id}</span>
              <span>
                {CENTER_NAMES_ZH[c.centers[0]]} —{' '}
                {CENTER_NAMES_ZH[c.centers[1]]}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function EmptyState() {
  return (
    <div className="mx-auto max-w-xl rounded-lg border border-border bg-surface p-8 text-center">
      <h1 className="text-xl font-semibold">目前沒有排盤資料</h1>
      <p className="mt-3 text-muted">
        為了保護隱私，排盤結果只暫存在原本的瀏覽器分頁中；關閉分頁或直接開啟這個網址時，就不會有資料。
      </p>
      <Link
        href="/"
        className="mt-6 inline-block rounded-md bg-accent px-5 py-2.5 font-semibold text-accent-fg hover:opacity-90"
      >
        輸入出生資料
      </Link>
    </div>
  );
}

function ChartSkeleton() {
  const block = 'hd-skeleton rounded-lg bg-surface-2';
  return (
    <div aria-busy="true" aria-live="polite">
      <p className="sr-only">正在載入排盤結果…</p>
      <div className={`${block} mb-6 h-8 w-40`} />
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <div className={`${block} h-64`} />
          <div
            className={`${block} mx-auto aspect-[400/640] w-full max-w-[480px]`}
          />
        </div>
        <div className="space-y-6">
          <div className={`${block} h-96`} />
          <div className={`${block} h-40`} />
        </div>
      </div>
    </div>
  );
}
