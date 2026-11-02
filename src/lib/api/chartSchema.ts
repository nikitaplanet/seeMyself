import { IANAZone } from 'luxon';
import { z } from 'zod';
import { MAX_DATE, MIN_DATE } from '../hd/constants';
import type { BirthInput } from '../hd/types';

// Spec §9.1 — request body validation for POST /api/chart. Structure is `BirthInput` (§3.2).

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Marker placed in `params` of the custom issue raised for an out-of-range (but real) date. */
export const DATE_OUT_OF_RANGE_PARAM = 'DATE_OUT_OF_RANGE';

function isRealDate(value: string): boolean {
  const m = DATE_RE.exec(value);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const date = new Date(0);
  date.setUTCFullYear(y, mo - 1, d);
  return date.getUTCFullYear() === y && date.getUTCMonth() + 1 === mo && date.getUTCDate() === d;
}

let supportedZones: Set<string> | null = null;
function intlZones(): Set<string> {
  if (supportedZones === null) {
    const list = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [];
    supportedZones = new Set(list);
  }
  return supportedZones;
}

/** §9.1: in `Intl.supportedValuesOf('timeZone')`, or a valid IANA name according to luxon. */
export function isValidTimezone(tz: string): boolean {
  return intlZones().has(tz) || IANAZone.isValidZone(tz);
}

const dateSchema = z
  .string()
  .regex(DATE_RE, { message: '日期格式必須為 YYYY-MM-DD。' })
  .refine(isRealDate, { message: '日期不存在，請確認年月日。', abort: true })
  .refine((d) => d >= MIN_DATE && d <= MAX_DATE, {
    message: `出生日期必須介於 ${MIN_DATE} 至 ${MAX_DATE}。`,
    params: { hdCode: DATE_OUT_OF_RANGE_PARAM },
  });

const placeSchema = z.object({
  name: z.string().min(1, { message: '地名不可為空。' }).max(200, { message: '地名過長。' }),
  lat: z.number().min(-90, { message: '緯度必須介於 -90 至 90。' }).max(90, { message: '緯度必須介於 -90 至 90。' }),
  lon: z
    .number()
    .min(-180, { message: '經度必須介於 -180 至 180。' })
    .max(180, { message: '經度必須介於 -180 至 180。' }),
  countryCode: z.string().regex(/^[A-Za-z]{2}$/, { message: '國家代碼必須為兩個英文字母。' }),
});

const optionsSchema = z.object({
  nodeMode: z.enum(['true', 'mean'], { message: '交點模式必須為 true 或 mean。' }).optional(),
  sensitivityMinutes: z
    .array(
      z
        .number({ message: '偏移量必須是數字。' })
        .int({ message: '偏移量必須是整數分鐘。' })
        .min(-720, { message: '偏移量必須介於 -720 至 720 分鐘。' })
        .max(720, { message: '偏移量必須介於 -720 至 720 分鐘。' }),
    )
    .max(8, { message: '敏感度偏移最多 8 個。' })
    .optional(),
  disambiguation: z.enum(['earlier', 'later'], { message: '重複時段選擇必須為 earlier 或 later。' }).optional(),
});

export const birthInputSchema = z.object({
  date: z.string({ message: '請提供出生日期。' }).pipe(dateSchema),
  time: z.string({ message: '請提供出生時間。' }).regex(TIME_RE, { message: '時間格式必須為 HH:mm（00:00～23:59）。' }),
  timezone: z
    .string({ message: '請提供時區。' })
    .min(1, { message: '請提供時區。' })
    .refine(isValidTimezone, { message: '無法辨識的時區名稱。' }),
  place: placeSchema.optional(),
  options: optionsSchema.optional(),
}, { message: '請求本文必須是 JSON 物件。' });

export type ParsedBirthInput = z.infer<typeof birthInputSchema>;

// Compile-time check: the parsed shape must be assignable to the calc layer's BirthInput.
const _assignable: (x: ParsedBirthInput) => BirthInput = (x) => x;
void _assignable;

export interface FieldError {
  path: string;
  message: string;
}

export type BirthInputParseResult =
  | { ok: true; data: BirthInput }
  | { ok: false; code: 'INVALID_INPUT' | 'DATE_OUT_OF_RANGE'; fieldErrors: FieldError[] };

/**
 * Validates an unknown JSON value. A real but out-of-range date yields DATE_OUT_OF_RANGE only when
 * it is the sole problem; any other field error makes the whole request INVALID_INPUT.
 */
export function parseBirthInput(value: unknown): BirthInputParseResult {
  const res = birthInputSchema.safeParse(value);
  if (res.success) return { ok: true, data: res.data };
  const issues = res.error.issues;
  const fieldErrors: FieldError[] = issues.map((i) => ({
    path: i.path.map(String).join('.') || '(root)',
    message: i.message,
  }));
  const onlyRange =
    issues.length > 0 &&
    issues.every(
      (i) => i.code === 'custom' && (i as { params?: { hdCode?: string } }).params?.hdCode === DATE_OUT_OF_RANGE_PARAM,
    );
  return { ok: false, code: onlyRange ? 'DATE_OUT_OF_RANGE' : 'INVALID_INPUT', fieldErrors };
}
