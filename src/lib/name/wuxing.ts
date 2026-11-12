// 五行小工具：數理轉五行、兩個五行之間的生剋關係。
import type { Wuxing } from './types';

/** 相生順序：木生火、火生土、土生金、金生水、水生木。 */
export const WUXING_ORDER: readonly Wuxing[] = ['木', '火', '土', '金', '水'];

const BY_LAST_DIGIT: readonly Wuxing[] = ['水', '木', '木', '火', '火', '土', '土', '金', '金', '水'];

/** 由個位數換算五行：1,2 木；3,4 火；5,6 土；7,8 金；9,0 水。 */
export function wuxingOfNumber(n: number): Wuxing {
  return BY_LAST_DIGIT[((Math.trunc(n) % 10) + 10) % 10];
}

/** a 生的五行（木 → 火）。 */
export function generates(a: Wuxing): Wuxing {
  return WUXING_ORDER[(WUXING_ORDER.indexOf(a) + 1) % 5];
}

/** a 剋的五行（木 → 土）。 */
export function overcomes(a: Wuxing): Wuxing {
  return WUXING_ORDER[(WUXING_ORDER.indexOf(a) + 2) % 5];
}

export type WuxingRelationKind = '相生' | '相剋' | '比和';

export interface WuxingRelation {
  kind: WuxingRelationKind;
  /**
   * 方向：'forward' = a 生／剋 b；'reverse' = b 生／剋 a；比和時為 null。
   */
  direction: 'forward' | 'reverse' | null;
  /** 主動的一方（生人者／剋人者）；比和時為 a。 */
  from: Wuxing;
  /** 被動的一方（被生者／被剋者）；比和時為 b。 */
  to: Wuxing;
  /** 例如「木生火」「金剋木」「土土比和」。 */
  label: string;
}

/** 兩個五行的關係。任兩個五行必為相生、相剋或比和其中之一。 */
export function wuxingRelation(a: Wuxing, b: Wuxing): WuxingRelation {
  if (a === b) return { kind: '比和', direction: null, from: a, to: b, label: `${a}${b}比和` };
  if (generates(a) === b) return { kind: '相生', direction: 'forward', from: a, to: b, label: `${a}生${b}` };
  if (generates(b) === a) return { kind: '相生', direction: 'reverse', from: b, to: a, label: `${b}生${a}` };
  if (overcomes(a) === b) return { kind: '相剋', direction: 'forward', from: a, to: b, label: `${a}剋${b}` };
  return { kind: '相剋', direction: 'reverse', from: b, to: a, label: `${b}剋${a}` };
}
