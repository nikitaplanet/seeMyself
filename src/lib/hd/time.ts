import { IANAZone } from 'luxon';
import { MAX_DATE, MIN_DATE } from './constants';
import { HDError } from './errors';

// Spec §4.3 / §4.4 — local wall time + IANA zone → UTC → Julian Day (UT).
// Intentionally free of the native sweph module so it stays usable anywhere.

const MS_PER_DAY = 86_400_000;
const JD_UNIX_EPOCH = 2440587.5;
const MS_PER_HOUR = 3_600_000;

export interface UtcInstant {
  utcMs: number;
  utcIso: string; // 'YYYY-MM-DDTHH:mm:ssZ'
  jd: number;     // Julian Day (UT)
}

/**
 * Unix ms → Julian Day (UT).
 * SPEC-QUESTION: spec §4.4 says to use `sweph.julday(y, m, d, hourUT, SE_GREG_CAL)`. To keep time.ts
 * free of the native module we use the exact arithmetic equivalent (proleptic Gregorian, UT);
 * tests/hd/time.test.ts asserts equality with sweph.julday within 1e-9 days.
 */
export function unixMsToJd(utcMs: number): number {
  return utcMs / MS_PER_DAY + JD_UNIX_EPOCH;
}

export function jdToUnixMs(jd: number): number {
  return (jd - JD_UNIX_EPOCH) * MS_PER_DAY;
}

/** ISO 8601 UTC with second precision, e.g. '2021-07-01T04:00:00Z' (spec §9.1 format). */
export function toIsoUtc(utcMs: number): string {
  const rounded = Math.round(utcMs / 1000) * 1000;
  return new Date(rounded).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

export function instantFromUtcMs(utcMs: number): UtcInstant {
  return { utcMs, utcIso: toIsoUtc(utcMs), jd: unixMsToJd(utcMs) };
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^(\d{2}):(\d{2})$/;

/** Builds a UTC ms value from wall-clock fields, safe for years < 100 (not needed here, but correct). */
function wallAsUtcMs(y: number, mo: number, d: number, h: number, mi: number): number {
  const date = new Date(0);
  date.setUTCFullYear(y, mo - 1, d);
  date.setUTCHours(h, mi, 0, 0);
  return date.getTime();
}

/**
 * Converts a local date/time in an IANA zone to a UTC instant, detecting DST gaps/overlaps.
 * Throws HDError: INVALID_INPUT, DATE_OUT_OF_RANGE, NONEXISTENT_LOCAL_TIME, AMBIGUOUS_LOCAL_TIME.
 */
export function localToUtc(
  date: string,
  time: string,
  timezone: string,
  disambiguation?: 'earlier' | 'later',
): UtcInstant {
  const dm = DATE_RE.exec(date);
  const tm = TIME_RE.exec(time);
  if (!dm) throw new HDError('INVALID_INPUT', { details: { field: 'date', value: date } });
  if (!tm) throw new HDError('INVALID_INPUT', { details: { field: 'time', value: time } });

  const y = Number(dm[1]);
  const mo = Number(dm[2]);
  const d = Number(dm[3]);
  const h = Number(tm[1]);
  const mi = Number(tm[2]);

  if (h > 23 || mi > 59) throw new HDError('INVALID_INPUT', { details: { field: 'time', value: time } });

  const t0 = wallAsUtcMs(y, mo, d, h, mi);
  const check = new Date(t0);
  if (check.getUTCFullYear() !== y || check.getUTCMonth() + 1 !== mo || check.getUTCDate() !== d) {
    throw new HDError('INVALID_INPUT', { details: { field: 'date', value: date } });
  }

  // SPEC-QUESTION: §4.4 and §9.1 both state 1800-01-01..2150-12-31 without saying whether the bound
  // applies to the local date or to the UTC instant. We check the local date as entered (the same
  // rule the API's zod validation applies), so the two layers never disagree.
  if (date < MIN_DATE || date > MAX_DATE) {
    throw new HDError('DATE_OUT_OF_RANGE', { details: { date, min: MIN_DATE, max: MAX_DATE } });
  }

  if (!IANAZone.isValidZone(timezone)) {
    throw new HDError('INVALID_INPUT', { details: { field: 'timezone', value: timezone } });
  }
  const zone = IANAZone.create(timezone);

  // §4.3 steps 2–3: candidate offsets (minutes) at t0−36h, t0, t0+36h; keep self-consistent ones.
  const candidates = new Set<number>([
    zone.offset(t0 - 36 * MS_PER_HOUR),
    zone.offset(t0),
    zone.offset(t0 + 36 * MS_PER_HOUR),
  ]);
  const solutions = new Set<number>();
  for (const o of candidates) {
    const utc = t0 - o * 60_000;
    if (zone.offset(utc) === o) solutions.add(utc);
  }
  const valid = [...solutions].sort((a, b) => a - b);

  if (valid.length === 0) {
    throw new HDError('NONEXISTENT_LOCAL_TIME', { details: { date, time, timezone } });
  }
  if (valid.length === 1) return instantFromUtcMs(valid[0]);

  // SPEC-QUESTION: >2 solutions cannot happen with real tzdb data inside a ±36h window; if it ever
  // did, 'earlier'/'later' pick the first/last instant and no disambiguation still raises AMBIGUOUS.
  if (disambiguation === 'earlier') return instantFromUtcMs(valid[0]);
  if (disambiguation === 'later') return instantFromUtcMs(valid[valid.length - 1]);
  throw new HDError('AMBIGUOUS_LOCAL_TIME', {
    details: { candidates: valid.map(toIsoUtc) },
  });
}
