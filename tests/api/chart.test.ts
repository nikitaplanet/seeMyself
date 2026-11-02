import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '@/app/api/chart/route';
import { setChartProvider } from '@/lib/api/chartProvider';
import { createRateLimiter, setChartRateLimiter } from '@/lib/api/rateLimit';
import type { EphemerisProvider } from '@/lib/hd/ephemeris/provider';
import { HDError } from '@/lib/hd/errors';
import type { ChartResult } from '@/lib/hd/types';

interface ErrorBody {
  error: { code: string; message: string; details?: Record<string, unknown> };
}

let ipCounter = 0;
/** Each call uses a fresh IP unless one is given, so the rate limiter never interferes. */
function req(body: unknown, opts: { raw?: string; ip?: string } = {}): Request {
  return new Request('http://localhost/api/chart', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': opts.ip ?? `10.0.0.${++ipCounter}, 172.16.0.1` },
    body: opts.raw ?? JSON.stringify(body),
  });
}

async function call(body: unknown, opts?: { raw?: string; ip?: string }) {
  const res = await POST(req(body, opts));
  return { res, json: (await res.json()) as unknown };
}

async function expectError(body: unknown, status: number, code: string, opts?: { raw?: string; ip?: string }) {
  const { res, json } = await call(body, opts);
  expect(res.status).toBe(status);
  expect(res.headers.get('cache-control')).toBe('no-store');
  const err = (json as ErrorBody).error;
  expect(err.code).toBe(code);
  expect(typeof err.message).toBe('string');
  expect(err.message).toMatch(/[一-鿿]/); // Traditional-Chinese user-facing message
  return err;
}

const TAIPEI = { date: '1990-05-12', time: '14:30', timezone: 'Asia/Taipei' };

beforeEach(() => {
  setChartRateLimiter();
  setChartProvider();
});
afterEach(() => {
  setChartRateLimiter();
  setChartProvider();
  vi.restoreAllMocks();
});

