import { GATE_ORDER } from './constants';

// Spec §6 — longitude → gate / line / color / tone / base, using integer base units.

export const GATE_START_LON = 302;        // 閘門 41 起點
export const UNITS_PER_CIRCLE = 69120;     // 64 × 1080
export const UNITS_PER_GATE = 1080;
export const UNITS_PER_LINE = 180;
export const UNITS_PER_COLOR = 30;
export const UNITS_PER_TONE = 5;
export const GATE_WIDTH_DEG = 360 / 64;    // 5.625
export const LINE_WIDTH_DEG = GATE_WIDTH_DEG / 6; // 0.9375

export interface GatePosition {
  gate: number;
  line: number;
  color: number;
  tone: number;
  base: number;
}

/** Normalize degrees to [0, 360). */
export function normalize(deg: number): number {
  const r = ((deg % 360) + 360) % 360;
  // Guard against floating point producing exactly 360 for tiny negative inputs.
  return r >= 360 ? 0 : r;
}

/** Wrap an angle difference to (-180, 180]. */
export function wrap180(deg: number): number {
  const r = normalize(deg); // [0, 360)
  return r > 180 ? r - 360 : r;
}

export function mapLongitude(lon: number): GatePosition {
  const x = normalize(lon - GATE_START_LON);
  // 加極小值防止 59.99999999 被算成 59
  let u = Math.floor((x * UNITS_PER_CIRCLE) / 360 + 1e-9);
  if (u >= UNITS_PER_CIRCLE) u = 0;
  const gateIdx = Math.floor(u / UNITS_PER_GATE);
  const r = u % UNITS_PER_GATE;
  return {
    gate: GATE_ORDER[gateIdx],
    line: Math.floor(r / UNITS_PER_LINE) + 1,
    color: Math.floor((r % UNITS_PER_LINE) / UNITS_PER_COLOR) + 1,
    tone: Math.floor((r % UNITS_PER_COLOR) / UNITS_PER_TONE) + 1,
    base: (r % UNITS_PER_TONE) + 1,
  };
}

/**
 * Spec §8.2 — minutes until the body crosses its current line boundary at its current speed.
 * Direct motion: distance to the upper (next) boundary. Retrograde (speed < 0): distance to the
 * lower boundary of the current line.
 */
export function minutesToLineBoundary(lon: number, speedDegPerDay: number): number {
  const x = normalize(lon - GATE_START_LON);
  const posInLine = x - Math.floor(x / LINE_WIDTH_DEG) * LINE_WIDTH_DEG; // [0, LINE_WIDTH)
  const degrees = speedDegPerDay < 0 ? posInLine : LINE_WIDTH_DEG - posInLine;
  // SPEC-QUESTION: the spec does not define the result for speed === 0 (division by zero). To keep
  // the value finite and JSON-serializable, |speed| is floored at 1e-9 °/day (→ a huge, non-warning
  // number of minutes) instead of returning Infinity.
  const absSpeed = Math.max(Math.abs(speedDegPerDay), 1e-9);
  return (degrees / absSpeed) * 1440;
}
