import { DateTime } from 'luxon';
import { util } from 'iztro';
import { localToUtc } from '../hd/time';
import { TIME_INDEX_NAMES, TIME_INDEX_RANGES, type ZiweiTiming } from './types';

/** iztro: 0 = 早子時 (00:00), 12 = 晚子時 (23:00). */
export function timeIndexFromHour(hour: number): number {
  return util.timeToIndex(hour);
}

/**
 * Spencer equation of time (minutes). Accurate to about a minute — enough for 時辰 boundaries
 * which are two hours wide.
 */
export function equationOfTimeMinutes(dayOfYear: number): number {
  const B = (2 * Math.PI * (dayOfYear - 1)) / 365;
  return (
    229.18 *
    (0.000075 +
      0.001868 * Math.cos(B) -
      0.032077 * Math.sin(B) -
      0.014615 * Math.cos(2 * B) -
      0.040849 * Math.sin(2 * B))
  );
}

export interface ZiweiTimingInput {
  date: string;
  time: string;
  timezone: string;
  lon?: number;
  timeUnknown?: boolean;
  disambiguation?: 'earlier' | 'later';
}

function timingOf(solarDate: string, timeIndex: number, clockTime: string, trueSolarTime: string, usedTrueSolar: boolean): ZiweiTiming {
  const idx = Math.min(12, Math.max(0, timeIndex));
  return {
    solarDate,
    timeIndex: idx,
    timeName: TIME_INDEX_NAMES[idx],
    timeRange: TIME_INDEX_RANGES[idx],
    clockTime,
    trueSolarTime,
    usedTrueSolar,
  };
}

function padDate(isoDate: string): string {
  return isoDate;
}

/**
 * Civil clock time → 紫微 時辰. When longitude is known, apply true solar time
 * (zone meridian + equation of time). Unknown birth time uses 午時 without TST.
 */
export function toZiweiTiming(input: ZiweiTimingInput): ZiweiTiming {
  if (input.timeUnknown) {
    return timingOf(padDate(input.date), 6, input.time, input.time, false);
  }

  const utc = localToUtc(input.date, input.time, input.timezone, input.disambiguation);
  const local = DateTime.fromMillis(utc.utcMs, { zone: input.timezone });
  const clockHour = local.hour;
  const clockMinute = local.minute;

  if (typeof input.lon !== 'number' || !Number.isFinite(input.lon)) {
    return timingOf(padDate(local.toISODate() ?? input.date), timeIndexFromHour(clockHour), input.time, input.time, false);
  }

  const offsetHours = local.offset / 60;
  const lonMinutes = 4 * (input.lon - offsetHours * 15);
  const eot = equationOfTimeMinutes(local.ordinal);
  let total = clockHour * 60 + clockMinute + lonMinutes + eot;
  let dayAdjust = 0;
  while (total < 0) {
    total += 1440;
    dayAdjust -= 1;
  }
  while (total >= 1440) {
    total -= 1440;
    dayAdjust += 1;
  }
  const tstHour = Math.floor(total / 60);
  const tstMinute = Math.floor(total % 60);
  const tstDate = DateTime.fromISO(input.date, { zone: 'utc' }).plus({ days: dayAdjust });
  const solarDate = tstDate.toISODate() ?? input.date;
  const trueSolarTime = `${String(tstHour).padStart(2, '0')}:${String(tstMinute).padStart(2, '0')}`;
  return timingOf(solarDate, timeIndexFromHour(tstHour), input.time, trueSolarTime, true);
}
