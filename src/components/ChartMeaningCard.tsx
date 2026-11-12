import { astroMeaningItems } from '@/lib/astro/meaning';
import type { AstroChart } from '@/lib/astro/types';
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
            heading="人類圖說明"
            lead="標題旁是欄位含義；意思說明依這份排盤解說此人。名詞可上網對照公開資料。"
            items={hdMeaningItems(chart)}
        />
    );
}

export function ZiweiMeaningCard({ chart }: { chart: ZiweiChart }) {
    return (
        <ChartMeaningCard
            heading="紫微斗數說明"
            lead="標題旁是宮位含義；意思說明依這份排盤的主星解說此人。名詞可上網對照公開資料。"
            items={ziweiMeaningItems(chart)}
        />
    );
}

export function BaziMeaningCard({ chart }: { chart: BaziChart }) {
    return (
        <ChartMeaningCard
            heading="八字說明"
            lead="標題旁是欄位含義；意思說明依這份排盤解說此人。名詞可上網對照公開資料。"
            items={baziMeaningItems(chart)}
        />
    );
}

export function AstroMeaningCard({ chart }: { chart: AstroChart }) {
    return (
        <ChartMeaningCard
            heading="星盤說明"
            lead="標題旁是欄位含義；意思說明依這份星盤解說此人。名詞可上網對照公開資料。"
            items={astroMeaningItems(chart)}
        />
    );
}

export function ChartMeaningCard({
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
        <section aria-labelledby={headingId} className="surface-card flex flex-col gap-5 p-5">
            <div className="flex flex-col gap-1">
                <h2 id={headingId} className="font-serif text-xl font-medium">
                    {heading}
                </h2>
                <p className="text-sm text-muted">{lead}</p>
            </div>
            <dl className="flex flex-col gap-5">
                {items.map((entry) => (
                    <div key={entry.term} className="flex flex-col gap-2">
                        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                            <dt className="font-medium">{entry.term}</dt>
                            <p className="min-w-0 flex-1 text-sm leading-relaxed text-muted">
                                {entry.field}
                            </p>
                        </div>
                        {entry.hook && (
                            <p className="border-l-2 border-accent pl-3 font-serif text-base text-fg">
                                「{entry.hook}」
                            </p>
                        )}
                        <dd className="grid grid-cols-[4.5rem_1fr] gap-x-3 rounded-md bg-surface-2 px-3 py-2 text-sm sm:grid-cols-[5.5rem_1fr]">
                            <span className="pt-0.5 text-xs tracking-wide text-muted">
                                意思說明
                            </span>
                            <MeaningText text={entry.meaning} />
                        </dd>
                    </div>
                ))}
            </dl>
        </section>
    );
}

// Lines starting with 【標題】 open a titled block; every other line is its own paragraph.
// Text without any 【】 heading keeps the plain pre-line rendering.
const HEADING = /^【([^】]+)】(.*)$/;

function MeaningText({ text }: { text: string }) {
    const lines = text.split('\n');
    if (!lines.some((l) => HEADING.test(l))) {
        return <p className="leading-relaxed whitespace-pre-line text-fg">{text}</p>;
    }
    const blocks: { title: string | null; paras: string[] }[] = [];
    for (const line of lines) {
        const m = HEADING.exec(line);
        if (m) blocks.push({ title: m[1], paras: m[2].trim() ? [m[2].trim()] : [] });
        else if (line.trim()) {
            if (blocks.length === 0) blocks.push({ title: null, paras: [] });
            blocks[blocks.length - 1].paras.push(line.trim());
        }
    }
    return (
        <div className="flex flex-col gap-4 text-fg">
            {blocks.map((b, i) => (
                <div key={i} className="flex flex-col gap-1.5">
                    {b.title && <h3 className="font-medium text-fg">{b.title}</h3>}
                    {b.paras.map((para, j) => (
                        <p key={j} className="leading-relaxed">
                            {para}
                        </p>
                    ))}
                </div>
            ))}
        </div>
    );
}
