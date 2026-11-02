import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { createIndex, formatPlace, searchPlaces, type Place } from "../../src/lib/places/search";
import { GET } from "../../src/app/api/places/route";

const top3Ids = (q: string): number[] => searchPlaces(q).slice(0, 3).map((p) => p.id);

// GeoNames ids
const TAIPEI = 1668341;
const KAOHSIUNG = 1673820;
const TOKYO = 1850147;
const NEW_YORK = 5128581;

describe("searchPlaces — M6 acceptance", () => {
  it.each([
    ["臺北", TAIPEI],
    ["台北", TAIPEI],
    ["高雄", KAOHSIUNG],
    ["Tokyo", TOKYO],
    ["New York", NEW_YORK],
    ["tokyo", TOKYO],
  ])("%s → intended city in top 3", (q, id) => {
    expect(top3Ids(q)).toContain(id);
  });

  it("returns at most 10 results", () => {
    expect(searchPlaces("a").length).toBe(10);
  });

  it("returns [] for blank query", () => {
    expect(searchPlaces("   ")).toEqual([]);
  });

  it("formats Taipei for display", () => {
    const taipei = searchPlaces("臺北").find((p) => p.id === TAIPEI);
    expect(taipei).toBeDefined();
    expect(formatPlace(taipei as Place)).toBe("臺北市, 臺灣 (Asia/Taipei)"); // TW country name overridden in build-places.ts
  });
});

describe("searchPlaces — ranking rules", () => {
  const base = { countryCode: "XX", country: "X", lat: 0, lon: 0, timezone: "UTC" };
  const data: Place[] = [
    { ...base, id: 1, name: "Big Contains Town", population: 1_000_000 },
    { ...base, id: 2, name: "Townsville", population: 10 },
    { ...base, id: 3, name: "Towne", population: 500 },
    { ...base, id: 4, name: "Zürich", asciiname: "Zurich", population: 1 },
  ];
  const index = createIndex(data);

  it("prefix beats contains; same tier by population desc", () => {
    expect(searchPlaces("town", 10, index).map((p) => p.id)).toEqual([3, 2, 1]);
  });

  it("matches asciiname and ignores diacritics", () => {
    expect(searchPlaces("zurich", 10, index).map((p) => p.id)).toEqual([4]);
    expect(searchPlaces("ZÜR", 10, index).map((p) => p.id)).toEqual([4]);
  });
});

describe("GET /api/places", () => {
  const call = (q?: string) =>
    GET(new NextRequest(`http://localhost/api/places${q === undefined ? "" : `?q=${encodeURIComponent(q)}`}`));

  it.each([
    ["missing", undefined],
    ["empty", ""],
    ["whitespace", "   "],
    ["too long", "a".repeat(51)],
  ])("400 INVALID_INPUT when q is %s", async (_label, q) => {
    const res = await call(q);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("INVALID_INPUT");
    expect(body.error.message.length).toBeGreaterThan(0);
  });

  it("200 with results and cache header; 50 chars is allowed", async () => {
    const res = await call(" 臺北 ");
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=86400");
    const body = (await res.json()) as { results: Place[] };
    expect(body.results.length).toBeLessThanOrEqual(10);
    expect(body.results.map((p) => p.id)).toContain(TAIPEI);
    expect((await call("a".repeat(50))).status).toBe(200);
  });
});
