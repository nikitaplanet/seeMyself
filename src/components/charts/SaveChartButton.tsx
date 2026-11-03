'use client';

import { Alert, Button, Modal, Stack, Text } from '@mantine/core';
import { useRouter } from 'next/navigation';
import { useId, useState, useSyncExternalStore } from 'react';
import { MantineRoot } from '@/components/MantineRoot';
import { loginUrl } from '@/lib/auth/redirect';
import { useAuth } from '@/lib/auth/useAuth';
import {
    normalizeChartMeta,
    toSavedRef,
    type ChartMeta,
    type MetaErrors,
} from '@/lib/charts/mapping';
import { insertChart } from '@/lib/charts/repo';
import {
    readPendingSave,
    saveStoredChart,
    setPendingSave,
    subscribePendingSave,
    type StoredChart,
} from '@/lib/ui/chartClient';
import { ChartMetaFields } from './ChartMetaFields';

// "儲存到帳號" on the result page. Logged out → the dialog asks to log in; the chart stays in this
// tab's sessionStorage and a pending flag reopens the dialog when the user returns signed in.

const EMPTY_META: ChartMeta = { kind: 'self', name: '', note: '' };
const noPending = () => false;

export function SaveChartButton({ stored }: { stored: StoredChart }) {
    return (
        <MantineRoot>
            <SaveChartInner stored={stored} />
        </MantineRoot>
    );
}

function SaveChartInner({ stored }: { stored: StoredChart }) {
    const auth = useAuth();
    const router = useRouter();
    const ids = useId();
    const pending = useSyncExternalStore(subscribePendingSave, readPendingSave, noPending);
    const [manualOpen, setManualOpen] = useState(false);
    const [meta, setMeta] = useState<ChartMeta>(EMPTY_META);
    const [errors, setErrors] = useState<MetaErrors>({});
    const [saveError, setSaveError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [justSaved, setJustSaved] = useState(false);

    if (auth.status === 'unavailable') return null;

    const saved = stored.saved ?? null;
    // Reopen automatically after "log in and come back".
    const opened = !saved && (manualOpen || (pending && auth.status === 'signedIn'));

    function close() {
        setManualOpen(false);
        if (pending) setPendingSave(false);
        setSaveError(null);
    }

    function goLogin() {
        setPendingSave(true);
        setManualOpen(false);
        router.push(loginUrl('/chart'));
    }

    async function onSave(ev: React.FormEvent<HTMLFormElement>) {
        ev.preventDefault();
        if (saving) return;
        const res = normalizeChartMeta(meta);
        if (!res.ok) {
            setErrors(res.errors);
            return;
        }
        setErrors({});
        setSaveError(null);
        setSaving(true);
        const out = await insertChart(stored, res.value);
        setSaving(false);
        if (!out.ok) {
            setSaveError(out.message);
            return;
        }
        setPendingSave(false);
        setManualOpen(false);
        setJustSaved(true);
        saveStoredChart({ ...stored, saved: toSavedRef(out.data) });
    }

    if (saved) {
        return (
            <p className="text-sm font-medium text-accent" role={justSaved ? 'status' : undefined}>
                ✓ 已儲存
            </p>
        );
    }

    return (
        <>
            <Button
                variant="default"
                size="sm"
                onClick={() => setManualOpen(true)}
                disabled={auth.status === 'loading'}
            >
                儲存到帳號
            </Button>
            <Modal
                opened={opened}
                onClose={close}
                title="儲存到帳號"
                centered
                closeButtonProps={{ 'aria-label': '關閉' }}
                size="30rem"
                radius="md"
                styles={{ title: { fontSize: 'var(--mantine-font-size-lg)', fontWeight: 600 } }}
            >
                {auth.status === 'signedIn' ? (
                    <form onSubmit={onSave} noValidate aria-busy={saving}>
                        <Stack gap="md">
                            <ChartMetaFields
                                idPrefix={ids}
                                value={meta}
                                onChange={setMeta}
                                errors={errors}
                            />
                            {saveError ? (
                                <Alert variant="outline" color="var(--app-danger)" role="alert">
                                    <span className="text-danger">{saveError}</span>
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
                ) : (
                    <Stack gap="md">
                        <Text>
                            登入後即可把這張命盤儲存到帳號，之後隨時打開，不必重新輸入出生資料。
                        </Text>
                        <Text size="sm" c="dimmed">
                            目前的排盤結果會保留在這個分頁；登入完成後會回到這裡繼續儲存。
                        </Text>
                        <div className="flex justify-end gap-2">
                            <Button variant="subtle" onClick={close}>
                                取消
                            </Button>
                            <Button onClick={goLogin}>登入／註冊</Button>
                        </div>
                    </Stack>
                )}
            </Modal>
        </>
    );
}
