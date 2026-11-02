import { mantineHtmlProps } from '@mantine/core';
import type { Metadata } from 'next';
import Link from 'next/link';
import { SiteFooter } from '@/components/SiteFooter';
import { UserNav } from '@/components/UserNav';
import './globals.css';

// §13.2: avoid "Human Design" / "Rave BodyGraph" as product branding.
export const metadata: Metadata = {
  title: { default: '排盤', template: '%s｜排盤' },
  description:
    '輸入一次出生資料，同時排出人類圖與紫微斗數命盤。未登入時資料僅用於即時計算、不保存；登入後可自行選擇把命盤儲存到帳號。',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html
      lang="zh-Hant-TW"
      {...mantineHtmlProps}
      className="h-full antialiased"
    >
      <body className="flex min-h-full flex-col">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2"
        >
          跳到主要內容
        </a>
        <header className="border-b border-border">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
            <Link
              href="/"
              className="text-lg font-semibold tracking-wide hover:text-accent"
            >
              排盤
            </Link>
            <UserNav />
          </div>
        </header>
        <main
          id="main"
          className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:py-10"
        >
          {children}
        </main>
        <SiteFooter />
      </body>
    </html>
  );
}
