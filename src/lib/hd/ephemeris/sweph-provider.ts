import * as swephModule from 'sweph';
import { HDError } from '../errors';
import { normalize } from '../mapping';
import type { EphemBody, EphemerisProvider } from './provider';

// Spec §5.2 — Swiss Ephemeris (Moshier mode) implementation. Server-only (native module, AGPL).

type SwephApi = typeof swephModule;
type SwephCore = Pick<SwephApi, 'calc_ut' | 'julday'>;

// sweph's ESM entry (index.mjs) only exposes `default`/`sweph`/`constants`/`close` as named exports,
// while its CJS entry exposes every function. Resolve the function table in both cases.
const loaded = swephModule as SwephApi & { default?: Partial<SwephCore>; sweph?: Partial<SwephCore> };

function resolveCore(): SwephCore {
  const candidates: Array<Partial<SwephCore> | undefined> = [loaded, loaded.default, loaded.sweph];
  for (const c of candidates) {
    if (c && typeof c.calc_ut === 'function' && typeof c.julday === 'function') {
      return { calc_ut: c.calc_ut, julday: c.julday };
    }
  }
  throw new HDError('EPHEMERIS_ERROR', { details: { reason: 'sweph native functions not found' } });
}

const core = resolveCore();
const C = loaded.constants;

const BODY_CONST: Record<EphemBody, number> = {
  sun: C.SE_SUN,
  moon: C.SE_MOON,
  mercury: C.SE_MERCURY,
  venus: C.SE_VENUS,
  mars: C.SE_MARS,
  jupiter: C.SE_JUPITER,
  saturn: C.SE_SATURN,
  uranus: C.SE_URANUS,
  neptune: C.SE_NEPTUNE,
  pluto: C.SE_PLUTO,
  trueNode: C.SE_TRUE_NODE,
  meanNode: C.SE_MEAN_NODE,
};

const FLAGS = C.SEFLG_MOSEPH | C.SEFLG_SPEED;

export const swephProvider: EphemerisProvider = {
  name: 'swisseph-moshier',
  position(jdUT: number, body: EphemBody) {
    if (!Number.isFinite(jdUT)) {
      throw new HDError('EPHEMERIS_ERROR', { details: { body, reason: 'non-finite JD' } });
    }
    const res = core.calc_ut(jdUT, BODY_CONST[body], FLAGS);
    if (res.flag < 0 || (typeof res.error === 'string' && res.error.length > 0)) {
      throw new HDError('EPHEMERIS_ERROR', { details: { body, jdUT, reason: res.error } });
    }
    const lon = res.data[0];
    const speed = res.data[3];
    if (!Number.isFinite(lon) || !Number.isFinite(speed)) {
      throw new HDError('EPHEMERIS_ERROR', { details: { body, jdUT, reason: 'non-finite result' } });
    }
    return { longitude: normalize(lon), speed };
  },
};

/** sweph.julday wrapper (Gregorian calendar), exposed for cross-checking time.ts in tests. */
export function swephJulday(year: number, month: number, day: number, hourUT: number): number {
  return core.julday(year, month, day, hourUT, C.SE_GREG_CAL);
}
