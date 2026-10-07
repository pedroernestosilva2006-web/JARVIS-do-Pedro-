"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { TYPE_LABELS } from "@jarvis/core";
import { FileDetail, type FileItem } from "@/components/files/FileDetail";
import { NotePanel } from "@/components/note/NotePanel";
import { ListToolbar } from "@/components/shell/ListToolbar";
import { PaneEmpty, SplitView } from "@/components/shell/SplitView";
import { useFocusNode } from "@/components/shell/useFocusNode";
import { EmptyState, typeColor } from "@/components/ui";
import { fileTypeLabel } from "@/lib/files/rules";
import { on } from "@/lib/ui-events";

export type TimelineEntry =
  | { kind: "note"; id: string; at: string; type: string; title: string; summary: string | null; learned: number }
  | { kind: "file"; id: string; at: string; title: string; file: FileItem };

const FILTERS = [
  { id: "all", label: "Tudo" },
  { id: "evento", label: "Eventos" },
  { id: "livro", label: "Livros" },
  { id: "projeto", label: "Projetos" },
  { id: "diario", label: "Diário" },
  { id: "file", label: "Arquivos" },
];

/** Timeline: mês a mês na esquerda, leitura da nota/arquivo escolhido à direita. */
export function TimelineBrowser({ entries, sel, aiReady }: { entries: TimelineEntry[]; sel: string | null; aiReady: boolean }) {
  const router = useRouter();
  const focusNode = useFocusNode();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState<string | null>(sel);
  useEffect(() => on("jarvis:changed", () => router.refresh()), [router]);

  const visible = useMemo(
    () =>
      entries.filter((e) => {
        if (filter === "file" && e.kind !== "file") return false;
        if (filter !== "all" && filter !== "file" && !(e.kind === "note" && e.type === filter)) return false;
        return !q.trim() || e.title.toLowerCase().includes(q.trim().toLowerCase());
      }),
    [entries, filter, q],
  );
  const byMonth = useMemo(() => {
    const m = new Map<string, TimelineEntry[]>();
    for (const e of visible) {
      const raw = new Date(e.at).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
      const key = raw.charAt(0).toUpperCase() + raw.slice(1).replace(" de ", " de "); // "Outubro de 2026"
      m.set(key, [...(m.get(key) ?? []), e]);
    }
    return [...m];
  }, [visible]);

  const current = entries.find((e) => e.id === selected) ?? null;
  const select = (id: string | null) => {
    setSelected(id);
    window.history.replaceState(null, "", id ? `/timeline?sel=${id}` : "/timeline");
  };

  return (
    <SplitView
      hasSelection={!!current}
      list={
        <>
          <ListToolbar
            title="Timeline"
            count={visible.length}
            query={q}
            onQuery={setQ}
            placeholder="Buscar na linha do tempo…"
            chips={FILTERS.map((f) => ({ ...f, active: filter === f.id, onClick: () => setFilter(f.id) }))}
          />
          <div className="min-h-0 flex-1 overflow-y-auto">
            {visible.length === 0 && <EmptyState title="Nada por aqui">Quando você capturar notas e arquivos, eles aparecem organizados por mês.</EmptyState>}
            {byMonth.map(([month, list]) => (
              <section key={month} aria-label={month}>
                <h2 className="sticky top-0 z-10 border-b border-border bg-background/95 px-3 py-1.5 text-sm font-semibold text-muted backdrop-blur">{month}</h2>
                <ul>
                  {list.map((e) => (
                    <li key={e.id}>
                      <button onClick={() => select(e.id)} aria-current={selected === e.id} className={`row-hover flex w-full items-center gap-3 border-b border-border px-3 py-2.5 text-left ${selected === e.id ? "bg-accent-soft" : ""}`}>
                        <span className="w-10 shrink-0 text-xs text-muted">{new Date(e.at).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}</span>
                        {e.kind === "note" ? <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: typeColor(e.type) }} /> : <span className="chip chip-static !px-1.5 !py-0 text-xs">{fileTypeLabel(e.file.file_name, e.file.mime_type)}</span>}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate">{e.title}</span>
                          <span className="block truncate text-xs text-muted">
                            {e.kind === "note" ? `${TYPE_LABELS[e.type as keyof typeof TYPE_LABELS] ?? e.type}${e.learned ? ` · ${e.learned} aprendizados` : ""}` : "Arquivo"}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </>
      }
      empty={<PaneEmpty title="Selecione um item">Leia a nota ou veja o arquivo ao lado da linha do tempo.</PaneEmpty>}
      detail={
        current &&
        (current.kind === "note" ? (
          <NotePanel key={current.id} noteId={current.id} aiReady={aiReady} variant="pane" onClose={() => select(null)} onSelect={select} onChanged={() => router.refresh()} onDeleted={() => router.refresh()} onLocalGraph={(d) => focusNode(current.id, { local: d })} />
        ) : (
          <FileDetail key={current.id} file={current.file} onClose={() => select(null)} onDeleted={() => { select(null); router.refresh(); }} />
        ))
      }
    />
  );
}
