// Supabase Auth error → Traditional Chinese message. Pure (no Supabase import) so it is unit-tested.

export interface AuthErrorLike {
  code?: string | null;
  message?: string | null;
  status?: number | null;
  name?: string | null;
}

export const PASSWORD_MIN_LENGTH = 8;

const GENERIC = '發生未預期的錯誤，請稍後再試。';
const NETWORK = '無法連線到驗證伺服器，請檢查網路後再試。';

const BY_CODE: Record<string, string> = {
  invalid_credentials: '電子郵件或密碼不正確。',
  email_not_confirmed: '這個電子郵件尚未完成驗證，請先點擊驗證信中的連結。',
  user_already_exists: '這個電子郵件已經註冊過，請直接登入。',
  email_exists: '這個電子郵件已經註冊過，請直接登入。',
  weak_password: `密碼強度不足，請使用至少 ${PASSWORD_MIN_LENGTH} 個字元並混合英文字母與數字。`,
  same_password: '新密碼不能與目前的密碼相同。',
  over_email_send_rate_limit: '寄信次數過多，請稍候幾分鐘再試。',
  over_request_rate_limit: '請求過於頻繁，請稍候再試。',
  email_address_invalid: '這個電子郵件地址無法使用，請確認是否輸入正確。',
  email_address_not_authorized: '目前無法寄信到這個電子郵件地址。',
  signup_disabled: '目前暫停開放註冊。',
  email_provider_disabled: '目前未開放以電子郵件登入。',
  provider_disabled: 'Google 登入尚未啟用，請先改用電子郵件登入。',
  manual_linking_disabled: '目前尚未開放綁定第三方帳號。',
  identity_already_exists: '這個 Google 帳號已經綁定過其他會員。',
  validation_failed: '輸入的資料格式不正確。',
  otp_expired: '連結已過期或已經使用過，請重新申請。',
  otp_disabled: '這種登入方式目前未開放。',
  flow_state_expired: '登入流程已逾時，請重新操作一次。',
  flow_state_not_found: '找不到登入流程，請在送出申請的同一個瀏覽器中開啟信件連結，或重新操作一次。',
  bad_code_verifier: '請在送出申請的同一個瀏覽器中開啟信件連結，或重新操作一次。',
  pkce_code_verifier_not_found: '請在送出申請的同一個瀏覽器中開啟信件連結，或重新操作一次。',
  bad_oauth_callback: '第三方登入回傳的資料不完整，請重新操作一次。',
  bad_oauth_state: '第三方登入狀態不符，請重新操作一次。',
  session_not_found: '登入狀態已失效，請重新登入。',
  session_expired: '登入狀態已過期，請重新登入。',
  refresh_token_not_found: '登入狀態已失效，請重新登入。',
  refresh_token_already_used: '登入狀態已失效，請重新登入。',
  user_not_found: '找不到這個帳號。',
  user_banned: '這個帳號已被停用。',
  reauthentication_needed: '為了安全，請重新登入後再修改密碼。',
  access_denied: '登入已取消或遭拒絕。',
  // Codes produced by our own /auth/callback route.
  missing_code: '驗證連結不完整或已失效，請重新申請。',
  not_configured: '網站尚未設定會員功能。',
  exchange_failed: '無法完成登入，請重新操作一次。',
};

const BY_MESSAGE: Array<[RegExp, string]> = [
  [/invalid login credentials/i, BY_CODE.invalid_credentials],
  [/email not confirmed/i, BY_CODE.email_not_confirmed],
  [/user already registered/i, BY_CODE.user_already_exists],
  [/password should be at least/i, `密碼長度不足，至少需要 ${PASSWORD_MIN_LENGTH} 個字元。`],
  [/provider is not enabled|unsupported provider/i, BY_CODE.provider_disabled],
  [/rate limit/i, BY_CODE.over_request_rate_limit],
  [/should be different from the old password/i, BY_CODE.same_password],
  [/expired/i, BY_CODE.otp_expired],
  [/failed to fetch|network|load failed/i, NETWORK],
];

export function authErrorMessage(err: AuthErrorLike | null | undefined): string {
  if (!err) return GENERIC;
  if (err.code && BY_CODE[err.code]) return BY_CODE[err.code];
  if (err.name === 'AuthRetryableFetchError' || err.status === 0) return NETWORK;
  const msg = err.message ?? '';
  for (const [re, zh] of BY_MESSAGE) if (re.test(msg)) return zh;
  return GENERIC;
}

/** Reason code from /auth/error?reason=… → message (unknown codes get a generic message). */
export function authReasonMessage(reason: string | null | undefined): string {
  if (reason && BY_CODE[reason]) return BY_CODE[reason];
  return '登入或驗證沒有完成，請重新操作一次。';
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateEmail(email: string): string | null {
  const e = email.trim();
  if (!e) return '請輸入電子郵件。';
  if (!EMAIL_RE.test(e)) return '電子郵件格式不正確。';
  return null;
}

export function validateNewPassword(password: string, confirm: string): { password?: string; confirm?: string } {
  const out: { password?: string; confirm?: string } = {};
  if (password.length < PASSWORD_MIN_LENGTH) out.password = `密碼至少需要 ${PASSWORD_MIN_LENGTH} 個字元。`;
  else if (password.length > 72) out.password = '密碼最多 72 個字元。';
  if (confirm !== password) out.confirm = '兩次輸入的密碼不一致。';
  return out;
}
