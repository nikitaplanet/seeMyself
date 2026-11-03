'use client';

import {
  Alert,
  Button,
  Divider,
  PasswordInput,
  Stack,
  Tabs,
  Text,
  TextInput,
} from '@mantine/core';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  authErrorMessage,
  PASSWORD_MIN_LENGTH,
  validateEmail,
  validateNewPassword,
} from '@/lib/auth/errors';
import { googleProviderEnabled } from '@/lib/auth/google';
import { safeNextPath } from '@/lib/auth/redirect';
import { useAuth } from '@/lib/auth/useAuth';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { authCallbackUrl } from '@/lib/supabase/env';

type Mode = 'signin' | 'signup' | 'forgot';

const INPUT_PROPS = {
  size: 'md',
  labelProps: { className: 'font-medium' },
  styles: {
    root: { display: 'flex', flexDirection: 'column', gap: '0.25rem' },
    error: { fontSize: 'var(--mantine-font-size-sm)' },
  },
} as const;

export function LoginView() {
  const params = useSearchParams();
  const router = useRouter();
  const auth = useAuth();
  const next = safeNextPath(params.get('next'), '/charts');
  const initial = params.get('mode');
  const [mode, setMode] = useState<Mode>(
    initial === 'signup' || initial === 'forgot' ? initial : 'signin',
  );
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<{
    email?: string;
    password?: string;
    confirm?: string;
  }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | 'email' | 'google'>(null);
  const [sent, setSent] = useState<null | {
    kind: 'signup' | 'reset';
    email: string;
  }>(null);
  // Hidden until the Google provider is turned on in the Dashboard (email/password is the path now).
  const [showGoogle, setShowGoogle] = useState(false);

  // Signed in (just now, or already when the page opened): go where the user was heading.
  useEffect(() => {
    if (auth.status === 'signedIn' && mode !== 'forgot') router.replace(next);
  }, [auth.status, mode, next, router]);

  useEffect(() => {
    let cancelled = false;
    googleProviderEnabled().then(on => {
      if (!cancelled) setShowGoogle(on);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  function switchMode(m: Mode) {
    setMode(m);
    setErrors({});
    setFormError(null);
    setSent(null);
  }

  async function onSubmit(ev: React.FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    if (busy) return;
    const e: typeof errors = {};
    const emailErr = validateEmail(email);
    if (emailErr) e.email = emailErr;
    if (mode === 'signin' && !password) e.password = '請輸入密碼。';
    if (mode === 'signup')
      Object.assign(e, validateNewPassword(password, confirm));
    setErrors(e);
    setFormError(null);
    if (e.email || e.password || e.confirm) return;

    const sb = getSupabaseBrowserClient();
    const addr = email.trim();
    setBusy('email');
    if (mode === 'signin') {
      const { error } = await sb.auth.signInWithPassword({
        email: addr,
        password,
      });
      setBusy(null);
      if (error) setFormError(authErrorMessage(error));
      // success: the auth state changes and the effect above redirects
      return;
    }
    if (mode === 'signup') {
      const { data, error } = await sb.auth.signUp({
        email: addr,
        password,
        options: { emailRedirectTo: authCallbackUrl(next) },
      });
      setBusy(null);
      if (error) {
        setFormError(authErrorMessage(error));
        return;
      }
      // Email confirmation is required, so there is no session yet. (For an address that is already
      // registered Supabase returns the same response on purpose, so we say the same thing.)
      if (!data.session) {
        setSent({ kind: 'signup', email: addr });
        setPassword('');
        setConfirm('');
      }
      return;
    }
    const { error } = await sb.auth.resetPasswordForEmail(addr, {
      redirectTo: authCallbackUrl('/reset-password'),
    });
    setBusy(null);
    if (error) setFormError(authErrorMessage(error));
    else setSent({ kind: 'reset', email: addr });
  }

  async function onGoogle() {
    if (busy) return;
    setBusy('google');
    setFormError(null);
    if (!(await googleProviderEnabled())) {
      setBusy(null);
      setShowGoogle(false);
      setFormError('Google 登入尚未啟用，請先改用電子郵件登入。');
      return;
    }
    const { error } = await getSupabaseBrowserClient().auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: authCallbackUrl(next) },
    });
    // On success the browser is already navigating to Google; keep the busy state.
    if (error) {
      setBusy(null);
      setFormError(authErrorMessage(error));
    }
  }

  if (sent) {
    return (
      <Stack gap="md">
        <h2 className="text-xl font-semibold">請到信箱收信</h2>
        <Text>
          {sent.kind === 'signup'
            ? `我們已寄出驗證信到 ${sent.email}。請點擊信中的連結完成註冊，完成後就會自動登入。`
            : `如果 ${sent.email} 有註冊帳號，我們已寄出重設密碼的連結。請點擊信中的連結設定新密碼。`}
        </Text>
        <Text size="sm" c="dimmed">
          請在這個瀏覽器中開啟信件連結。沒收到的話，請檢查垃圾郵件匣，或稍候幾分鐘再試。
        </Text>
        <div>
          <Button variant="default" onClick={() => switchMode('signin')}>
            回到登入
          </Button>
        </div>
      </Stack>
    );
  }

  const form = (
    <form onSubmit={onSubmit} noValidate aria-busy={busy !== null}>
      <Stack gap="lg">
        <TextInput
          {...INPUT_PROPS}
          type="email"
          label="電子郵件"
          autoComplete="email"
          value={email}
          onChange={e => {
            setEmail(e.currentTarget.value);
            setErrors(x => ({ ...x, email: undefined }));
          }}
          error={errors.email}
        />
        {mode !== 'forgot' ? (
          <PasswordInput
            {...INPUT_PROPS}
            label="密碼"
            description={
              mode === 'signup'
                ? `至少 ${PASSWORD_MIN_LENGTH} 個字元`
                : undefined
            }
            autoComplete={
              mode === 'signup' ? 'new-password' : 'current-password'
            }
            value={password}
            onChange={e => {
              setPassword(e.currentTarget.value);
              setErrors(x => ({ ...x, password: undefined }));
            }}
            error={errors.password}
            visibilityToggleButtonProps={{ 'aria-label': '顯示或隱藏密碼' }}
          />
        ) : null}
        {mode === 'signup' ? (
          <PasswordInput
            {...INPUT_PROPS}
            label="確認密碼"
            autoComplete="new-password"
            value={confirm}
            onChange={e => {
              setConfirm(e.currentTarget.value);
              setErrors(x => ({ ...x, confirm: undefined }));
            }}
            error={errors.confirm}
            visibilityToggleButtonProps={{ 'aria-label': '顯示或隱藏密碼' }}
          />
        ) : null}

        {formError ? (
          <Alert variant="outline" color="var(--app-danger)" role="alert">
            <span className="text-danger">{formError}</span>
          </Alert>
        ) : null}

        <Button
          type="submit"
          size="md"
          loading={busy === 'email'}
          disabled={busy === 'google'}
          fullWidth
        >
          {mode === 'signin'
            ? '登入'
            : mode === 'signup'
              ? '註冊'
              : '寄送重設密碼連結'}
        </Button>

        {mode === 'signin' ? (
          <button
            type="button"
            onClick={() => switchMode('forgot')}
            className="self-start text-sm underline hover:text-accent"
          >
            忘記密碼？
          </button>
        ) : null}
        {mode === 'forgot' ? (
          <button
            type="button"
            onClick={() => switchMode('signin')}
            className="self-start text-sm underline hover:text-accent"
          >
            回到登入
          </button>
        ) : null}
      </Stack>
    </form>
  );

  if (mode === 'forgot') {
    return (
      <Stack gap="md">
        <h2 className="text-xl font-semibold">忘記密碼</h2>
        <Text size="sm" c="dimmed">
          輸入註冊時使用的電子郵件，我們會寄給你重設密碼的連結。
        </Text>
        {form}
      </Stack>
    );
  }

  return (
    <Stack gap="lg">
      <Tabs
        value={mode}
        onChange={v => switchMode(v === 'signup' ? 'signup' : 'signin')}
        className="flex flex-col gap-4"
      >
        <Tabs.List grow>
          <Tabs.Tab value="signin" className="text-base">
            登入
          </Tabs.Tab>
          <Tabs.Tab value="signup" className="text-base">
            註冊
          </Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value={mode}>{form}</Tabs.Panel>
      </Tabs>
      {showGoogle ? (
        <>
          <Divider label="或" labelPosition="center" />
          <Button
            variant="default"
            size="md"
            fullWidth
            onClick={onGoogle}
            loading={busy === 'google'}
            disabled={busy === 'email'}
          >
            使用 Google 帳號{mode === 'signup' ? '註冊' : '登入'}
          </Button>
        </>
      ) : null}
      <Text
        size="sm"
        c="dimmed"
        className="inline-flex flex-wrap items-baseline gap-1"
      >
        <span>不登入也能排盤；登入後可以把命盤儲存到帳號。</span>
        <Link href="/" className="underline hover:text-accent">
          回到首頁
        </Link>
      </Text>
    </Stack>
  );
}
