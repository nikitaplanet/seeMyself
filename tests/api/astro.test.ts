import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { POST } from '@/app/api/astro/route';
import { createRateLimiter, setChartRateLimiter } from '@/lib/api/rateLimit';
import type { AstroChart } from '@/lib/astro/types';

interface ErrorBody {
    error: { code: string; message: string; details?: Record<string, unknown> };
}

let ipCounter = 0;
function req(body: unknown, opts: { raw?: string; ip?: string } = {}): Request {
    return new Request('http://localhost/api/astro', {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            'x-forwarded-for': opts.ip ?? `10.1.0.${++ipCounter}`,
        },
        body: opts.raw ?? JSON.stringify(body),
    });
}

async function call(body: unknown, opts?: { raw?: string; ip?: string }) {
    const res = await POST(req(body, opts));
    return { res, json: (await res.json()) as unknown };
}

const TAIPEI = {
    date: '1990-05-12',
    time: '14:30',
    timezone: 'Asia/Taipei',
    place: { name: '臺北市', lat: 25.0478, lon: 121.5319, countryCode: 'TW' },
};

beforeEach(() => setChartRateLimiter());
afterEach(() => setChartRateLimiter());

describe('POST /api/astro', () => {
    it('200 with a full natal chart (no gender required)', async () => {
        const { res, json } = await call(TAIPEI);
        expect(res.status).toBe(200);
        expect(res.headers.get('cache-control')).toBe('no-store');
        const chart = json as AstroChart;
        expect(chart.utc).toBe('1990-05-12T06:30:00Z');
        expect(chart.bodies.length).toBeGreaterThanOrEqual(11);
        expect(chart.bodies[0]).toMatchObject({ key: 'sun', name: '太陽', signName: '金牛' });
        expect(chart.houses).toHaveLength(12);
        expect(chart.angles?.asc.signName).toBeTypeOf('string');
        expect(chart.houseSystem).toBe('placidus');
        expect(Array.isArray(chart.aspects)).toBe(true);
    });

    it('timeUnknown → no houses / angles', async () => {
        const { res, json } = await call({ ...TAIPEI, timeUnknown: true });
        expect(res.status).toBe(200);
        const chart = json as AstroChart;
        expect(chart.timeUnknown).toBe(true);
        expect(chart.houses).toBeNull();
        expect(chart.angles).toBeNull();
    });

    it('400 INVALID_INPUT for bad JSON and bad fields', async () => {
        const a = await call(null, { raw: '{oops' });
        expect(a.res.status).toBe(400);
        expect((a.json as ErrorBody).error.code).toBe('INVALID_INPUT');
        const b = await call({ ...TAIPEI, date: '1990/05/12' });
        expect(b.res.status).toBe(400);
        expect((b.json as ErrorBody).error.message).toMatch(/[一-鿿]/);
    });

    it('400 DATE_OUT_OF_RANGE and 422 NONEXISTENT_LOCAL_TIME', async () => {
        const a = await call({ ...TAIPEI, date: '1700-01-01' });
        expect(a.res.status).toBe(400);
        expect((a.json as ErrorBody).error.code).toBe('DATE_OUT_OF_RANGE');
        const b = await call({ date: '2021-03-14', time: '02:30', timezone: 'America/New_York' });
        expect(b.res.status).toBe(422);
        expect((b.json as ErrorBody).error.code).toBe('NONEXISTENT_LOCAL_TIME');
    });

    it('429 when rate limited', async () => {
        setChartRateLimiter(createRateLimiter({ limit: 1, windowMs: 60_000 }));
        expect((await call(TAIPEI, { ip: '10.9.9.9' })).res.status).toBe(200);
        const { res, json } = await call(TAIPEI, { ip: '10.9.9.9' });
        expect(res.status).toBe(429);
        expect((json as ErrorBody).error.code).toBe('RATE_LIMITED');
        expect(res.headers.get('retry-after')).toBeTruthy();
    });
});
