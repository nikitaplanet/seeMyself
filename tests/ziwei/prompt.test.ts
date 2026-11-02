import { describe, expect, it } from 'vitest';
import { computeZiwei } from '@/lib/ziwei/compute';
import { buildZiweiAiPrompt } from '@/lib/ziwei/prompt';

describe('buildZiweiAiPrompt', () => {
  it('includes natal palace names, four transformations, and reading instructions', () => {
    const chart = computeZiwei({
      date: '1993-06-21',
      time: '11:18',
      timezone: 'Asia/Taipei',
      gender: 'female',
    });
    const text = buildZiweiAiPrompt(chart);
    expect(text).toContain('請依下列紫微斗數本命盤資料');
    expect(text).toContain('海中金四局');
    expect(text).toContain('交友宮');
    expect(text).toContain('事業宮');
    expect(text).toContain('命宮-身宮');
    expect(text).toContain('巨門化權');
    expect(text).toContain('貪狼化忌');
    expect(text).not.toContain('僕役');
    expect(text).not.toContain('官祿');
  });
});
