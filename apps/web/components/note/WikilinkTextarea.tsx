"use client";

import { useEffect, useRef, useState } from "react";
import { TYPE_LABELS } from "@jarvis/core";
import { completeWikilink, openWikilinkQuery } from "@/lib/wikilink-autocomplete";

type Suggestion = { id: string; title: string; type: string };

/** Textarea markdown com autocomplete ao digitar [[ */
export function WikilinkTextarea({
  value,
  onChange,
  className,
  excludeId,
  onSave,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
  excludeId: string;
  onSave?: () => void;
  autoFocus?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [query, setQuery] = useState<string | null>(null);
  const [items, setItems] = useState<Suggestion[]>([]);
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);

  useEffect(() => {
    if (query === null) return;
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/notes/titles?q=${encodeURIComponent(query)}`, { signal: ctrl.signal })
        .then((r) => (r.ok ? r.json() : []))
        .then((d: Suggestion[]) => {
          setItems(d.filter((it) => it.id !== excludeId));
          setActive(0);
        })
        .catch(() => {});
    }, 150);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [query, excludeId]);

  const refresh = (text: string, caret: number) => setQuery(openWikilinkQuery(text, caret)?.query ?? null);

  const pick = (title: string) => {
    const el = ref.current;
    if (!el) return;
    const r = completeWikilink(value, el.selectionStart, title);
    onChange(r.text);
    setQuery(null);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(r.caret, r.caret);
    });
  };

  const open = query !== null && items.length > 0;
  return (
    <div className="relative">
      <textarea
        ref={ref}
        className={className ?? "field min-h-[260px] font-mono text-sm"}
        aria-label="Conteúdo da nota em markdown"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          refresh(e.target.value, e.target.selectionStart);
        }}
        onClick={(e) => refresh(value, e.currentTarget.selectionStart)}
        onKeyDown={(e) => {
          if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
            e.preventDefault();
            onSave?.();
            return;
          }
          if (!open) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => (a + 1) % items.length);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => (a - 1 + items.length) % items.length);
          } else if (e.key === "Enter" || e.key === "Tab") {
            e.preventDefault();
            pick(items[active]!.title);
          } else if (e.key === "Escape") {
            e.stopPropagation();
            setQuery(null);
          }
        }}
        placeholder="Escreva em markdown. Digite [[ para ligar a outra nota."
      />
      {open && (
        <ul className="absolute bottom-2 left-2 z-10 w-72 max-w-[calc(100%-1rem)] overflow-hidden rounded-lg border border-border-strong bg-surface-2 shadow-xl">
          <li className="px-3 py-1.5 text-xs text-muted">Ligar a… (↑↓ Enter)</li>
          {items.map((it, i) => (
            <li key={it.id}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(it.title);
                }}
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm ${i === active ? "bg-accent-soft" : "hover:bg-surface"}`}
              >
                <span className="text-xs text-muted">{TYPE_LABELS[it.type as keyof typeof TYPE_LABELS] ?? it.type}</span>
                <span className="truncate">{it.title}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
