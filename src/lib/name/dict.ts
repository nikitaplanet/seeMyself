// 姓名學字典：讀取 scripts/build-kangxi-dict.ts 產生的 data/kangxi_dict.json。
// 每個字是一筆精簡字串「<康熙筆畫><五行><字根…>」，例如 "芬": "10木艸八刀"。
import raw from './data/kangxi_dict.json';
import type { Wuxing } from './types';

export interface DictEntry {
  char: string;
  /** 康熙字典筆畫（部首以原字計）。 */
  strokes: number;
  /** 字義五行。 */
  wuxing: Wuxing;
  /** 拆字後的字根（部首一律為原字，例如 艸、水、心、手、玉、肉、辵、阜、邑）。 */
  roots: string[];
}

const RAW = raw as Record<string, string>;
const RECORD = /^(\d+)([木火土金水])(.*)$/u;
const cache = new Map<string, DictEntry>();

/** 查一個字；字典沒收錄時回傳 undefined。 */
export function lookupChar(char: string): DictEntry | undefined {
  const hit = cache.get(char);
  if (hit) return hit;
  const record = Object.prototype.hasOwnProperty.call(RAW, char) ? RAW[char] : undefined;
  const m = record ? RECORD.exec(record) : null;
  if (!m) return undefined;
  const entry: DictEntry = { char, strokes: Number(m[1]), wuxing: m[2] as Wuxing, roots: [...m[3]] };
  cache.set(char, entry);
  return entry;
}

export function hasChar(char: string): boolean {
  return Object.prototype.hasOwnProperty.call(RAW, char);
}

/** 字典收錄的字數。 */
export function dictSize(): number {
  return Object.keys(RAW).length;
}
