import { parseBirthInput } from '../../../lib/api/chartSchema';
import { clientKey, getChartRateLimiter } from '../../../lib/api/rateLimit';
import { computeAstro } from '../../../lib/astro/compute';
import { MAX_DATE, MIN_DATE } from '../../../lib/hd/constants';
import { HD_ERROR_MESSAGES, isHDError, type HDErrorCode } from '../../../lib/hd/errors';

// POST /api/astro — Western natal chart (本命盤). Same birth payload as /api/chart, plus optional
// `timeUnknown`. Stateless. Like /api/chart, no `runtime` export (Cache Components; Node is default).

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
    if (status >= 500) console.error(`[api/astro] ${code}`);
    return Response.json(
        {
            error: {
                code,
                message: MESSAGES[code],
                ...(details !== undefined ? { details } : {}),
            },
        },
        { status, headers: { ...BASE_HEADERS, ...extraHeaders } },
    );
}

export async function POST(request: Request): Promise<Response> {
    const limit = getChartRateLimiter().check(clientKey(request.headers));
    if (!limit.allowed) {
        return errorResponse(
            'RATE_LIMITED',
            { retryAfterSeconds: limit.retryAfterSeconds },
            { 'Retry-After': String(limit.retryAfterSeconds) },
        );
    }

    let json: unknown;
    try {
        json = JSON.parse(await request.text());
    } catch {
        return errorResponse('INVALID_INPUT', {
            fieldErrors: [{ path: '(root)', message: '請求本文不是有效的 JSON。' }],
        });
    }

    const parsed = parseBirthInput(json);
    if (!parsed.ok) {
        if (parsed.code === 'DATE_OUT_OF_RANGE') {
            return errorResponse('DATE_OUT_OF_RANGE', {
                min: MIN_DATE,
                max: MAX_DATE,
                fieldErrors: parsed.fieldErrors,
            });
        }
        return errorResponse('INVALID_INPUT', { fieldErrors: parsed.fieldErrors });
    }

    const body = json !== null && typeof json === 'object' ? (json as Record<string, unknown>) : {};
    const timeUnknown = body.timeUnknown === true;

    try {
        const chart = computeAstro(parsed.data, timeUnknown);
        return Response.json(chart, { status: 200, headers: BASE_HEADERS });
    } catch (err) {
        if (isHDError(err)) {
            const status = STATUS[err.code];
            return errorResponse(err.code, status < 500 ? err.details : undefined);
        }
        return errorResponse('INTERNAL_ERROR');
    }
}
