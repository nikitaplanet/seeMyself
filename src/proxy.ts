import type { NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/proxy';

// Next 16 "proxy" (formerly middleware): refreshes the Supabase session cookie and redirects
// logged-out visitors away from /charts. See src/lib/supabase/proxy.ts.

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    // Everything except API routes (none of them use the session), Next internals and static files.
    '/((?!api/|_next/static|_next/image|favicon.ico|icon.svg|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml|json)$).*)',
  ],
};
