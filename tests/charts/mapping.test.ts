import { describe, expect, it } from 'vitest';
import {
  chartDbErrorMessage,
  fromChartRow,
  normalizeChartMeta,
  parseSavedRef,
  sanitizeBirthInput,
  toChartInsert,
  toChartUpdate,
  type ComputedChart,
} from '@/lib/charts/mapping';
import type { BirthInput } from '@/lib/hd/types';
import type { ChartRow } from '@/lib/supabase/database.types';

const INPUT: BirthInput = {
  date: '1990-05-12',
  time: '14:30',
  timezone: 'Asia/Taipei',
  place: { name: '臺北市', lat: 25.04776, lon: 121.53185, countryCode: 'TW' },
  options: { nodeMode: 'true', sensitivityMinutes: [-30, -15, 15, 30] },
};

const COMPUTED: ComputedChart = {
  input: INPUT,
  result: {
    type: 'generator',
    authority: 'sacral',
    profile: { personality: 4, design: 6 },
  },
  timeUnknown: false,
  placeLabel: '臺北市, 臺灣',
};

function row(over: Partial<ChartRow> = {}): ChartRow {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    user_id: '00000000-0000-4000-8000-0000000000aa',
    kind: 'self',
    name: '我',
    note: null,
    input: JSON.parse(JSON.stringify(INPUT)),
    birth_date: '1990-05-12',
    birth_time: '14:30:00',
    time_unknown: false,
    timezone: 'Asia/Taipei',
    place_label: '臺北市, 臺灣',
    hd_type: 'generator',
    profile: '4/6',
    authority: 'sacral',
    created_at: '2026-11-02T00:00:00+00:00',
    updated_at: '2026-11-02T00:00:00+00:00',
    ...over,
  };
}

describe('sanitizeBirthInput', () => {
  it('keeps a valid input unchanged', () => {
    expect(sanitizeBirthInput(INPUT)).toEqual(INPUT);
  });

  it('accepts an input without place / options', () => {
    expect(
      sanitizeBirthInput({
        date: '2000-01-01',
        time: '00:00',
        timezone: 'UTC',
      }),
    ).toEqual({
      date: '2000-01-01',
      time: '00:00',
      timezone: 'UTC',
    });
  });

  it('keeps gender for 紫微斗數', () => {
    expect(sanitizeBirthInput({ ...INPUT, gender: 'female' })?.gender).toBe(
      'female',
    );
  });

  it('drops unknown keys and keeps disambiguation', () => {
    const out = sanitizeBirthInput({
      ...INPUT,
      evil: 1,
      place: { ...INPUT.place, extra: 'x' },
      options: { nodeMode: 'mean', disambiguation: 'later', foo: 'bar' },
    });
    expect(out).toEqual({
      ...INPUT,
      options: { nodeMode: 'mean', disambiguation: 'later' },
    });
  });

  it.each([
    null,
    'x',
    [],
    { time: '14:30', timezone: 'UTC' },
    { date: '1990-5-12', time: '14:30', timezone: 'UTC' },
    { date: '1990-05-12', time: '24:00', timezone: 'UTC' },
    { date: '1990-05-12', time: '14:30', timezone: '' },
    {
      date: '1990-05-12',
      time: '14:30',
      timezone: 'UTC',
      place: { name: 'x', lat: '1', lon: 2, countryCode: 'TW' },
    },
    { date: '1990-05-12', time: '14:30', timezone: 'UTC', options: 'x' },
  ])('rejects malformed input %#', bad => {
    expect(sanitizeBirthInput(bad)).toBeNull();
  });
});

