import { describe, expect, it } from 'vitest';
import { equationOfTimeMinutes, timeIndexFromHour, toZiweiTiming } from '@/lib/ziwei/time';

describe('timeIndexFromHour', () => {
  it.each([
    [0, 0],
    [1, 1],
    [2, 1],
    [3, 2],
    [11, 6],
    [12, 6],
    [14, 7],
    [22, 11],
    [23, 12],
  ])('%s → %s', (hour, idx) => {
    expect(timeIndexFromHour(hour)).toBe(idx);
  });
});

describe('toZiweiTiming', () => {
  it('uses 午時 when the birth time is unknown', () => {
    const t = toZiweiTiming({
      date: '1990-05-12',
      time: '12:00',
      timezone: 'Asia/Taipei',
      lon: 121.53,
      timeUnknown: true,
    });
    expect(t.timeIndex).toBe(6);
    expect(t.usedTrueSolar).toBe(false);
    expect(t.timeName).toBe('午時');
  });

  it('keeps clock time when there is no longitude', () => {
    const t = toZiweiTiming({ date: '1990-05-12', time: '14:30', timezone: 'Asia/Taipei' });
    expect(t.timeIndex).toBe(7);
    expect(t.usedTrueSolar).toBe(false);
    expect(t.trueSolarTime).toBe('14:30');
  });

  it('applies true solar time for Taipei without crossing the 時辰 boundary at 14:30', () => {
    const t = toZiweiTiming({
      date: '1990-05-12',
      time: '14:30',
      timezone: 'Asia/Taipei',
      lon: 121.53,
    });
    expect(t.usedTrueSolar).toBe(true);
    expect(t.timeIndex).toBe(7);
    expect(t.trueSolarTime).not.toBe('14:30');
  });
});

describe('equationOfTimeMinutes', () => {
  it('stays within a few minutes of zero around the equinoxes', () => {
    expect(Math.abs(equationOfTimeMinutes(80))).toBeLessThan(20);
    expect(Math.abs(equationOfTimeMinutes(266))).toBeLessThan(20);
  });
});
