import type { Metadata } from 'next';
import { Suspense } from 'react';
import { NewChartView } from '@/components/charts/NewChartView';
import { MantineRoot } from '@/components/MantineRoot';

export const metadata: Metadata = {
    title: '新增命盤',
    robots: { index: false, follow: false },
};

export default function NewChartPage() {
    return (
        <div className="flex max-w-2xl flex-col gap-6">
            <MantineRoot>
                <Suspense
                    fallback={
                        <div
                            aria-hidden="true"
                            className="hd-skeleton h-96 rounded-lg bg-surface-2"
                        />
                    }
                >
                    <NewChartView />
                </Suspense>
            </MantineRoot>
        </div>
    );
}
