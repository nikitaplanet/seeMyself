import { CENTER_ORDER, CHANNELS, GATE_CENTER, MOTORS } from './constants';
import type { CenterId, Channel } from './types';

// Spec §7.1 — gates → formed channels → defined centers → connected components.

export function gateCenter(gate: number): CenterId {
  const c = GATE_CENTER[gate];
  if (c === undefined) throw new Error(`Unknown gate ${gate}`);
  return c;
}

/** All 36 channels with centers derived from CENTER_GATES (appendix C note). */
export const ALL_CHANNELS: readonly Channel[] = CHANNELS.map(([a, b]): Channel => {
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  return { id: `${lo}-${hi}`, gates: [lo, hi], centers: [gateCenter(lo), gateCenter(hi)] };
});

export interface GraphAnalysis {
  activeGates: number[];          // sorted, unique
  channels: Channel[];            // formed channels, in appendix C order
  definedCenters: CenterId[];     // in CENTER_ORDER
  components: CenterId[][];       // connected components of defined centers (CENTER_ORDER within / by first member)
  hangingGates: number[];         // active gates not part of any formed channel (sorted)
}

export function analyzeGraph(gates: Iterable<number>): GraphAnalysis {
  const active = new Set<number>();
  for (const g of gates) {
    gateCenter(g); // validates 1..64
    active.add(g);
  }

  const channels = ALL_CHANNELS.filter((ch) => active.has(ch.gates[0]) && active.has(ch.gates[1]));

  const defined = new Set<CenterId>();
  const inChannel = new Set<number>();
  for (const ch of channels) {
    defined.add(ch.centers[0]);
    defined.add(ch.centers[1]);
    inChannel.add(ch.gates[0]);
    inChannel.add(ch.gates[1]);
  }
  const definedCenters = CENTER_ORDER.filter((c) => defined.has(c));

  // Union-Find over defined centers
  const parent = new Map<CenterId, CenterId>();
  for (const c of definedCenters) parent.set(c, c);
  const find = (c: CenterId): CenterId => {
    let r = c;
    while (parent.get(r) !== r) r = parent.get(r) as CenterId;
    parent.set(c, r);
    return r;
  };
  for (const ch of channels) {
    const ra = find(ch.centers[0]);
    const rb = find(ch.centers[1]);
    if (ra !== rb) parent.set(ra, rb);
  }
  const groups = new Map<CenterId, CenterId[]>();
  for (const c of definedCenters) {
    const r = find(c);
    const arr = groups.get(r);
    if (arr) arr.push(c);
    else groups.set(r, [c]);
  }
  const components = [...groups.values()].sort(
    (x, y) => CENTER_ORDER.indexOf(x[0]) - CENTER_ORDER.indexOf(y[0]),
  );

  const activeGates = [...active].sort((a, b) => a - b);
  const hangingGates = activeGates.filter((g) => !inChannel.has(g));

  return { activeGates, channels, definedCenters, components, hangingGates };
}

/** §7.1 connected(a, b): both centers defined and in the same component. */
export function connected(graph: GraphAnalysis, a: CenterId, b: CenterId): boolean {
  return graph.components.some((comp) => comp.includes(a) && comp.includes(b));
}

/** §7.1 motorToThroat */
export function motorToThroat(graph: GraphAnalysis): boolean {
  return MOTORS.some((m) => connected(graph, m, 'throat'));
}
