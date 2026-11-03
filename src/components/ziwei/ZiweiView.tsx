'use client';

import { useEffect, useId, useRef, useState } from 'react';
import type { BirthInput } from '@/lib/hd/types';
import {
  displayBrightness,
  displayPalaceName,
  SCOPE_LABELS,
  type ZiweiScope,
} from '@/lib/ziwei/labels';
import { majorStarRows } from '@/lib/ziwei/luck';
import { buildZiweiAiPrompt } from '@/lib/ziwei/prompt';
import { TIME_INDEX_NAMES, type ZiweiChart } from '@/lib/ziwei/types';
import { postZiwei } from '@/lib/ui/chartClient';
import { AiPromptCard } from '../AiPromptCard';
import { ZiweiBoard, type MonthStart } from './ZiweiBoard';

function scopeSoulIndex(
  chart: ZiweiChart,
  scope: ZiweiScope,
  monthStart: MonthStart,
): number {
  const h = chart.horoscope;
  if (scope === 'origin')
    return chart.palaces.find(p => p.isSoulPalace)?.index ?? 0;
  if (scope === 'yearly') return h.yearly.index;
  if (scope === 'monthly')
    return monthStart === 'yearlySoul'
      ? h.monthlyFromYearly.index
      : h.monthly.index;
  if (scope === 'daily')
    return monthStart === 'yearlySoul'
      ? h.dailyFromYearly.index
      : h.daily.index;
  return monthStart === 'yearlySoul'
    ? h.hourlyFromYearly.index
    : h.hourly.index;
}

function overlayPalaceName(
  chart: ZiweiChart,
  scope: ZiweiScope,
  monthStart: MonthStart,
  index: number,
): string {
  if (scope === 'origin') {
    const p = chart.palaces.find(x => x.index === index);
    return p
      ? displayPalaceName(p.name, {
          isSoulPalace: p.isSoulPalace,
          isBodyPalace: p.isBodyPalace,
        })
      : '命宮';
  }
  const names =
    scope === 'yearly'
      ? chart.horoscope.yearly.palaceNames
      : scope === 'monthly'
        ? monthStart === 'yearlySoul'
          ? chart.horoscope.monthlyFromYearly.palaceNames
          : chart.horoscope.monthly.palaceNames
        : scope === 'daily'
          ? monthStart === 'yearlySoul'
            ? chart.horoscope.dailyFromYearly.palaceNames
            : chart.horoscope.daily.palaceNames
          : monthStart === 'yearlySoul'
            ? chart.horoscope.hourlyFromYearly.palaceNames
            : chart.horoscope.hourly.palaceNames;
  return displayPalaceName(names[index] ?? '命宮');
}

const SCOPES: ZiweiScope[] = ['origin', 'yearly', 'monthly', 'daily', 'hourly'];

function padDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function parseIsoDate(iso: string): {
  year: number;
  month: number;
  day: number;
} {
  const [y, m, d] = iso.split('-').map(Number);
  return { year: y || 2026, month: m || 1, day: d || 1 };
}

export function ZiweiView({
  chart,
  timeUnknown,
  error,
  input,
}: {
  chart: ZiweiChart | null | undefined;
  timeUnknown: boolean;
  error?: string | null;
  input?: BirthInput;
}) {
  if (error && !chart) {
    return (
      <p
        role="alert"
        className="rounded-md border border-danger px-3 py-2 text-danger"
      >
        {error}
      </p>
    );
  }
  if (!chart) {
    return (
      <p className="rounded-md border border-border bg-surface px-4 py-6 text-muted">
        這份資料沒有紫微斗數命盤。請回到輸入頁選擇性別後重新排盤。
      </p>
    );
  }
  return (
    <ZiweiChartPanel
      chart={chart}
      timeUnknown={timeUnknown}
      error={error}
      input={input}
    />
  );
}

