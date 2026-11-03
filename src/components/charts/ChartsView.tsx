'use client';

import { Alert, Badge, Button, Modal, Stack, Tabs, Text } from '@mantine/core';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useState } from 'react';
import { loginUrl } from '@/lib/auth/redirect';
import { useAuth } from '@/lib/auth/useAuth';
import {
  normalizeChartMeta,
  toSavedRef,
  type ChartKind,
  type ChartMeta,
  type MetaErrors,
  type SavedChart,
} from '@/lib/charts/mapping';
import {
  deleteChart,
  listCharts,
  updateChart,
  type RepoResult,
} from '@/lib/charts/repo';
import { AUTHORITY_NAMES_ZH, TYPE_NAMES_ZH } from '@/lib/hd/constants';
import {
  attachSidecars,
  postBoth,
  saveStoredChart,
} from '@/lib/ui/chartClient';
import { ChartMetaFields } from './ChartMetaFields';

// /charts — the signed-in user's saved charts, in two tabs (我的 / 好友). Reads and writes go
// straight to Supabase from the browser; RLS restricts them to the user's own rows.

const TAB_KEY = 'hd-charts:tab';

export function readChartsTab(): ChartKind {
  try {
    return sessionStorage.getItem(TAB_KEY) === 'friend' ? 'friend' : 'self';
  } catch {
    return 'self';
  }
}

export function rememberChartsTab(kind: ChartKind) {
  try {
    sessionStorage.setItem(TAB_KEY, kind);
  } catch {
    // ignore
  }
}

interface ListState {
  userId: string;
  result: RepoResult<SavedChart[]>;
}

