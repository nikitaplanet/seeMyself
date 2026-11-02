import type { EmailOtpType } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import { safeNextPath } from '@/lib/auth/redirect';
import { isSupabaseConfigured } from '@/lib/supabase/env';
import { createSupabaseServerClient } from '@/lib/supabase/server';

// GET /auth/callback — landing point for the signup confirmation e-mail, the password-reset e-mail
// and Google OAuth. Exchanges the PKCE `code` (or an e-mail `token_hash`) for a session cookie, then
// redirects to `next`, which must be a same-origin path (open-redirect protection).

const OTP_TYPES: readonly EmailOtpType[] = ['signup', 'invite', 'magiclink', 'recovery', 'email_change', 'email'];

function fail(request: NextRequest, reason: string): NextResponse {
  const url = new URL('/auth/error', request.nextUrl.origin);
  url.searchParams.set('reason', reason.replace(/[^a-z0-9_]/gi, '').slice(0, 64) || 'unknown');
  return NextResponse.redirect(url, { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const params = request.nextUrl.searchParams;
  const next = safeNextPath(params.get('next'), '/');

  // Supabase reports failures (expired link, cancelled Google consent…) as query parameters.
  const upstreamError = params.get('error_code') ?? params.get('error');
  if (upstreamError) return fail(request, upstreamError);
  if (!isSupabaseConfigured) return fail(request, 'not_configured');

  const code = params.get('code');
  const tokenHash = params.get('token_hash');
  const type = params.get('type') as EmailOtpType | null;
  if (!code && !(tokenHash && type && OTP_TYPES.includes(type))) return fail(request, 'missing_code');

  const supabase = await createSupabaseServerClient();
  const { error } = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : await supabase.auth.verifyOtp({ type: type as EmailOtpType, token_hash: tokenHash as string });
  if (error) return fail(request, error.code ?? 'exchange_failed');

  return NextResponse.redirect(new URL(next, request.nextUrl.origin), {
    headers: { 'Cache-Control': 'private, no-store' },
  });
}
