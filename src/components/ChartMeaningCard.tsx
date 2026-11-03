import type { BaziChart } from '@/lib/bazi/types';
import type { ChartResult } from '@/lib/hd/types';
import {
    baziMeaningItems,
    hdMeaningItems,
    ziweiMeaningItems,
    type MeaningItem,
} from '@/lib/ui/personMeaning';
import type { ZiweiChart } from '@/lib/ziwei/types';

export function HdMeaningCard({ chart }: { chart: ChartResult }) {
    return (
        <ChartMeaningCard
            heading="這個人在人類圖裡"
            lead="依這份排盤解說此人怎麼運作、怎麼想、怎麼相處。名詞可上網對照公開資料。"
            items={hdMeaningItems(chart)}
        />
    );
}

export function ZiweiMeaningCard({ chart }: { chart: ZiweiChart }) {
    return (
        <ChartMeaningCard
            heading="這個人在紫微斗數裡"
            lead="依命宮與各宮主星，解說此人各領域怎麼運作。名詞可上網對照公開資料。"
            items={ziweiMeaningItems(chart)}
        />
    );
}

export function BaziMeaningCard({ chart }: { chart: BaziChart }) {
    return (
        <ChartMeaningCard
            heading="這個人在八字裡"
            lead="依日主、四柱與用神，解說此人底色與節奏。名詞可上網對照公開資料。"
            items={baziMeaningItems(chart)}
        />
    );
}

function ChartMeaningCard({
    heading,
    lead,
    items,
}: {
    heading: string;
    lead: string;
    items: MeaningItem[];
}) {
    const headingId = `${heading}-title`;
    return (
        <section aria-labelledby={headingId} className="surface-card flex flex-col gap-4 p-5">
            <div className="flex flex-col gap-1">
                <h2 id={headingId} className="font-serif text-xl font-medium">
                    {heading}
                </h2>
                <p className="text-sm text-muted">{lead}</p>
            </div>
            <dl className="flex flex-col gap-3 text-sm">
                {items.map(([term, meaning]) => (
                    <div
                        key={term}
                        className="flex flex-col gap-1 sm:grid sm:grid-cols-[8rem_1fr] sm:gap-x-4"
                    >
                        <dt className="font-medium">{term}</dt>
                        <dd className="leading-relaxed text-muted">{meaning}</dd>
                    </div>
                ))}
            </dl>
        </section>
    );
}
