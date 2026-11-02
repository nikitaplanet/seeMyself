// Public Supabase settings. `process.env.NEXT_PUBLIC_*` must be written out literally so Next can
// inline them into the browser bundle at build time.

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
export const SUPABASE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '';

/**
 * False when the env vars are missing (e.g. a build without `.env.local`). The calculator keeps
 * working anonymously; the account features just stay hidden.
 */
export const isSupabaseConfigured = SUPABASE_URL !== '' && SUPABASE_PUBLISHABLE_KEY !== '';

/** Base URL used in auth e-mail / OAuth redirect links. Falls back to the current origin. */
export function siteUrl(): string {
  const fromEnv = (process.env.NEXT_PUBLIC_SITE_URL ?? '').replace(/\/+$/, '');
  if (fromEnv) return fromEnv;
  return typeof window !== 'undefined' ? window.location.origin : '';
}

/** `${site}/auth/callback?next=<path>` */
export function authCallbackUrl(next: string): string {
  return `${siteUrl()}/auth/callback?next=${encodeURIComponent(next)}`;
}
