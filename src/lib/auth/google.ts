import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from '@/lib/supabase/env';

/** True when the session already has a Google identity (from email signup + later linking). */
export function hasGoogleIdentity(identities: { provider?: string | null }[] | null | undefined): boolean {
  return (identities ?? []).some((i) => i.provider === 'google');
}

/**
 * Public Auth settings: whether the Google provider is switched on. Fail closed (false) so the
 * login page stays email-only until the Dashboard toggle is enabled.
 */
export async function googleProviderEnabled(): Promise<boolean> {
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/settings`, { headers: { apikey: SUPABASE_PUBLISHABLE_KEY } });
    if (!res.ok) return false;
    const body = (await res.json()) as { external?: { google?: boolean } };
    return body.external?.google === true;
  } catch {
    return false;
  }
}
