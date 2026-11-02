import { PROFILE_ANGLE, STRATEGY_ZH, VALID_PROFILES } from './constants';
import { CROSS_NAMES } from './crossNames';
import { analyzeGraph, connected, motorToThroat, type GraphAnalysis } from './graph';
import type { Authority, CrossAngle, Definition, HDType } from './types';

// Spec §7.2–§7.6 — derived attributes.

export function deriveType(graph: GraphAnalysis): HDType {
  const defined = new Set(graph.definedCenters);
  const m2t = motorToThroat(graph);
  if (defined.size === 0) return 'reflector';
  if (defined.has('sacral') && m2t) return 'manifestingGenerator';
  if (defined.has('sacral')) return 'generator';
  if (m2t) return 'manifestor';
  return 'projector';
}

export function strategyFor(type: HDType): string {
  return STRATEGY_ZH[type];
}

export function deriveAuthority(graph: GraphAnalysis): Authority {
  const defined = new Set(graph.definedCenters);
  if (defined.has('solarPlexus')) return 'emotional';
  if (defined.has('sacral')) return 'sacral';
  if (defined.has('spleen')) return 'splenic';
  if (defined.has('heart') && connected(graph, 'heart', 'throat')) return 'egoManifested';
  if (defined.has('heart')) return 'egoProjected';
  if (defined.has('g') && connected(graph, 'g', 'throat')) return 'selfProjected';
  if (defined.size > 0) return 'mental';
  return 'lunar';
}

const DEFINITIONS: readonly Definition[] = ['none', 'single', 'split', 'tripleSplit', 'quadrupleSplit'];

export function deriveDefinition(graph: GraphAnalysis): Definition {
  const d = DEFINITIONS[graph.components.length];
  // 9 centers with 36 channels cannot form more than 4 components, but guard anyway.
  if (d === undefined) throw new Error(`Unexpected component count ${graph.components.length}`);
  return d;
}

export function profileKey(profile: { personality: number; design: number }): string {
  return `${profile.personality}/${profile.design}`;
}

export function isValidProfile(personalityLine: number, designLine: number): boolean {
  return VALID_PROFILES.includes(`${personalityLine}/${designLine}`);
}

/** §7.4 — throws a plain Error for any of the non-legal combinations (indicates a calculation bug). */
export function deriveProfile(personalitySunLine: number, designSunLine: number): { personality: number; design: number } {
  if (!isValidProfile(personalitySunLine, designSunLine)) {
    throw new Error(`Invalid profile ${personalitySunLine}/${designSunLine}: calculation error`);
  }
  return { personality: personalitySunLine, design: designSunLine };
}

export function crossAngleFor(profile: { personality: number; design: number }): CrossAngle {
  const angle = PROFILE_ANGLE[profileKey(profile)];
  if (angle === undefined) throw new Error(`Invalid profile ${profileKey(profile)}`);
  return angle;
}

export function crossNameFor(angle: CrossAngle, personalitySunGate: number): string | null {
  return CROSS_NAMES[`${angle}:${personalitySunGate}`] ?? null;
}

export interface GateAnalysis {
  graph: GraphAnalysis;
  type: HDType;
  strategy: string;
  authority: Authority;
  definition: Definition;
}

/** Pure analysis straight from a gate list — used by computeChart and by truth-table tests (§12.1). */
export function analyzeGates(activeGates: Iterable<number>): GateAnalysis {
  const graph = analyzeGraph(activeGates);
  const type = deriveType(graph);
  return {
    graph,
    type,
    strategy: strategyFor(type),
    authority: deriveAuthority(graph),
    definition: deriveDefinition(graph),
  };
}
