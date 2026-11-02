import { describe, expect, it } from 'vitest';
import { computeBazi } from '@/lib/bazi/compute';

const SAMPLE = {
  date: '1993-06-21',
  time: '11:18',
  timezone: 'Asia/Taipei',
  place: {
    name: '臺北市',
    lat: 25.04776,
    lon: 121.53185,
    countryCode: 'TW',
  },
  gender: 'female' as const,
};

describe('computeBazi', () => {
  it('matches the 1993-06-21 female reference chart', () => {
    const chart = computeBazi(SAMPLE);
    expect(chart.ganZhiLabel).toBe('癸酉 戊午 癸酉 戊午');
    expect(chart.pillars.map((p) => `${p.gan}${p.zhi}`)).toEqual([
      '癸酉',
      '戊午',
      '癸酉',
      '戊午',
    ]);
    expect(chart.pillars.map((p) => p.ganTenGod)).toEqual([
      '比肩',
      '正官',
      '元女',
      '正官',
    ]);
    expect(chart.geJu).toBe('偏財格');
    expect(chart.strength).toBe('身弱');
    expect(chart.wangShuai).toBe('太弱');
    expect(chart.dayMaster).toBe('癸水');
    expect(chart.siLing).toBe('己土');
    expect(chart.jieQi).toBe('芒種');
    expect(chart.season).toBe('夏');
    expect(chart.shengXiao).toBe('雞');
    expect(chart.xingZuo).toBe('雙子');
    expect(chart.mingGong).toBe('丁巳');
    expect(chart.shenGong).toBe('乙丑');
    expect(chart.taiYuan).toBe('己酉');
    expect(chart.taiXi).toBe('戊辰');
    expect(`${chart.boneLiang}兩${chart.boneQian}錢`).toBe('3兩3錢');
    expect(chart.boneVerse).toContain('未年運至受福祿');
    expect(chart.daYun[0]).toMatchObject({
      ganZhi: '己未',
      tenGod: '七殺',
      startAge: 6,
      startYear: 1998,
      endYear: 2007,
    });
    expect(chart.daYun.map((d) => d.ganZhi)).toEqual([
      '己未',
      '庚申',
      '辛酉',
      '壬戌',
      '癸亥',
      '甲子',
      '乙丑',
      '丙寅',
      '丁卯',
    ]);
    expect(chart.daYun.map((d) => d.diShi)).toEqual([
      '墓',
      '死',
      '病',
      '衰',
      '帝旺',
      '臨官',
      '冠帶',
      '沐浴',
      '長生',
    ]);
    expect(chart.helpers).toBe('水金');
    expect(chart.drainers).toBe('土火木');
    expect(chart.xiShen).toBe('印梟');
    expect(chart.yongShen).toBe('比劫');
    expect(chart.jiShen).toBe('食傷、官殺');
    expect(chart.yongShenBody).toContain('水囚失令');
    expect(chart.yongShenBody).toContain('得地');
    expect(chart.yongShenBody).toContain('失勢');
    expect(chart.stemNotes).toContain('戊癸合化火');
    expect(chart.branchNotes).toContain('午午自刑');
    expect(chart.branchNotes).toContain('酉酉自刑');
    const byWx = Object.fromEntries(chart.wuXing.map((s) => [s.wx, s]));
    expect(byWx.木.percent).toBe(0);
    expect(byWx.火.percent).toBe(38);
    expect(byWx.土.percent).toBe(37);
    expect(byWx.金.percent).toBe(9);
    expect(byWx.水.percent).toBe(16);
    expect(byWx.火.stage).toBe('旺');
    expect(byWx.土.stage).toBe('相');
    expect(byWx.木.stage).toBe('休');
    expect(byWx.水.stage).toBe('囚');
    expect(byWx.金.stage).toBe('死');
    expect(chart.pillars.every((p) => p.shensha.includes('德秀貴人'))).toBe(true);
    expect(chart.pillars[0].shensha).toContain('將星');
    expect(chart.pillars[2].shensha).toContain('金神');
    expect(chart.pillars[3].shensha).toContain('童子煞');
    expect(chart.pillars[1].shensha).not.toContain('童子煞');
    expect(chart.lunarLabel).toMatch(/癸酉年五月初二日午時/);
  });
});
