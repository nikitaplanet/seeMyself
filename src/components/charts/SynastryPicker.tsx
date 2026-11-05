'use client';

import { Alert, Button, Select } from '@mantine/core';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { flushSync } from 'react-dom';
import { CHART_KIND_NAMES_ZH, type SavedChart } from '@/lib/charts/mapping';
import { computeSynastryPerson, saveStoredSynastry } from '@/lib/ui/chartClient';

// 命盤列表 → 雙人合盤 tab: pick two different saved charts, compute every system for both (all
// requests in parallel), hand the result to /charts/synastry through sessionStorage.

export const SYNASTRY_PATH = '/charts/synastry';

function selectData(charts: SavedChart[], otherId: string | null) {
    return (['self', 'friend'] as const)
        .map((kind) => ({
            group: CHART_KIND_NAMES_ZH[kind],
            items: charts
                .filter((c) => c.kind === kind)
                .map((c) => ({
                    value: c.id,
                    label: c.timeUnknown ? `${c.name}（時間不確定）` : c.name,
                    // The same chart cannot be picked twice.
                    disabled: c.id === otherId,
                })),
        }))
        .filter((g) => g.items.length > 0);
}

export function SynastryPicker({
    charts,
    onRememberFriendTab,
}: {
    charts: SavedChart[];
    onRememberFriendTab: () => void;
}) {
    const router = useRouter();
    const [aId, setAId] = useState<string | null>(null);
    const [bId, setBId] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Drop a pick whose chart was deleted in the other tab.
    const a = charts.find((c) => c.id === aId) ?? null;
    const b = charts.find((c) => c.id === bId) ?? null;

    if (charts.length < 2) {
        return (
            <div className="surface-card flex flex-col items-center gap-4 border-dashed p-8 text-center">
                <div className="flex flex-col gap-2">
                    <p className="font-medium">至少需要兩份命盤才能合盤</p>
                    <p className="text-sm text-muted">
                        {charts.length === 0
                            ? '先儲存自己的命盤，再新增一位好友的命盤，就能看兩人的合盤。'
                            : '再新增一位好友的命盤（朋友不需要註冊），就能看兩人的合盤。'}
                    </p>
                </div>
                <Button
                    component={Link}
                    href="/charts/new?kind=friend"
                    onClick={onRememberFriendTab}
                >
                    新增好友命盤
                </Button>
            </div>
        );
    }

    async function start() {
        if (!a || !b || a.id === b.id || busy) return;
        setBusy(true);
        setError(null);
        try {
            const [ra, rb] = await Promise.all([
                computeSynastryPerson(a),
                computeSynastryPerson(b),
            ]);
            if (!ra.ok || !rb.ok) {
                const msgs = [ra, rb].flatMap((r) => (r.ok ? [] : [r.message]));
                setError(`無法排出合盤：${msgs.join('；')}`);
                return;
            }
            saveStoredSynastry({ a: ra.person, b: rb.person });
            // Cache Components keeps this page alive (hidden) after navigating; clear the
            // spinner synchronously so coming back shows a usable button.
            flushSync(() => setBusy(false));
            router.push(SYNASTRY_PATH);
        } finally {
            setBusy(false);
        }
    }

    const ready = a !== null && b !== null && a.id !== b.id;

    return (
        <section
            aria-labelledby="synastry-pick-title"
            aria-busy={busy}
            className="surface-card flex flex-col gap-5 p-5"
        >
            <div className="flex flex-col gap-1">
                <h2 id="synastry-pick-title" className="font-serif text-xl font-medium tracking-wide">
                    選擇兩份命盤
                </h2>
                <p className="text-sm text-muted">
                    從你儲存的命盤中選兩位，比較人類圖、紫微斗數、八字與星盤的合盤。結果只暫存在這個分頁。
                </p>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Select
                    label="第一位"
                    placeholder="選擇命盤"
                    data={selectData(charts, b?.id ?? null)}
                    value={a?.id ?? null}
                    onChange={setAId}
                    disabled={busy}
                    searchable
                    nothingFoundMessage="找不到這個名字"
                    allowDeselect={false}
                    comboboxProps={{ withinPortal: true }}
                />
                <Select
                    label="第二位"
                    placeholder="選擇命盤"
                    data={selectData(charts, a?.id ?? null)}
                    value={b?.id ?? null}
                    onChange={setBId}
                    disabled={busy}
                    searchable
                    nothingFoundMessage="找不到這個名字"
                    allowDeselect={false}
                    comboboxProps={{ withinPortal: true }}
                />
            </div>
            {error ? (
                <Alert
                    variant="outline"
                    color="var(--app-danger)"
                    role="alert"
                    withCloseButton
                    onClose={() => setError(null)}
                    closeButtonLabel="關閉"
                >
                    <span className="text-danger">{error}</span>
                </Alert>
            ) : null}
            <div className="flex flex-wrap items-center justify-end gap-3">
                {!ready ? <p className="text-sm text-muted">請選擇兩份不同的命盤。</p> : null}
                <Button size="md" onClick={() => void start()} loading={busy} disabled={!ready}>
                    開始合盤
                </Button>
            </div>
        </section>
    );
}
