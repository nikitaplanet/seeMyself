import type { AspectType, AstroBodyKey, AstroHouseSystem } from './types';

export const SIGN_NAMES = [
    '牡羊',
    '金牛',
    '雙子',
    '巨蟹',
    '獅子',
    '處女',
    '天秤',
    '天蠍',
    '射手',
    '摩羯',
    '水瓶',
    '雙魚',
] as const;

/** 火 / 土 / 風 / 水, repeating from 牡羊. */
export const SIGN_ELEMENTS = ['火', '土', '風', '水'] as const;

export const BODY_NAMES: Record<AstroBodyKey, string> = {
    sun: '太陽',
    moon: '月亮',
    mercury: '水星',
    venus: '金星',
    mars: '火星',
    jupiter: '木星',
    saturn: '土星',
    uranus: '天王星',
    neptune: '海王星',
    pluto: '冥王星',
    northNode: '北交點',
    chiron: '凱龍',
};

export const BODY_SHORT: Record<AstroBodyKey, string> = {
    sun: '日',
    moon: '月',
    mercury: '水',
    venus: '金',
    mars: '火',
    jupiter: '木',
    saturn: '土',
    uranus: '天',
    neptune: '海',
    pluto: '冥',
    northNode: '交',
    chiron: '凱',
};

export const ASPECT_NAMES: Record<AspectType, string> = {
    conjunction: '合',
    sextile: '六分',
    square: '四分',
    trine: '三分',
    opposition: '對分',
};

export const ASPECT_ANGLES: Record<AspectType, number> = {
    conjunction: 0,
    sextile: 60,
    square: 90,
    trine: 120,
    opposition: 180,
};

/**
 * Aspect orbs in degrees. A pair uses the larger orb of its two bodies: Sun/Moon 8°, planets 6°,
 * points (North Node, Chiron) 3°. Lives here (not compute.ts) so client code can show it without
 * pulling in the native ephemeris.
 */
export const ASPECT_ORBS = { luminary: 8, planet: 6, point: 3 } as const;

export const HOUSE_SYSTEM_NAMES: Record<AstroHouseSystem, string> = {
    placidus: '普拉西度制（Placidus）',
    porphyry: '波菲利制（Porphyry）',
    wholeSign: '整宮制（Whole Sign）',
};

/** (22, 5) → 「22°05′」 */
export function formatDegMin(degree: number, minute: number): string {
    return `${degree}°${String(minute).padStart(2, '0')}′`;
}
