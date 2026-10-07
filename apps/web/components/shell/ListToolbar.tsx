"use client";

import { useEffect, useRef, useState } from "react";
import { IconSearch } from "@/components/icons";

/** Cabeçalho das listas: título, busca no topo e chips de filtro. */
export function ListToolbar({
  title,
  count,
  query,
  onQuery,
  placeholder,
  chips,
  actions,
}: {
  title: string;
  count?: number;
  query: string;
  onQuery: (q: string) => void;
  placeholder: string;
  chips?: { id: string; label: string; count?: number; active: boolean; onClick: () => void }[];
  actions?: React.ReactNode;
}) {
  const [value, setValue] = useState(query);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const t = setTimeout(() => onQuery(value), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <div className="space-y-3 border-b border-border p-3">
      <div className="flex items-center gap-2">
        <h1 className="text-lg font-semibold">
          {title}
          {count != null && <span className="ml-2 text-sm font-normal text-muted">{count}</span>}
        </h1>
        <div className="ml-auto flex items-center gap-2">{actions}</div>
      </div>
      <label className="relative block">
        <span className="sr-only">{placeholder}</span>
        <IconSearch width={18} height={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        <input value={value} onChange={(e) => setValue(e.target.value)} placeholder={placeholder} className="field !pl-9" type="search" />
      </label>
      {chips && chips.length > 0 && (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtros">
          {chips.map((c) => (
            <button key={c.id} className="chip" aria-pressed={c.active} onClick={c.onClick}>
              {c.label}
              {c.count != null && <span className="text-xs opacity-70">{c.count}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
