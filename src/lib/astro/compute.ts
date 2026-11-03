import type { EphemBody, EphemerisProvider } from '../hd/ephemeris/provider';
import {
    swephChiron,
    swephHouses,
    swephProvider,
    type SwephHouseSystem,
} from '../hd/ephemeris/sweph-provider';
import { normalize } from '../hd/mapping';
import { localToUtc } from '../hd/time';
import type { BirthInput, NodeMode } from '../hd/types';
import {
    ASPECT_ANGLES,
    ASPECT_NAMES,
    ASPECT_ORBS,
    BODY_NAMES,
    BODY_SHORT,
    HOUSE_SYSTEM_NAMES,
    SIGN_NAMES,
} from './labels';
import type {
    AspectType,
    AstroAspect,
    AstroBody,
    AstroBodyKey,
    AstroChart,
    AstroHouseCusp,
    AstroHouseSystem,
    AstroZodiacPos,
} from './types';

// Western natal chart (本命盤): tropical, geocentric, Swiss Ephemeris in Moshier mode (the same
// engine as Human Design). Houses need both a known birth time and a place (lat/lon).

const ASPECT_TYPES: AspectType[] = ['conjunction', 'sextile', 'square', 'trine', 'opposition'];

const PLANET_BODIES: Array<[AstroBodyKey, EphemBody]> = [
    ['sun', 'sun'],
    ['moon', 'moon'],
    ['mercury', 'mercury'],
    ['venus', 'venus'],
    ['mars', 'mars'],
    ['jupiter', 'jupiter'],
    ['saturn', 'saturn'],
    ['uranus', 'uranus'],
    ['neptune', 'neptune'],
    ['pluto', 'pluto'],
];

/** Placidus first; Porphyry then Whole Sign when Placidus is undefined (polar latitudes). */
const HOUSE_FALLBACKS: Array<[SwephHouseSystem, AstroHouseSystem]> = [
    ['P', 'placidus'],
    ['O', 'porphyry'],
    ['W', 'wholeSign'],
];

export function zodiacPos(longitude: number): AstroZodiacPos {
    const lon = normalize(longitude);
    // Truncate to whole arc-minutes (22.93° → 22°55′) so the sign never rounds up to the next one.
    const totalMinutes = Math.floor(lon * 60 + 1e-9);
    const sign = Math.floor(totalMinutes / 1800) % 12;
    const inSign = totalMinutes - sign * 1800;
    return {
        longitude: lon,
        sign,
        signName: SIGN_NAMES[sign],
        degree: Math.floor(inSign / 60),
        minute: inSign % 60,
    };
}

/** 1..12: the house whose cusp the longitude has passed (cusps[0] = house 1). */
export function houseOf(longitude: number, cusps: number[]): number {
    const lon = normalize(longitude);
    for (let i = 0; i < 12; i++) {
        const start = cusps[i];
        const span = normalize(cusps[(i + 1) % 12] - start);
        if (normalize(lon - start) < span) return i + 1;
    }
    return 1;
}

function orbOf(key: AstroBodyKey): number {
    if (key === 'sun' || key === 'moon') return ASPECT_ORBS.luminary;
    if (key === 'northNode' || key === 'chiron') return ASPECT_ORBS.point;
    return ASPECT_ORBS.planet;
}

/** Major aspects between every pair of bodies (at most one per pair), in body order. */
export function findAspects(bodies: Array<Pick<AstroBody, 'key' | 'longitude'>>): AstroAspect[] {
    const out: AstroAspect[] = [];
    for (let i = 0; i < bodies.length; i++) {
        for (let j = i + 1; j < bodies.length; j++) {
            const a = bodies[i];
            const b = bodies[j];
            const d = normalize(b.longitude - a.longitude);
            const sep = d > 180 ? 360 - d : d;
            const maxOrb = Math.max(orbOf(a.key), orbOf(b.key));
            for (const type of ASPECT_TYPES) {
                const angle = ASPECT_ANGLES[type];
                const orb = Math.abs(sep - angle);
                if (orb <= maxOrb) {
                    out.push({
                        a: a.key,
                        b: b.key,
                        type,
                        name: ASPECT_NAMES[type],
                        angle,
                        orb: Math.round(orb * 100) / 100,
                    });
                    break;
                }
            }
        }
    }
    return out;
}

function computeHouses(
    jd: number,
    lat: number,
    lon: number,
): { system: AstroHouseSystem; cusps: number[]; asc: number; mc: number } | null {
    for (const [code, system] of HOUSE_FALLBACKS) {
        const res = swephHouses(jd, lat, lon, code);
        if (res.ok) return { system, cusps: res.cusps, asc: res.asc, mc: res.mc };
    }
    return null;
}

export function computeAstro(
    input: BirthInput,
    timeUnknown = false,
    provider: EphemerisProvider = swephProvider,
): AstroChart {
    const nodeMode: NodeMode = input.options?.nodeMode ?? 'true';
    const instant = localToUtc(
        input.date,
        timeUnknown ? '12:00' : input.time,
        input.timezone,
        input.options?.disambiguation,
    );
    const jd = instant.jd;

    const raw: Array<{ key: AstroBodyKey; longitude: number; speed: number }> = PLANET_BODIES.map(
        ([key, body]) => ({ key, ...provider.position(jd, body) }),
    );
    raw.push({
        key: 'northNode',
        ...provider.position(jd, nodeMode === 'mean' ? 'meanNode' : 'trueNode'),
    });
    const chiron = swephChiron(jd);
    if (chiron) raw.push({ key: 'chiron', ...chiron });

    const place = input.place;
    const houseData = !timeUnknown && place ? computeHouses(jd, place.lat, place.lon) : null;

    const bodies: AstroBody[] = raw.map((r) => ({
        key: r.key,
        name: BODY_NAMES[r.key],
        short: BODY_SHORT[r.key],
        ...zodiacPos(r.longitude),
        speed: r.speed,
        // The lunar nodes move backwards almost always; ℞ is only meaningful for planets / Chiron.
        retrograde: r.key !== 'northNode' && r.speed < 0,
        house: houseData ? houseOf(r.longitude, houseData.cusps) : null,
    }));

    const houses: AstroHouseCusp[] | null = houseData
        ? houseData.cusps.map((c, i) => ({ house: i + 1, ...zodiacPos(c) }))
        : null;

    let houseNote: string | null = null;
    if (timeUnknown) {
        houseNote = '出生時間不確定，無法計算上升、天頂與宮位。';
    } else if (!place) {
        houseNote = '沒有出生地點的經緯度，無法計算上升、天頂與宮位。';
    } else if (!houseData) {
        houseNote = '這個緯度無法計算宮位。';
    } else if (houseData.system !== 'placidus') {
        houseNote = `出生地緯度過高，普拉西度制無法成立，改用${HOUSE_SYSTEM_NAMES[houseData.system]}。`;
    }

    return {
        utc: instant.utcIso,
        jd,
        timeUnknown,
        nodeMode,
        ephemeris: provider.name,
        bodies,
        angles: houseData ? { asc: zodiacPos(houseData.asc), mc: zodiacPos(houseData.mc) } : null,
        houses,
        houseSystem: houseData?.system ?? null,
        houseSystemLabel: houseData ? HOUSE_SYSTEM_NAMES[houseData.system] : null,
        houseNote,
        aspects: findAspects(bodies),
        chironAvailable: chiron !== null,
        placeName: place?.name ?? null,
    };
}
