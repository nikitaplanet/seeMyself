import type { Metadata } from 'next';
import { NewChartView } from '@/components/charts/NewChartView';
import { MantineRoot } from '@/components/MantineRoot';

export const metadata: Metadata = {
  title: '新增命盤',
  robots: { index: false, follow: false },
};

export default function NewChartPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-bold">新增命盤</h1>
      <p className="mt-2 text-muted">輸入出生資料並取一個名稱，計算後會直接儲存到你的帳號。朋友不需要註冊帳號。</p>
      <MantineRoot>
        <NewChartView />
      </MantineRoot>
    </div>
  );
}
