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

/** Shade 6 is Ink (--app-accent): #1a1a1a. */
const ACCENT: MantineColorsTuple = [
    '#f5f5f5',
    '#e8e8e8',
    '#d4d4d4',
    '#b0b0b0',
    '#888888',
    '#5c5c5c',
    '#1a1a1a',
    '#141414',
    '#0d0d0d',
    '#000000',
];
/** Warm greys matching Ivory / Stone tokens (gray-4 ≈ --app-border). */
const GRAY: MantineColorsTuple = [
    '#faf9f4',
    '#f3f1eb',
    '#e6e3dc',
    '#ddd9d0',
    '#d6d3c8',
    '#a9a69f',
    '#7a7a7a',
    '#6b6b6b',
    '#3d3d3d',
    '#1a1a1a',
];

const FONT_SANS =
    'var(--font-sans-face), "Noto Sans TC", "PingFang TC", "Microsoft JhengHei", sans-serif';
const FONT_SERIF = 'var(--font-serif-face), "Noto Serif TC", "Songti TC", "PMingLiU", serif';

const theme = createTheme({
    fontFamily: FONT_SANS,
    headings: { fontFamily: FONT_SERIF, fontWeight: '500' },
    colors: {
        accent: ACCENT,
        gray: GRAY,
    },
    primaryColor: 'accent',
    primaryShade: 6,
    autoContrast: true,
    radius: {
        xs: '0.75rem',
        sm: '1rem',
        md: '1.5rem',
        lg: '1.75rem',
        xl: '9999px',
    },
    defaultRadius: 'md',
    shadows: {
        sm: '4px 6px 12px rgb(0 0 0 / 0.06), -2px -2px 8px rgb(255 255 255 / 0.8)',
        md: '6px 8px 18px rgb(0 0 0 / 0.08), -4px -4px 14px rgb(255 255 255 / 0.85)',
        lg: '10px 14px 28px rgb(0 0 0 / 0.1), -6px -6px 18px rgb(255 255 255 / 0.9)',
    },
    components: {
        Button: {
            defaultProps: { radius: 'xl' },
        },
        TextInput: {
            defaultProps: { radius: 'xs' },
        },
        PasswordInput: {
            defaultProps: { radius: 'xs' },
        },
        Textarea: {
            defaultProps: { radius: 'xs' },
        },
        Select: {
            defaultProps: { radius: 'xs' },
        },
        NativeSelect: {
            defaultProps: { radius: 'xs' },
        },
        DatePickerInput: {
            defaultProps: { radius: 'xs' },
        },
        Input: {
            defaultProps: { withErrorStyles: false },
        },
        InputWrapper: {
            defaultProps: { errorProps: { className: 'sr-only' } },
        },
        Paper: {
            defaultProps: { radius: 'md', shadow: 'md' },
        },
        Modal: {
            defaultProps: { radius: 'md' },
        },
        Checkbox: {
            defaultProps: { color: 'accent', radius: 'sm' },
        },
        Radio: {
            defaultProps: { color: 'accent', withErrorStyles: false },
        },
        Tabs: {
            defaultProps: { variant: 'pills', radius: 'xl' },
        },
    },
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
