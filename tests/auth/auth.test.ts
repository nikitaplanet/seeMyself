import { describe, expect, it } from 'vitest';
import {
  authErrorMessage,
  authReasonMessage,
  validateEmail,
  validateNewPassword,
} from '@/lib/auth/errors';
import { hasGoogleIdentity } from '@/lib/auth/google';
import { loginUrl, safeNextPath } from '@/lib/auth/redirect';

describe('safeNextPath', () => {
  it.each([
    ['/charts', '/charts'],
    ['/chart?x=1#y', '/chart?x=1#y'],
    ['/charts/new', '/charts/new'],
    ['/reset-password', '/reset-password'],
  ])('keeps same-origin path %s', (input, out) => {
    expect(safeNextPath(input)).toBe(out);
  });

  it.each([
    null,
    undefined,
    '',
    'charts',
    'https://evil.example/',
    '//evil.example/x',
    '/\\evil.example',
    '/\tevil',
    '/foo\\bar',
    'javascript:alert(1)',
    '/login',
    '/auth/callback?next=/x',
  ])('falls back for unsafe value %s', input => {
    expect(safeNextPath(input, '/fallback')).toBe('/fallback');
  });

  it('builds a login URL with an encoded next', () => {
    expect(loginUrl('/chart?a=1')).toBe('/login?next=%2Fchart%3Fa%3D1');
  });
});

describe('authErrorMessage', () => {
  it('maps by error code first', () => {
    expect(
      authErrorMessage({
        code: 'invalid_credentials',
        message: 'Invalid login credentials',
      }),
    ).toBe('電子郵件或密碼不正確。');
    expect(authErrorMessage({ code: 'email_not_confirmed' })).toContain('驗證');
    expect(authErrorMessage({ code: 'over_email_send_rate_limit' })).toContain(
      '稍候',
    );
    expect(authErrorMessage({ code: 'manual_linking_disabled' })).toContain(
      '綁定',
    );
    expect(authErrorMessage({ code: 'identity_already_exists' })).toContain(
      '已經綁定',
    );
  });
  it('falls back to the message text', () => {
    expect(authErrorMessage({ message: 'User already registered' })).toContain(
      '已經註冊',
    );
    expect(
      authErrorMessage({
        message: 'Unsupported provider: provider is not enabled',
      }),
    ).toContain('Google');
    expect(
      authErrorMessage({
        message: 'Password should be at least 6 characters.',
      }),
    ).toContain('密碼長度');
  });
  it('detects network failures', () => {
    expect(
      authErrorMessage({
        name: 'AuthRetryableFetchError',
        message: 'fetch failed',
        status: 0,
      }),
    ).toContain('無法連線');
  });
  it('returns a generic message otherwise', () => {
    expect(authErrorMessage({ message: 'something odd' })).toContain('未預期');
    expect(authErrorMessage(null)).toContain('未預期');
  });
});

describe('authReasonMessage', () => {
  it('maps callback reasons', () => {
    expect(authReasonMessage('otp_expired')).toContain('過期');
    expect(authReasonMessage('missing_code')).toContain('連結');
    expect(authReasonMessage('pkce_code_verifier_not_found')).toContain(
      '同一個瀏覽器',
    );
    expect(authReasonMessage('???')).toBeTruthy();
    expect(authReasonMessage(null)).toBeTruthy();
  });
});

describe('hasGoogleIdentity', () => {
  it('detects a linked Google identity', () => {
    expect(hasGoogleIdentity(undefined)).toBe(false);
    expect(hasGoogleIdentity([{ provider: 'email' }])).toBe(false);
    expect(
      hasGoogleIdentity([{ provider: 'email' }, { provider: 'google' }]),
    ).toBe(true);
  });
});

describe('validation', () => {
  it('validates e-mail', () => {
    expect(validateEmail('')).toBeTruthy();
    expect(validateEmail('a@b')).toBeTruthy();
    expect(validateEmail(' a@b.co ')).toBeNull();
  });
  it('validates new passwords', () => {
    expect(validateNewPassword('short', 'short').password).toBeTruthy();
    expect(
      validateNewPassword('longenough1', 'different').confirm,
    ).toBeTruthy();
    expect(validateNewPassword('longenough1', 'longenough1')).toEqual({});
  });
});
