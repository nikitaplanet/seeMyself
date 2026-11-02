/**
 * Place-name search (spec §4.2). Server-only: imports the multi-MB GeoNames index, which is
 * loaded into memory once at module scope. Do not import this from client components.
 */
import placesData from "../../data/places.zh-TW.json";

/** Spec §4.1 `Place`, plus `asciiname` (searched per §4.2) and `country` (display name). */
export interface Place {
  id: number; // geonameid
  name: string; // English name
  asciiname?: string; // omitted in data when identical to `name`
  nameZh?: string; // Traditional Chinese name
  admin1?: string; // first-level administrative division
  countryCode: string;
  country: string; // Chinese country name if available, else English
  lat: number;
  lon: number;
  timezone: string; // IANA
  population: number;
}

export const MAX_RESULTS = 10;

/** Lowercase, NFKC, strip diacritics, and fold 台 → 臺 so either form matches. */
export function normalize(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/台/g, "臺")
    .trim();
}

interface IndexedPlace {
  place: Place;
  keys: string[];
}

function buildIndex(places: readonly Place[]): IndexedPlace[] {
  return places.map((place) => {
    const keys = new Set<string>();
    for (const k of [place.nameZh, place.name, place.asciiname]) if (k) keys.add(normalize(k));
    return { place, keys: [...keys] };
  });
}

const ALL_PLACES: readonly Place[] = placesData as Place[];
const DEFAULT_INDEX = buildIndex(ALL_PLACES);

/**
 * Prefix matches rank above contains matches; within a tier, population descending.
 * Returns at most `limit` (default 10) places.
 */
export function searchPlaces(query: string, limit: number = MAX_RESULTS, index: IndexedPlace[] = DEFAULT_INDEX): Place[] {
  const q = normalize(query);
  if (!q) return [];
  const prefix: Place[] = [];
  const contains: Place[] = [];
  for (const { place, keys } of index) {
    if (keys.some((k) => k.startsWith(q))) prefix.push(place);
    else if (keys.some((k) => k.includes(q))) contains.push(place);
  }
  const byPop = (a: Place, b: Place) => b.population - a.population || a.id - b.id;
  prefix.sort(byPop);
  if (prefix.length >= limit) return prefix.slice(0, limit);
  contains.sort(byPop);
  return prefix.concat(contains).slice(0, limit);
}

/** Exposed for tests with a custom data set. */
export function createIndex(places: readonly Place[]): IndexedPlace[] {
  return buildIndex(places);
}

/** Display format: `臺北市, 臺灣 (Asia/Taipei)`. */
export function formatPlace(place: Place): string {
  return `${place.nameZh ?? place.name}, ${place.country} (${place.timezone})`;
}
