import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { loginUrl } from '@/lib/auth/redirect';
import type { Database } from './database.types';
import { isSupabaseConfigured, SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from './env';

// Session refresh for every page request (the @supabase/ssr Next.js pattern), plus an optimistic
// login check for the account pages. Real authorization is Postgres RLS on `public.charts`.

const PROTECTED_PREFIXES = ['/charts'];

function isProtected(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/** Supabase stores the session as `sb-<project-ref>-auth-token` (possibly chunked as `.0`, `.1`…). */
function hasAuthCookie(request: NextRequest): boolean {
  return request.cookies.getAll().some((c) => c.name.startsWith('sb-') && c.name.includes('-auth-token'));
}

function redirectToLogin(request: NextRequest, from?: NextResponse): NextResponse {
  const { pathname, search } = request.nextUrl;
  const res = NextResponse.redirect(new URL(loginUrl(`${pathname}${search}`), request.url));
  // Keep any cookie changes (e.g. a cleared, expired session) made while checking.
  from?.cookies.getAll().forEach((c) => res.cookies.set(c));
  res.headers.set('Cache-Control', 'private, no-store');
  return res;
}

export async function updateSession(request: NextRequest): Promise<NextResponse> {
  const needsAuth = isProtected(request.nextUrl.pathname);

  // Anonymous visitors (no auth cookie): nothing to refresh, no network round trip.
  if (!isSupabaseConfigured || !hasAuthCookie(request)) {
    return needsAuth ? redirectToLogin(request) : NextResponse.next();
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers ?? {}).forEach(([k, v]) => response.headers.set(k, v));
      },
    },
  });

  // Do not run code between createServerClient and getClaims(): it refreshes the token if needed.
  let signedIn = false;
  try {
    const { data } = await supabase.auth.getClaims();
    signedIn = Boolean(data?.claims?.sub);
  } catch {
    signedIn = false;
  }

  if (needsAuth && !signedIn) return redirectToLogin(request, response);
  return response;
}
