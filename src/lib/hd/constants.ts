import type {
  Authority,
  CenterId,
  CrossAngle,
  Definition,
  HDType,
  Planet,
  Side,
} from './types';

// ---------------------------------------------------------------------------
// Appendix A/B/C — fixed system data. Pasted verbatim from the spec; DO NOT reorder or "optimize".
// ---------------------------------------------------------------------------

// A. 閘門順序（從黃經 302° 起，每 5.625° 一個）
export const GATE_ORDER: readonly number[] = [
  41, 19, 13, 49, 30, 55, 37, 63, 22, 36, 25, 17, 21, 51, 42,  3,
  27, 24,  2, 23,  8, 20, 16, 35, 45, 12, 15, 52, 39, 53, 62, 56,
  31, 33,  7,  4, 29, 59, 40, 64, 47,  6, 46, 18, 48, 57, 32, 50,
  28, 44,  1, 43, 14, 34,  9,  5, 26, 11, 10, 58, 38, 54, 61, 60,
] as const;

// B. 各中心包含的閘門
export const CENTER_GATES: Record<CenterId, readonly number[]> = {
  head:        [64, 61, 63],
  ajna:        [47, 24, 4, 17, 43, 11],
  throat:      [62, 23, 56, 35, 12, 45, 33, 8, 31, 20, 16],
  g:           [7, 1, 13, 25, 46, 2, 15, 10],
  heart:       [21, 40, 26, 51],
  sacral:      [5, 14, 29, 59, 9, 3, 42, 27, 34],
  solarPlexus: [6, 37, 22, 36, 30, 55, 49],
  spleen:      [48, 57, 44, 50, 32, 28, 18],
  root:        [53, 60, 52, 19, 39, 41, 58, 38, 54],
};

// C. 36 條通道
export const CHANNELS: readonly [number, number][] = [
  [1, 8],   [2, 14],  [3, 60],  [4, 63],  [5, 15],  [6, 59],
  [7, 31],  [9, 52],  [10, 20], [10, 34], [10, 57], [11, 56],
  [12, 22], [13, 33], [16, 48], [17, 62], [18, 58], [19, 49],
  [20, 34], [20, 57], [21, 45], [23, 43], [24, 61], [25, 51],
  [26, 44], [27, 50], [28, 38], [29, 46], [30, 41], [32, 54],
  [34, 57], [35, 36], [37, 40], [39, 55], [42, 53], [47, 64],
] as const;
// 每條通道兩端的中心由 CENTER_GATES 反查，不另外硬寫

// ---------------------------------------------------------------------------
// Derived lookups and labels
// ---------------------------------------------------------------------------

/** Canonical center order (same order as the CenterId union / appendix D). */
export const CENTER_ORDER: readonly CenterId[] = [
  'head', 'ajna', 'throat', 'g', 'heart', 'sacral', 'solarPlexus', 'spleen', 'root',
];

/** D. 中文顯示名稱 */
export const CENTER_NAMES_ZH: Record<CenterId, string> = {
  head: '頭頂中心',
  ajna: '邏輯中心',
  throat: '喉嚨中心',
  g: 'G 中心',
  heart: '意志力中心',
  sacral: '薦骨中心',
  solarPlexus: '情緒中心',
  spleen: '直覺中心（脾）',
  root: '根部中心',
};

/** §7.1 動力中心 */
export const MOTORS: readonly CenterId[] = ['sacral', 'solarPlexus', 'heart', 'root'];

/** §5.3 fixed planet order for each side (also the table display order). */
export const PLANET_ORDER: readonly Planet[] = [
  'sun', 'earth', 'northNode', 'southNode', 'moon', 'mercury', 'venus',
  'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto',
];

/** §11.2 星體符號 */
export const PLANET_SYMBOLS: Record<Planet, string> = {
  sun: '☉',
  earth: '⊕',
  northNode: '☊',
  southNode: '☋',
  moon: '☽',
  mercury: '☿',
  venus: '♀',
  mars: '♂',
  jupiter: '♃',
  saturn: '♄',
  uranus: '♅',
  neptune: '♆',
  pluto: '♇',
};

