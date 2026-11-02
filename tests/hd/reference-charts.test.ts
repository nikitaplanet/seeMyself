import { describe, expect, it } from 'vitest';
import { computeChart } from '@/lib/hd/chart';
import { swephProvider } from '@/lib/hd/ephemeris/sweph-provider';
import type { Authority, BirthInput, Definition, HDType, Planet, Side } from '@/lib/hd/types';
import referenceData from '../fixtures/reference-charts.json';

// Spec §12.2 — regression against reference charts supplied by the project owner.
// The expected values MUST come from a human (existing chart tools); never generate them here.

interface ReferenceChart {
  label: string;
  input: BirthInput;
  source: string;
  expected: {
    type: HDType;
    authority: Authority;
    profile: string;
    definition: Definition;
    channels: string[];
    personality: Record<Planet, string>;
    design: Record<Planet, string>;
  };
}

const charts = referenceData as unknown as ReferenceChart[];

describe('reference charts (spec §12.2)', () => {
  if (charts.length === 0) {
    it.skip('tests/fixtures/reference-charts.json is empty — waiting for the project owner to supply reference charts (spec §12.2)', () => {});
    return;
  }

  it.each(charts.map((c) => [c.label, c] as const))('%s', (_label, ref) => {
    const chart = computeChart({ ...ref.input, options: { ...ref.input.options, sensitivityMinutes: [] } }, swephProvider);
    expect(chart.type).toBe(ref.expected.type);
    expect(chart.authority).toBe(ref.expected.authority);
    expect(`${chart.profile.personality}/${chart.profile.design}`).toBe(ref.expected.profile);
    expect(chart.definition).toBe(ref.expected.definition);
    expect(chart.channels.map((c) => c.id).sort()).toEqual([...ref.expected.channels].sort());
    for (const side of ['personality', 'design'] as const satisfies readonly Side[]) {
      const actual: Partial<Record<Planet, string>> = {};
      for (const a of chart.activations.filter((x) => x.side === side)) actual[a.planet] = `${a.gate}.${a.line}`;
      expect(actual, `${ref.label} ${side} (source: ${ref.source})`).toEqual(ref.expected[side]);
    }
  });
});
