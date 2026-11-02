// Spec §3.2 — public types of the calculation layer. Keep in sync with the spec verbatim.

export type Planet =
  | 'sun' | 'earth' | 'moon' | 'northNode' | 'southNode'
  | 'mercury' | 'venus' | 'mars' | 'jupiter' | 'saturn'
  | 'uranus' | 'neptune' | 'pluto';

export type Side = 'personality' | 'design';

export type CenterId =
  | 'head' | 'ajna' | 'throat' | 'g' | 'heart'
  | 'sacral' | 'solarPlexus' | 'spleen' | 'root';

export type NodeMode = 'true' | 'mean';

/** Used by 紫微斗數; Human Design ignores it. Stored with the birth input so a saved chart can be recomputed. */
export type Gender = 'male' | 'female';

export interface BirthInput {
  date: string;        // 'YYYY-MM-DD'（當地日期）
  time: string;        // 'HH:mm'（當地時間，24 小時制）
  timezone: string;    // IANA，例如 'Asia/Taipei'
  place?: { name: string; lat: number; lon: number; countryCode: string };
  gender?: Gender;     // 紫微斗數需要；人類圖不使用
  options?: {
    nodeMode?: NodeMode;              // 預設 'true'
    sensitivityMinutes?: number[];    // 預設 [-30, -15, 15, 30]
    disambiguation?: 'earlier' | 'later'; // 夏令時間重複時段用
  };
}

export interface Activation {
  planet: Planet;
  side: Side;
  longitude: number;   // 0 <= x < 360，回歸黃道
  gate: number;        // 1..64
  line: number;        // 1..6
  color: number;       // 1..6
  tone: number;        // 1..6
  base: number;        // 1..5
  speed: number;       // 度／日，負值為逆行
  minutesToLineBoundary: number; // 見第 8.2 節
}

export interface Channel {
  id: string;          // 例如 '1-8'，小號在前
  gates: [number, number];
  centers: [CenterId, CenterId];
}

export type HDType =
  | 'manifestor' | 'generator' | 'manifestingGenerator'
  | 'projector' | 'reflector';

export type Authority =
  | 'emotional' | 'sacral' | 'splenic' | 'egoManifested'
  | 'egoProjected' | 'selfProjected' | 'mental' | 'lunar';

export type Definition =
  | 'none' | 'single' | 'split' | 'tripleSplit' | 'quadrupleSplit';

export type CrossAngle = 'rightAngle' | 'juxtaposition' | 'leftAngle';

export interface ChartResult {
  input: BirthInput;
  utc: { personality: string; design: string }; // ISO 8601
  jd:  { personality: number; design: number };
  activations: Activation[];             // 長度固定 26
  activeGates: Record<number, Side[]>;   // gate -> 啟動它的側（可能兩側）
  channels: Channel[];                   // 已成立的通道
  definedCenters: CenterId[];
  type: HDType;
  strategy: string;                      // 由 type 對應
  authority: Authority;
  profile: { personality: number; design: number }; // 例如 {4, 6}
  definition: Definition;
  cross: {
    angle: CrossAngle;
    gates: [number, number, number, number]; // 個性太陽、個性地球、設計太陽、設計地球
    name: string | null;                     // 名稱表未建置前為 null
  };
  sensitivity?: SensitivityReport;
  meta: { nodeMode: NodeMode; ephemeris: string; version: string };
}

export interface SensitivityReport {
  offsets: number[];               // 分鐘
  stable: boolean;                 // 所有偏移下 type/authority/profile/definition 皆相同
  changes: Array<{
    offsetMinutes: number;
    field: string;                 // 例如 'activations.personality.moon.line'
    from: string | number;
    to: string | number;
  }>;
}
