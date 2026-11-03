'use client';

import { Combobox, InputBase, useCombobox } from '@mantine/core';
import { useEffect, useId, useRef, useState } from 'react';
// Type-only import: erased at compile time, so the multi-MB place index is never bundled.
import type { Place } from '@/lib/places/search';

// Spec §11.1 / §4.2 — place autocomplete. 300 ms debounce, then GET /api/places?q=…
// Mantine Combobox implements the ARIA 1.2 combobox pattern (input + listbox,
// aria-activedescendant, arrow-key navigation, Enter to choose, Escape to close).

export type PlaceOption = Place;

export function placeLabel(p: Place): string {
  return `${p.nameZh ?? p.name}, ${p.country ?? p.countryCode}`;
}

const DEBOUNCE_MS = 300;

interface Props {
  value: Place | null;
  onChange: (place: Place | null) => void;
  /** true when a manual timezone is chosen, so the place becomes optional */
  optional?: boolean;
  /** validation message, rendered under the hint and linked via aria-describedby */
  error?: string;
  /** id for the text input (so the form can move focus to it) */
  id?: string;
}

export function PlaceAutocomplete({
  value,
  onChange,
  optional,
  error,
  id,
}: Props) {
  const baseId = useId();
  const inputId = id ?? `${baseId}-input`;
  const [query, setQuery] = useState(value ? placeLabel(value) : '');
  const [results, setResults] = useState<Place[]>([]);
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>(
    'idle',
  );
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abort = useRef<AbortController | null>(null);
  const combobox = useCombobox();

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      abort.current?.abort();
    },
    [],
  );

  function search(q: string) {
    abort.current?.abort();
    const ctrl = new AbortController();
    abort.current = ctrl;
    setStatus('loading');
    fetch(`/api/places?q=${encodeURIComponent(q)}`, { signal: ctrl.signal })
      .then(async res => {
        if (!res.ok) throw new Error(String(res.status));
        const body = (await res.json()) as { results?: Place[] };
        setResults(Array.isArray(body.results) ? body.results : []);
        combobox.resetSelectedOption();
        combobox.openDropdown();
        setStatus('done');
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setResults([]);
        setStatus('error');
        combobox.openDropdown();
      });
  }

  function handleInput(text: string) {
    setQuery(text);
    if (value) onChange(null);
    if (timer.current) clearTimeout(timer.current);
    const q = text.trim();
    if ([...q].length < 1 || [...q].length > 50) {
      abort.current?.abort();
      setResults([]);
      combobox.closeDropdown();
      setStatus('idle');
      return;
    }
    timer.current = setTimeout(() => search(q), DEBOUNCE_MS);
  }

  function choose(placeId: string) {
    const p = results.find(r => String(r.id) === placeId);
    if (!p) return;
    onChange(p);
    setQuery(placeLabel(p));
    combobox.closeDropdown();
    combobox.resetSelectedOption();
  }

  // The list only shows once a search has finished (results, "no match" or error).
  const hasOutcome =
    results.length > 0 || status === 'done' || status === 'error';
  const statusText =
    status === 'loading'
      ? '搜尋中…'
      : status === 'error'
        ? '地名搜尋失敗，請稍後再試，或在「進階」手動選擇時區。'
        : status === 'done'
          ? results.length > 0
            ? `找到 ${results.length} 個地點，可用上下鍵選擇。`
            : '找不到符合的地點。可改用英文名稱，或在「進階」手動選擇時區。'
          : '';

  return (
    <div>
      <Combobox store={combobox} onOptionSubmit={choose} size="md">
        <Combobox.Target withExpandedAttribute>
          <InputBase
            id={inputId}
            size="md"
            label={
              <span className="inline-flex flex-wrap items-baseline gap-1">
                出生地點
                {optional ? (
                  <span className="text-sm font-normal text-muted">
                    （已手動選擇時區，可不填）
                  </span>
                ) : null}
              </span>
            }
            labelProps={{ className: 'font-medium' }}
            type="text"
            autoComplete="off"
            spellCheck={false}
            aria-autocomplete="list"
            description={
              value ? (
                <>
                  時區：
                  <span className="font-medium text-fg">{value.timezone}</span>
                  {value.admin1 ? `（${value.admin1}）` : null}
                </>
              ) : (
                '地點只用來決定出生時的時區；城市層級即可。'
              )
            }
            error={error}
            // Hint under the input, then the error (Mantine links both via aria-describedby).
            inputWrapperOrder={['label', 'input', 'description', 'error']}
            styles={{
              root: {
                display: 'flex',
                flexDirection: 'column',
                gap: '0.25rem',
              },
              description: { fontSize: 'var(--mantine-font-size-sm)' },
              error: { fontSize: 'var(--mantine-font-size-sm)' },
            }}
            aria-required={!optional}
            placeholder="輸入城市名稱，例如：臺北、高雄、Tokyo"
            value={query}
            onChange={e => handleInput(e.currentTarget.value)}
            onFocus={() => {
              if (results.length > 0 && !value) combobox.openDropdown();
            }}
            onBlur={() => combobox.closeDropdown()}
          />
        </Combobox.Target>

        <Combobox.Dropdown hidden={!hasOutcome}>
          <Combobox.Options
            aria-label="地點搜尋結果"
            mah={288}
            style={{ overflowY: 'auto' }}
          >
            {results.map(p => (
              <Combobox.Option value={String(p.id)} key={p.id}>
                <span className="block">{placeLabel(p)}</span>
                <span className="block text-sm text-muted">
                  {p.admin1 ? `${p.admin1} · ` : ''}
                  {p.timezone}
                </span>
              </Combobox.Option>
            ))}
            {hasOutcome && results.length === 0 ? (
              <Combobox.Empty>
                {status === 'error'
                  ? '地名搜尋失敗，請稍後再試。'
                  : '找不到符合的地點。'}
              </Combobox.Empty>
            ) : null}
          </Combobox.Options>
        </Combobox.Dropdown>
      </Combobox>
      <p className="sr-only" role="status" aria-live="polite">
        {statusText}
      </p>
    </div>
  );
}
