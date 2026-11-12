import { describe, expect, it } from 'vitest';
import { buildHdAiPrompt } from '@/lib/hd/prompt';
import type { Activation, ChartResult } from '@/lib/hd/types';

function act(
  partial: Pick<Activation, 'planet' | 'side' | 'gate' | 'line'>,
): Activation {
  return {
    longitude: 0,
    color: 1,
    tone: 1,
    base: 1,
    speed: 0,
    minutesToLineBoundary: 120,
    ...partial,
  };
}

describe('buildHdAiPrompt', () => {
  it('summarises type, channels, and both sides', () => {
    const result = {
      input: { date: '1993-06-21', time: '11:18', timezone: 'Asia/Taipei' },
      utc: {
        personality: '1993-06-21T03:18:00.000Z',
        design: '1993-03-24T00:00:00.000Z',
      },
      jd: { personality: 0, design: 0 },
      activations: [
        act({ planet: 'sun', side: 'personality', gate: 15, line: 2 }),
        act({ planet: 'earth', side: 'personality', gate: 10, line: 2 }),
        act({ planet: 'sun', side: 'design', gate: 25, line: 4 }),
        act({ planet: 'earth', side: 'design', gate: 46, line: 4 }),
      ],
      activeGates: {},
      channels: [{ id: '5-15', gates: [5, 15], centers: ['sacral', 'g'] }],
      definedCenters: ['g', 'sacral'],
      type: 'generator',
      strategy: '等待回應',
      authority: 'sacral',
      profile: { personality: 2, design: 4 },
      definition: 'single',
      cross: { angle: 'rightAngle', gates: [15, 10, 25, 46], name: null },
      meta: { nodeMode: 'true', ephemeris: 'test', version: '0' },
    } as ChartResult;

    const text = buildHdAiPrompt({
      input: result.input,
      result,
      timeUnknown: false,
      placeLabel: '臺北市, 臺灣',
    });
    expect(text).toContain('請依下列人類圖');
    expect(text).toContain('生產者');
    expect(text).toContain('薦骨權威');
    expect(text).toContain('2/4');
    expect(text).toContain('5-15');
    expect(text).toContain('太陽 15.2');
    expect(text).toContain('1993-06-21 11:18');
    for (const k of ['個性與日常特色', '面對壓力', '面具與真實的反差', '內耗與充電', '金錢觀與安全感', '天賦盲區'])
      expect(text).toContain(k);
  });
});