function ZiweiChartPanel({
  chart: natal,
  timeUnknown,
  error,
  input,
}: {
  chart: ZiweiChart;
  timeUnknown: boolean;
  error?: string | null;
  input?: BirthInput;
}) {
  const formId = useId();
  const [chart, setChart] = useState(natal);
  const [scope, setScope] = useState<ZiweiScope>('origin');
  const [monthStart, setMonthStart] = useState<MonthStart>('yearlySoul');
  const [selectedIndex, setSelectedIndex] = useState(
    () => natal.palaces.find(p => p.isSoulPalace)?.index ?? 0,
  );
  const initial = parseIsoDate(natal.horoscope.solarDate);
  const [year, setYear] = useState(initial.year);
  const [month, setMonth] = useState(initial.month);
  const [day, setDay] = useState(initial.day);
  const [timeIndex, setTimeIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [queryError, setQueryError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setChart(natal);
    const next = parseIsoDate(natal.horoscope.solarDate);
    setYear(next.year);
    setMonth(next.month);
    setDay(next.day);
    setSelectedIndex(natal.palaces.find(p => p.isSoulPalace)?.index ?? 0);
  }, [natal]);

  async function queryHoroscope(nextScope: ZiweiScope) {
    setScope(nextScope);
    setSelectedIndex(scopeSoulIndex(chart, nextScope, monthStart));
    if (nextScope === 'origin' || !input) return;
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setBusy(true);
    setQueryError(null);
    const res = await postZiwei(input, timeUnknown, ac.signal, {
      targetDate: padDate(year, month, day),
      targetTimeIndex: timeIndex,
    });
    if (ac.signal.aborted) return;
    setBusy(false);
    if (res.ok) setChart({ ...natal, horoscope: res.chart.horoscope });
    else setQueryError(res.error.message);
  }

  const rows = majorStarRows(chart.palaces);
  const years = Array.from({ length: 21 }, (_, i) => initial.year - 10 + i);

  return (
    <div className="flex flex-col gap-6">
      {timeUnknown || natal.timeUnknown ? (
        <p className="rounded-md border border-border bg-surface-2 px-3 py-2 text-sm text-muted">
          出生時間不確定，紫微斗數先以午時（11:00～12:59）排盤；時辰一改，十二宮會整盤重排。
        </p>
      ) : null}
      {natal.timing.usedTrueSolar ? (
        <p className="text-sm text-muted">
          真太陽時 {natal.timing.trueSolarTime}（鐘錶時間{' '}
          {natal.timing.clockTime}）
        </p>
      ) : null}
      {error ? (
        <p
          role="alert"
          className="rounded-md border border-danger px-3 py-2 text-danger"
        >
          {error}
        </p>
      ) : null}

      <fieldset className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
        <legend className="px-1 text-sm font-semibold">流月起始宮位</legend>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex items-center gap-1 text-sm">
            年
            <select
              className="rounded-md border border-border bg-surface px-2 py-1"
              value={year}
              onChange={e => setYear(Number(e.target.value))}
            >
              {years.map(y => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1 text-sm">
            月
            <select
              className="rounded-md border border-border bg-surface px-2 py-1"
              value={month}
              onChange={e => setMonth(Number(e.target.value))}
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1 text-sm">
            日
            <select
              className="rounded-md border border-border bg-surface px-2 py-1"
              value={day}
              onChange={e => setDay(Number(e.target.value))}
            >
              {Array.from({ length: 31 }, (_, i) => i + 1).map(d => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1 text-sm">
            時
            <select
              className="rounded-md border border-border bg-surface px-2 py-1"
              value={timeIndex}
              onChange={e => setTimeIndex(Number(e.target.value))}
            >
              {TIME_INDEX_NAMES.map((name, i) => (
                <option key={name} value={i}>
                  {i} {name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="flex flex-wrap gap-4 text-sm">
          <label className="inline-flex items-center gap-1.5">
            <input
              type="radio"
              name={`${formId}-month-start`}
              checked={monthStart === 'yearlySoul'}
              onChange={() => setMonthStart('yearlySoul')}
            />
            流年本宮
          </label>
          <label className="inline-flex items-center gap-1.5">
            <input
              type="radio"
              name={`${formId}-month-start`}
              checked={monthStart === 'doujun'}
              onChange={() => setMonthStart('doujun')}
            />
            流年斗君
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted">查詢：</span>
          {SCOPES.map(s => (
            <button
              key={s}
              type="button"
              className={`cursor-pointer rounded-md border px-3 py-1 text-sm ${
                scope === s
                  ? 'border-accent bg-accent text-accent-fg'
                  : 'border-border hover:border-accent'
              }`}
              aria-pressed={scope === s}
              disabled={busy && s !== 'origin'}
              onClick={() => void queryHoroscope(s)}
            >
              {SCOPE_LABELS[s]}
            </button>
          ))}
        </div>
        <p className="text-sm text-muted">
          目前運限日期 {chart.horoscope.solarDate}
          {chart.horoscope.lunarDate
            ? `（農曆 ${chart.horoscope.lunarDate}）`
            : ''}
          ，虛歲 {chart.horoscope.nominalAge}
        </p>
        {queryError ? (
          <p role="alert" className="text-sm text-danger">
            {queryError}
          </p>
        ) : null}
      </fieldset>

      <div className="text-center">
        <p className="text-xl font-semibold text-accent">
          {SCOPE_LABELS[scope]}：
          {overlayPalaceName(chart, scope, monthStart, selectedIndex)}
        </p>
      </div>

      <section aria-labelledby="ziwei-board-title">
        <h2 id="ziwei-board-title" className="sr-only">
          十二宮
        </h2>
        <div className="overflow-x-auto" aria-busy={busy}>
          <ZiweiBoard
            chart={chart}
            scope={scope}
            monthStart={monthStart}
            selectedIndex={selectedIndex}
            onSelectPalace={setSelectedIndex}
          />
        </div>
      </section>

      <section
        aria-labelledby="ziwei-star-analysis"
        className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-5"
      >
        <h2 id="ziwei-star-analysis" className="text-lg font-semibold">
          主星亮度與吉凶分析
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[28rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted">
                <th className="py-2 pr-3 font-medium">主星</th>
                <th className="py-2 pr-3 font-medium">落宮</th>
                <th className="py-2 pr-3 font-medium">亮度</th>
                <th className="py-2 pr-3 font-medium">四化</th>
                <th className="py-2 font-medium">吉凶</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr
                  key={`${row.name}-${row.palaceName}`}
                  className="border-b border-border"
                >
                  <td className="py-2 pr-3 font-medium">{row.name}</td>
                  <td className="py-2 pr-3">
                    {displayPalaceName(row.palaceName)}
                  </td>
                  <td className="py-2 pr-3">
                    {displayBrightness(row.brightness) || '—'}
                  </td>
                  <td className="py-2 pr-3">
                    {row.mutagen ? `化${row.mutagen}` : '—'}
                  </td>
                  <td className="py-2">{row.verdict}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <AiPromptCard
        heading="提供給 AI 的提示詞"
        description="複製後可貼到 ChatGPT、Claude 等，請它依這份紫微本命盤做解讀。內容含出生資料。"
        text={buildZiweiAiPrompt(natal)}
      />
    </div>
  );
}
