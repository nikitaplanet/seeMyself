export type NameErrorCode = 'INVALID_SHAPE' | 'UNKNOWN_CHAR' | 'INVALID_BIRTH_DATE';

/** Default end-user messages (Traditional Chinese). */
export const NAME_ERROR_MESSAGES: Record<NameErrorCode, string> = {
  INVALID_SHAPE: '請分別輸入姓氏（一到兩個字）與名字（一到兩個字）。',
  UNKNOWN_CHAR: '名字裡有字典尚未收錄的字，暫時無法計算筆畫。',
  INVALID_BIRTH_DATE: '出生日期格式不正確，請檢查後再試。',
};

export type NameErrorDetails = Record<string, unknown>;

/** The single error type thrown by the 姓名學 calculation layer (same shape as `HDError`). */
export class NameError extends Error {
  readonly code: NameErrorCode;
  readonly details?: NameErrorDetails;

  constructor(code: NameErrorCode, options?: { message?: string; details?: NameErrorDetails }) {
    super(options?.message ?? NAME_ERROR_MESSAGES[code]);
    this.name = 'NameError';
    this.code = code;
    if (options?.details !== undefined) this.details = options.details;
  }
}

export function isNameError(value: unknown): value is NameError {
  return value instanceof NameError;
}
