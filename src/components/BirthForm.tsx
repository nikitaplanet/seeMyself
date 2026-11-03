'use client';

import {
    Alert,
    Button,
    Checkbox,
    Collapse,
    Modal,
    NativeSelect,
    Radio,
    Select,
    Skeleton,
    Stack,
    Text,
    UnstyledButton,
} from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { useRouter } from 'next/navigation';
import { useId, useLayoutEffect, useRef, useState } from 'react';
import { DEFAULT_SENSITIVITY_MINUTES, MAX_DATE, MIN_DATE } from '@/lib/hd/constants';
import type { BirthInput, Gender, NodeMode } from '@/lib/hd/types';
import {
    attachSidecars,
    formatOffset,
    formatUtc,
    postBoth,
    saveStoredChart,
    type StoredChart,
} from '@/lib/ui/chartClient';
import { PlaceAutocomplete, placeLabel, type PlaceOption } from './PlaceAutocomplete';

// Spec §11.1 — the input page form.

/** §4.5: "time unknown" computes at local 12:00 with ±6 h / ±12 h sensitivity offsets. */
const UNKNOWN_TIME = '12:00';
const UNKNOWN_TIME_OFFSETS = [-720, -360, 360, 720];

/** §11.1 — exact inline message for NONEXISTENT_LOCAL_TIME. */
const NONEXISTENT_MESSAGE = '這個時間因夏令時間調整而不存在，請確認出生證明上的時間。';

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));
// Empty value = unset; the placeholder option doubles as the visible "時" / "分" prompt.
const HOUR_OPTIONS = [{ value: '', label: '時' }, ...HOURS.map((h) => ({ value: h, label: h }))];
const MINUTE_OPTIONS = [
    { value: '', label: '分' },
    ...MINUTES.map((m) => ({ value: m, label: m })),
];

function CalendarIcon() {
    return (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <rect
                x="2"
                y="3"
                width="12"
                height="11"
                rx="2"
                stroke="currentColor"
                strokeWidth="1.5"
            />
            <path d="M2 6.5h12" stroke="currentColor" strokeWidth="1.5" />
            <path
                d="M5 1.5v3M11 1.5v3"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
            />
        </svg>
    );
}

/** Accessible names for the calendar's otherwise icon-only navigation buttons. */
const CALENDAR_ARIA_LABELS = {
    monthLevelControl: '切換到年份檢視',
    yearLevelControl: '切換到年代檢視',
    nextMonth: '下個月',
    previousMonth: '上個月',
    nextYear: '下一年',
    previousYear: '上一年',
    nextDecade: '下一個十年',
    previousDecade: '上一個十年',
};

/** Sentinel for the timezone Select's "automatic" option (Mantine Select values cannot be empty). */
const AUTO_TZ = 'auto';

interface FieldErrors {
    date?: string;
    time?: string;
    place?: string;
    gender?: string;
}

interface AmbiguousState {
    input: BirthInput;
    candidates: [string, string];
}

