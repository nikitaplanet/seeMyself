import type { EphemerisProvider } from '../hd/ephemeris/provider';
import { swephProvider } from '../hd/ephemeris/sweph-provider';

// Ephemeris provider used by POST /api/chart. Swappable so integration tests can inject failures;
// route.ts may only export Next's allowed names, so the hook lives here.

let current: EphemerisProvider = swephProvider;

export function getChartProvider(): EphemerisProvider {
  return current;
}

/** Test hook: swap the provider (pass nothing to restore swephProvider). */
export function setChartProvider(provider?: EphemerisProvider): void {
  current = provider ?? swephProvider;
}
