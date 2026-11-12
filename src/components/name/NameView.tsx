'use client';

import { useId, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import { analyzeName, GRID_KEYS } from '@/lib/name/analyze';
import { GRID_LABEL } from '@/lib/name/assemble';
import { isNameError } from '@/lib/name/errors';
import { buildNameAiPrompt } from '@/lib/name/prompt';
import { nameReportItems } from '@/lib/name/report';
import { nameSynastryItems } from '@/lib/name/synastry';
import type { NameAnalysis } from '@/lib/name/types';
import {
    nameInputKeys,
    parseNameInputs,
    readNameInputsRaw,
    resolveNameFields,
    saveNameInput,
    subscribeNameInputs,
    type NameFields,
} from '@/lib/ui/nameInputStore';
import { AiPromptCard } from '../AiPromptCard';
import { ChartMeaningCard } from '../ChartMeaningCard';

// 姓名學分頁（個人盤與雙人合盤共用）。計算全在瀏覽器端：這個檔案連同康熙字典由 ChartView／
// SynastryView 以 next/dynamic 載入，第一次打開「姓名學」分頁時才下載，不影響其他分頁的 bundle。

/** What both views know about one chart: where its name is remembered and its birth date. */
export interface NameSubject {
    /** Saved chart id (stable across the personal page and 雙人合盤); null for an unsaved chart. */
    savedId: string | null;
    /** The chart's saved name — often a nickname; only used for the first guess. */
    chartName: string | null;
    /** 出生日期 'YYYY-MM-DD' and time 'HH:mm' from the chart's stored birth input. */
    date: string;
    time: string;
}

type NameState =
    | { kind: 'empty' }
    | { kind: 'incomplete'; missing: '姓' | '名' }
    | { kind: 'error'; message: string }
    | { kind: 'ok'; analysis: NameAnalysis; zodiacSkipped: boolean };

const SHAPE_MESSAGE =
    '姓請輸入 1–2 個字，名請輸入 1–2 個字（複姓如「歐陽」填在姓，單名只填一個字）。';

export function computeNameState(fields: NameFields, birthDate: string): NameState {
    const surname = fields.surname.trim();
    const given = fields.given.trim();
    if (!surname && !given) return { kind: 'empty' };
    if (!surname) return { kind: 'incomplete', missing: '姓' };
    if (!given) return { kind: 'incomplete', missing: '名' };
    try {
        return {
            kind: 'ok',
            analysis: analyzeName({ surname, given, birthDate }),
            zodiacSkipped: false,
        };
    } catch (e) {
        if (!isNameError(e)) return { kind: 'error', message: '計算時發生問題，請稍後再試。' };
        if (e.code === 'UNKNOWN_CHAR') {
            const chars = Array.isArray(e.details?.chars) ? (e.details.chars as string[]) : [];
            return {
                kind: 'error',
                message: chars.length
                    ? `字典裡找不到${chars.map((c) => `「${c}」`).join('')}，目前無法計算。請確認是否為繁體字。`
                    : '名字裡有字典裡找不到的字，目前無法計算。',
            };
        }
        if (e.code === 'INVALID_SHAPE') return { kind: 'error', message: SHAPE_MESSAGE };
        // INVALID_BIRTH_DATE — the name itself is fine; analyse without the zodiac.
        try {
            return { kind: 'ok', analysis: analyzeName({ surname, given }), zodiacSkipped: true };
        } catch {
            return { kind: 'error', message: '計算時發生問題，請稍後再試。' };
        }
    }
}

const serverSnapshot = (): string | null => null;

function useNameFields(subject: NameSubject): [NameFields, (next: NameFields) => void] {
    const raw = useSyncExternalStore(subscribeNameInputs, readNameInputsRaw, serverSnapshot);
    const { savedId, chartName, date, time } = subject;
    const keys = useMemo(() => nameInputKeys(savedId, { date, time }), [savedId, date, time]);
    const fields = useMemo(
        () => resolveNameFields(parseNameInputs(raw), keys, chartName),
        [raw, keys, chartName],
    );
    return [fields, (next) => saveNameInput(keys[0], next)];
}

// Plain Tailwind fields: the result pages are not inside a MantineProvider (see MantineRoot).
function NameField({
    label,
    placeholder,
    value,
    onChange,
}: {
    label: string;
    placeholder: string;
    value: string;
    onChange: (value: string) => void;
}) {
    const id = useId();
    return (
        <div className="flex min-w-0 flex-col gap-1">
            <label htmlFor={id} className="font-medium">
                {label}
            </label>
            <input
                id={id}
                type="text"
                autoComplete="off"
                spellCheck={false}
                placeholder={placeholder}
                value={value}
                onChange={(e) => onChange(e.currentTarget.value)}
                className="surface-inset w-full min-w-0 px-3 py-2 text-base text-fg placeholder:text-muted"
            />
        </div>
    );
}

function NameForm({
    legend,
    fields,
    onChange,
}: {
    legend: string;
    fields: NameFields;
    onChange: (next: NameFields) => void;
}) {
    return (
        <fieldset className="m-0 grid min-w-0 grid-cols-2 gap-3 border-0 p-0">
            <legend className="sr-only">{legend}</legend>
            <NameField
                label="姓"
                placeholder="例如：王"
                value={fields.surname}
                onChange={(surname) => onChange({ ...fields, surname })}
            />
            <NameField
                label="名"
                placeholder="例如：怡君"
                value={fields.given}
                onChange={(given) => onChange({ ...fields, given })}
            />
        </fieldset>
    );
}

function KangxiNote() {
    return (
        <p className="text-sm text-muted">
            筆畫依康熙字典的算法：部首還原成原字計算（例如「氵」算 4 畫、「艹」算 6 畫、「扌」算 4
            畫），所以可能比平常手寫的筆畫多。
        </p>
    );
}

/** Hint (before input) or error (role="alert") shown next to the form; null when the name is valid. */
function NameStatus({ state, who }: { state: NameState; who?: string }) {
    if (state.kind === 'ok') return null;
    if (state.kind === 'error') {
        return (
            <p
                role="alert"
                className="rounded-md border border-danger px-3 py-2 text-sm text-danger"
            >
                {state.message}
            </p>
        );
    }
    return (
        <p className="rounded-md border border-border bg-surface-2 px-3 py-2 text-sm text-muted">
            {state.kind === 'empty'
                ? `請輸入${who ? `${who}的` : ''}中文本名，姓與名分開填（複姓如「歐陽」填在姓）。命盤名稱常是暱稱，所以這裡要另外填。`
                : `還差「${state.missing}」，填好就會開始計算。`}
        </p>
    );
}

function NameSummary({ analysis, birthDate }: { analysis: NameAnalysis; birthDate?: string }) {
    const chars = [...analysis.surname, ...analysis.given];
    return (
        <div className="flex flex-col gap-4">
            <ul aria-label="每個字的康熙筆畫" className="flex flex-wrap gap-2">
                {chars.map((c, i) => (
                    <li
                        key={`${i}-${c.char}`}
                        className="flex min-w-14 flex-col items-center rounded-md bg-surface-2 px-3 py-2"
                    >
                        <span className="font-serif text-2xl">{c.char}</span>
                        <span className="text-xs text-muted tabular-nums">{c.strokes} 畫</span>
                    </li>
                ))}
            </ul>
            <dl aria-label="五格" className="grid grid-cols-5 gap-1.5 text-center sm:gap-2">
                {GRID_KEYS.map((k) => {
                    const g = analysis.grids[k];
                    return (
                        <div
                            key={k}
                            className="flex min-w-0 flex-col gap-0.5 rounded-md border border-border px-1 py-2"
                        >
                            <dt className="text-xs text-muted">{GRID_LABEL[k]}</dt>
                            <dd className="m-0 text-sm font-medium tabular-nums">{g.strokes} 畫</dd>
                            <dd className="m-0 text-sm">{g.wuxing}</dd>
                        </div>
                    );
                })}
            </dl>
            <dl className="grid grid-cols-[3rem_1fr] gap-x-3 gap-y-1.5 text-sm">
                <dt className="text-muted">三才</dt>
                <dd className="m-0">
                    {analysis.sancai.join('、')}
                    <span className="text-muted">（天格、人格、地格的五行）</span>
                </dd>
                <dt className="text-muted">生肖</dt>
                <dd className="m-0">
                    {analysis.zodiac ? (
                        <>
                            屬{analysis.zodiac}
                            <span className="text-muted">
                                （{birthDate ? `依出生日期 ${birthDate}，` : ''}以立春為界）
                            </span>
                        </>
                    ) : (
                        <span className="text-muted">出生日期無法判讀，這次不看生肖字根。</span>
                    )}
                </dd>
            </dl>
        </div>
    );
}

function Card({ title, children }: { title: ReactNode; children: ReactNode }) {
    const id = useId();
    return (
        <section
            aria-labelledby={id}
            className="surface-card flex min-w-0 flex-col gap-4 p-4 sm:p-5"
        >
            <h2 id={id} className="flex items-center gap-2 text-lg font-semibold">
                {title}
            </h2>
            {children}
        </section>
    );
}

// ---------------------------------------------------------------------------
// 個人盤
// ---------------------------------------------------------------------------

export function NamePersonalTab({ subject }: { subject: NameSubject }) {
    const [fields, setFields] = useNameFields(subject);
    const state = useMemo(() => computeNameState(fields, subject.date), [fields, subject.date]);

    return (
        <div className="flex flex-col gap-6">
            <div className="grid gap-6 lg:grid-cols-2">
                <Card title="輸入姓名">
                    <NameForm legend="要分析的姓名" fields={fields} onChange={setFields} />
                    <NameStatus state={state} />
                    <KangxiNote />
                </Card>
                {state.kind === 'ok' ? (
                    <Card title="五格與三才">
                        <NameSummary analysis={state.analysis} birthDate={subject.date} />
                    </Card>
                ) : null}
            </div>
            {state.kind === 'ok' ? (
                <>
                    <ChartMeaningCard
                        heading="姓名學說明"
                        lead="標題旁是欄位含義；意思說明依這個名字的五格、三才與生肖字根解說。每張卡片下方的標籤是判讀依據。"
                        items={nameReportItems(state.analysis)}
                    />
                    <AiPromptCard
                        heading="提供給 AI 的提示詞"
                        description="複製後可貼到 ChatGPT、Claude 等，請它依這個名字的姓名學資料做解讀。內容含姓名與生肖。"
                        text={buildNameAiPrompt(state.analysis)}
                    />
                </>
            ) : null}
        </div>
    );
}

// ---------------------------------------------------------------------------
// 雙人合盤
// ---------------------------------------------------------------------------

export interface NamePairPerson extends NameSubject {
    /** Display name the pair view uses for this person (used inside the report text). */
    displayName: string;
}

export function NamePairTab({ a, b }: { a: NamePairPerson; b: NamePairPerson }) {
    const [fieldsA, setFieldsA] = useNameFields(a);
    const [fieldsB, setFieldsB] = useNameFields(b);
    const stateA = useMemo(() => computeNameState(fieldsA, a.date), [fieldsA, a.date]);
    const stateB = useMemo(() => computeNameState(fieldsB, b.date), [fieldsB, b.date]);
    const analysisA = stateA.kind === 'ok' ? stateA.analysis : null;
    const analysisB = stateB.kind === 'ok' ? stateB.analysis : null;
    const items = useMemo(
        () =>
            analysisA && analysisB
                ? nameSynastryItems(
                      { name: a.displayName, analysis: analysisA },
                      { name: b.displayName, analysis: analysisB },
                  )
                : null,
        [analysisA, analysisB, a.displayName, b.displayName],
    );
    const people = [
        { p: a, fields: fieldsA, set: setFieldsA, state: stateA, dot: 'bg-personality' },
        { p: b, fields: fieldsB, set: setFieldsB, state: stateB, dot: 'bg-design' },
    ];

    return (
        <div className="flex flex-col gap-6">
            <div className="grid gap-6 md:grid-cols-2">
                {people.map(({ p, fields, set, state, dot }, i) => (
                    <Card
                        key={i}
                        title={
                            <>
                                <span
                                    aria-hidden="true"
                                    className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${dot}`}
                                />
                                <span className="break-all">{p.displayName}</span>
                            </>
                        }
                    >
                        <NameForm
                            legend={`${p.displayName}的姓名`}
                            fields={fields}
                            onChange={set}
                        />
                        <NameStatus state={state} who={`${p.displayName}`} />
                        {state.kind === 'ok' ? (
                            <NameSummary analysis={state.analysis} birthDate={p.date} />
                        ) : null}
                    </Card>
                ))}
            </div>
            <KangxiNote />
            {items ? (
                <ChartMeaningCard
                    heading="合盤報告書"
                    lead="依兩人姓名的五格、三才與生肖字根比對而成；每張卡片下方的標籤是判讀依據。這是互動傾向的說明，不是合不合的判決。"
                    items={items}
                />
            ) : (
                <p className="rounded-md border border-border bg-surface px-4 py-6 text-muted">
                    兩個人的姓名都填好之後，這裡會出現六張合盤卡片。
                </p>
            )}
        </div>
    );
}
