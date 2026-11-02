export type HDErrorCode =
  | 'INVALID_INPUT'
  | 'DATE_OUT_OF_RANGE'
  | 'NONEXISTENT_LOCAL_TIME'
  | 'AMBIGUOUS_LOCAL_TIME'
  | 'EPHEMERIS_ERROR'
  | 'DESIGN_TIME_ERROR';

/** Default end-user messages (Traditional Chinese, spec §9.1 / §11.1). */
export const HD_ERROR_MESSAGES: Record<HDErrorCode, string> = {
  INVALID_INPUT: '輸入的出生資料格式不正確，請檢查後再試。',
  DATE_OUT_OF_RANGE: '出生日期超出支援範圍（1800-01-01 至 2150-12-31）。',
  NONEXISTENT_LOCAL_TIME: '這個時間因夏令時間調整而不存在，請確認出生證明上的時間。',
  AMBIGUOUS_LOCAL_TIME: '這個時間在當地出現兩次（夏令時間結束），請選擇。',
  EPHEMERIS_ERROR: '星曆計算失敗，請稍後再試。',
  DESIGN_TIME_ERROR: '設計時刻計算無法收斂，請稍後再試。',
};

export type HDErrorDetails = Record<string, unknown>;

/**
 * The single error type thrown by the calculation layer.
 * The spec's `EphemerisError` / `DesignTimeError` (§5.2, §5.4) are HDError with code
 * EPHEMERIS_ERROR / DESIGN_TIME_ERROR.
 */
export class HDError extends Error {
  readonly code: HDErrorCode;
  readonly details?: HDErrorDetails;

  constructor(code: HDErrorCode, options?: { message?: string; details?: HDErrorDetails; cause?: unknown }) {
    super(options?.message ?? HD_ERROR_MESSAGES[code], options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = 'HDError';
    this.code = code;
    if (options?.details !== undefined) this.details = options.details;
  }
}

export function isHDError(value: unknown): value is HDError {
  return value instanceof HDError;
}
