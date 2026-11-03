'use client';

import { Radio, Textarea, TextInput } from '@mantine/core';
import {
  CHART_KIND_NAMES_ZH,
  CHART_NAME_MAX,
  CHART_NOTE_MAX,
  type ChartKind,
  type ChartMeta,
  type MetaErrors,
} from '@/lib/charts/mapping';

// Name / kind / note fields shared by the save dialog, the edit dialog and the "add a chart" page.

interface Props {
  value: ChartMeta;
  onChange: (v: ChartMeta) => void;
  errors: MetaErrors;
  idPrefix: string;
  /** Hide the kind radio (e.g. when the page fixes it). */
  showKind?: boolean;
}

export function ChartMetaFields({
  value,
  onChange,
  errors,
  idPrefix,
  showKind = true,
}: Props) {
  return (
    <>
      <TextInput
        id={`${idPrefix}-name`}
        size="md"
        label="名稱"
        labelProps={{ className: 'font-medium' }}
        placeholder={
          value.kind === 'friend' ? '例如：小明' : '例如：我（出生證明時間）'
        }
        maxLength={CHART_NAME_MAX}
        value={value.name}
        onChange={e => onChange({ ...value, name: e.currentTarget.value })}
        error={errors.name}
        styles={{
          root: { display: 'flex', flexDirection: 'column', gap: '0.25rem' },
          error: { fontSize: 'var(--mantine-font-size-sm)' },
        }}
        data-autofocus
      />
      {showKind ? (
        <Radio.Group
          label="分類"
          labelProps={{ className: 'font-medium' }}
          name={`${idPrefix}-kind`}
          size="md"
          value={value.kind}
          onChange={v =>
            onChange({
              ...value,
              kind: (v === 'friend' ? 'friend' : 'self') as ChartKind,
            })
          }
          styles={{
            root: { display: 'flex', flexDirection: 'column', gap: '0.5rem' },
          }}
        >
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <Radio
              size="sm"
              value="self"
              label={`${CHART_KIND_NAMES_ZH.self}命盤`}
            />
            <Radio
              size="sm"
              value="friend"
              label={`${CHART_KIND_NAMES_ZH.friend}命盤`}
            />
          </div>
        </Radio.Group>
      ) : null}
      <Textarea
        id={`${idPrefix}-note`}
        size="md"
        label="備註（選填）"
        labelProps={{ className: 'font-medium' }}
        autosize
        minRows={2}
        maxRows={6}
        maxLength={CHART_NOTE_MAX}
        value={value.note}
        onChange={e => onChange({ ...value, note: e.currentTarget.value })}
        error={errors.note}
        styles={{
          root: { display: 'flex', flexDirection: 'column', gap: '0.25rem' },
          error: { fontSize: 'var(--mantine-font-size-sm)' },
        }}
      />
    </>
  );
}
