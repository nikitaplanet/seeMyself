'use client';

import 'dayjs/locale/zh-tw';
import '@/app/mantine.css';
import {
  createTheme,
  MantineProvider,
  virtualColor,
  type CSSVariablesResolver,
  type MantineColorScheme,
  type MantineColorSchemeManager,
  type MantineColorsTuple,
} from '@mantine/core';
import { DatesProvider } from '@mantine/dates';

// Mantine is used for the input form and the account UI (login, /charts, save dialog). Everything else keeps its own
// Tailwind styling; see src/app/mantine.css for how the cascade layers keep the two apart.

/** Shade 6 is the app accent (--app-accent): #2b5c8a light, #8ab4f8 dark. */
const ACCENT_LIGHT: MantineColorsTuple = [
  '#eaf1f8', '#d3e1ee', '#a9c3dd', '#7da4cb', '#5888bb', '#3f73a6', '#2b5c8a', '#234c73', '#1b3c5b', '#132b42',
];
const ACCENT_DARK: MantineColorsTuple = [
  '#eef4fe', '#dce8fd', '#c3d8fb', '#a9c7fa', '#9bbef9', '#93b9f8', '#8ab4f8', '#6f9de8', '#5586d6', '#3d6fc0',
];
/** Warm greys matching the light tokens (gray-4 = --app-border). */
const GRAY: MantineColorsTuple = [
  '#f7f6f2', '#efede7', '#e6e3dc', '#dedad2', '#d9d6ce', '#a9a69f', '#8c8a85', '#5b5d63', '#3d3f44', '#1d1d1f',
];
/** Dark tokens: dark-4 = --app-border, dark-6 = --app-surface (inputs, popovers), dark-8 = --app-bg. */
const DARK: MantineColorsTuple = [
  '#e8e6e3', '#c9ccd1', '#a4a8ae', '#7d8188', '#33363c', '#2a2d32', '#1b1d21', '#24272c', '#121316', '#0d0e10',
];

const FONT = '"Noto Sans TC", "PingFang TC", "Microsoft JhengHei", sans-serif';

const theme = createTheme({
  fontFamily: FONT,
  headings: { fontFamily: FONT },
  colors: {
    accentLight: ACCENT_LIGHT,
    accentDark: ACCENT_DARK,
    accent: virtualColor({ name: 'accent', light: 'accentLight', dark: 'accentDark' }),
    gray: GRAY,
    dark: DARK,
  },
  primaryColor: 'accent',
  primaryShade: { light: 6, dark: 6 },
  autoContrast: true,
  radius: { sm: '0.375rem', md: '0.5rem' },
  defaultRadius: 'sm',
});

// Semantic colours follow the app's own tokens, which already switch with the theme.
const APP_SEMANTIC_VARS = {
  '--mantine-color-body': 'var(--app-surface)',
  '--mantine-color-text': 'var(--app-fg)',
  '--mantine-color-dimmed': 'var(--app-muted)',
  '--mantine-color-default': 'var(--app-surface)',
  '--mantine-color-default-hover': 'var(--app-surface-2)',
  '--mantine-color-default-color': 'var(--app-fg)',
  '--mantine-color-default-border': 'var(--app-border)',
  '--mantine-color-error': 'var(--app-danger)',
};
const cssVariablesResolver: CSSVariablesResolver = () => ({
  variables: {},
  light: APP_SEMANTIC_VARS,
  dark: APP_SEMANTIC_VARS,
});

/**
 * ThemeToggle owns the theme: it writes `data-theme` on <html> (absent = follow the OS) and persists
 * it. Mantine just mirrors that attribute: system → 'auto' (Mantine resolves it with matchMedia and
 * tracks OS changes), light/dark → forced. `set`/`clear` are no-ops so Mantine never writes storage.
 */
function readAppScheme(): MantineColorScheme {
  if (typeof document === 'undefined') return 'auto';
  const t = document.documentElement.getAttribute('data-theme');
  return t === 'light' || t === 'dark' ? t : 'auto';
}

function appColorSchemeManager(): MantineColorSchemeManager {
  let observer: MutationObserver | null = null;
  return {
    get: () => readAppScheme(),
    set: () => {},
    clear: () => {},
    subscribe: (onUpdate) => {
      observer?.disconnect();
      observer = new MutationObserver(() => onUpdate(readAppScheme()));
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    },
    unsubscribe: () => {
      observer?.disconnect();
      observer = null;
    },
  };
}

const colorSchemeManager = appColorSchemeManager();

export function MantineRoot({ children }: { children: React.ReactNode }) {
  return (
    <MantineProvider
      theme={theme}
      defaultColorScheme="auto"
      colorSchemeManager={colorSchemeManager}
      cssVariablesResolver={cssVariablesResolver}
    >
      <DatesProvider settings={{ locale: 'zh-tw', firstDayOfWeek: 0 }}>{children}</DatesProvider>
    </MantineProvider>
  );
}
