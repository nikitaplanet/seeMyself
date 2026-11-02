import { mantineHtmlProps } from '@mantine/core';
import type { Metadata } from 'next';
import Link from 'next/link';
import { SiteFooter } from '@/components/SiteFooter';
import { THEME_STORAGE_KEY, ThemeToggle } from '@/components/ThemeToggle';
import { UserNav } from '@/components/UserNav';
import './globals.css';

// §13.2: avoid "Human Design" / "Rave BodyGraph" as product branding.
export const metadata: Metadata = {
  title: { default: '人類圖排盤', template: '%s｜人類圖排盤' },
  description: '輸入出生日期、時間與地點，計算個性與設計兩組星體啟動並繪製人體圖。未登入時資料僅用於即時計算、不保存；登入後可自行選擇把命盤儲存到帳號。',
};

// Applies the saved theme before first paint (Next docs: guides/preventing-flash-before-hydration).
// Also mirrors it to Mantine's `data-mantine-color-scheme` (the form's colour scheme, see MantineRoot);
// this replaces Mantine's ColorSchemeScript so both attributes come from the one stored value.
const THEME_SCRIPT = `(function(){var d=document.documentElement,t=null;try{t=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY,
)});if(t==="light"||t==="dark")d.setAttribute("data-theme",t)}catch(e){}try{d.setAttribute("data-mantine-color-scheme",t==="light"||t==="dark"?t:matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light")}catch(e){}})()`;

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="zh-Hant-TW" {...mantineHtmlProps} className="h-full antialiased">
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="flex min-h-full flex-col">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2"
        >
          跳到主要內容
        </a>
        <header className="border-b border-border">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
            <Link href="/" className="text-lg font-semibold tracking-wide hover:text-accent">
              人類圖排盤
            </Link>
            <div className="flex items-center gap-2">
              <UserNav />
              <ThemeToggle />
            </div>
          </div>
        </header>
        <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:py-10">
          {children}
        </main>
        <SiteFooter />
      </body>
    </html>
  );
}
