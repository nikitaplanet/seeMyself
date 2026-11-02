import { describe, expect, it } from 'vitest';
import { swephJulday } from '@/lib/hd/ephemeris/sweph-provider';
import { HDError } from '@/lib/hd/errors';
import { localToUtc, unixMsToJd } from '@/lib/hd/time';

function catchHD(fn: () => unknown): HDError {
  try {
    fn();
  } catch (e) {
    if (e instanceof HDError) return e;
    throw e;
  }
  throw new Error('expected HDError');
}

describe('localToUtc — spec §12.1', () => {
  it('2021-03-14 02:30 America/New_York → NONEXISTENT_LOCAL_TIME', () => {
    const e = catchHD(() => localToUtc('2021-03-14', '02:30', 'America/New_York'));
    expect(e.code).toBe('NONEXISTENT_LOCAL_TIME');
    expect(e.message).toMatch(/不存在/);
  });

  it('2021-11-07 01:30 America/New_York → AMBIGUOUS_LOCAL_TIME with 05:30Z and 06:30Z', () => {
    const e = catchHD(() => localToUtc('2021-11-07', '01:30', 'America/New_York'));
    expect(e.code).toBe('AMBIGUOUS_LOCAL_TIME');
    expect(e.details).toEqual({ candidates: ['2021-11-07T05:30:00Z', '2021-11-07T06:30:00Z'] });
  });

  it('ambiguous time resolves with disambiguation', () => {
    expect(localToUtc('2021-11-07', '01:30', 'America/New_York', 'earlier').utcIso).toBe('2021-11-07T05:30:00Z');
    expect(localToUtc('2021-11-07', '01:30', 'America/New_York', 'later').utcIso).toBe('2021-11-07T06:30:00Z');
  });

  it('2021-07-01 12:00 Asia/Taipei → 2021-07-01T04:00:00Z', () => {
    expect(localToUtc('2021-07-01', '12:00', 'Asia/Taipei').utcIso).toBe('2021-07-01T04:00:00Z');
  });

  it('rejects out-of-range dates and malformed input', () => {
    expect(catchHD(() => localToUtc('1799-12-31', '12:00', 'UTC')).code).toBe('DATE_OUT_OF_RANGE');
    expect(catchHD(() => localToUtc('2151-01-01', '12:00', 'UTC')).code).toBe('DATE_OUT_OF_RANGE');
    expect(catchHD(() => localToUtc('2021-02-30', '12:00', 'UTC')).code).toBe('INVALID_INPUT');
    expect(catchHD(() => localToUtc('2021-02-01', '24:00', 'UTC')).code).toBe('INVALID_INPUT');
    expect(catchHD(() => localToUtc('2021-02-01', '12:00', 'Mars/Olympus')).code).toBe('INVALID_INPUT');
    expect(localToUtc('1800-01-01', '00:00', 'UTC').utcIso).toBe('1800-01-01T00:00:00Z');
    expect(localToUtc('2150-12-31', '23:59', 'UTC').utcIso).toBe('2150-12-31T23:59:00Z');
  });
});

describe('unixMsToJd matches sweph.julday (spec §4.4)', () => {
  const cases: Array<[number, number, number, number, number]> = [
    [2000, 1, 1, 12, 0],
    [1800, 1, 1, 0, 0],
    [1979, 9, 30, 14, 30],
    [2021, 7, 1, 4, 0],
    [2150, 12, 31, 23, 59],
    [1900, 2, 28, 7, 13],
  ];
  it.each(cases)('%i-%i-%i %i:%i UT', (y, mo, d, h, mi) => {
    const ms = Date.UTC(y, mo - 1, d, h, mi);
    expect(Math.abs(unixMsToJd(ms) - swephJulday(y, mo, d, h + mi / 60))).toBeLessThan(1e-9);
  });
  it('J2000.0 is 2451545.0', () => {
    expect(unixMsToJd(Date.UTC(2000, 0, 1, 12))).toBe(2451545);
  });
});
