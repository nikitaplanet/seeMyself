'use client';

import { useLayoutEffect, useSyncExternalStore } from 'react';

// Spec §11.3 — top-right theme switch. Cycles 跟隨系統 → 淺色 → 深色. The choice is persisted in
// localStorage (per-browser convenience only) and applied as `data-theme` on <html>; the inline
// script in layout.tsx applies it before first paint to avoid a flash.

export const THEME_STORAGE_KEY = 'hd-theme';

type ThemeMode = 'system' | 'light' | 'dark';

const LABEL: Record<ThemeMode, string> = { system: '跟隨系統', light: '淺色', dark: '深色' };
const ICON: Record<ThemeMode, string> = { system: '◐', light: '☀', dark: '☾' };
const NEXT: Record<ThemeMode, ThemeMode> = { system: 'light', light: 'dark', dark: 'system' };

const listeners = new Set<() => void>();
// Fallback when localStorage is unavailable, so the toggle still works for this page view.
let memoryMode: ThemeMode = 'system';

function readMode(): ThemeMode {
  try {
    const v = localStorage.getItem(THEME_STORAGE_KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return memoryMode;
  }
}

function applyMode(mode: ThemeMode) {
  const root = document.documentElement;
  if (mode === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', mode);
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  window.addEventListener('storage', cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener('storage', cb);
  };
}

export function ThemeToggle() {
  const mode = useSyncExternalStore(subscribe, readMode, () => 'system' as ThemeMode);

  // React may reset <html> attributes on the dev-mode remount; re-apply before paint. Reads the
  // stored value (not `mode`, which is the 'system' server snapshot during hydration).
  useLayoutEffect(() => {
    applyMode(readMode());
  }, [mode]);

  function cycle() {
    const next = NEXT[mode];
    memoryMode = next;
    try {
      if (next === 'system') localStorage.removeItem(THEME_STORAGE_KEY);
      else localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // storage unavailable (private mode etc.): the theme still applies for this page view
    }
    applyMode(next);
    listeners.forEach((l) => l());
  }

  return (
    <button
      type="button"
      onClick={cycle}
      className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-1.5 text-sm hover:bg-surface-2"
      aria-label={`色彩主題：${LABEL[mode]}（按下切換為${LABEL[NEXT[mode]]}）`}
    >
      <span aria-hidden="true">{ICON[mode]}</span>
      <span>{LABEL[mode]}</span>
    </button>
  );
}
