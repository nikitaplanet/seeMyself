import type { BaziChart } from '@/lib/bazi/types';
import { parseSavedRef, type SavedRef } from '@/lib/charts/mapping';
import type { BirthInput, ChartResult } from '@/lib/hd/types';
import type { ZiweiChart } from '@/lib/ziwei/types';

// Browser-side helpers shared by the form page and the result page: calling POST /api/chart and
// passing the result through sessionStorage (spec §11.1, §13.3 — never through the URL).

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export type ChartResponse =
  | { ok: true; chart: ChartResult }
  | { ok: false; status: number; error: ApiError };
export type ZiweiResponse =
  | { ok: true; chart: ZiweiChart }
  | { ok: false; status: number; error: ApiError };
export type BaziResponse =
  | { ok: true; chart: BaziChart }
  | { ok: false; status: number; error: ApiError };

const NETWORK_ERROR: ApiError = {
  code: 'NETWORK_ERROR',
  message: '無法連線到伺服器，請檢查網路後再試。',
};

function isApiErrorBody(v: unknown): v is { error: ApiError } {
  if (typeof v !== 'object' || v === null || !('error' in v)) return false;
  const e = (v as { error: unknown }).error;
  return (
    typeof e === 'object' &&
    e !== null &&
    typeof (e as ApiError).code === 'string' &&
    typeof (e as ApiError).message === 'string'
  );
}

export async function postChart(
  input: BirthInput,
  signal?: AbortSignal,
): Promise<ChartResponse> {
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
  if (
    res.ok &&
    body !== null &&
    typeof body === 'object' &&
    'activations' in body
  ) {
    return { ok: true, chart: body as ChartResult };
  }
  if (isApiErrorBody(body))
    return { ok: false, status: res.status, error: body.error };
  return {
    ok: false,
    status: res.status,
    error: {
      code: 'UNKNOWN',
      message: `伺服器回應異常（HTTP ${res.status}），請稍後再試。`,
    },
  };
}

function isBaziChart(v: unknown): v is BaziChart {
  if (typeof v !== 'object' || v === null) return false;
  const c = v as Partial<BaziChart>;
  return (
    Array.isArray(c.pillars) &&
    c.pillars.length === 4 &&
    typeof c.ganZhiLabel === 'string' &&
    Array.isArray(c.daYun) &&
    Array.isArray(c.wuXing) &&
    c.wuXing.length === 5
  );
}

function isZiweiChart(v: unknown): v is ZiweiChart {
  if (typeof v !== 'object' || v === null) return false;
  const c = v as Partial<ZiweiChart>;
  return (
    Array.isArray(c.palaces) &&
    c.palaces.length === 12 &&
    typeof c.fiveElementsClass === 'string' &&
    typeof c.luckIndex === 'number' &&
    c.horoscope !== null &&
    typeof c.horoscope === 'object'
  );
}

export async function postZiwei(
  input: BirthInput,
  timeUnknown: boolean,
  signal?: AbortSignal,
  extras?: { targetDate?: string; targetTimeIndex?: number },
): Promise<ZiweiResponse> {
  let res: Response;
  try {
    res = await fetch('/api/ziwei', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...input, timeUnknown, ...extras }),
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
  if (res.ok && isZiweiChart(body)) return { ok: true, chart: body };
  if (isApiErrorBody(body))
    return { ok: false, status: res.status, error: body.error };
  return {
    ok: false,
    status: res.status,
    error: {
      code: 'UNKNOWN',
      message: `伺服器回應異常（HTTP ${res.status}），請稍後再試。`,
    },
  };
}

export async function postBazi(
  input: BirthInput,
  timeUnknown: boolean,
  signal?: AbortSignal,
): Promise<BaziResponse> {
  let res: Response;
  try {
    res = await fetch('/api/bazi', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...input, timeUnknown }),
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
  if (res.ok && isBaziChart(body)) return { ok: true, chart: body };
  if (isApiErrorBody(body))
    return { ok: false, status: res.status, error: body.error };
  return {
    ok: false,
    status: res.status,
    error: {
      code: 'UNKNOWN',
      message: `伺服器回應異常（HTTP ${res.status}），請稍後再試。`,
    },
  };
}

/** Human Design is required; 紫微／八字 are best-effort so a library failure still shows the bodygraph. */
export async function postBoth(
  input: BirthInput,
  timeUnknown: boolean,
  signal?: AbortSignal,
): Promise<{ hd: ChartResponse; ziwei: ZiweiResponse | null; bazi: BaziResponse | null }> {
  const hdPromise = postChart(input, signal);
  if (!input.gender) {
    const hd = await hdPromise;
    return { hd, ziwei: null, bazi: null };
  }
  const [hd, ziwei, bazi] = await Promise.all([
    hdPromise,
    postZiwei(input, timeUnknown, signal),
    postBazi(input, timeUnknown, signal),
  ]);
  return { hd, ziwei, bazi };
}

export function attachZiwei(
  stored: StoredChart,
  ziwei: ZiweiResponse | null,
): StoredChart {
  if (!ziwei) {
    return {
      ...stored,
      ziwei: null,
      ziweiError: stored.input.gender
        ? null
        : '紫微斗數需要性別。重新輸入一次並選擇男或女即可一併排出。',
    };
  }
  if (ziwei.ok) return { ...stored, ziwei: ziwei.chart, ziweiError: null };
  return { ...stored, ziwei: null, ziweiError: ziwei.error.message };
}

export function attachBazi(
  stored: StoredChart,
  bazi: BaziResponse | null,
): StoredChart {
  if (!bazi) {
    return {
      ...stored,
      bazi: null,
      baziError: stored.input.gender
        ? null
        : '八字排盤需要性別。重新輸入一次並選擇男或女即可一併排出。',
    };
  }
  if (bazi.ok) return { ...stored, bazi: bazi.chart, baziError: null };
  return { ...stored, bazi: null, baziError: bazi.error.message };
}

export function attachSidecars(
  stored: StoredChart,
  ziwei: ZiweiResponse | null,
  bazi: BaziResponse | null,
): StoredChart {
  return attachBazi(attachZiwei(stored, ziwei), bazi);
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
  ziwei?: ZiweiChart | null;
  ziweiError?: string | null;
  bazi?: BaziChart | null;
  baziError?: string | null;
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
  listeners.forEach(l => l());
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
    if (
      !v ||
      typeof v !== 'object' ||
      !v.input ||
      !v.result ||
      !Array.isArray(v.result.activations)
    )
      return null;
    return {
      input: v.input,
      result: v.result,
      timeUnknown: v.timeUnknown === true,
      placeLabel: typeof v.placeLabel === 'string' ? v.placeLabel : null,
      saved: parseSavedRef(v.saved),
      ziwei: isZiweiChart(v.ziwei) ? v.ziwei : null,
      ziweiError: typeof v.ziweiError === 'string' ? v.ziweiError : null,
      bazi: isBaziChart(v.bazi) ? v.bazi : null,
      baziError: typeof v.baziError === 'string' ? v.baziError : null,
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
  pendingListeners.forEach(l => l());
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
