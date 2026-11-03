import { mantineHtmlProps } from '@mantine/core';
import type { Metadata, Viewport } from 'next';
import { Noto_Sans_TC, Noto_Serif_TC } from 'next/font/google';
import Link from 'next/link';
import { SiteFooter } from '@/components/SiteFooter';
import { UserNav } from '@/components/UserNav';
import './globals.css';

const sans = Noto_Sans_TC({
    subsets: ['latin'],
    weight: ['300', '400', '500', '700'],
    variable: '--font-sans-face',
    display: 'swap',
});

const serif = Noto_Serif_TC({
    subsets: ['latin'],
    weight: ['400', '500', '600', '700'],
    variable: '--font-serif-face',
    display: 'swap',
});

// §13.2: avoid "Human Design" / "Rave BodyGraph" as product branding.
export const metadata: Metadata = {
    title: { default: '排盤', template: '%s｜排盤' },
    description:
        '輸入一次出生資料，同時排出人類圖、紫微斗數、八字與西洋本命星盤。未登入時資料僅用於即時計算、不保存；登入後可自行選擇把命盤儲存到帳號。',
};

export const viewport: Viewport = {
    width: 'device-width',
    initialScale: 1,
    userScalable: false,
    viewportFit: 'cover',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
    return (
        <html
            lang="zh-Hant-TW"
            {...mantineHtmlProps}
            className={`h-full antialiased ${sans.variable} ${serif.variable}`}
        >
            <body className="flex min-h-full flex-col font-sans">
                <a
                    href="#main"
                    className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-surface focus:px-3 focus:py-2"
                >
                    跳到主要內容
                </a>
                <header className="border-b border-border/60 bg-bg/80 backdrop-blur-sm">
                    <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4">
                        <Link
                            href="/"
                            className="font-serif text-2xl font-medium tracking-wide text-accent hover:opacity-80"
                        >
                            排盤
                        </Link>
                        <UserNav />
                    </div>
                </header>
                <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:py-12">
                    {children}
                </main>
                <SiteFooter />
            </body>
        </html>
    );
}
