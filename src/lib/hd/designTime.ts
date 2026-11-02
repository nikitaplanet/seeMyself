import type { EphemerisProvider } from './ephemeris/provider';
import { HDError } from './errors';
import { normalize, wrap180 } from './mapping';

// Spec §5.4 — find jdD where sunLon(jdD) = sunLon(jdP) − 88° (solar arc, not 88 days).

export const DESIGN_ARC_DEG = 88;
const SEARCH_LO_DAYS = 95;
const SEARCH_HI_DAYS = 84;
const NEWTON_START_DAYS = 88.5;
const NEWTON_MAX_ITER = 10;
const NEWTON_TOL_DEG = 1e-9;
const BISECT_WIDTH_DAYS = 1e-7;
const BISECT_MAX_ITER = 60;
const FINAL_TOL_DEG = 1e-6;

export function findDesignJd(provider: EphemerisProvider, jdP: number): number {
  const target = normalize(provider.position(jdP, 'sun').longitude - DESIGN_ARC_DEG);
  const f = (jd: number) => wrap180(provider.position(jd, 'sun').longitude - target);
  const lo0 = jdP - SEARCH_LO_DAYS;
  const hi0 = jdP - SEARCH_HI_DAYS;

  // 1) Newton
  let jd = jdP - NEWTON_START_DAYS;
  let newtonOk = false;
  for (let i = 0; i < NEWTON_MAX_ITER; i++) {
    const pos = provider.position(jd, 'sun');
    const fx = wrap180(pos.longitude - target);
    if (Math.abs(fx) < NEWTON_TOL_DEG) {
      newtonOk = true;
      break;
    }
    if (!(pos.speed > 0)) break; // sun is never retrograde geocentrically; bail out to bisection
    jd -= fx / pos.speed;
    if (!(jd >= lo0 && jd <= hi0)) break;
  }
  // jd is inside [lo0, hi0] whenever newtonOk (start is inside; every step is range-checked).
  if (newtonOk) return jd;

  // 2) Bisection fallback
  let lo = lo0;
  let hi = hi0;
  const flo = f(lo);
  const fhi = f(hi);
  if (!(flo < 0 && fhi > 0)) {
    throw new HDError('DESIGN_TIME_ERROR', { details: { jdP, reason: 'bracket invalid', flo, fhi } });
  }
  for (let i = 0; i < BISECT_MAX_ITER && hi - lo >= BISECT_WIDTH_DAYS; i++) {
    const mid = (lo + hi) / 2;
    if (f(mid) < 0) lo = mid;
    else hi = mid;
  }
  const jdD = (lo + hi) / 2;
  const residual = f(jdD);
  if (!(Math.abs(residual) < FINAL_TOL_DEG)) {
    throw new HDError('DESIGN_TIME_ERROR', { details: { jdP, residual } });
  }
  return jdD;
}
