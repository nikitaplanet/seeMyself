import { describe, expect, it } from 'vitest';
import { computeZiwei } from '@/lib/ziwei/compute';

describe('computeZiwei', () => {
  it('returns twelve palaces and Traditional Chinese labels', () => {
    const chart = computeZiwei({
      date: '1990-05-12',
      time: '14:30',
      timezone: 'Asia/Taipei',
      place: {
        name: '臺北市',
        lat: 25.04776,
        lon: 121.53185,
        countryCode: 'TW',
      },
      gender: 'male',
    });
    expect(chart.palaces).toHaveLength(12);
    expect(chart.palaces.map(p => p.index).sort((a, b) => a - b)).toEqual([
      ...Array(12).keys(),
    ]);
    expect(chart.fiveElementsClass).toMatch(/局/);
    expect(chart.lunarDate.length).toBeGreaterThan(0);
    expect(chart.chineseDate.length).toBeGreaterThan(0);
    expect(chart.soul.length).toBeGreaterThan(0);
    expect(chart.palaces.some(p => p.isSoulPalace)).toBe(true);
    expect(chart.palaces.filter(p => p.isBodyPalace)).toHaveLength(1);
    expect(chart.timing.timeIndex).toBeGreaterThanOrEqual(0);
    expect(chart.timing.timeIndex).toBeLessThanOrEqual(12);
    expect(chart.horoscope.yearly.palaceNames).toHaveLength(12);
  });

  it('matches the 1993-06-21 noon female screenshot wording and extras', () => {
    const chart = computeZiwei(
      {
        date: '1993-06-21',
        time: '11:18',
        timezone: 'Asia/Taipei',
        gender: 'female',
      },
      false,
      { targetDate: '2026-11-02', targetTimeIndex: 0 },
    );
    expect(chart.yinYangGender).toBe('陰女');
    expect(chart.fiveElementsLabel).toBe('海中金四局');
    expect(chart.luckIndex).toBe(72);
    expect(chart.chineseDateLabel).toBe('癸酉年戊午月癸酉日戊午時');
    expect(chart.lunarDateLabel).toMatch(/1993年 5月 2日午時/);
    expect(chart.palaces.find(p => p.name === '僕役')?.displayName).toBe(
      '交友宮',
    );
    expect(chart.palaces.find(p => p.name === '官祿')?.displayName).toBe(
      '事業宮',
    );
    const soul = chart.palaces.find(p => p.isSoulPalace);
    expect(soul?.displayName).toBe('命宮-身宮');
    expect(soul?.decadal?.range).toEqual([4, 13]);
    const wealth = chart.palaces.find(p => p.name === '財帛');
    expect(wealth?.adjectiveStars.some(s => s.name === '月馬')).toBe(true);
    expect(chart.mutagens.map(m => `${m.star}化${m.mutagen}`)).toEqual([
      '破軍化祿',
      '巨門化權',
      '太陰化科',
      '貪狼化忌',
    ]);
    const sun = chart.palaces
      .find(p => p.name === '父母')
      ?.majorStars.find(s => s.name === '太陽');
    expect(sun?.brightness).toBe('不');
    const ziwei = chart.palaces
      .find(p => p.name === '官祿')
      ?.majorStars.find(s => s.name === '紫微');
    expect(ziwei?.brightness).toBe('得');
  });
});
