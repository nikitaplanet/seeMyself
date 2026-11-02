// Open-redirect protection for `?next=` parameters (login page, /auth/callback).

const BASE = 'http://same-origin.invalid';

/**
 * Returns `next` as a same-origin path (pathname + search + hash) or `fallback` when it is missing,
 * absolute, protocol-relative (`//evil.com`, `/\evil.com`), contains control characters, or points
 * back into the auth flow itself.
 */
export function safeNextPath(next: string | null | undefined, fallback = '/'): string {
  if (typeof next !== 'string' || next === '') return fallback;
  if (!next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return fallback;
  if (/[\u0000-\u001f\u007f]/.test(next) || next.includes('\\')) return fallback;
  let url: URL;
  try {
    url = new URL(next, BASE);
  } catch {
    return fallback;
  }
  if (url.origin !== BASE) return fallback;
  if (url.pathname.startsWith('/auth/') || url.pathname === '/login') return fallback;
  return `${url.pathname}${url.search}${url.hash}`;
}

/** `/login?next=<path>` */
export function loginUrl(next: string): string {
  return `/login?next=${encodeURIComponent(next)}`;
}
