'use client';

import 'dayjs/locale/zh-tw';
import '@/app/mantine.css';
import {
  createTheme,
  MantineProvider,
  type CSSVariablesResolver,
  type MantineColorsTuple,
} from '@mantine/core';
import { DatesProvider } from '@mantine/dates';

// Mantine is used for the input form and the account UI (login, /charts, save dialog). Everything else keeps its own
// Tailwind styling; see src/app/mantine.css for how the cascade layers keep the two apart.

/** Shade 6 is the app accent (--app-accent): #2b5c8a. */
const ACCENT: MantineColorsTuple = [
  '#eaf1f8',
  '#d3e1ee',
  '#a9c3dd',
  '#7da4cb',
  '#5888bb',
  '#3f73a6',
  '#2b5c8a',
  '#234c73',
  '#1b3c5b',
  '#132b42',
];
/** Warm greys matching the light tokens (gray-4 = --app-border). */
const GRAY: MantineColorsTuple = [
  '#f7f6f2',
  '#efede7',
  '#e6e3dc',
  '#dedad2',
  '#d9d6ce',
  '#a9a69f',
  '#8c8a85',
  '#5b5d63',
  '#3d3f44',
  '#1d1d1f',
];

const FONT = '"Noto Sans TC", "PingFang TC", "Microsoft JhengHei", sans-serif';

const theme = createTheme({
  fontFamily: FONT,
  headings: { fontFamily: FONT },
  colors: {
    accent: ACCENT,
    gray: GRAY,
  },
  primaryColor: 'accent',
  primaryShade: 6,
  autoContrast: true,
  radius: { sm: '0.375rem', md: '0.5rem' },
  defaultRadius: 'sm',
});

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

export function MantineRoot({ children }: { children: React.ReactNode }) {
  return (
    <MantineProvider
      theme={theme}
      defaultColorScheme="light"
      forceColorScheme="light"
      cssVariablesResolver={cssVariablesResolver}
    >
      <DatesProvider settings={{ locale: 'zh-tw', firstDayOfWeek: 0 }}>
        {children}
      </DatesProvider>
    </MantineProvider>
  );
}
