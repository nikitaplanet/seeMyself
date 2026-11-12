'use client';

import type { ReactNode } from 'react';

/** One pill tab inside a `tab-pill` tablist (result page, 雙人合盤, 命盤列表). */
export function TabButton({
    selected,
    onClick,
    children,
    id,
    controls,
}: {
    selected: boolean;
    onClick: () => void;
    children: ReactNode;
    id?: string;
    controls?: string;
}) {
    return (
        <button
            type="button"
            role="tab"
            id={id}
            aria-selected={selected}
            aria-controls={controls}
            onClick={onClick}
            className={`tab-pill-item cursor-pointer whitespace-nowrap ${selected ? '' : 'hover:text-fg'}`}
            data-active={selected ? 'true' : undefined}
        >
            {children}
        </button>
    );
}
