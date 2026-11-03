'use client';

import { ActionIcon, Alert, Badge, Button, Modal, Stack, Text } from '@mantine/core';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useState, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
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
import { deleteChart, listCharts, updateChart, type RepoResult } from '@/lib/charts/repo';
import { AUTHORITY_NAMES_ZH, TYPE_NAMES_ZH } from '@/lib/hd/constants';
import { attachSidecars, postBoth, saveStoredChart } from '@/lib/ui/chartClient';
import { ChartMetaFields } from './ChartMetaFields';

// /charts — the signed-in user's saved charts. Own charts stay in the first block; friend charts
// grow in the second and paginate. Reads and writes go straight to Supabase from the browser; RLS
// restricts them to the user's own rows.

const TAB_KEY = 'hd-charts:tab';
const FRIEND_PAGE_SIZE = 20;

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
    const [friendPage, setFriendPage] = useState(1);
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
        void listCharts().then((result) => {
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
            <Alert variant="outline" color="var(--app-danger)" role="alert" title="無法載入命盤">
                <Stack gap="sm">
                    <span className="text-danger">{list.result.message}</span>
                    <div>
                        <Button
                            size="xs"
                            variant="default"
                            onClick={() => setReloadKey((k) => k + 1)}
                        >
                            重新載入
                        </Button>
                    </div>
                </Stack>
            </Alert>
        );
    }

    const charts = list.result.data;
    const selfCharts = charts.filter((c) => c.kind === 'self');
    const friendCharts = charts.filter((c) => c.kind === 'friend');
    const friendPages = Math.max(1, Math.ceil(friendCharts.length / FRIEND_PAGE_SIZE));
    const currentFriendPage = Math.min(friendPage, friendPages);
    const pagedFriends = friendCharts.slice(
        (currentFriendPage - 1) * FRIEND_PAGE_SIZE,
        currentFriendPage * FRIEND_PAGE_SIZE,
    );

    function replaceLocal(next: SavedChart) {
        setList((l) =>
            l && l.result.ok
                ? {
                      ...l,
                      result: {
                          ok: true,
                          data: l.result.data.map((c) => (c.id === next.id ? next : c)),
                      },
                  }
                : l,
        );
    }
    function removeLocal(id: string) {
        setList((l) =>
            l && l.result.ok
                ? {
                      ...l,
                      result: { ok: true, data: l.result.data.filter((c) => c.id !== id) },
                  }
                : l,
        );
    }

    async function open(chart: SavedChart) {
        if (opening) return;
        setOpening(chart.id);
        setActionError(null);
        try {
            const { hd, ziwei, bazi } = await postBoth(chart.input, chart.timeUnknown);
            if (!hd.ok) {
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
            flushSync(() => setOpening(null));
            router.push('/chart');
        } finally {
            setOpening(null);
        }
    }

    const cardProps = {
        openingId: opening,
        disabled: opening !== null,
        onOpen: open,
        onEdit: setEditing,
        onDelete: setDeleting,
    };

    return (
        <div className="flex flex-col gap-8">
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

            <ChartSection
                title="我的"
                count={selfCharts.length}
                addLabel="新增我的命盤"
                addKind="self"
                showAdd={selfCharts.length === 0}
            >
                {selfCharts.length === 0 ? (
                    <EmptyState kind="self" />
                ) : (
                    <ChartGrid charts={selfCharts} {...cardProps} />
                )}
            </ChartSection>

            <ChartSection
                title="好友"
                count={friendCharts.length}
                addLabel="新增好友命盤"
                addKind="friend"
            >
                {friendCharts.length === 0 ? (
                    <EmptyState kind="friend" />
                ) : (
                    <div className="flex flex-col gap-4">
                        <ChartGrid charts={pagedFriends} {...cardProps} />
                        <FriendPagination
                            page={currentFriendPage}
                            totalPages={friendPages}
                            total={friendCharts.length}
                            onPage={setFriendPage}
                        />
                    </div>
                )}
            </ChartSection>

            <EditDialog chart={editing} onClose={() => setEditing(null)} onSaved={replaceLocal} />
            <DeleteDialog
                chart={deleting}
                onClose={() => setDeleting(null)}
                onDeleted={removeLocal}
            />
        </div>
    );
}

// ---------------------------------------------------------------------------