describe('normalizeChartMeta', () => {
  it('trims name and note', () => {
    expect(
      normalizeChartMeta({ kind: 'friend', name: '  小明 ', note: '  同事 ' }),
    ).toEqual({
      ok: true,
      value: { kind: 'friend', name: '小明', note: '同事' },
    });
  });

  it('requires a name', () => {
    const r = normalizeChartMeta({ kind: 'self', name: '   ', note: '' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.name).toBeTruthy();
  });

  it('limits name to 60 and note to 500 characters (counting code points)', () => {
    expect(
      normalizeChartMeta({ kind: 'self', name: '字'.repeat(60), note: '' }).ok,
    ).toBe(true);
    expect(
      normalizeChartMeta({ kind: 'self', name: '字'.repeat(61), note: '' }).ok,
    ).toBe(false);
    expect(
      normalizeChartMeta({ kind: 'self', name: '😀'.repeat(60), note: '' }).ok,
    ).toBe(true);
    const r = normalizeChartMeta({
      kind: 'self',
      name: 'a',
      note: 'x'.repeat(501),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.note).toBeTruthy();
  });
});

describe('toChartInsert', () => {
  it('maps a computed chart to the insert payload', () => {
    expect(
      toChartInsert(COMPUTED, { kind: 'self', name: '我', note: '' }),
    ).toEqual({
      kind: 'self',
      name: '我',
      note: null,
      input: INPUT,
      birth_date: '1990-05-12',
      birth_time: '14:30',
      time_unknown: false,
      timezone: 'Asia/Taipei',
      place_label: '臺北市, 臺灣',
      hd_type: 'generator',
      profile: '4/6',
      authority: 'sacral',
    });
  });

  it('stores a null birth_time when the time is unknown, and no user_id (DB default)', () => {
    const ins = toChartInsert(
      { ...COMPUTED, timeUnknown: true, placeLabel: null },
      { kind: 'friend', name: 'A', note: 'n' },
    );
    expect(ins.birth_time).toBeNull();
    expect(ins.time_unknown).toBe(true);
    expect(ins.place_label).toBeNull();
    expect(ins.note).toBe('n');
    expect('user_id' in ins).toBe(false);
  });

  it('throws on an unusable input', () => {
    expect(() =>
      toChartInsert(
        { ...COMPUTED, input: { ...INPUT, date: 'bad' } },
        { kind: 'self', name: 'a', note: '' },
      ),
    ).toThrow();
  });
});

describe('toChartUpdate', () => {
  it('maps form values and empties the note to null', () => {
    expect(toChartUpdate({ kind: 'friend', name: 'B', note: '' })).toEqual({
      kind: 'friend',
      name: 'B',
      note: null,
    });
  });
});

describe('fromChartRow', () => {
  it('maps a row to SavedChart', () => {
    expect(fromChartRow(row({ note: '備註' }))).toEqual({
      id: '00000000-0000-4000-8000-000000000001',
      kind: 'self',
      name: '我',
      note: '備註',
      input: INPUT,
      timeUnknown: false,
      placeLabel: '臺北市, 臺灣',
      summary: { type: 'generator', profile: '4/6', authority: 'sacral' },
      createdAt: '2026-11-02T00:00:00+00:00',
      updatedAt: '2026-11-02T00:00:00+00:00',
    });
  });

  it('round-trips insert → row → SavedChart input exactly (so reopening recomputes the same chart)', () => {
    const ins = toChartInsert(COMPUTED, { kind: 'self', name: '我', note: '' });
    const saved = fromChartRow(row({ input: ins.input }));
    expect(saved?.input).toEqual(COMPUTED.input);
  });

  it('nulls unknown summary values instead of failing', () => {
    const s = fromChartRow(
      row({ hd_type: 'wizard', profile: '7/9', authority: null }),
    );
    expect(s?.summary).toEqual({ type: null, profile: null, authority: null });
  });

  it('returns null for an unusable stored input or kind', () => {
    expect(fromChartRow(row({ input: { foo: 1 } }))).toBeNull();
    expect(fromChartRow(row({ kind: 'other' as 'self' }))).toBeNull();
  });
});

describe('parseSavedRef', () => {
  it('accepts a valid ref and rejects others', () => {
    expect(
      parseSavedRef({ id: 'x', name: 'n', kind: 'friend', extra: 1 }),
    ).toEqual({ id: 'x', name: 'n', kind: 'friend' });
    expect(parseSavedRef({ id: 'x', name: 'n', kind: 'enemy' })).toBeNull();
    expect(parseSavedRef(undefined)).toBeNull();
  });
});

describe('chartDbErrorMessage', () => {
  it('explains a missing table', () => {
    expect(
      chartDbErrorMessage({
        code: 'PGRST205',
        message: "Could not find the table 'public.charts'",
      }),
    ).toContain('SQL');
    expect(chartDbErrorMessage({ code: '42P01' })).toContain('SQL');
  });
  it('maps auth, RLS, constraint and network errors', () => {
    expect(
      chartDbErrorMessage({ code: 'PGRST301', message: 'JWT expired' }),
    ).toContain('登入');
    expect(chartDbErrorMessage({ code: '42501' })).toContain('權限');
    expect(chartDbErrorMessage({ code: '23514' })).toContain('長度');
    expect(
      chartDbErrorMessage({ message: 'TypeError: Failed to fetch' }),
    ).toContain('網路');
    expect(chartDbErrorMessage(null)).toBeTruthy();
  });
});
