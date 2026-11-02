// Spec §5.1 — ephemeris abstraction. Geocentric, tropical ecliptic longitudes, JD in UT.

export type EphemBody =
  | 'sun' | 'moon' | 'mercury' | 'venus' | 'mars' | 'jupiter'
  | 'saturn' | 'uranus' | 'neptune' | 'pluto'
  | 'trueNode' | 'meanNode';

export interface EphemerisProvider {
  readonly name: string;           // 例如 'swisseph-moshier'
  position(jdUT: number, body: EphemBody): {
    longitude: number;             // 0 <= x < 360
    speed: number;                 // 度／日
  };
}
