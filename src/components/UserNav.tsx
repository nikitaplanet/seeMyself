'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState } from 'react';
import { authErrorMessage } from '@/lib/auth/errors';
import { googleProviderEnabled } from '@/lib/auth/google';
import { safeNextPath } from '@/lib/auth/redirect';
import { useAuth } from '@/lib/auth/useAuth';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { authCallbackUrl } from '@/lib/supabase/env';

const LINK = 'rounded-full px-3 py-1.5 text-sm text-fg hover:bg-surface-2 hover:text-accent';

export function UserNav() {
    const auth = useAuth();
    const router = useRouter();
    const menuId = useId();
    const [open, setOpen] = useState(false);
    const [signingOut, setSigningOut] = useState(false);
    const [linkingGoogle, setLinkingGoogle] = useState(false);
    const [googleOn, setGoogleOn] = useState(false);
    const [linkError, setLinkError] = useState<string | null>(null);
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

    useEffect(() => {
        if (auth.status !== 'signedIn') {
            setGoogleOn(false);
            return;
        }
        let cancelled = false;
        googleProviderEnabled().then((on) => {
            if (!cancelled) setGoogleOn(on);
        });
        return () => {
            cancelled = true;
        };
    }, [auth.status]);

    if (auth.status === 'unavailable') return null;
    if (auth.status === 'loading')
        return <span aria-hidden="true" className="inline-block size-9 rounded-full" />;
    if (auth.status === 'signedOut') {
        return (
            <Link href="/login" className={LINK}>
                登入 / 註冊
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

    async function linkGoogle() {
        if (linkingGoogle || signingOut) return;
        setLinkError(null);
        setLinkingGoogle(true);
        if (!(await googleProviderEnabled())) {
            setGoogleOn(false);
            setLinkingGoogle(false);
            setLinkError('Google 登入尚未啟用。');
            return;
        }
        const next = safeNextPath(
            `${window.location.pathname}${window.location.search}`,
            '/charts',
        );
        const { error } = await getSupabaseBrowserClient().auth.linkIdentity({
            provider: 'google',
            options: { redirectTo: authCallbackUrl(next) },
        });
        if (error) {
            setLinkingGoogle(false);
            setLinkError(authErrorMessage(error));
        }
    }

    const email = auth.user.email ?? '已登入';
    const initial = (auth.user.email?.trim().charAt(0) || '?').toUpperCase();
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
                    aria-label={`帳號選單：${email}`}
                    onClick={() => setOpen((o) => !o)}
                    className="inline-flex size-9 items-center justify-center rounded-full border border-border/70 bg-surface text-sm font-medium text-fg hover:bg-surface-2"
                >
                    <span aria-hidden="true">{initial}</span>
                </button>
                {open ? (
                    <div
                        id={menuId}
                        className="surface-card absolute right-0 z-40 mt-2 w-56 p-2 text-sm"
                    >
                        <p className="truncate px-2 py-1.5 text-muted" title={email}>
                            {email}
                        </p>
                        <Link
                            href="/charts"
                            onClick={() => setOpen(false)}
                            className="block rounded px-2 py-1.5 hover:bg-surface-2"
                        >
                            我的命盤
                        </Link>
                        {googleOn && !auth.user.googleLinked ? (
                            <button
                                type="button"
                                onClick={linkGoogle}
                                disabled={linkingGoogle || signingOut}
                                className="block w-full rounded px-2 py-1.5 text-left hover:bg-surface-2 disabled:opacity-60"
                            >
                                {linkingGoogle ? '前往 Google…' : '連結 Google 帳號'}
                            </button>
                        ) : null}
                        {auth.user.googleLinked ? (
                            <p className="px-2 py-1.5 text-muted">已連結 Google</p>
                        ) : null}
                        {linkError ? (
                            <p className="px-2 py-1.5 text-danger" role="alert">
                                {linkError}
                            </p>
                        ) : null}
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
