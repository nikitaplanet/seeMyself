/**
 * Build the place-name index `src/data/places.zh-TW.json` from GeoNames (CC BY 4.0).
 *
 * Usage: npx tsx scripts/build-places.ts
 *
 * Requires the system `curl` and `unzip` CLIs. Downloads are cached in `.cache/geonames/`
 * (gitignored) and skipped when already present. `alternateNamesV2.zip` is large, so it is
 * streamed line by line through `unzip -p` and never loaded into memory as a whole.
 *
 * Spec §4.1: Traditional Chinese name priority is zh-TW > zh-Hant > zh (fallback).
 */
import { spawn, spawnSync } from "node:child_process";
import { createReadStream, existsSync, mkdirSync, renameSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import readline from "node:readline";
import type { Readable } from "node:stream";

const ROOT = path.resolve(__dirname, "..");
const CACHE_DIR = path.join(ROOT, ".cache", "geonames");
const OUT_FILE = path.join(ROOT, "src", "data", "places.zh-TW.json");
const BASE_URL = "https://download.geonames.org/export/dump/";
const FILES = ["cities15000.zip", "alternateNamesV2.zip", "countryInfo.txt", "admin1CodesASCII.txt"] as const;

/** Display-name overrides where GeoNames' zh-TW name differs from the spec's Taiwan usage (§4.2: `臺北市, 臺灣`). */
const COUNTRY_NAME_OVERRIDES: Record<string, string> = { TW: "臺灣" };

/** Output record. Matches spec §4.1 `Place`, plus `asciiname` (searched per §4.2) and `country` (display). */
export interface PlaceRecord {
  id: number;
  name: string;
  asciiname?: string; // omitted when identical to `name`
  nameZh?: string;
  admin1?: string;
  countryCode: string;
  country: string; // Chinese country name if available, else English
  lat: number;
  lon: number;
  timezone: string;
  population: number;
}

function download(file: string): void {
  const dest = path.join(CACHE_DIR, file);
  if (existsSync(dest) && statSync(dest).size > 0) {
    console.log(`cached: ${file}`);
    return;
  }
  console.log(`downloading: ${file}`);
  const tmp = `${dest}.part`;
  const res = spawnSync("curl", ["-fSL", "--retry", "3", "-o", tmp, BASE_URL + file], { stdio: "inherit" });
  if (res.status !== 0) throw new Error(`curl failed for ${file}`);
  renameSync(tmp, dest);
}

/** Stream lines of a single entry inside a zip via `unzip -p`. */
async function* zipLines(zipFile: string, entry: string): AsyncGenerator<string> {
  const child = spawn("unzip", ["-p", zipFile, entry], { stdio: ["ignore", "pipe", "inherit"] });
  const exited = new Promise<number | null>((resolve) => child.on("close", resolve));
  yield* lines(child.stdout);
  const code = await exited;
  if (code !== 0) throw new Error(`unzip exited with ${code} for ${zipFile}:${entry}`);
}

async function* fileLines(file: string): AsyncGenerator<string> {
  yield* lines(createReadStream(file));
}

async function* lines(stream: Readable): AsyncGenerator<string> {
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  for await (const line of rl) yield line;
}

interface City {
  id: number;
  name: string;
  asciiname: string;
  countryCode: string;
  admin1Code: string;
  lat: number;
  lon: number;
  timezone: string;
  population: number;
}

const LANG_RANK: Record<string, number> = { "zh-TW": 0, "zh-Hant": 1, zh: 2 };

interface ZhCandidate {
  name: string;
  score: number; // lower is better
}

/**
 * Rank: language tier first, then preferred-name flag, then non-short names
 * (so "臺北市" beats a short form like "臺北" within the same tier).
 */
function candidateScore(lang: string, preferred: boolean, short: boolean): number {
  return LANG_RANK[lang] * 4 + (preferred ? 0 : 2) + (short ? 1 : 0);
}

function round(n: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

async function main(): Promise<void> {
  mkdirSync(CACHE_DIR, { recursive: true });
  for (const f of FILES) download(f);

  // 1. Cities
  const cities: City[] = [];
  for await (const line of zipLines(path.join(CACHE_DIR, "cities15000.zip"), "cities15000.txt")) {
    if (!line) continue;
    const c = line.split("\t");
    cities.push({
      id: Number(c[0]),
      name: c[1],
      asciiname: c[2],
      countryCode: c[8],
      admin1Code: c[10],
      lat: Number(c[4]),
      lon: Number(c[5]),
      timezone: c[17],
      population: Number(c[14]) || 0,
    });
  }
  console.log(`cities: ${cities.length}`);

  // 2. Countries (English name + geonameid for Chinese lookup)
  const countries = new Map<string, { name: string; geonameid: number }>();
  for await (const line of fileLines(path.join(CACHE_DIR, "countryInfo.txt"))) {
    if (!line || line.startsWith("#")) continue;
    const c = line.split("\t");
    countries.set(c[0], { name: c[4], geonameid: Number(c[16]) });
  }

  // 3. Admin1 (English name + geonameid)
  const admin1 = new Map<string, { name: string; geonameid: number }>();
  for await (const line of fileLines(path.join(CACHE_DIR, "admin1CodesASCII.txt"))) {
    if (!line) continue;
    const c = line.split("\t");
    admin1.set(c[0], { name: c[1], geonameid: Number(c[3]) });
  }

  // 4. Stream alternate names for every geonameid we care about.
  const wanted = new Set<number>();
  for (const c of cities) wanted.add(c.id);
  for (const c of countries.values()) wanted.add(c.geonameid);
  for (const a of admin1.values()) wanted.add(a.geonameid);

  const zh = new Map<number, ZhCandidate>();
  let scanned = 0;
  for await (const line of zipLines(path.join(CACHE_DIR, "alternateNamesV2.zip"), "alternateNamesV2.txt")) {
    scanned++;
    // alternateNameId, geonameid, isolanguage, name, isPreferredName, isShortName, isColloquial, isHistoric, from, to
    const t1 = line.indexOf("\t");
    const t2 = line.indexOf("\t", t1 + 1);
    const t3 = line.indexOf("\t", t2 + 1);
    const lang = line.slice(t2 + 1, t3);
    if (!(lang in LANG_RANK)) continue;
    const id = Number(line.slice(t1 + 1, t2));
    if (!wanted.has(id)) continue;
    const c = line.split("\t");
    if (c[6] === "1" || c[7] === "1") continue; // colloquial / historic
    const name = c[3].trim();
    if (!name) continue;
    const score = candidateScore(lang, c[4] === "1", c[5] === "1");
    const prev = zh.get(id);
    if (!prev || score < prev.score) zh.set(id, { name, score });
  }
  console.log(`alternate names scanned: ${scanned}, Chinese names found: ${zh.size}`);

  // 5. Assemble output.
  // SPEC-QUESTION: `zh`-only names may be Simplified Chinese; per instructions opencc is not used,
  // so those are kept as-is (most Taiwan/major-city names come from zh-TW/zh-Hant anyway).
  const out: PlaceRecord[] = cities.map((c) => {
    const country = countries.get(c.countryCode);
    const adm = admin1.get(`${c.countryCode}.${c.admin1Code}`);
    const rec: PlaceRecord = {
      id: c.id,
      name: c.name,
      countryCode: c.countryCode,
      country:
        COUNTRY_NAME_OVERRIDES[c.countryCode] ??
        (country && zh.get(country.geonameid)?.name) ??
        country?.name ??
        c.countryCode,
      lat: round(c.lat, 4),
      lon: round(c.lon, 4),
      timezone: c.timezone,
      population: c.population,
    };
    if (c.asciiname && c.asciiname !== c.name) rec.asciiname = c.asciiname;
    const nameZh = zh.get(c.id)?.name;
    if (nameZh) rec.nameZh = nameZh;
    const admName = adm ? (zh.get(adm.geonameid)?.name ?? adm.name) : undefined;
    if (admName) rec.admin1 = admName;
    return rec;
  });
  out.sort((a, b) => b.population - a.population || a.id - b.id);

  mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  const json = JSON.stringify(out);
  writeFileSync(OUT_FILE, json);
  const withZh = out.filter((p) => p.nameZh).length;
  console.log(
    `wrote ${path.relative(ROOT, OUT_FILE)}: ${out.length} records (${withZh} with nameZh), ${(Buffer.byteLength(json) / 1024 / 1024).toFixed(2)} MB`,
  );
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
