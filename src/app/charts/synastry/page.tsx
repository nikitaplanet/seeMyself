import type { Metadata } from 'next';
import { SynastryView } from '@/components/synastry/SynastryView';

// Login required like the rest of /charts (src/proxy.ts). The two charts arrive through
// sessionStorage from the 雙人合盤 tab on /charts; nothing personal is in the URL or the HTML.

export const metadata: Metadata = {
    title: '雙人合盤',
    // Results are private and session-only; keep the page out of search indexes.
    robots: { index: false, follow: false },
};

export default function SynastryPage() {
    return <SynastryView />;
}
