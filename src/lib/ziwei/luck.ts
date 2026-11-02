import type { ZiweiPalace, ZiweiStar } from './types';

const BRIGHTNESS_POINTS: Record<string, number> = {
  廟: 10,
  旺: 8,
  得: 6,
  利: 5,
  平: 4,
  不: 0,
  陷: 0,
};

const MUTAGEN_POINTS: Record<string, number> = {
  祿: 2,
  權: 1,
  科: 1,
  忌: -2,
};

export type StarVerdict = '吉' | '次吉' | '平' | '凶';

export interface MajorStarRow {
  name: string;
  palaceName: string;
  brightness: string;
  mutagen?: string;
  verdict: StarVerdict;
}

export function verdictOf(brightness: string): StarVerdict {
  if (brightness === '廟' || brightness === '旺') return '吉';
  if (brightness === '得' || brightness === '利') return '次吉';
  if (brightness === '平') return '平';
  return '凶';
}

function mutagenBonus(stars: ZiweiStar[]): number {
  let n = 0;
  for (const s of stars) {
    if (s.mutagen && MUTAGEN_POINTS[s.mutagen] !== undefined) n += MUTAGEN_POINTS[s.mutagen];
  }
  return n;
}

/** 主星亮度平均（廟 10…陷 0）×10，再加減生年四化。與截圖 1993 陰女盤對得上 72。 */
export function luckIndex(palaces: ZiweiPalace[]): number {
  const majors = palaces.flatMap((p) => p.majorStars);
  if (majors.length === 0) return 0;
  const sum = majors.reduce((acc, s) => acc + (BRIGHTNESS_POINTS[s.brightness] ?? 4), 0);
  const all = palaces.flatMap((p) => [...p.majorStars, ...p.minorStars]);
  return Math.round((sum / majors.length) * 10 + mutagenBonus(all));
}

export function majorStarRows(palaces: ZiweiPalace[]): MajorStarRow[] {
  const rows: MajorStarRow[] = [];
  for (const p of palaces) {
    for (const s of p.majorStars) {
      rows.push({
        name: s.name,
        palaceName: p.name,
        brightness: s.brightness,
        ...(s.mutagen ? { mutagen: s.mutagen } : {}),
        verdict: verdictOf(s.brightness),
      });
    }
  }
  return rows;
}
