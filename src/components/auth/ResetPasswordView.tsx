'use client';

import { Alert, Button, PasswordInput, Stack, Text } from '@mantine/core';
import Link from 'next/link';
import { useState } from 'react';
import { authErrorMessage, PASSWORD_MIN_LENGTH, validateNewPassword } from '@/lib/auth/errors';
import { useAuth } from '@/lib/auth/useAuth';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { AuthCardSkeleton } from './AuthCard';

// Reached from the reset e-mail via /auth/callback?next=/reset-password, which has already turned
// the link's code into a (recovery) session.

const INPUT_PROPS = {
    size: 'md',
    labelProps: { className: 'font-medium' },
    styles: {
        root: { display: 'flex', flexDirection: 'column', gap: '0.25rem' },
        error: { fontSize: 'var(--mantine-font-size-sm)' },
    },
    visibilityToggleButtonProps: { 'aria-label': '顯示或隱藏密碼' },
} as const;

export function ResetPasswordView() {
    const auth = useAuth();
    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [errors, setErrors] = useState<{ password?: string; confirm?: string }>({});
    const [formError, setFormError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [done, setDone] = useState(false);

    if (auth.status === 'loading') return <AuthCardSkeleton />;
    if (auth.status !== 'signedIn' && !done) {
        return (
            <Stack gap="md">
                <Text>重設密碼的連結無效或已過期，請重新申請。</Text>
                <div>
                    <Button component={Link} href="/login?mode=forgot">
                        重新寄送重設連結
                    </Button>
                </div>
            </Stack>
        );
    }

    if (done) {
        return (
            <Stack gap="md">
                <Text>密碼已更新。</Text>
                <div>
                    <Button component={Link} href="/charts">
                        前往我的命盤
                    </Button>
                </div>
            </Stack>
        );
    }

    async function onSubmit(ev: React.FormEvent<HTMLFormElement>) {
        ev.preventDefault();
        if (busy) return;
        const e = validateNewPassword(password, confirm);
        setErrors(e);
        setFormError(null);
        if (e.password || e.confirm) return;
        setBusy(true);
        const { error } = await getSupabaseBrowserClient().auth.updateUser({
            password,
        });
        setBusy(false);
        if (error) setFormError(authErrorMessage(error));
        else setDone(true);
    }

    return (
        <form onSubmit={onSubmit} noValidate aria-busy={busy}>
            <Stack gap="lg">
                {auth.status === 'signedIn' && auth.user.email ? (
                    <Text size="sm" c="dimmed">
                        帳號：{auth.user.email}
                    </Text>
                ) : null}
                <PasswordInput
                    {...INPUT_PROPS}
                    label="新密碼"
                    description={`至少 ${PASSWORD_MIN_LENGTH} 個字元`}
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => {
                        setPassword(e.currentTarget.value);
                        setErrors((x) => ({ ...x, password: undefined }));
                    }}
                    error={errors.password}
                    labelProps={{
                        className: `font-medium${errors.password ? ' text-danger' : ''}`,
                    }}
                />
                <PasswordInput
                    {...INPUT_PROPS}
                    label="確認新密碼"
                    autoComplete="new-password"
                    value={confirm}
                    onChange={(e) => {
                        setConfirm(e.currentTarget.value);
                        setErrors((x) => ({ ...x, confirm: undefined }));
                    }}
                    error={errors.confirm}
                    labelProps={{
                        className: `font-medium${errors.confirm ? ' text-danger' : ''}`,
                    }}
                />
                {formError ? (
                    <Alert variant="outline" color="var(--app-danger)" role="alert">
                        <span className="text-danger">{formError}</span>
                    </Alert>
                ) : null}
                <Button type="submit" size="md" loading={busy} fullWidth>
                    更新密碼
                </Button>
            </Stack>
        </form>
    );
}
