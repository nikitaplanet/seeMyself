'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState } from 'react';
import { useAuth } from '@/lib/auth/useAuth';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';

// Header account links. Client-only state (see useAuth), so the root layout and the / and /chart
// static shells stay prerendered; a fixed-size placeholder avoids layout shift while it resolves.

const LINK = 'rounded-md px-3 py-1.5 text-sm hover:bg-surface-2 hover:text-accent';

export function UserNav() {
  const auth = useAuth();
  const router = useRouter();
  const menuId = useId();
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointer(e: PointerEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (auth.status === 'unavailable') return null;
  if (auth.status === 'loading') return <span aria-hidden="true" className="inline-block h-8 w-14" />;
  if (auth.status === 'signedOut') {
    return (
      <Link href="/login" className={LINK}>
        登入
      </Link>
    );
  }

  async function signOut() {
    setSigningOut(true);
    await getSupabaseBrowserClient().auth.signOut();
    setSigningOut(false);
    setOpen(false);
    const path = window.location.pathname;
    if (path.startsWith('/charts') || path === '/reset-password') router.replace('/');
  }

  const email = auth.user.email ?? '已登入';
  return (
    <div className="flex items-center gap-1">
      <Link href="/charts" className={LINK}>
        我的命盤
      </Link>
      <div ref={wrapRef} className="relative">
        <button
          type="button"
          aria-haspopup="true"
          aria-expanded={open}
          aria-controls={menuId}
          onClick={() => setOpen((o) => !o)}
          className="inline-flex items-center gap-1 rounded-md border border-border bg-surface px-3 py-1.5 text-sm hover:bg-surface-2"
        >
          <span className="sr-only">帳號選單：</span>
          <span aria-hidden="true">帳號</span>
          <span aria-hidden="true" className="text-xs">
            ▾
          </span>
        </button>
        {open ? (
          <div
            id={menuId}
            className="absolute right-0 z-40 mt-2 w-56 rounded-md border border-border bg-surface p-2 text-sm shadow-lg"
          >
            <p className="truncate px-2 py-1.5 text-muted" title={email}>
              {email}
            </p>
            <Link href="/charts" onClick={() => setOpen(false)} className="block rounded px-2 py-1.5 hover:bg-surface-2">
              我的命盤
            </Link>
            <button
              type="button"
              onClick={signOut}
              disabled={signingOut}
              className="block w-full rounded px-2 py-1.5 text-left hover:bg-surface-2 disabled:opacity-60"
            >
              {signingOut ? '登出中…' : '登出'}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