function ChartSection({
    title,
    count,
    addLabel,
    addKind,
    showAdd = true,
    children,
}: {
    title: string;
    count: number;
    addLabel: string;
    addKind: ChartKind;
    showAdd?: boolean;
    children: ReactNode;
}) {
    return (
        <section className="flex flex-col gap-3" aria-labelledby={`charts-${addKind}`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
                <h2
                    id={`charts-${addKind}`}
                    className="font-serif text-xl font-medium tracking-wide"
                >
                    {title} <span className="text-sm font-normal text-muted">({count})</span>
                </h2>
                {showAdd ? (
                    <Button
                        component={Link}
                        href={`/charts/new?kind=${addKind}`}
                        size="sm"
                        onClick={() => rememberChartsTab(addKind)}
                    >
                        {addLabel}
                    </Button>
                ) : null}
            </div>
            {children}
        </section>
    );
}

function ChartGrid({
    charts,
    openingId,
    disabled,
    onOpen,
    onEdit,
    onDelete,
}: {
    charts: SavedChart[];
    openingId: string | null;
    disabled: boolean;
    onOpen: (c: SavedChart) => void;
    onEdit: (c: SavedChart) => void;
    onDelete: (c: SavedChart) => void;
}) {
    return (
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {charts.map((c) => (
                <ChartCard
                    key={c.id}
                    chart={c}
                    opening={openingId === c.id}
                    disabled={disabled}
                    onOpen={() => onOpen(c)}
                    onEdit={() => onEdit(c)}
                    onDelete={() => onDelete(c)}
                />
            ))}
        </ul>
    );
}

function FriendPagination({
    page,
    totalPages,
    total,
    onPage,
}: {
    page: number;
    totalPages: number;
    total: number;
    onPage: (p: number) => void;
}) {
    if (totalPages <= 1) return null;
    return (
        <nav aria-label="好友命盤分頁" className="flex flex-wrap items-center justify-center gap-3">
            <Button
                size="sm"
                variant="default"
                disabled={page <= 1}
                onClick={() => onPage(page - 1)}
            >
                上一頁
            </Button>
            <p className="text-sm text-muted">
                第 {page} / {totalPages} 頁（共 {total} 份）
            </p>
            <Button
                size="sm"
                variant="default"
                disabled={page >= totalPages}
                onClick={() => onPage(page + 1)}
            >
                下一頁
            </Button>
        </nav>
    );
}

function summaryText(c: SavedChart): string | null {
    const parts = [
        c.summary.type ? TYPE_NAMES_ZH[c.summary.type] : null,
        c.summary.profile,
        c.summary.authority ? AUTHORITY_NAMES_ZH[c.summary.authority] : null,
    ].filter(Boolean);
    return parts.length ? parts.join(' · ') : null;
}

function TrashIcon() {
    return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M4 7h16" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
            <path
                d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinejoin="round"
            />
            <path
                d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinejoin="round"
            />
            <path
                d="M10 11v6M14 11v6"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
            />
        </svg>
    );
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
        <li aria-labelledby={titleId} className="surface-card flex flex-col gap-2 p-4">
            <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 flex-1 items-start gap-2">
                    <h2 id={titleId} className="break-all text-lg font-semibold">
                        {chart.name}
                    </h2>
                    {chart.timeUnknown ? (
                        <Badge variant="light" color="gray" radius="sm" className="shrink-0">
                            時間不確定
                        </Badge>
                    ) : null}
                </div>
                <ActionIcon
                    size="lg"
                    variant="subtle"
                    color="var(--app-danger)"
                    onClick={onDelete}
                    disabled={disabled}
                    aria-label="刪除"
                    aria-describedby={titleId}
                    className="-mr-1.5 -mt-1.5 shrink-0 text-danger"
                >
                    <TrashIcon />
                </ActionIcon>
            </div>
            {summary ? <p className="font-medium">{summary}</p> : null}
            {chart.placeLabel || chart.input.timezone ? (
                <p className="text-sm text-muted">{chart.placeLabel ?? chart.input.timezone}</p>
            ) : null}
            {chart.note ? (
                <p className="whitespace-pre-line break-words text-sm">{chart.note}</p>
            ) : null}
            <div className="mt-auto flex gap-2 pt-2">
                <Button
                    size="md"
                    className="flex-1"
                    onClick={onOpen}
                    loading={opening}
                    disabled={disabled && !opening}
                    aria-describedby={titleId}
                >
                    開啟
                </Button>
                <Button
                    size="md"
                    className="flex-1"
                    variant="default"
                    onClick={onEdit}
                    disabled={disabled}
                    aria-describedby={titleId}
                >
                    編輯
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
                        href="/charts/new?kind=friend"
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
        <div aria-busy="true" aria-live="polite" className="flex flex-col gap-8">
            <p className="sr-only">正在載入命盤…</p>
            <div className="flex flex-col gap-3">
                <div className="hd-skeleton h-8 w-32 rounded-lg bg-surface-2" />
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="hd-skeleton h-40 rounded-lg bg-surface-2" />
                    <div className="hd-skeleton h-40 rounded-lg bg-surface-2" />
                </div>
            </div>
            <div className="flex flex-col gap-3">
                <div className="hd-skeleton h-8 w-32 rounded-lg bg-surface-2" />
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="hd-skeleton h-40 rounded-lg bg-surface-2" />
                    <div className="hd-skeleton h-40 rounded-lg bg-surface-2" />
                </div>
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