function isValidDate(s: string): boolean {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (!m) return false;
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    const dt = new Date(Date.UTC(y, mo - 1, d));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

function listTimezones(): string[] {
    try {
        const zones = Intl.supportedValuesOf('timeZone');
        return zones.includes('UTC') ? zones : [...zones, 'UTC'];
    } catch {
        return ['UTC'];
    }
}

export interface BirthFormProps {
    /** Extra fields rendered at the top of the form (e.g. name / note when adding a friend's chart). */
    header?: React.ReactNode;
    /** Runs on submit before the birth-data checks; return false to stop (the caller shows its errors). */
    validateExtra?: () => boolean;
    /**
     * Replaces the default "store in sessionStorage and open /chart" step after a successful
     * calculation. Resolve to an error message to show in the form, or null when done.
     */
    onComputed?: (chart: StoredChart) => Promise<string | null>;
    submitLabel?: string;
}

export function BirthForm({
    header,
    validateExtra,
    onComputed,
    submitLabel = '開始排盤',
}: BirthFormProps = {}) {
    const router = useRouter();
    const ids = useId();
    const [date, setDate] = useState('');
    const [hour, setHour] = useState('');
    const [minute, setMinute] = useState('');
    const [gender, setGender] = useState<Gender | ''>('female');
    const [timeUnknown, setTimeUnknown] = useState(false);
    const [place, setPlace] = useState<PlaceOption | null>(null);
    const [advancedOpen, setAdvancedOpen] = useState(false);
    const [timezones, setTimezones] = useState<string[] | null>(null);
    const [manualTz, setManualTz] = useState('');
    const [nodeMode, setNodeMode] = useState<NodeMode>('true');
    const [errors, setErrors] = useState<FieldErrors>({});
    const [formError, setFormError] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [ambiguous, setAmbiguous] = useState<AmbiguousState | null>(null);
    const hourRef = useRef<HTMLSelectElement>(null);
    const minuteRef = useRef<HTMLSelectElement>(null);

    const dateId = `${ids}-date`;
    const genderId = `${ids}-gender`;
    const hourId = `${ids}-hour`;
    const minuteId = `${ids}-minute`;
    const timeErrId = `${ids}-time-err`;
    const placeId = `${ids}-place`;
    const advancedId = `${ids}-advanced`;
    const tzId = `${ids}-tz`;

    // Mantine inputs only take aria-describedby from their own wrapper (label/description/error), and
    // the time error is shared by both selects, so point them at it directly.
    useLayoutEffect(() => {
        for (const el of [hourRef.current, minuteRef.current]) {
            if (!el) continue;
            if (errors.time) el.setAttribute('aria-describedby', timeErrId);
            else el.removeAttribute('aria-describedby');
        }
    }, [errors.time, timeErrId]);

    function toggleAdvanced() {
        if (!advancedOpen && timezones === null) setTimezones(listTimezones());
        setAdvancedOpen((o) => !o);
    }

    function validate(): FieldErrors {
        const e: FieldErrors = {};
        if (!date) e.date = '請輸入出生日期。';
        else if (!isValidDate(date)) e.date = '請輸入正確的日期。';
        else if (date < MIN_DATE || date > MAX_DATE)
            e.date = `出生日期須介於 ${MIN_DATE} 與 ${MAX_DATE} 之間。`;
        if (!timeUnknown && (hour === '' || minute === ''))
            e.time = '請選擇出生時間的「時」與「分」，或勾選「出生時間不確定」。';
        // SPEC-QUESTION: §11.1 marks the place as required, but §4.2 offers the manual timezone to
        // users who cannot find their birthplace. We accept a manual timezone without a place (the
        // place only determines the timezone anyway, §4) and omit `place` from the request.
        if (!place && !manualTz) e.place = '請從清單中選擇出生地點，或在「進階」手動選擇時區。';
        if (gender !== 'male' && gender !== 'female')
            e.gender = '紫微斗數與八字排盤需要性別，請選擇男或女。';
        return e;
    }

    async function send(input: BirthInput) {
        setSubmitting(true);
        setFormError(null);
        const { hd, ziwei, bazi } = await postBoth(input, timeUnknown);
        if (hd.ok) {
            const stored = attachSidecars(
                {
                    input,
                    result: hd.chart,
                    timeUnknown,
                    placeLabel: place ? placeLabel(place) : null,
                },
                ziwei,
                bazi,
            );
            if (onComputed) {
                const err = await onComputed(stored);
                if (err) {
                    setSubmitting(false);
                    setFormError(err);
                }
                return; // on success the caller navigates; keep the submitting state
            }
            saveStoredChart(stored);
            router.push('/chart');
            return; // keep the submitting state while navigating
        }
        setSubmitting(false);
        const { code, message, details } = hd.error;
        if (code === 'AMBIGUOUS_LOCAL_TIME') {
            const c = details?.candidates;
            if (
                Array.isArray(c) &&
                c.length === 2 &&
                typeof c[0] === 'string' &&
                typeof c[1] === 'string'
            ) {
                setAmbiguous({ input, candidates: [c[0], c[1]] });
                return;
            }
        }
        if (code === 'NONEXISTENT_LOCAL_TIME') {
            setErrors((e) => ({ ...e, time: NONEXISTENT_MESSAGE }));
            document.getElementById(hourId)?.focus();
            return;
        }
        setFormError(message);
    }

    async function onSubmit(ev: React.FormEvent<HTMLFormElement>) {
        ev.preventDefault();
        if (submitting) return;
        const extraOk = validateExtra ? validateExtra() : true;
        const e = validate();
        setErrors(e);
        setFormError(null);
        if (!extraOk) return;
        if (e.date || e.time || e.place || e.gender) {
            const first = e.date ? dateId : e.gender ? genderId : e.time ? hourId : placeId;
            document.getElementById(first)?.focus();
            return;
        }
        const timezone = manualTz || place?.timezone || '';
        const input: BirthInput = {
            date,
            time: timeUnknown ? UNKNOWN_TIME : `${hour}:${minute}`,
            timezone,
            gender: gender === 'female' ? 'female' : 'male',
            ...(place
                ? {
                      place: {
                          name: place.nameZh ?? place.name,
                          lat: place.lat,
                          lon: place.lon,
                          countryCode: place.countryCode,
                      },
                  }
                : {}),
            options: {
                nodeMode,
                sensitivityMinutes: timeUnknown
                    ? UNKNOWN_TIME_OFFSETS
                    : [...DEFAULT_SENSITIVITY_MINUTES],
            },
        };
        await send(input);
    }

    function chooseCandidate(which: 'earlier' | 'later') {
        if (!ambiguous) return;
        const input: BirthInput = {
            ...ambiguous.input,
            options: { ...ambiguous.input.options, disambiguation: which },
        };
        setAmbiguous(null);
        void send(input);
    }

    const effectiveTz = manualTz || place?.timezone || null;
    const tzOptions = [
        { value: AUTO_TZ, label: '依出生地點自動判斷' },
        ...(timezones ?? []).map((tz) => ({ value: tz, label: tz })),
    ];

    return (
        <>
            <form
                onSubmit={onSubmit}
                noValidate
                className="flex flex-col gap-8"
                aria-busy={submitting}
            >
                {header}
                {/* 出生日期 */}
                <DatePickerInput
                    id={dateId}
                    size="md"
                    label="出生日期（西元）"
                    labelProps={{ className: `font-medium${errors.date ? ' text-danger' : ''}` }}
                    placeholder="選擇日期"
                    required
                    withAsterisk={false}
                    minDate={MIN_DATE}
                    maxDate={MAX_DATE}
                    defaultLevel="decade"
                    defaultDate={date || '1990-01-01'}
                    valueFormat="YYYY年M月D日"
                    value={date || null}
                    onChange={(v) => {
                        setDate(v ?? '');
                        setErrors((x) => ({ ...x, date: undefined }));
                    }}
                    popoverProps={{ position: 'bottom-start' }}
                    ariaLabels={CALENDAR_ARIA_LABELS}
                    error={errors.date}
                    leftSection={<CalendarIcon />}
                    leftSectionPointerEvents="none"
                    rightSection={<span aria-hidden="true">▾</span>}
                    rightSectionPointerEvents="none"
                    classNames={{ input: 'cursor-pointer font-medium' }}
                    styles={{
                        root: { display: 'flex', flexDirection: 'column', gap: '1rem' },
                        label: { marginBottom: 0 },
                        error: { fontSize: 'var(--mantine-font-size-sm)' },
                        input: { cursor: 'pointer' },
                        placeholder: { color: 'var(--app-fg)', fontWeight: 500 },
                    }}
                    className="sm:w-64"
                />

                <Radio.Group
                    id={genderId}
                    label="性別"
                    labelProps={{ className: `font-medium${errors.gender ? ' text-danger' : ''}` }}
                    description=""
                    inputWrapperOrder={['label', 'input', 'description', 'error']}
                    styles={{
                        root: { display: 'flex', flexDirection: 'column', gap: '1rem' },
                        label: { marginBottom: 0 },
                        description: { fontSize: 'var(--mantine-font-size-sm)' },
                        error: { fontSize: 'var(--mantine-font-size-sm)' },
                    }}
                    name="gender"
                    size="md"
                    value={gender}
                    onChange={(v) => {
                        setGender(v === 'female' ? 'female' : v === 'male' ? 'male' : '');
                        setErrors((x) => ({ ...x, gender: undefined }));
                    }}
                    error={errors.gender}
                >
                    <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                        <Radio size="sm" value="female" label="女" />
                        <Radio size="sm" value="male" label="男" />
                    </div>
                </Radio.Group>

                {/* 出生時間 */}
                <fieldset
                    aria-describedby={errors.time ? timeErrId : undefined}
                    className="flex flex-col gap-4"
                >
                    <legend className="contents">
                        <span className={`font-medium${errors.time ? ' text-danger' : ''}`}>
                            出生時間（24 小時制，當地時間）
                        </span>
                    </legend>
                    <div className="flex flex-wrap items-center gap-2">
                        <NativeSelect
                            ref={hourRef}
                            id={hourId}
                            size="md"
                            label="時"
                            labelProps={{ className: 'sr-only' }}
                            data={HOUR_OPTIONS}
                            value={hour}
                            disabled={timeUnknown}
                            onChange={(e) => {
                                setHour(e.currentTarget.value);
                                setErrors((x) => ({ ...x, time: undefined }));
                            }}
                        />
                        <span aria-hidden="true">:</span>
                        <NativeSelect
                            ref={minuteRef}
                            id={minuteId}
                            size="md"
                            label="分"
                            labelProps={{ className: 'sr-only' }}
                            data={MINUTE_OPTIONS}
                            value={minute}
                            disabled={timeUnknown}
                            onChange={(e) => {
                                setMinute(e.currentTarget.value);
                                setErrors((x) => ({ ...x, time: undefined }));
                            }}
                        />
                    </div>
                    <Checkbox
                        size="sm"
                        radius={4}
                        checked={timeUnknown}
                        onChange={(e) => {
                            setTimeUnknown(e.currentTarget.checked);
                            setErrors((x) => ({ ...x, time: undefined }));
                        }}
                        label="出生時間不確定"
                        description="以當地中午 12:00 計算，並檢查前後 6 與 12 小時的差異，讓你知道哪些結果可信。"
                        styles={{
                            body: { alignItems: 'flex-start' },
                            inner: {
                                display: 'flex',
                                alignItems: 'center',
                                minHeight: '1.5em',
                            },
                            input: { borderRadius: 4 },
                            label: { fontSize: '1rem', lineHeight: 1.5 },
                            description: { fontSize: 'var(--mantine-font-size-sm)' },
                        }}
                    />
                    {errors.time ? (
                        <Text id={timeErrId} role="alert" className="sr-only">
                            {errors.time}
                        </Text>
                    ) : null}
                </fieldset>

                {/* 出生地點 */}
                <PlaceAutocomplete
                    id={placeId}
                    value={place}
                    onChange={(p) => {
                        setPlace(p);
                        if (p) setErrors((x) => ({ ...x, place: undefined }));
                    }}
                    optional={manualTz !== ''}
                    error={errors.place}
                />

                {/* 進階 */}
                <div className="overflow-hidden rounded-[1.5rem] border border-border bg-surface-2">
                    <UnstyledButton
                        aria-expanded={advancedOpen}
                        aria-controls={advancedId}
                        onClick={toggleAdvanced}
                        className="flex w-full items-center justify-between px-4 py-3 text-left font-medium"
                    >
                        <span>進階選項</span>
                        <span aria-hidden="true" className="text-xl leading-none">
                            {advancedOpen ? '−' : '+'}
                        </span>
                    </UnstyledButton>
                    <Collapse
                        id={advancedId}
                        expanded={advancedOpen}
                        keepMountedMode="display-none"
                    >
                        <Stack gap="lg" className="border-t border-border px-4 py-4">
                            <Select
                                id={tzId}
                                size="md"
                                label="手動選擇時區"
                                labelProps={{ className: 'font-medium' }}
                                description="找不到出生地點時使用。選擇後會覆蓋地點帶出的時區；請選擇出生地所屬的 IANA 時區（例如 Asia/Taipei）。"
                                inputWrapperOrder={['label', 'input', 'description']}
                                styles={{
                                    root: {
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: '1rem',
                                    },
                                    label: { marginBottom: 0 },
                                    description: { fontSize: 'var(--mantine-font-size-sm)' },
                                }}
                                data={tzOptions}
                                value={manualTz || AUTO_TZ}
                                allowDeselect={false}
                                searchable
                                nothingFoundMessage="找不到符合的時區"
                                onChange={(v) => {
                                    const tz = v && v !== AUTO_TZ ? v : '';
                                    setManualTz(tz);
                                    if (tz) setErrors((x) => ({ ...x, place: undefined }));
                                }}
                                className="sm:w-96"
                            />
                            <Radio.Group
                                label="月亮交點模式"
                                labelProps={{ className: 'font-medium' }}
                                name="nodeMode"
                                size="md"
                                value={nodeMode}
                                onChange={(v) => setNodeMode(v === 'mean' ? 'mean' : 'true')}
                                styles={{
                                    root: {
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: '1rem',
                                    },
                                    label: { marginBottom: 0 },
                                }}
                            >
                                <div className="flex flex-wrap gap-x-6 gap-y-2">
                                    <Radio size="sm" value="true" label="真交點（預設）" />
                                    <Radio size="sm" value="mean" label="平交點" />
                                </div>
                            </Radio.Group>
                        </Stack>
                    </Collapse>
                </div>

                {effectiveTz ? (
                    <p className="text-sm text-muted" aria-live="polite">
                        排盤使用時區：
                        <span className="font-medium text-fg">{effectiveTz}</span>
                        {manualTz ? '（手動選擇）' : '（依出生地點）'}
                    </p>
                ) : null}

                {formError ? (
                    <Alert variant="outline" color="var(--app-danger)" className="text-base">
                        <span className="text-danger">{formError}</span>
                    </Alert>
                ) : null}

                <Button type="submit" size="lg" loading={submitting} fullWidth>
                    {submitting ? '計算中…' : submitLabel}
                </Button>

                {submitting ? (
                    <div aria-hidden="true" className="flex flex-col gap-3">
                        <Skeleton height={16} width="66%" radius="sm" />
                        <Skeleton height={16} width="50%" radius="sm" />
                        <Skeleton height={160} radius="sm" />
                    </div>
                ) : null}
            </form>

            <AmbiguousDialog
                state={ambiguous}
                onChoose={chooseCandidate}
                onCancel={() => setAmbiguous(null)}
            />
        </>
    );
}

// ---------------------------------------------------------------------------

function AmbiguousDialog({
    state,
    onChoose,
    onCancel,
}: {
    state: AmbiguousState | null;
    onChoose: (which: 'earlier' | 'later') => void;
    onCancel: () => void;
}) {
    // Keep the last state while the close transition runs, so the content doesn't vanish mid-fade.
    const [shown, setShown] = useState<AmbiguousState | null>(state);
    if (state && state !== shown) setShown(state);
    const current = state ?? shown;
    const options = current ? describeCandidates(current) : [];
    return (
        <Modal
            opened={state !== null}
            onClose={onCancel}
            title="這個時間在當地出現兩次"
            centered
            closeButtonProps={{ 'aria-label': '關閉' }}
            size="32rem"
            radius="md"
            styles={{
                title: { fontSize: 'var(--mantine-font-size-lg)', fontWeight: 600 },
            }}
        >
            {current ? (
                <Stack gap="md">
                    <Text size="sm" c="dimmed">
                        {current.input.date} {current.input.time} 在 {current.input.timezone}{' '}
                        正好遇到夏令時間結束、時鐘撥回，同一個當地時間出現了兩次。請依出生證明或家人記憶選擇：
                    </Text>
                    <ul className="flex flex-col gap-2">
                        {options.map((o) => (
                            <li key={o.which}>
                                <UnstyledButton
                                    onClick={() => onChoose(o.which)}
                                    className="flex w-full flex-col gap-0.5 rounded-md border border-border px-4 py-3 text-left hover:bg-surface-2"
                                >
                                    <span className="font-medium">{o.title}</span>
                                    <span className="text-sm text-muted">
                                        當地 {current.input.date} {current.input.time}（
                                        {o.offsetLabel}）＝ {formatUtc(o.utc)}
                                    </span>
                                </UnstyledButton>
                            </li>
                        ))}
                    </ul>
                    <div className="text-right">
                        <Button variant="subtle" size="sm" onClick={onCancel} className="underline">
                            取消
                        </Button>
                    </div>
                </Stack>
            ) : null}
        </Modal>
    );
}

interface CandidateOption {
    which: 'earlier' | 'later';
    utc: string;
    title: string;
    offsetLabel: string;
}

/**
 * Works out which candidate is daylight-saving time from its UTC offset (local wall time − UTC):
 * the candidate with the larger offset is the DST reading. Candidates arrive as
 * [earlier UTC instant, later UTC instant] (API contract).
 */
function describeCandidates(state: AmbiguousState): CandidateOption[] {
    const [y, mo, d] = state.input.date.split('-').map(Number);
    const [hh, mm] = state.input.time.split(':').map(Number);
    const wall = Date.UTC(y, mo - 1, d, hh, mm);
    const offsets = state.candidates.map((iso) => Math.round((wall - Date.parse(iso)) / 60000));
    const [o0, o1] = offsets;
    const labelFor = (i: 0 | 1): string => {
        if (!Number.isFinite(o0) || !Number.isFinite(o1) || o0 === o1)
            return i === 0 ? '較早的時刻' : '較晚的時刻';
        const mine = offsets[i];
        const other = offsets[1 - i];
        return mine > other ? '夏令時間' : '標準時間';
    };
    return ([0, 1] as const).map((i) => ({
        which: i === 0 ? 'earlier' : 'later',
        utc: state.candidates[i],
        title: `${labelFor(i)}（${i === 0 ? '第一次' : '第二次'}出現）`,
        offsetLabel: Number.isFinite(offsets[i]) ? formatOffset(offsets[i]) : '時差不明',
    }));
}
