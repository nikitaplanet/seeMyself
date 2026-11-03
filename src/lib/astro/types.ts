import type { NodeMode } from '../hd/types';

// Western natal chart (本命盤) — public types returned by POST /api/astro. Tropical zodiac,
// geocentric, longitudes in degrees 0 <= x < 360.

export type AstroBodyKey =
    | 'sun'
    | 'moon'
    | 'mercury'
    | 'venus'
    | 'mars'
    | 'jupiter'
    | 'saturn'
    | 'uranus'
    | 'neptune'
    | 'pluto'
    | 'northNode'
    | 'chiron';

/** Position inside a sign, e.g. 雙子 22°55′. */
export interface AstroZodiacPos {
    longitude: number;
    /** 0 = 牡羊 … 11 = 雙魚 */
    sign: number;
    signName: string;
    degree: number; // 0..29
    minute: number; // 0..59
}

export interface AstroBody extends AstroZodiacPos {
    key: AstroBodyKey;
    name: string;
    /** One-character label used on the wheel (always renders, unlike astrological glyphs). */
    short: string;
    speed: number; // 度／日，負值為逆行
    retrograde: boolean;
    /** 1..12, null when houses are unavailable (time unknown / no place). */
    house: number | null;
}

export interface AstroAngles {
    asc: AstroZodiacPos;
    mc: AstroZodiacPos;
}

export interface AstroHouseCusp extends AstroZodiacPos {
    house: number; // 1..12
}

export type AstroHouseSystem = 'placidus' | 'porphyry' | 'wholeSign';

export type AspectType = 'conjunction' | 'sextile' | 'square' | 'trine' | 'opposition';

export interface AstroAspect {
    a: AstroBodyKey;
    b: AstroBodyKey;
    type: AspectType;
    name: string;
    /** Exact aspect angle (0 / 60 / 90 / 120 / 180). */
    angle: number;
    /** |separation − angle| in degrees. */
    orb: number;
}

export interface AstroChart {
    utc: string; // ISO 8601
    jd: number;
    timeUnknown: boolean;
    nodeMode: NodeMode;
    ephemeris: string;
    bodies: AstroBody[];
    angles: AstroAngles | null;
    houses: AstroHouseCusp[] | null;
    houseSystem: AstroHouseSystem | null;
    houseSystemLabel: string | null;
    /** Why houses are missing, or why the house system differs from Placidus. */
    houseNote: string | null;
    aspects: AstroAspect[];
    chironAvailable: boolean;
    placeName: string | null;
}
