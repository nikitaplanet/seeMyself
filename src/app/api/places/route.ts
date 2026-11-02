import type { NextRequest } from "next/server";
import { searchPlaces } from "../../../lib/places/search";

// SPEC-QUESTION: spec §9 asks for `export const runtime = 'nodejs'`, but next.config.ts enables
// `cacheComponents`, and Next 16 docs (migrating-to-cache-components.md → "runtime = 'edge'")
// require removing the `runtime` export entirely, even `'nodejs'`. Node.js is already the default
// runtime under Cache Components, so the export is omitted. Re-add it if cacheComponents is disabled.

const MIN_LEN = 1;
const MAX_LEN = 50;

interface ErrorBody {
  error: { code: "INVALID_INPUT"; message: string; details?: Record<string, unknown> };
}

function invalid(message: string, details?: Record<string, unknown>): Response {
  const body: ErrorBody = { error: { code: "INVALID_INPUT", message, ...(details ? { details } : {}) } };
  return Response.json(body, { status: 400 });
}

/** GET /api/places?q=臺北 — spec §9.2. The query is never logged (spec §13.3). */
export async function GET(request: NextRequest): Promise<Response> {
  const raw = request.nextUrl.searchParams.get("q");
  const q = (raw ?? "").trim();
  const len = [...q].length; // count code points, not UTF-16 units
  if (len < MIN_LEN || len > MAX_LEN) {
    return invalid(`請輸入 ${MIN_LEN}～${MAX_LEN} 個字元的地名。`, {
      field: "q",
      minLength: MIN_LEN,
      maxLength: MAX_LEN,
    });
  }
  return Response.json(
    { results: searchPlaces(q) },
    { status: 200, headers: { "Cache-Control": "public, max-age=86400" } },
  );
}