export function ChartsView() {
  const auth = useAuth();
  const router = useRouter();
  const [tab, setTab] = useState<ChartKind>(() =>
    typeof window === 'undefined' ? 'self' : readChartsTab(),
  );
  const [list, setList] = useState<ListState | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [editing, setEditing] = useState<SavedChart | null>(null);
  const [deleting, setDeleting] = useState<SavedChart | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const userId = auth.status === 'signedIn' ? auth.user.id : null;

  useEffect(() => {
    if (auth.status === 'signedOut') router.replace(loginUrl('/charts'));
  }, [auth.status, router]);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    void listCharts().then(result => {
      if (!cancelled) setList({ userId, result });
    });
    return () => {
      cancelled = true;
    };
  }, [userId, reloadKey]);

  if (auth.status === 'unavailable') {
    return <p className="text-muted">網站尚未設定會員功能。</p>;
  }
  if (!userId || !list || list.userId !== userId) return <ListSkeleton />;

  if (!list.result.ok) {
    return (
      <Alert
        variant="outline"
        color="var(--app-danger)"
        role="alert"
        title="無法載入命盤"
      >
        <Stack gap="sm">
          <span className="text-danger">{list.result.message}</span>
          <div>
            <Button
              size="xs"
              variant="default"
              onClick={() => setReloadKey(k => k + 1)}
            >
              重新載入
            </Button>
          </div>
        </Stack>
      </Alert>
    );
  }

  const charts = list.result.data;
  const counts = {
    self: charts.filter(c => c.kind === 'self').length,
    friend: charts.filter(c => c.kind === 'friend').length,
  };

  function replaceLocal(next: SavedChart) {
    setList(l =>
      l && l.result.ok
        ? {
            ...l,
            result: {
              ok: true,
              data: l.result.data.map(c => (c.id === next.id ? next : c)),
            },
          }
        : l,
    );
  }
  function removeLocal(id: string) {
    setList(l =>
      l && l.result.ok
        ? {
            ...l,
            result: { ok: true, data: l.result.data.filter(c => c.id !== id) },
          }
        : l,
    );
  }

  async function open(chart: SavedChart) {
    if (opening) return;
    setOpening(chart.id);
    setActionError(null);
    const { hd, ziwei, bazi } = await postBoth(chart.input, chart.timeUnknown);
    if (!hd.ok) {
      setOpening(null);
      setActionError(`無法開啟「${chart.name}」：${hd.error.message}`);
      return;
    }
    saveStoredChart(
      attachSidecars(
        {
          input: chart.input,
          result: hd.chart,
          timeUnknown: chart.timeUnknown,
          placeLabel: chart.placeLabel,
          saved: toSavedRef(chart),
        },
        ziwei,
        bazi,
      ),
    );
    router.push('/chart');
  }

  function changeTab(v: string | null) {
    const k: ChartKind = v === 'friend' ? 'friend' : 'self';
    setTab(k);
    rememberChartsTab(k);
  }

  return (
    <div className="flex flex-col gap-4">
      {actionError ? (
        <Alert
          variant="outline"
          color="var(--app-danger)"
          role="alert"
          withCloseButton
          onClose={() => setActionError(null)}
          closeButtonLabel="關閉"
        >
          <span className="text-danger">{actionError}</span>
        </Alert>
      ) : null}
      <Tabs value={tab} onChange={changeTab} className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <Tabs.List>
            <Tabs.Tab value="self" className="text-base">
              我的 <span className="text-sm text-muted">({counts.self})</span>
            </Tabs.Tab>
            <Tabs.Tab value="friend" className="text-base">
              好友 <span className="text-sm text-muted">({counts.friend})</span>
            </Tabs.Tab>
          </Tabs.List>
          <Button
            component={Link}
            href="/charts/new"
            onClick={() => rememberChartsTab(tab)}
            size="sm"
          >
            {tab === 'friend' ? '新增好友命盤' : '新增我的命盤'}
          </Button>
        </div>
        {(['self', 'friend'] as const).map(k => (
          <Tabs.Panel key={k} value={k}>
            {counts[k] === 0 ? (
              <EmptyState kind={k} />
            ) : (
              <ul className="grid gap-4 sm:grid-cols-2">
                {charts
                  .filter(c => c.kind === k)
                  .map(c => (
                    <ChartCard
                      key={c.id}
                      chart={c}
                      opening={opening === c.id}
                      disabled={opening !== null}
                      onOpen={() => open(c)}
                      onEdit={() => setEditing(c)}
                      onDelete={() => setDeleting(c)}
                    />
                  ))}
              </ul>
            )}
          </Tabs.Panel>
        ))}
      </Tabs>

      <EditDialog
        chart={editing}
        onClose={() => setEditing(null)}
        onSaved={replaceLocal}
      />
      <DeleteDialog
        chart={deleting}
        onClose={() => setDeleting(null)}
        onDeleted={removeLocal}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------

function summaryText(c: SavedChart): string | null {
  const parts = [
    c.summary.type ? TYPE_NAMES_ZH[c.summary.type] : null,
    c.summary.profile,
    c.summary.authority ? AUTHORITY_NAMES_ZH[c.summary.authority] : null,
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
}

function ChartCard({
  chart,
  opening,
  disabled,
  onOpen,
  onEdit,
  onDelete,
}: {
  chart: SavedChart;
  opening: boolean;
  disabled: boolean;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const summary = summaryText(chart);
  const titleId = `chart-${chart.id}-title`;
  return (
    <li
      aria-labelledby={titleId}
      className="surface-card flex flex-col gap-2 p-4"
    >
      <div className="flex items-start justify-between gap-2">
        <h2 id={titleId} className="break-all text-lg font-semibold">
          {chart.name}
        </h2>
        {chart.timeUnknown ? (
          <Badge variant="light" color="gray" radius="sm" className="shrink-0">
            時間不確定
          </Badge>
        ) : null}
      </div>
      {summary ? <p className="font-medium">{summary}</p> : null}
      <p className="flex flex-col gap-0.5 text-sm text-muted">
        <span>
          {chart.input.date} {chart.timeUnknown ? '' : chart.input.time}
        </span>
        <span>{chart.placeLabel ?? chart.input.timezone}</span>
      </p>
      {chart.note ? (
        <p className="whitespace-pre-line break-words text-sm">{chart.note}</p>
      ) : null}
      <div className="mt-auto flex flex-wrap gap-2 pt-2">
        <Button
          size="xs"
          onClick={onOpen}
          loading={opening}
          disabled={disabled && !opening}
          aria-describedby={titleId}
        >
          開啟
        </Button>
        <Button
          size="xs"
          variant="default"
          onClick={onEdit}
          disabled={disabled}
          aria-describedby={titleId}
        >
          編輯
        </Button>
        <Button
          size="xs"
          variant="subtle"
          color="var(--app-danger)"
          onClick={onDelete}
          disabled={disabled}
          aria-describedby={titleId}
        >
          <span className="text-danger">刪除</span>
        </Button>
      </div>
    </li>
  );
}

function EmptyState({ kind }: { kind: ChartKind }) {
  return (
    <div className="surface-card flex flex-col items-center gap-4 border-dashed p-8 text-center">
      {kind === 'self' ? (
        <>
          <div className="flex flex-col gap-2">
            <p className="font-medium">還沒有儲存自己的命盤</p>
            <p className="text-sm text-muted">
              在首頁排盤後，按結果頁的「儲存到帳號」即可存到這裡。
            </p>
          </div>
          <Button component={Link} href="/">
            到首頁排盤
          </Button>
        </>
      ) : (
        <>
          <div className="flex flex-col gap-2">
            <p className="font-medium">還沒有好友命盤</p>
            <p className="text-sm text-muted">
              輸入朋友的出生資料，就能把他的命盤存在你的帳號裡（朋友不需要註冊）。
            </p>
          </div>
          <Button
            component={Link}
            href="/charts/new"
            onClick={() => rememberChartsTab('friend')}
          >
            新增好友命盤
          </Button>
        </>
      )}
    </div>
  );
}

function ListSkeleton() {
  return (
    <div aria-busy="true" aria-live="polite" className="flex flex-col gap-6">
      <p className="sr-only">正在載入命盤…</p>
      <div className="hd-skeleton h-10 w-48 rounded-lg bg-surface-2" />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="hd-skeleton h-40 rounded-lg bg-surface-2" />
        <div className="hd-skeleton h-40 rounded-lg bg-surface-2" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function EditDialog({
  chart,
  onClose,
  onSaved,
}: {
  chart: SavedChart | null;
  onClose: () => void;
  onSaved: (c: SavedChart) => void;
}) {
  const ids = useId();
  const [forId, setForId] = useState<string | null>(null);
  const [meta, setMeta] = useState<ChartMeta>({
    kind: 'self',
    name: '',
    note: '',
  });
  const [errors, setErrors] = useState<MetaErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Reset the form when a different chart is opened (state derived from props, no effect needed).
  if (chart && chart.id !== forId) {
    setForId(chart.id);
    setMeta({ kind: chart.kind, name: chart.name, note: chart.note ?? '' });
    setErrors({});
    setError(null);
  }

  async function onSubmit(ev: React.FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    if (!chart || saving) return;
    const res = normalizeChartMeta(meta);
    if (!res.ok) {
      setErrors(res.errors);
      return;
    }
    setSaving(true);
    setError(null);
    const out = await updateChart(chart.id, res.value);
    setSaving(false);
    if (!out.ok) {
      setError(out.message);
      return;
    }
    onSaved(out.data);
    setForId(null);
    onClose();
  }

  function close() {
    setForId(null);
    onClose();
  }

  return (
    <Modal
      opened={chart !== null}
      onClose={close}
      title="編輯命盤"
      centered
      closeButtonProps={{ 'aria-label': '關閉' }}
      size="30rem"
      radius="md"
      styles={{
        title: { fontSize: 'var(--mantine-font-size-lg)', fontWeight: 600 },
      }}
    >
      <form onSubmit={onSubmit} noValidate aria-busy={saving}>
        <Stack gap="md">
          <ChartMetaFields
            idPrefix={ids}
            value={meta}
            onChange={setMeta}
            errors={errors}
          />
          {error ? (
            <Alert variant="outline" color="var(--app-danger)" role="alert">
              <span className="text-danger">{error}</span>
            </Alert>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button variant="subtle" onClick={close}>
              取消
            </Button>
            <Button type="submit" loading={saving}>
              儲存
            </Button>
          </div>
        </Stack>
      </form>
    </Modal>
  );
}

function DeleteDialog({
  chart,
  onClose,
  onDeleted,
}: {
  chart: SavedChart | null;
  onClose: () => void;
  onDeleted: (id: string) => void;
}) {
  const [shown, setShown] = useState<SavedChart | null>(chart);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Keep the last chart while the close transition runs.
  if (chart && chart !== shown) {
    setShown(chart);
    setError(null);
  }
  const current = chart ?? shown;

  async function confirm() {
    if (!current || busy) return;
    setBusy(true);
    setError(null);
    const out = await deleteChart(current.id);
    setBusy(false);
    if (!out.ok) {
      setError(out.message);
      return;
    }
    onDeleted(current.id);
    onClose();
  }

  return (
    <Modal
      opened={chart !== null}
      onClose={onClose}
      title="刪除命盤"
      centered
      closeButtonProps={{ 'aria-label': '關閉' }}
      size="28rem"
      radius="md"
      styles={{
        title: { fontSize: 'var(--mantine-font-size-lg)', fontWeight: 600 },
      }}
    >
      <Stack gap="md">
        <Text>確定要刪除「{current?.name}」嗎？刪除後無法復原。</Text>
        {error ? (
          <Alert variant="outline" color="var(--app-danger)" role="alert">
            <span className="text-danger">{error}</span>
          </Alert>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button variant="subtle" onClick={onClose}>
            取消
          </Button>
          <Button color="var(--app-danger)" onClick={confirm} loading={busy}>
            刪除
          </Button>
        </div>
      </Stack>
    </Modal>
  );
}
