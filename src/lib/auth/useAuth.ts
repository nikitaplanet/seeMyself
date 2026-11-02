'use client';

import { useSyncExternalStore } from 'react';
import { hasGoogleIdentity } from '@/lib/auth/google';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { isSupabaseConfigured } from '@/lib/supabase/env';

// One shared, client-side view of the login state (header, /charts, save button, login page).
// The server snapshot is always 'loading', so pages that use it still prerender into the static
// shell; the browser resolves it from the session cookie via onAuthStateChange (INITIAL_SESSION).
// UI only — data access is enforced by RLS, not by this state.

export interface AuthUser {
  id: string;
  email: string | null;
  googleLinked: boolean;
}

export type AuthState =
  | { status: 'loading' }
  | { status: 'unavailable' } // Supabase env vars missing: account features hidden
  | { status: 'signedOut' }
  | { status: 'signedIn'; user: AuthUser };

const LOADING: AuthState = { status: 'loading' };
const SIGNED_OUT: AuthState = { status: 'signedOut' };
const UNAVAILABLE: AuthState = { status: 'unavailable' };

let state: AuthState = LOADING;
let started = false;
const listeners = new Set<() => void>();

function setState(next: AuthState) {
  const same =
    next.status === state.status &&
    (next.status !== 'signedIn' ||
      (state.status === 'signedIn' &&
        state.user.id === next.user.id &&
        state.user.email === next.user.email &&
        state.user.googleLinked === next.user.googleLinked));
  if (same) return;
  state = next;
  listeners.forEach((l) => l());
}

function start() {
  if (started) return;
  started = true;
  if (!isSupabaseConfigured) {
    setState(UNAVAILABLE);
    return;
  }
  getSupabaseBrowserClient().auth.onAuthStateChange((_event, session) => {
    // Keep this callback synchronous: calling other Supabase methods here can deadlock.
    const u = session?.user;
    setState(
      u
        ? { status: 'signedIn', user: { id: u.id, email: u.email ?? null, googleLinked: hasGoogleIdentity(u.identities) } }
        : SIGNED_OUT,
    );
  });
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  start();
  return () => {
    listeners.delete(cb);
  };
}

const getSnapshot = () => state;
const getServerSnapshot = () => LOADING;

export function useAuth(): AuthState {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
