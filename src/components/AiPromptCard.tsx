'use client';

import { useId, useRef, useState } from 'react';

const AI_CHATS = [
  { name: 'Claude', href: 'https://claude.ai/new' },
  { name: 'Gemini', href: 'https://gemini.google.com/app' },
  { name: 'ChatGPT', href: 'https://chatgpt.com/' },
] as const;

export function AiPromptCard({
  heading,
  description,
  text,
}: {
  heading: string;
  description: string;
  text: string;
}) {
  const headingId = useId();
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const [copied, setCopied] = useState(false);

  async function copy(): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      const el = areaRef.current;
      if (!el) return false;
      el.focus();
      el.select();
      setCopied(document.execCommand('copy'));
    }
    window.setTimeout(() => setCopied(false), 2000);
    return true;
  }

  function copyAndOpen(href: string) {
    // Open in the same click so the new tab is not blocked, then copy for paste.
    window.open(href, '_blank', 'noopener,noreferrer');
    void copy();
  }

  return (
    <section
      aria-labelledby={headingId}
      className="surface-card flex flex-col gap-4 p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h2 id={headingId} className="font-serif text-xl font-medium">
            {heading}
          </h2>
          <p className="text-sm text-muted">{description}</p>
        </div>
        <button
          type="button"
          onClick={() => void copy()}
          className="btn-primary cursor-pointer shrink-0 px-4 py-2 text-sm"
        >
          {copied ? '已複製' : '複製提示詞'}
        </button>
      </div>
      <p className="sr-only" aria-live="polite">
        {copied ? '提示詞已複製到剪貼簿' : ''}
      </p>
      <textarea
        ref={areaRef}
        readOnly
        value={text}
        rows={16}
        spellCheck={false}
        aria-label={heading}
        className="surface-inset w-full resize-y rounded-[1.25rem] p-3 font-mono text-xs leading-relaxed text-fg"
      />
      <div className="flex flex-col gap-2">
        <p className="text-sm text-muted">
          複製後開啟新分頁，再於對話框貼上提示詞。
        </p>
        <div className="flex flex-wrap gap-2">
          {AI_CHATS.map(chat => (
            <button
              key={chat.name}
              type="button"
              onClick={() => copyAndOpen(chat.href)}
              aria-label={`複製提示詞並開啟 ${chat.name}（新分頁）`}
              className="btn-secondary cursor-pointer gap-1.5 px-4 py-2 text-sm"
            >
              {chat.name}
              <span aria-hidden="true" className="text-muted">
                ↗
              </span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
