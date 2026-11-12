// 姓名學分頁的「姓／名」輸入：命盤存的名稱常是暱稱，所以真實姓名由使用者自己填，並依命盤記在
// 這台瀏覽器的 localStorage（不寫入 Supabase）。個人盤與雙人合盤共用同一份紀錄。
// Read it with useSyncExternalStore(subscribeNameInputs, readNameInputsRaw, () => null).

export interface NameFields {
    surname: string;
    given: string;
}

export const NAME_INPUT_STORAGE_KEY = 'name-input:v1';
const FIELD_MAX = 20;

const listeners = new Set<() => void>();
// Fallback copy when localStorage is unavailable (private mode / blocked storage).
let memoryCopy: string | null = null;

/** Raw snapshot for useSyncExternalStore (a string, so it is referentially stable). */
export function readNameInputsRaw(): string | null {
    try {
        return localStorage.getItem(NAME_INPUT_STORAGE_KEY) ?? memoryCopy;
    } catch {
        return memoryCopy;
    }
}

export function parseNameInputs(raw: string | null): Record<string, NameFields> {
    if (!raw) return {};
    try {
        const v: unknown = JSON.parse(raw);
        if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
        const out: Record<string, NameFields> = {};
        for (const [key, entry] of Object.entries(v as Record<string, unknown>)) {
            if (!entry || typeof entry !== 'object') continue;
            const { surname, given } = entry as Partial<NameFields>;
            if (typeof surname !== 'string' || typeof given !== 'string') continue;
            out[key] = { surname: surname.slice(0, FIELD_MAX), given: given.slice(0, FIELD_MAX) };
        }
        return out;
    } catch {
        return {};
    }
}

export function saveNameInput(key: string, fields: NameFields): void {
    const all = parseNameInputs(readNameInputsRaw());
    all[key] = { surname: fields.surname, given: fields.given };
    const raw = JSON.stringify(all);
    memoryCopy = raw;
    try {
        localStorage.setItem(NAME_INPUT_STORAGE_KEY, raw);
    } catch {
        // ignore — memoryCopy is used instead
    }
    listeners.forEach((l) => l());
}

export function subscribeNameInputs(cb: () => void): () => void {
    listeners.add(cb);
    // Another browser tab editing the same chart's name.
    const onStorage = (e: StorageEvent) => {
        if (e.key === null || e.key === NAME_INPUT_STORAGE_KEY) cb();
    };
    window.addEventListener('storage', onStorage);
    return () => {
        listeners.delete(cb);
        window.removeEventListener('storage', onStorage);
    };
}

/**
 * Storage keys for one chart, most specific first: the saved chart id (stable, shared by the
 * personal page and 雙人合盤), then the birth moment (so a name typed before the chart was saved
 * is still found afterwards). Writes go to the first key.
 */
export function nameInputKeys(
    savedId: string | null | undefined,
    input: { date: string; time: string },
): string[] {
    const birth = `birth:${input.date}T${input.time}`;
    return savedId ? [`chart:${savedId}`, birth] : [birth];
}

const HAN_NAME = /^\p{Script=Han}{2,4}$/u;

/**
 * Editable first guess from the chart's saved name. Only a 2–4 字 all-Chinese name is used:
 * first character → 姓, the rest → 名. A four-character name is split 2＋2, because 1＋3 is never
 * a valid shape (名 is at most two characters). Anything else (暱稱、英文) gives empty fields.
 */
export function guessNameFields(name: string | null | undefined): NameFields {
    const text = (name ?? '').trim().normalize('NFC');
    if (!HAN_NAME.test(text)) return { surname: '', given: '' };
    const chars = [...text];
    const cut = chars.length === 4 ? 2 : 1;
    return { surname: chars.slice(0, cut).join(''), given: chars.slice(cut).join('') };
}

/** The stored value for the first key that has one, else the guess from the chart name. */
export function resolveNameFields(
    all: Record<string, NameFields>,
    keys: string[],
    chartName: string | null | undefined,
): NameFields {
    for (const key of keys) {
        const hit = all[key];
        if (hit) return hit;
    }
    return guessNameFields(chartName);
}