describe('POST /api/chart — success', () => {
  it('200 with a full ChartResult, sensitivity on by default', async () => {
    const { res, json } = await call({
      ...TAIPEI,
      place: { name: '臺北市', lat: 25.0478, lon: 121.5319, countryCode: 'TW' },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const chart = json as ChartResult;
    expect(chart.activations).toHaveLength(26);
    expect(chart.utc.personality).toBe('1990-05-12T06:30:00Z');
    expect(chart.sensitivity?.offsets).toEqual([-30, -15, 15, 30]);
    expect(chart.meta.nodeMode).toBe('true');
    expect(chart.input.place?.name).toBe('臺北市');
  });

  it('honours options (mean node, custom offsets, empty offsets → no sensitivity)', async () => {
    const a = (await call({ ...TAIPEI, options: { nodeMode: 'mean', sensitivityMinutes: [-720, 720] } }))
      .json as ChartResult;
    expect(a.meta.nodeMode).toBe('mean');
    expect(a.sensitivity?.offsets).toEqual([-720, 720]);
    const b = (await call({ ...TAIPEI, options: { sensitivityMinutes: [] } })).json as ChartResult;
    expect(b.sensitivity).toBeUndefined();
  });
});

describe('POST /api/chart — INVALID_INPUT (400)', () => {
  const cases: Array<[string, unknown, string]> = [
    ['nonexistent calendar date', { ...TAIPEI, date: '2021-02-30' }, 'date'],
    ['bad date format', { ...TAIPEI, date: '1990/05/12' }, 'date'],
    ['bad time', { ...TAIPEI, time: '24:00' }, 'time'],
    ['time without zero padding', { ...TAIPEI, time: '9:05' }, 'time'],
    ['bad timezone', { ...TAIPEI, timezone: 'Mars/Olympus_Mons' }, 'timezone'],
    ['missing timezone', { date: TAIPEI.date, time: TAIPEI.time }, 'timezone'],
    ['too many offsets', { ...TAIPEI, options: { sensitivityMinutes: [1, 2, 3, 4, 5, 6, 7, 8, 9] } }, 'options.sensitivityMinutes'],
    ['offset out of range', { ...TAIPEI, options: { sensitivityMinutes: [721] } }, 'options.sensitivityMinutes.0'],
    ['non-integer offset', { ...TAIPEI, options: { sensitivityMinutes: [1.5] } }, 'options.sensitivityMinutes.0'],
    ['bad nodeMode', { ...TAIPEI, options: { nodeMode: 'osculating' } }, 'options.nodeMode'],
    ['bad disambiguation', { ...TAIPEI, options: { disambiguation: 'first' } }, 'options.disambiguation'],
    ['bad place lat', { ...TAIPEI, place: { name: 'X', lat: 91, lon: 0, countryCode: 'TW' } }, 'place.lat'],
    ['body is an array', [TAIPEI], '(root)'],
  ];
  it.each(cases)('%s', async (_name, body, path) => {
    const err = await expectError(body, 400, 'INVALID_INPUT');
    const fieldErrors = err.details?.fieldErrors as Array<{ path: string; message: string }>;
    expect(fieldErrors.map((f) => f.path)).toContain(path);
  });

  it('malformed JSON', async () => {
    const err = await expectError(undefined, 400, 'INVALID_INPUT', { raw: '{"date": "1990-05-12",' });
    expect(err.details?.fieldErrors).toBeDefined();
  });

  it('out-of-range date plus another bad field is INVALID_INPUT, not DATE_OUT_OF_RANGE', async () => {
    await expectError({ ...TAIPEI, date: '1799-12-31', time: '99:99' }, 400, 'INVALID_INPUT');
  });
});

describe('POST /api/chart — DATE_OUT_OF_RANGE (400)', () => {
  it.each(['1799-12-31', '2151-01-01'])('%s', async (date) => {
    const err = await expectError({ ...TAIPEI, date }, 400, 'DATE_OUT_OF_RANGE');
    expect(err.details).toMatchObject({ min: '1800-01-01', max: '2150-12-31' });
  });

  it('accepts the bounds themselves', async () => {
    expect((await call({ ...TAIPEI, date: '1800-01-01' })).res.status).toBe(200);
    expect((await call({ ...TAIPEI, date: '2150-12-31' })).res.status).toBe(200);
  });
});

describe('POST /api/chart — DST', () => {
  const NY_AMBIG = { date: '2021-11-07', time: '01:30', timezone: 'America/New_York' };

  it('NONEXISTENT_LOCAL_TIME (422) in the spring-forward gap', async () => {
    await expectError({ date: '2021-03-14', time: '02:30', timezone: 'America/New_York' }, 422, 'NONEXISTENT_LOCAL_TIME');
  });

  it('AMBIGUOUS_LOCAL_TIME (422) with both candidates', async () => {
    const err = await expectError(NY_AMBIG, 422, 'AMBIGUOUS_LOCAL_TIME');
    expect(err.details?.candidates).toEqual(['2021-11-07T05:30:00Z', '2021-11-07T06:30:00Z']);
  });

  it.each([
    ['earlier', '2021-11-07T05:30:00Z'],
    ['later', '2021-11-07T06:30:00Z'],
  ] as const)('disambiguation=%s resolves to %s', async (disambiguation, utc) => {
    const { res, json } = await call({ ...NY_AMBIG, options: { disambiguation } });
    expect(res.status).toBe(200);
    expect((json as ChartResult).utc.personality).toBe(utc);
  });
});

describe('POST /api/chart — RATE_LIMITED (429)', () => {
  it('allows 30 requests per minute per IP and rejects the 31st', async () => {
    let t = 1_000_000;
    setChartRateLimiter(createRateLimiter({ now: () => t }));
    // Invalid bodies keep this fast; the limiter runs before validation.
    for (let i = 0; i < 30; i++) {
      const { res } = await call({}, { ip: '203.0.113.7' });
      expect(res.status).toBe(400);
    }
    const { res, json } = await call(TAIPEI, { ip: '203.0.113.7, 10.0.0.1' });
    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toBe('60');
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect((json as ErrorBody).error.code).toBe('RATE_LIMITED');
    expect((json as ErrorBody).error.message).toMatch(/[一-鿿]/);

    // A different IP is unaffected.
    expect((await call({}, { ip: '203.0.113.8' })).res.status).toBe(400);
    // After the window slides past, the first IP may call again.
    t += 60_001;
    expect((await call({}, { ip: '203.0.113.7' })).res.status).toBe(400);
  });

  it('falls back to x-real-ip, then "unknown"', async () => {
    setChartRateLimiter(createRateLimiter({ limit: 1 }));
    const mk = (headers: Record<string, string>) =>
      POST(new Request('http://localhost/api/chart', { method: 'POST', headers, body: '{}' }));
    expect((await mk({ 'x-real-ip': '198.51.100.1' })).status).toBe(400);
    expect((await mk({ 'x-real-ip': '198.51.100.1' })).status).toBe(429);
    expect((await mk({})).status).toBe(400);
    expect((await mk({})).status).toBe(429);
  });
});

describe('POST /api/chart — 500s via injected provider', () => {
  it('EPHEMERIS_ERROR', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const failing: EphemerisProvider = {
      name: 'failing',
      position: (jdUT, body) => {
        throw new HDError('EPHEMERIS_ERROR', { details: { body, jdUT } });
      },
    };
    setChartProvider(failing);
    const err = await expectError(TAIPEI, 500, 'EPHEMERIS_ERROR');
    expect(err.details).toBeUndefined(); // internal diagnostics withheld
    // §13.3: only the code is logged, never birth data.
    expect(spy).toHaveBeenCalledWith('[api/chart] EPHEMERIS_ERROR');
    expect(JSON.stringify(spy.mock.calls)).not.toContain('1990');
  });

  it('DESIGN_TIME_ERROR (sun never moves → no design time)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    setChartProvider({ name: 'frozen', position: () => ({ longitude: 100, speed: 0 }) });
    await expectError(TAIPEI, 500, 'DESIGN_TIME_ERROR');
  });

  it('INTERNAL_ERROR for non-HDError failures', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    setChartProvider({
      name: 'buggy',
      position: () => {
        throw new TypeError('boom');
      },
    });
    await expectError(TAIPEI, 500, 'INTERNAL_ERROR');
  });
});

describe('POST /api/chart — performance (§12.3)', () => {
  it('p95 of 50 sequential calls with default sensitivity < 300ms', async () => {
    setChartRateLimiter(createRateLimiter({ limit: 1000 }));
    await call(TAIPEI, { ip: 'perf' }); // warm-up
    const times: number[] = [];
    for (let i = 0; i < 50; i++) {
      const t0 = performance.now();
      const { res } = await call({ ...TAIPEI, time: `14:${String(i).padStart(2, '0')}` }, { ip: 'perf' });
      times.push(performance.now() - t0);
      expect(res.status).toBe(200);
    }
    times.sort((a, b) => a - b);
    const p95 = times[Math.ceil(0.95 * times.length) - 1];
    console.info(`[perf] POST /api/chart p95=${p95.toFixed(2)}ms median=${times[25].toFixed(2)}ms max=${times[49].toFixed(2)}ms`);
    expect(p95).toBeLessThan(300);
  });
});
