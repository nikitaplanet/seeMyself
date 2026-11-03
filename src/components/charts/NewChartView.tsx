'use client';

import { Paper, Stack } from '@mantine/core';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useState } from 'react';
import { BirthForm } from '@/components/BirthForm';
import { loginUrl } from '@/lib/auth/redirect';
import { useAuth } from '@/lib/auth/useAuth';
import {
  normalizeChartMeta,
  type ChartMeta,
  type MetaErrors,
} from '@/lib/charts/mapping';
import { insertChart } from '@/lib/charts/repo';
import type { StoredChart } from '@/lib/ui/chartClient';
import { ChartMetaFields } from './ChartMetaFields';
import { readChartsTab, rememberChartsTab } from './ChartsView';

// /charts/new — enter someone's birth data (usually a friend's) and save the computed chart straight
// to the account. Reuses BirthForm; only the "after calculation" step differs.

export function NewChartView() {
  const auth = useAuth();
  const router = useRouter();
  const ids = useId();
  const [meta, setMeta] = useState<ChartMeta>(() => ({
    kind: typeof window === 'undefined' ? 'friend' : readChartsTab(),
    name: '',
    note: '',
  }));
  const [errors, setErrors] = useState<MetaErrors>({});

  useEffect(() => {
    if (auth.status === 'signedOut') router.replace(loginUrl('/charts/new'));
  }, [auth.status, router]);

  if (auth.status === 'unavailable')
    return <p className="text-muted">網站尚未設定會員功能。</p>;
  if (auth.status !== 'signedIn')
    return (
      <div
        aria-hidden="true"
        className="hd-skeleton h-96 rounded-lg bg-surface-2"
      />
    );

  function validateExtra(): boolean {
    const res = normalizeChartMeta(meta);
    setErrors(res.ok ? {} : res.errors);
    if (!res.ok) document.getElementById(`${ids}-name`)?.focus();
    return res.ok;
  }

  async function onComputed(chart: StoredChart): Promise<string | null> {
    const res = normalizeChartMeta(meta);
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
      <Paper withBorder radius="md" className="p-5 sm:p-8">
        <BirthForm
          submitLabel="計算並儲存"
          validateExtra={validateExtra}
          onComputed={onComputed}
          header={
            <Stack gap="lg" className="border-b border-border pb-6">
              <ChartMetaFields
                idPrefix={ids}
                value={meta}
                onChange={setMeta}
                errors={errors}
              />
            </Stack>
          }
        />
      </Paper>
      <p className="text-sm">
        <Link href="/charts" className="underline hover:text-accent">
          返回我的命盤
        </Link>
      </p>
    </div>
  );
}
