import type { Metadata } from 'next';
import { PrivacyArticle } from '@/components/SiteLegal';

export const metadata: Metadata = {
    title: '隱私說明',
    description:
        '出生資料僅用於即時計算；未登入不保存，登入後需你主動儲存才會寫入帳號。本站不使用第三方分析工具。',
};

export default function PrivacyPage() {
    return (
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-8">
            <div className="flex flex-col gap-3">
                <h1 className="font-serif text-3xl font-medium tracking-wide">隱私說明</h1>
                <p className="leading-relaxed text-muted">
                    這頁說明本站怎麼處理出生資料、會員帳號，以及排盤用到的資料來源。
                </p>
            </div>
            <PrivacyArticle />
        </div>
    );
}