/** §11.2 星體中文名 */
export const PLANET_NAMES_ZH: Record<Planet, string> = {
  sun: '太陽',
  earth: '地球',
  northNode: '北交點',
  southNode: '南交點',
  moon: '月亮',
  mercury: '水星',
  venus: '金星',
  mars: '火星',
  jupiter: '木星',
  saturn: '土星',
  uranus: '天王星',
  neptune: '海王星',
  pluto: '冥王星',
};

export const SIDE_NAMES_ZH: Record<Side, string> = {
  personality: '個性',
  design: '設計',
};

/** §7.2 類型中文 */
export const TYPE_NAMES_ZH: Record<HDType, string> = {
  reflector: '反映者',
  manifestingGenerator: '顯示生產者',
  generator: '生產者',
  manifestor: '顯示者',
  projector: '投射者',
};

/** §7.2 策略 */
export const STRATEGY_ZH: Record<HDType, string> = {
  reflector: '等待一個月亮週期（約 28 天）',
  manifestingGenerator: '等待回應，行動前告知',
  generator: '等待回應',
  manifestor: '行動前告知',
  projector: '等待邀請',
};

/** §7.3 權威中文 */
export const AUTHORITY_NAMES_ZH: Record<Authority, string> = {
  emotional: '情緒權威',
  sacral: '薦骨權威',
  splenic: '直覺權威',
  egoManifested: '意志力權威（顯示）',
  egoProjected: '意志力權威（投射）',
  selfProjected: '自我投射權威',
  mental: '心智權威（環境）',
  lunar: '月亮權威',
};

/** §7.5 定義型態中文 */
export const DEFINITION_NAMES_ZH: Record<Definition, string> = {
  none: '無定義',
  single: '一分人',
  split: '二分人',
  tripleSplit: '三分人',
  quadrupleSplit: '四分人',
};

/** §7.6 角度中文 */
export const CROSS_ANGLE_NAMES_ZH: Record<CrossAngle, string> = {
  rightAngle: '右角度',
  juxtaposition: '並列',
  leftAngle: '左角度',
};

/** §7.4 合法的 12 種人生角色（個性/設計）。 */
export const VALID_PROFILES: readonly string[] = [
  '1/3', '1/4', '2/4', '2/5', '3/5', '3/6', '4/6', '4/1', '5/1', '5/2', '6/2', '6/3',
];

/** §7.6 人生角色 → 輪迴交叉角度 */
export const PROFILE_ANGLE: Record<string, CrossAngle> = {
  '1/3': 'rightAngle',
  '1/4': 'rightAngle',
  '2/4': 'rightAngle',
  '2/5': 'rightAngle',
  '3/5': 'rightAngle',
  '3/6': 'rightAngle',
  '4/6': 'rightAngle',
  '4/1': 'juxtaposition',
  '5/1': 'leftAngle',
  '5/2': 'leftAngle',
  '6/2': 'leftAngle',
  '6/3': 'leftAngle',
};

/** gate -> center, derived from CENTER_GATES (never hand-written). */
export const GATE_CENTER: Readonly<Record<number, CenterId>> = (() => {
  const map: Record<number, CenterId> = {};
  for (const center of CENTER_ORDER) {
    for (const gate of CENTER_GATES[center]) map[gate] = center;
  }
  return map;
})();

/** §2.2 / §4.4 supported local date range (inclusive). */
export const MIN_DATE = '1800-01-01';
export const MAX_DATE = '2150-12-31';

/** §8.1 default sensitivity offsets in minutes. */
export const DEFAULT_SENSITIVITY_MINUTES: readonly number[] = [-30, -15, 15, 30];

/** Calculation-layer version reported in ChartResult.meta.version. */
export const HD_LIB_VERSION = '1.0.0';
