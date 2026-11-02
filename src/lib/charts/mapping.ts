import type { Authority, BirthInput, HDType } from '@/lib/hd/types';
import type { ChartInsert, ChartRow, ChartUpdate, Json } from '@/lib/supabase/database.types';

// Pure mapping between `public.charts` rows and app types. No Supabase / React imports, unit-tested
// in tests/charts/mapping.test.ts. The jsonb `input` column is the exact BirthInput that was POSTed
// to /api/chart, so a saved chart is reopened by re-POSTing it; the other birth columns are a
// denormalised copy for list display.

export type ChartKind = 'self' | 'friend';

export const CHART_KIND_NAMES_ZH: Record<ChartKind, string> = { self: '我的', friend: '好友' };

/** Keep in sync with the CHECK constraints in supabase/migrations/*_charts.sql. */
export const CHART_NAME_MAX = 60;
export const CHART_NOTE_MAX = 500;

/** Marker on a session chart that was saved to / opened from the account (avoids duplicate saves). */
export interface SavedRef {
  id: string;
  name: string;
  kind: ChartKind;
}

export interface SavedChart {
  id: string;
  kind: ChartKind;
  name: string;
  note: string | null;
  input: BirthInput;
  timeUnknown: boolean;
  placeLabel: string | null;
  summary: { type: HDType | null; profile: string | null; authority: Authority | null };
  createdAt: string;
  updatedAt: string;
}

/** What the save / edit forms collect. */
export interface ChartMeta {
  kind: ChartKind;
  name: string;
  note: string;
}

/** The parts of a computed chart (StoredChart in chartClient) that saving needs. */
export interface ComputedChart {
  input: BirthInput;
  result: { type: HDType; authority: Authority; profile: { personality: number; design: number } };
  timeUnknown: boolean;
  placeLabel: string | null;
}

const HD_TYPES: readonly HDType[] = ['manifestor', 'generator', 'manifestingGenerator', 'projector', 'reflector'];
const AUTHORITIES: readonly Authority[] = [
  'emotional', 'sacral', 'splenic', 'egoManifested', 'egoProjected', 'selfProjected', 'mental', 'lunar',
];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Shape check + copy of a BirthInput, dropping unknown keys. Returns null when required fields are
 * missing or malformed. (Full validation — real dates, valid zones, ranges — is done again by
 * /api/chart when the chart is recomputed.)
 */
