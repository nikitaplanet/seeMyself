import { DEFAULT_SENSITIVITY_MINUTES, HD_LIB_VERSION, PLANET_ORDER } from './constants';
import { analyzeGates, crossAngleFor, crossNameFor, deriveProfile } from './derive';
import { findDesignJd } from './designTime';
import type { EphemBody, EphemerisProvider } from './ephemeris/provider';
import { HDError } from './errors';
import { mapLongitude, minutesToLineBoundary, normalize } from './mapping';
import { buildSensitivityReport } from './sensitivity';
import { jdToUnixMs, localToUtc, toIsoUtc, unixMsToJd } from './time';
import type { Activation, BirthInput, ChartResult, NodeMode, Planet, Side } from './types';

// Spec §3.1 — the single public entry point of the calculation layer.

const DIRECT_BODIES: Partial<Record<Planet, EphemBody>> = {
  sun: 'sun',
  moon: 'moon',
  mercury: 'mercury',
  venus: 'venus',
  mars: 'mars',
  jupiter: 'jupiter',
  saturn: 'saturn',
  uranus: 'uranus',
  neptune: 'neptune',
  pluto: 'pluto',
};

function makeActivation(planet: Planet, side: Side, longitude: number, speed: number): Activation {
  const lon = normalize(longitude);
  return {
    planet,
    side,
    longitude: lon,
    ...mapLongitude(lon),
    speed,
    minutesToLineBoundary: minutesToLineBoundary(lon, speed),
  };
}

/** §5.3 — the 13 activations of one side, in fixed order. */
export function computeSide(provider: EphemerisProvider, jd: number, side: Side, nodeMode: NodeMode): Activation[] {
  const sun = provider.position(jd, 'sun');
  const node = provider.position(jd, nodeMode === 'mean' ? 'meanNode' : 'trueNode');
  return PLANET_ORDER.map((planet) => {
    switch (planet) {
      case 'sun':
        return makeActivation(planet, side, sun.longitude, sun.speed);
      case 'earth':
        return makeActivation(planet, side, sun.longitude + 180, sun.speed);
      case 'northNode':
        return makeActivation(planet, side, node.longitude, node.speed);
      case 'southNode':
        return makeActivation(planet, side, node.longitude + 180, node.speed);
      default: {
        const body = DIRECT_BODIES[planet];
        if (body === undefined) throw new Error(`No ephemeris body for ${planet}`);
        const p = provider.position(jd, body);
        return makeActivation(planet, side, p.longitude, p.speed);
      }
    }
  });
}

type ChartCore = Omit<ChartResult, 'input' | 'sensitivity' | 'meta'>;

function findActivation(acts: readonly Activation[], side: Side, planet: Planet): Activation {
  const a = acts.find((x) => x.side === side && x.planet === planet);
  if (!a) throw new Error(`Missing activation ${side}.${planet}`);
  return a;
}

/** Steps 2–7 of §3.1 from a personality UTC instant (ms). */
function computeCore(utcMs: number, nodeMode: NodeMode, provider: EphemerisProvider): ChartCore {
  const jdP = unixMsToJd(utcMs);
  const jdD = findDesignJd(provider, jdP);

  const activations = [
    ...computeSide(provider, jdP, 'personality', nodeMode),
    ...computeSide(provider, jdD, 'design', nodeMode),
  ];

  const activeGates: Record<number, Side[]> = {};
  for (const a of activations) {
    const sides = (activeGates[a.gate] ??= []);
    if (!sides.includes(a.side)) sides.push(a.side);
  }

  const analysis = analyzeGates(activations.map((a) => a.gate));

  const pSun = findActivation(activations, 'personality', 'sun');
  const pEarth = findActivation(activations, 'personality', 'earth');
  const dSun = findActivation(activations, 'design', 'sun');
  const dEarth = findActivation(activations, 'design', 'earth');
  const profile = deriveProfile(pSun.line, dSun.line);
  const angle = crossAngleFor(profile);

  return {
    utc: { personality: toIsoUtc(utcMs), design: toIsoUtc(jdToUnixMs(jdD)) },
    jd: { personality: jdP, design: jdD },
    activations,
    activeGates,
    channels: analysis.graph.channels,
    definedCenters: analysis.graph.definedCenters,
    type: analysis.type,
    strategy: analysis.strategy,
    authority: analysis.authority,
    profile,
    definition: analysis.definition,
    cross: {
      angle,
      gates: [pSun.gate, pEarth.gate, dSun.gate, dEarth.gate],
      name: crossNameFor(angle, pSun.gate),
    },
  };
}

export function computeChart(input: BirthInput, provider: EphemerisProvider): ChartResult {
  const nodeMode: NodeMode = input.options?.nodeMode ?? 'true';
  if (nodeMode !== 'true' && nodeMode !== 'mean') {
    throw new HDError('INVALID_INPUT', { details: { field: 'options.nodeMode', value: String(nodeMode) } });
  }
  const offsets = input.options?.sensitivityMinutes ?? DEFAULT_SENSITIVITY_MINUTES;
  if (!offsets.every((o) => Number.isFinite(o))) {
    throw new HDError('INVALID_INPUT', { details: { field: 'options.sensitivityMinutes' } });
  }

  const instant = localToUtc(input.date, input.time, input.timezone, input.options?.disambiguation);
  const core = computeCore(instant.utcMs, nodeMode, provider);

  // SPEC-QUESTION: shifted instants are not range-checked (a 2150-12-31 23:50 birth + 30 min lands in
  // 2151); the ephemeris handles it fine and the user-entered date itself was validated.
  const sensitivity =
    offsets.length > 0
      ? buildSensitivityReport(core, offsets, (off) => computeCore(instant.utcMs + off * 60_000, nodeMode, provider))
      : undefined;

  return {
    input,
    ...core,
    ...(sensitivity ? { sensitivity } : {}),
    meta: { nodeMode, ephemeris: provider.name, version: HD_LIB_VERSION },
  };
}
