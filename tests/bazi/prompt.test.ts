import { describe, expect, it } from 'vitest';
import { computeBazi } from '@/lib/bazi/compute';
import { buildBaziAiPrompt } from '@/lib/bazi/prompt';

describe('buildBaziAiPrompt', () => {
  it('includes pillars, yong shen, and reading instructions', () => {
    const chart = computeBazi({
      date: '1993-06-21',
      time: '11:18',
      timezone: 'Asia/Taipei',
      gender: 'female',
    });
    const text = buildBaziAiPrompt(chart);
    expect(text).toContain('請依下列八字命盤資料');
    expect(text).toContain('偏財格');
    expect(text).toContain('癸酉');
    expect(text).toContain('己未');
    expect(text).toContain('比劫');
    expect(text).toContain('3～5 條務實建議');
  });
});