export function sanitizeBirthInput(v: unknown): BirthInput | null {
  if (!isRecord(v)) return null;
  const { date, time, timezone, place, options } = v;
  if (typeof date !== 'string' || !DATE_RE.test(date)) return null;
  if (typeof time !== 'string' || !TIME_RE.test(time)) return null;
  if (typeof timezone !== 'string' || timezone === '' || timezone.length > 64) return null;
  const out: BirthInput = { date, time, timezone };

  if (place !== undefined && place !== null) {
    if (!isRecord(place)) return null;
    const { name, lat, lon, countryCode } = place;
    if (typeof name !== 'string' || typeof countryCode !== 'string') return null;
    if (typeof lat !== 'number' || typeof lon !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    out.place = { name, lat, lon, countryCode };
  }

  if (options !== undefined && options !== null) {
    if (!isRecord(options)) return null;
    const o: NonNullable<BirthInput['options']> = {};
    if (options.nodeMode === 'true' || options.nodeMode === 'mean') o.nodeMode = options.nodeMode;
    if (options.disambiguation === 'earlier' || options.disambiguation === 'later') o.disambiguation = options.disambiguation;
    if (Array.isArray(options.sensitivityMinutes)) {
      const mins = options.sensitivityMinutes.filter((n): n is number => typeof n === 'number' && Number.isInteger(n));
      o.sensitivityMinutes = mins;
    }
    out.options = o;
  }
  return out;
}

function toJson(input: BirthInput): Json {
  // BirthInput is plain JSON data; a structural copy satisfies the Json type without `any`.
  return JSON.parse(JSON.stringify(input)) as Json;
}

export type MetaErrors = { name?: string; note?: string };

/** Trims the form values and checks them against the table's limits. */
export function normalizeChartMeta(meta: ChartMeta): { ok: true; value: ChartMeta } | { ok: false; errors: MetaErrors } {
  const name = meta.name.trim();
  const note = meta.note.trim();
  const errors: MetaErrors = {};
  if (!name) errors.name = '請輸入名稱。';
  else if ([...name].length > CHART_NAME_MAX) errors.name = `名稱最多 ${CHART_NAME_MAX} 個字。`;
  if ([...note].length > CHART_NOTE_MAX) errors.note = `備註最多 ${CHART_NOTE_MAX} 個字。`;
  if (meta.kind !== 'self' && meta.kind !== 'friend') errors.name = errors.name ?? '請選擇命盤類別。';
  if (errors.name || errors.note) return { ok: false, errors };
  return { ok: true, value: { kind: meta.kind, name, note } };
}

/** Computed chart + form values → insert payload (user_id is filled by the DB default auth.uid()). */
export function toChartInsert(chart: ComputedChart, meta: ChartMeta): ChartInsert {
  const input = sanitizeBirthInput(chart.input);
  if (!input) throw new Error('Invalid birth input');
  return {
    kind: meta.kind,
    name: meta.name,
    note: meta.note === '' ? null : meta.note,
    input: toJson(input),
    birth_date: input.date,
    birth_time: chart.timeUnknown ? null : input.time,
    time_unknown: chart.timeUnknown,
    timezone: input.timezone,
    place_label: chart.placeLabel,
    hd_type: chart.result.type,
    profile: `${chart.result.profile.personality}/${chart.result.profile.design}`,
    authority: chart.result.authority,
  };
}

/** Form values from the edit dialog → update payload. */
export function toChartUpdate(meta: ChartMeta): ChartUpdate {
  return { kind: meta.kind, name: meta.name, note: meta.note === '' ? null : meta.note };
}

/** DB row → app type. Null when the stored input is unusable (the list skips such rows). */
export function fromChartRow(row: ChartRow): SavedChart | null {
  const input = sanitizeBirthInput(row.input);
  if (!input) return null;
  if (row.kind !== 'self' && row.kind !== 'friend') return null;
  return {
    id: row.id,
    kind: row.kind,
    name: row.name,
    note: row.note,
    input,
    timeUnknown: row.time_unknown,
    placeLabel: row.place_label,
    summary: {
      type: HD_TYPES.includes(row.hd_type as HDType) ? (row.hd_type as HDType) : null,
      profile: row.profile && /^[1-6]\/[1-6]$/.test(row.profile) ? row.profile : null,
      authority: AUTHORITIES.includes(row.authority as Authority) ? (row.authority as Authority) : null,
    },
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toSavedRef(chart: Pick<SavedChart, 'id' | 'name' | 'kind'>): SavedRef {
  return { id: chart.id, name: chart.name, kind: chart.kind };
}

export function parseSavedRef(v: unknown): SavedRef | null {
  if (!isRecord(v)) return null;
  const { id, name, kind } = v;
  if (typeof id !== 'string' || typeof name !== 'string' || (kind !== 'self' && kind !== 'friend')) return null;
  return { id, name, kind };
}

/** PostgREST / network error → Chinese message for the charts UI. */
export function chartDbErrorMessage(err: { code?: string | null; message?: string | null } | null | undefined): string {
  const code = err?.code ?? '';
  const msg = err?.message ?? '';
  if (code === '42P01' || code === 'PGRST205' || /relation .* does not exist|could not find the table/i.test(msg)) {
    return '資料表尚未建立：請先在 Supabase 執行 supabase/migrations 內的 SQL。';
  }
  if (code === 'PGRST301' || code === 'PGRST303' || /jwt/i.test(msg)) return '登入狀態已過期，請重新登入。';
  if (code === '42501') return '沒有權限存取這筆命盤，請重新登入後再試。';
  if (code === '23514') return '名稱或備註超過長度限制。';
  if (code === 'PGRST116') return '找不到這筆命盤，可能已被刪除。';
  if (/failed to fetch|network|load failed/i.test(msg)) return '無法連線到資料庫，請檢查網路後再試。';
  return '儲存服務發生錯誤，請稍後再試。';
}
