import type { Metadata } from 'next';
import { ChartView } from '@/components/ChartView';

export const metadata: Metadata = {
  title: '排盤結果',
  // Results are private and session-only; keep the page out of search indexes.
  robots: { index: false, follow: false },
};

export default function ChartPage() {
  return <ChartView />;
}
