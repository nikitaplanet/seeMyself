import { profileKey } from './derive';
import type { ChartResult, SensitivityReport } from './types';

// Spec §8.1 — birth-time sensitivity. Offsets are applied to the personality UTC instant; the
// re-computations never run sensitivity themselves (no recursion).

export type ComparableChart = Pick<
  ChartResult,
  'activations' | 'type' | 'authority' | 'profile' | 'definition' | 'cross' | 'channels' | 'definedCenters'
>;

type Change = SensitivityReport['changes'][number];

export function formatCrossGates(gates: readonly [number, number, number, number]): string {
  return `${gates[0]}/${gates[1]} | ${gates[2]}/${gates[3]}`;
}

/** Field-by-field diff of the §8.1 step-3 fields. `from` = base chart, `to` = shifted chart. */
export function diffCharts(base: ComparableChart, other: ComparableChart, offsetMinutes: number): Change[] {
  const changes: Change[] = [];
  const push = (field: string, from: string | number, to: string | number) => {
    if (from !== to) changes.push({ offsetMinutes, field, from, to });
  };

  for (const a of base.activations) {
    const b = other.activations.find((x) => x.side === a.side && x.planet === a.planet);
    if (!b) throw new Error(`Missing activation ${a.side}.${a.planet}`);
    push(`activations.${a.side}.${a.planet}.gate`, a.gate, b.gate);
    push(`activations.${a.side}.${a.planet}.line`, a.line, b.line);
  }
  push('type', base.type, other.type);
  push('authority', base.authority, other.authority);
  push('profile', profileKey(base.profile), profileKey(other.profile));
  push('definition', base.definition, other.definition);
  push('cross.gates', formatCrossGates(base.cross.gates), formatCrossGates(other.cross.gates));
  push('channels', base.channels.map((c) => c.id).join(','), other.channels.map((c) => c.id).join(','));
  push('definedCenters', base.definedCenters.join(','), other.definedCenters.join(','));
  return changes;
}

const STABILITY_FIELDS = new Set(['type', 'authority', 'profile', 'definition']);

export function buildSensitivityReport(
  base: ComparableChart,
  offsets: readonly number[],
  computeAtOffset: (offsetMinutes: number) => ComparableChart,
): SensitivityReport {
  const changes: Change[] = [];
  for (const off of offsets) {
    changes.push(...diffCharts(base, computeAtOffset(off), off));
  }
  const stable = !changes.some((c) => STABILITY_FIELDS.has(c.field));
  return { offsets: [...offsets], stable, changes };
}
