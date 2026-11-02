import { parseSavedRef, type SavedRef } from '@/lib/charts/mapping';
import type { BirthInput, ChartResult } from '@/lib/hd/types';

// Browser-side helpers shared by the form page and the result page: calling POST /api/chart and
// passing the result through sessionStorage (spec §11.1, §13.3 — never through the URL).

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export type ChartResponse = { ok: true; chart: ChartResult } | { ok: false; status: number; error: ApiError };

const NETWORK_ERROR: ApiError = { code: 'NETWORK_ERROR', message: '無法連線到伺服器，請檢查網路後再試。' };

function isApiErrorBody(v: unknown): v is { error: ApiError } {
  if (typeof v !== 'object' || v === null || !('error' in v)) return false;
  const e = (v as { error: unknown }).error;
  return typeof e === 'object' && e !== null && typeof (e as ApiError).code === 'string' && typeof (e as ApiError).message === 'string';
}

export async function postChart(input: BirthInput, signal?: AbortSignal): Promise<ChartResponse> {
  let res: Response;
  try {
    res = await fetch('/api/chart', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
      signal,
    });
  } catch {
    return { ok: false, status: 0, error: NETWORK_ERROR };
  }
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    // fall through
  }
  if (res.ok && body !== null && typeof body === 'object' && 'activations' in body) {
    return { ok: true, chart: body as ChartResult };
  }
  if (isApiErrorBody(body)) return { ok: false, status: res.status, error: body.error };
  return {
    ok: false,
    status: res.status,
    error: { code: 'UNKNOWN', message: `伺服器回應異常（HTTP ${res.status}），請稍後再試。` },
  };
}

// ---------------------------------------------------------------------------
// sessionStorage hand-off
// ---------------------------------------------------------------------------

export const CHART_STORAGE_KEY = 'hd-chart:v1';

export interface StoredChart {
  /** Exactly what was POSTed (so the result page can re-POST with another node mode). */
  input: BirthInput;
  result: ChartResult;
  /** 出生時間不確定 was checked (time sent as 12:00, offsets ±6h / ±12h). */
  timeUnknown: boolean;
  /** Display label of the chosen place, e.g. 「臺北市, 臺灣」; null when only a timezone was chosen. */
  placeLabel: string | null;
  /** Set when this chart was saved to, or opened from, the user's account (avoids duplicate saves). */
  saved?: SavedRef | null;
}

const listeners = new Set<() => void>();
// Fallback copy when sessionStorage is unavailable (private mode / blocked storage): the hand-off
// still works for client-side navigation within this page view.
let memoryCopy: string | null = null;

export function saveStoredChart(data: StoredChart): void {
  const raw = JSON.stringify(data);
  memoryCopy = raw;
  try {
    sessionStorage.setItem(CHART_STORAGE_KEY, raw);
  } catch {
    // ignore — memoryCopy is used instead
  }
  listeners.forEach((l) => l());
}

/** Raw snapshot for useSyncExternalStore (a string, so it is referentially stable). */
export function readStoredChartRaw(): string | null {
  try {
    return sessionStorage.getItem(CHART_STORAGE_KEY) ?? memoryCopy;
  } catch {
    return memoryCopy;
  }
}

export function subscribeStoredChart(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function parseStoredChart(raw: string | null): StoredChart | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<StoredChart>;
    if (!v || typeof v !== 'object' || !v.input || !v.result || !Array.isArray(v.result.activations)) return null;
    return {
      input: v.input,
      result: v.result,
      timeUnknown: v.timeUnknown === true,
      placeLabel: typeof v.placeLabel === 'string' ? v.placeLabel : null,
      saved: parseSavedRef(v.saved),
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// "Save after login" intent: set when a logged-out user clicks 登入 in the save dialog on /chart,
// so the dialog reopens once they come back signed in (same tab, so the chart is still stored).
// ---------------------------------------------------------------------------

export const PENDING_SAVE_KEY = 'hd-chart:pending-save';
const pendingListeners = new Set<() => void>();

export function setPendingSave(on: boolean): void {
  try {
    if (on) sessionStorage.setItem(PENDING_SAVE_KEY, '1');
    else sessionStorage.removeItem(PENDING_SAVE_KEY);
  } catch {
    // storage unavailable: the user just reopens the dialog by hand
  }
  pendingListeners.forEach((l) => l());
}

export function readPendingSave(): boolean {
  try {
    return sessionStorage.getItem(PENDING_SAVE_KEY) === '1';
  } catch {
    return false;
  }
}

export function subscribePendingSave(cb: () => void): () => void {
  pendingListeners.add(cb);
  return () => {
    pendingListeners.delete(cb);
  };
}

// ---------------------------------------------------------------------------
// Time formatting (UI layer only — the calc layer works in UTC / JD, §1.2 rule 5)
// ---------------------------------------------------------------------------

/** '1990-05-12T06:30:00.000Z' → '1990-05-12 06:30 UTC' */
export function formatUtc(iso: string): string {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(iso);
  return m ? `${m[1]} ${m[2]} UTC` : iso;
}

/** Minutes → 'UTC+8' / 'UTC−3:30' */
export function formatOffset(minutes: number): string {
  const sign = minutes >= 0 ? '+' : '−';
  const abs = Math.abs(minutes);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `UTC${sign}${h}${m ? `:${String(m).padStart(2, '0')}` : ''}`;
}

/** Duration in minutes → '15 分鐘' / '6 小時' / '1 小時 30 分鐘' */
export function formatMinutes(minutes: number): string {
  const abs = Math.abs(minutes);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  if (h === 0) return `${m} 分鐘`;
  return m === 0 ? `${h} 小時` : `${h} 小時 ${m} 分鐘`;
}
