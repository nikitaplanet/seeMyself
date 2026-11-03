import type { Metadata } from 'next';
import { NewChartView } from '@/components/charts/NewChartView';
import { MantineRoot } from '@/components/MantineRoot';

export const metadata: Metadata = {
    title: '新增命盤',
    robots: { index: false, follow: false },
};

export default function NewChartPage() {
    return (
        <div className="flex max-w-2xl flex-col gap-6">
            <div className="flex flex-col gap-2">
                <h1 className="font-serif text-3xl font-medium tracking-wide">新增命盤</h1>
                <p className="text-muted">
                    輸入出生資料並取一個名稱，計算後會直接儲存到你的帳號。朋友不需要註冊帳號。
                </p>
            </div>
            <MantineRoot>
                <NewChartView />
            </MantineRoot>
        </div>
    );
}
