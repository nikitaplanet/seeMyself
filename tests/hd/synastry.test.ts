import { describe, expect, it } from 'vitest';
import { computeChart } from '@/lib/hd/chart';
import { swephProvider } from '@/lib/hd/ephemeris/sweph-provider';
import { ALL_CHANNELS } from '@/lib/hd/graph';
import {
  analyzeHdSynastry,
  buildHdSynastryAiPrompt,
  chartGates,
  classifyChannel,
  compositeGraphData,
  hdSynastryItems,
} from '@/lib/hd/synastry';

// Hand-built pair (gate lists, not real charts):
//   A: 1, 2, 14, 13, 33, 20, 34, 59   →  2-14, 13-33, 20-34
//   B: 8, 2, 14, 34, 10, 6            →  2-14, 10-34
const A = [1, 2, 14, 13, 33, 20, 34, 59];
const B = [8, 2, 14, 34, 10, 6];

function ids(syn: ReturnType<typeof analyzeHdSynastry>, kind: string) {
  return syn.channels.filter((c) => c.kind === kind).map((c) => c.channel.id);
}

describe('analyzeHdSynastry — channel categories', () => {
  const syn = analyzeHdSynastry(A, B);

  it('electromagnetic: one gate each, only formed together', () => {
    expect(ids(syn, 'electromagnetic')).toEqual(['1-8', '6-59', '10-20']);
    const em = syn.channels.find((c) => c.channel.id === '10-20');
    expect(em).toMatchObject({ gateA: 20, gateB: 10, holder: null });
  });

  it('companionship: both have the full channel', () => {
    expect(ids(syn, 'companionship')).toEqual(['2-14']);
  });

  it('dominance: one has the full channel, the other neither gate', () => {
    expect(ids(syn, 'dominance')).toEqual(['13-33']);
    expect(syn.channels.find((c) => c.channel.id === '13-33')?.holder).toBe('a');
  });

  it('compromise: one has the full channel, the other exactly one gate', () => {
    expect(ids(syn, 'compromise')).toEqual(['10-34', '20-34']);
    expect(syn.channels.find((c) => c.channel.id === '10-34')?.holder).toBe('b');
    expect(syn.channels.find((c) => c.channel.id === '20-34')?.holder).toBe('a');
  });

  it('ignores channels not formed even together', () => {
    // 34-57: both have 34, nobody has 57.
    expect(syn.channels.some((c) => c.channel.id === '34-57')).toBe(false);
  });

  it('composite defined centers, new and open centers', () => {
    expect(syn.definedA).toEqual(['throat', 'g', 'sacral']);
    expect(syn.definedB).toEqual(['g', 'sacral']);
    expect(syn.composite.definedCenters).toEqual(['throat', 'g', 'sacral', 'solarPlexus']);
    expect(syn.newCenters).toEqual(['solarPlexus']);
    expect(syn.openCenters).toEqual(['head', 'ajna', 'heart', 'spleen', 'root']);
  });

  it('composite type / authority / definition come from the union of gates', () => {
    expect(syn.composite.type).toBe('manifestingGenerator');
    expect(syn.composite.authority).toBe('emotional');
    expect(syn.composite.definition).toBe('single');
    expect(syn.composite.channels.map((c) => c.id)).toEqual([
      '1-8',
      '2-14',
      '6-59',
      '10-20',
      '10-34',
      '13-33',
      '20-34',
    ]);
  });

  it('is symmetric: swapping the pair swaps holders and gates only', () => {
    const rev = analyzeHdSynastry(B, A);
    for (const c of syn.channels) {
      const r = rev.channels.find((x) => x.channel.id === c.channel.id);
      expect(r?.kind).toBe(c.kind);
      expect(r?.holder).toBe(c.holder === null ? null : c.holder === 'a' ? 'b' : 'a');
      expect(r?.gateA).toBe(c.gateB);
    }
  });
});

describe('classifyChannel', () => {
  const ch = ALL_CHANNELS.find((c) => c.id === '1-8')!;
  it.each([
    [[1], [8], 'electromagnetic'],
    [[8], [1], 'electromagnetic'],
    [[1, 8], [1, 8], 'companionship'],
    [[1, 8], [], 'dominance'],
    [[], [1, 8], 'dominance'],
    [[1, 8], [8], 'compromise'],
    [[1], [1, 8], 'compromise'],
  ] as const)('A %j / B %j → %s', (a, b, kind) => {
    expect(classifyChannel(new Set(a), new Set(b), ch)?.kind).toBe(kind);
  });
  it('same single gate on both sides is not a channel', () => {
    expect(classifyChannel(new Set([1]), new Set([1]), ch)).toBeNull();
    expect(classifyChannel(new Set([]), new Set([8]), ch)).toBeNull();
  });
});

describe('composite graph data and report', () => {
  const a = computeChart({ date: '1990-05-12', time: '14:30', timezone: 'Asia/Taipei' }, swephProvider);
  const b = computeChart({ date: '1992-11-03', time: '08:15', timezone: 'Asia/Taipei' }, swephProvider);
  const syn = analyzeHdSynastry(chartGates(a), chartGates(b));

  it('maps A to the personality colour, B to design, shared gates to both', () => {
    const g = compositeGraphData(a, b, syn);
    expect(g.activations).toHaveLength(52);
    for (const gate of syn.composite.gates) {
      const sides = g.activeGates[gate];
      expect(sides.includes('personality')).toBe(syn.gatesA.includes(gate));
      expect(sides.includes('design')).toBe(syn.gatesB.includes(gate));
    }
    expect(g.definedCenters).toEqual(syn.composite.definedCenters);
  });

  it('builds a clean report with every category and both names', () => {
    const items = hdSynastryItems({ name: '甲', chart: a }, { name: '乙', chart: b }, syn);
    const terms = items.map((i) => i.term);
    expect(terms).toEqual(
      expect.arrayContaining(['合盤總覽', '電磁通道', '友伴通道', '主導通道', '妥協通道', '類型互動', '一起做決定']),
    );
    const all = items.map((i) => `${i.term}${i.field}${i.meaning}`).join('\n');
    expect(all).not.toMatch(/undefined|null|NaN/);
    expect(all).toContain('甲');
    expect(all).toContain('乙');
    for (const c of syn.channels.filter((x) => x.kind === 'electromagnetic')) {
      expect(all).toContain(c.channel.id);
    }
  });

  it('AI prompt includes both people and the four categories', () => {
    const text = buildHdSynastryAiPrompt(
      { name: '甲', chart: a, timeUnknown: false },
      { name: '乙', chart: b, timeUnknown: true },
      syn,
    );
    expect(text).toContain('### 甲');
    expect(text).toContain('### 乙');
    expect(text).toContain('時間不確定');
    for (const k of ['電磁通道', '友伴通道', '主導通道', '妥協通道']) expect(text).toContain(k);
    expect(text).not.toMatch(/undefined|NaN/);
  });
});
