import type { Metadata } from 'next';
import { ChartsView } from '@/components/charts/ChartsView';
import { MantineRoot } from '@/components/MantineRoot';

// Login required: src/proxy.ts redirects logged-out visitors to /login?next=/charts before this
// renders; ChartsView repeats the check client-side, and RLS protects the data itself.

export const metadata: Metadata = {
  title: '我的命盤',
  robots: { index: false, follow: false },
};

export default function ChartsPage() {
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <h1 className="text-2xl font-bold">我的命盤</h1>
      <MantineRoot>
        <ChartsView />
      </MantineRoot>
    </div>
  );
}
