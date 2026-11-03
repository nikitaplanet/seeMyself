'use client';

import { Stack } from '@mantine/core';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useId, useState } from 'react';
import { BirthForm } from '@/components/BirthForm';
import { loginUrl } from '@/lib/auth/redirect';
import { useAuth } from '@/lib/auth/useAuth';
import {
    normalizeChartMeta,
    type ChartKind,
    type ChartMeta,
    type MetaErrors,
} from '@/lib/charts/mapping';
import { insertChart } from '@/lib/charts/repo';
import type { StoredChart } from '@/lib/ui/chartClient';
import { ChartMetaFields } from './ChartMetaFields';
import { rememberChartsTab } from './ChartsView';

// /charts/new?kind=self|friend — kind is fixed by the link that opened this page.

const COPY: Record<ChartKind, { title: string; intro: string }> = {
    self: {
        title: '新增我的命盤',
        intro: '輸入自己的出生資料並取一個名稱，計算後會直接儲存到你的帳號。',
    },
    friend: {
        title: '新增好友命盤',
        intro: '輸入朋友的出生資料並取一個名稱，計算後會直接儲存到你的帳號。朋友不需要註冊帳號。',
    },
};

function kindFromParam(raw: string | null): ChartKind {
    return raw === 'self' ? 'self' : 'friend';
}

export function NewChartView() {
    const auth = useAuth();
    const router = useRouter();
    const params = useSearchParams();
    const kind = kindFromParam(params.get('kind'));
    const ids = useId();
    const [meta, setMeta] = useState<ChartMeta>(() => ({
        kind,
        name: '',
        note: '',
    }));
    const [errors, setErrors] = useState<MetaErrors>({});

    useEffect(() => {
        setMeta((m) => (m.kind === kind ? m : { ...m, kind }));
    }, [kind]);

    useEffect(() => {
        if (auth.status === 'signedOut') {
            router.replace(loginUrl(`/charts/new?kind=${kind}`));
        }
    }, [auth.status, kind, router]);

    if (auth.status === 'unavailable') return <p className="text-muted">網站尚未設定會員功能。</p>;
    if (auth.status !== 'signedIn')
        return <div aria-hidden="true" className="hd-skeleton h-96 rounded-lg bg-surface-2" />;

    const copy = COPY[kind];

    function validateExtra(): boolean {
        const res = normalizeChartMeta({ ...meta, kind });
        setErrors(res.ok ? {} : res.errors);
        if (!res.ok) document.getElementById(`${ids}-name`)?.focus();
        return res.ok;
    }

    async function onComputed(chart: StoredChart): Promise<string | null> {
        const res = normalizeChartMeta({ ...meta, kind });
        if (!res.ok) {
            setErrors(res.errors);
            return '請先修正名稱或備註。';
        }
        const out = await insertChart(chart, res.value);
        if (!out.ok) return out.message;
        rememberChartsTab(res.value.kind);
        router.push('/charts');
        return null;
    }

    return (
        <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-2">
                <h1 className="font-serif text-3xl font-medium tracking-wide">{copy.title}</h1>
                <p className="text-muted">{copy.intro}</p>
            </div>
            <BirthForm
                submitLabel="計算並儲存"
                validateExtra={validateExtra}
                onComputed={onComputed}
                header={
                    <Stack gap="lg" className="border-b border-border pb-6">
                        <ChartMetaFields
                            idPrefix={ids}
                            value={{ ...meta, kind }}
                            onChange={setMeta}
                            errors={errors}
                            showKind={false}
                        />
                    </Stack>
                }
            />
            <p className="text-sm">
                <Link href="/charts" className="underline hover:text-accent">
                    返回命盤列表
                </Link>
            </p>
        </div>
    );
}
