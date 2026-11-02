import { describe, expect, it } from 'vitest';
import { parseBirthInput } from '@/lib/api/chartSchema';

describe('parseBirthInput gender', () => {
  it('keeps male / female', () => {
    const a = parseBirthInput({
      date: '1990-05-12',
      time: '14:30',
      timezone: 'Asia/Taipei',
      gender: 'male',
    });
    expect(a.ok).toBe(true);
    if (a.ok) expect(a.data.gender).toBe('male');
    const b = parseBirthInput({
      date: '1990-05-12',
      time: '14:30',
      timezone: 'Asia/Taipei',
      gender: 'female',
    });
    expect(b.ok).toBe(true);
    if (b.ok) expect(b.data.gender).toBe('female');
  });

  it('allows omitting gender (Human Design only)', () => {
    const r = parseBirthInput({
      date: '1990-05-12',
      time: '14:30',
      timezone: 'Asia/Taipei',
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.gender).toBeUndefined();
  });
});
