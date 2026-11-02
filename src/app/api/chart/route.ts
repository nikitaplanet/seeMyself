import { getChartProvider } from '../../../lib/api/chartProvider';
import { parseBirthInput } from '../../../lib/api/chartSchema';
import { clientKey, getChartRateLimiter } from '../../../lib/api/rateLimit';
import { computeChart } from '../../../lib/hd/chart';
import { MAX_DATE, MIN_DATE } from '../../../lib/hd/constants';
import { HD_ERROR_MESSAGES, isHDError, type HDErrorCode } from '../../../lib/hd/errors';

// POST /api/chart — spec §9.1. Stateless: nothing is stored, and birth data is never logged (§13.3).
//
// SPEC-QUESTION: spec §9.1 asks for `export const runtime = 'nodejs'`, but next.config.ts enables
// `cacheComponents`, and the Next 16 docs (route-segment-config/runtime.md) say to remove the
// `runtime` export entirely under Cache Components, even `'nodejs'`. Node.js is the default runtime,
// so the export is omitted. POST handlers are never cached/prerendered, so no `dynamic` config is
// needed (and `dynamic` is not allowed under Cache Components anyway).

type ApiErrorCode = HDErrorCode | 'RATE_LIMITED' | 'INTERNAL_ERROR';

const STATUS: Record<ApiErrorCode, number> = {
  INVALID_INPUT: 400,
  DATE_OUT_OF_RANGE: 400,
  NONEXISTENT_LOCAL_TIME: 422,
  AMBIGUOUS_LOCAL_TIME: 422,
  RATE_LIMITED: 429,
  EPHEMERIS_ERROR: 500,
  DESIGN_TIME_ERROR: 500,
  INTERNAL_ERROR: 500,
};

const MESSAGES: Record<ApiErrorCode, string> = {
  ...HD_ERROR_MESSAGES,
  RATE_LIMITED: '請求過於頻繁，請稍候一分鐘再試。',
  INTERNAL_ERROR: '伺服器發生未預期的錯誤，請稍後再試。',
};

const BASE_HEADERS = { 'Cache-Control': 'no-store' } as const;

function errorResponse(
  code: ApiErrorCode,
  details?: Record<string, unknown>,
  extraHeaders?: Record<string, string>,
): Response {
  const status = STATUS[code];
  // §13.3: log the error code only — never the request body, birth data or error details.
  if (status >= 500) console.error(`[api/chart] ${code}`);
  return Response.json(
    { error: { code, message: MESSAGES[code], ...(details !== undefined ? { details } : {}) } },
    { status, headers: { ...BASE_HEADERS, ...extraHeaders } },
  );
}

export async function POST(request: Request): Promise<Response> {
  const limit = getChartRateLimiter().check(clientKey(request.headers));
  if (!limit.allowed) {
    return errorResponse('RATE_LIMITED', { retryAfterSeconds: limit.retryAfterSeconds }, {
      'Retry-After': String(limit.retryAfterSeconds),
    });
  }

  let json: unknown;
  try {
    json = JSON.parse(await request.text());
  } catch {
    return errorResponse('INVALID_INPUT', { fieldErrors: [{ path: '(root)', message: '請求本文不是有效的 JSON。' }] });
  }

  const parsed = parseBirthInput(json);
  if (!parsed.ok) {
    if (parsed.code === 'DATE_OUT_OF_RANGE') {
      return errorResponse('DATE_OUT_OF_RANGE', { min: MIN_DATE, max: MAX_DATE, fieldErrors: parsed.fieldErrors });
    }
    return errorResponse('INVALID_INPUT', { fieldErrors: parsed.fieldErrors });
  }

  try {
    const chart = computeChart(parsed.data, getChartProvider());
    return Response.json(chart, { status: 200, headers: BASE_HEADERS });
  } catch (err) {
    if (isHDError(err)) {
      // 4xx details describe the user's own input (e.g. AMBIGUOUS candidates) and are safe to return;
      // 5xx details are internal diagnostics (JDs, residuals) and are withheld.
      const status = STATUS[err.code];
      return errorResponse(err.code, status < 500 ? err.details : undefined);
    }
    // SPEC-QUESTION: §9.1 lists no code for non-HDError failures (programming errors). Conservatively
    // return a generic 500 INTERNAL_ERROR rather than mislabelling it EPHEMERIS_ERROR.
    return errorResponse('INTERNAL_ERROR');
  }
}
