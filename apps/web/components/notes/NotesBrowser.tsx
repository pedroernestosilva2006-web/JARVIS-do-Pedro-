"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { NOTE_TYPES, STAGES, TYPE_LABELS } from "@jarvis/core";
import { createQuickNoteAction } from "@/app/(app)/actions";
import { NotePanel } from "@/components/note/NotePanel";
import { PaneEmpty, SplitView } from "@/components/shell/SplitView";
import { ListToolbar } from "@/components/shell/ListToolbar";
import { useFocusNode } from "@/components/shell/useFocusNode";
import { EmptyState, timeAgo, typeColor } from "@/components/ui";
import { notifyChanged, on } from "@/lib/ui-events";

export interface NoteListItem {
  id: string;
  type: string;
  title: string;
  summary: string | null;
  stage: string;
  created_at: string;
}

const STAGE_LABEL: Record<string, string> = { semente: "Semente", broto: "Broto", perene: "Perene" };

/** Notas: lista à esquerda (busca no topo, filtros como chips) e leitura/edição à direita. */
export function NotesBrowser({ notes, typeCounts, q, type, stage, sel, aiReady }: { notes: NoteListItem[]; typeCounts: Record<string, number>; q: string; type: string; stage: string; sel: string | null; aiReady: boolean }) {
  const router = useRouter();
  const focusNode = useFocusNode();
  const [selected, setSelected] = useState<string | null>(sel);
  const [pending, start] = useTransition();
  const [newTitle, setNewTitle] = useState("");
  const [adding, setAdding] = useState(false);

  // A seleção segue a URL quando ela muda (ex.: link vindo de outra tela)
  const [prevSel, setPrevSel] = useState(sel);
  if (sel !== prevSel) {
    setPrevSel(sel);
    setSelected(sel);
  }
  useEffect(() => on("jarvis:changed", () => router.refresh()), [router]);

  const go = (next: { q?: string; type?: string; stage?: string }) => {
    const p = new URLSearchParams();
    const nq = next.q ?? q;
    const nt = next.type ?? type;
    const ns = next.stage ?? stage;
    if (nq) p.set("q", nq);
    if (nt) p.set("type", nt);
    if (ns) p.set("stage", ns);
    if (selected) p.set("sel", selected);
    start(() => router.replace(`/notes${p.size ? `?${p}` : ""}`, { scroll: false }));
  };

  const select = (id: string | null) => {
    setSelected(id);
    const p = new URLSearchParams(window.location.search);
    if (id) p.set("sel", id);
    else p.delete("sel");
    window.history.replaceState(null, "", `/notes${p.size ? `?${p}` : ""}`);
  };

  const chips = [
    { id: "all", label: "Todas", active: !type && !stage, onClick: () => go({ type: "", stage: "" }) },
    ...NOTE_TYPES.filter((t) => typeCounts[t]).map((t) => ({ id: t, label: TYPE_LABELS[t], count: typeCounts[t], active: type === t, onClick: () => go({ type: type === t ? "" : t }) })),
    ...STAGES.map((s) => ({ id: `s-${s}`, label: STAGE_LABEL[s]!, active: stage === s, onClick: () => go({ stage: stage === s ? "" : s }) })),
  ];

  async function create(e: React.FormEvent) {
    e.preventDefault();
    const r = await createQuickNoteAction(newTitle);
    if ("error" in r) return;
    setNewTitle("");
    setAdding(false);
    notifyChanged();
    router.refresh();
    select(r.id);
  }

  const filtered = !!(q || type || stage);
  return (
    <SplitView
      hasSelection={!!selected}
      list={
        <>
          <ListToolbar
            title="Notas"
            count={notes.length}
            query={q}
            onQuery={(v) => go({ q: v })}
            placeholder="Buscar nas notas…"
            chips={chips}
            actions={
              <button className="btn-primary !py-1.5" onClick={() => setAdding((v) => !v)} aria-expanded={adding}>
                Nova nota
              </button>
            }
          />
          {adding && (
            <form onSubmit={create} className="flex gap-2 border-b border-border p-3">
              <input autoFocus value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Título da nova nota" aria-label="Título da nova nota" className="field" />
              <button disabled={!newTitle.trim()} className="btn-primary shrink-0">
                Criar
              </button>
            </form>
          )}
          <ul className={`min-h-0 flex-1 overflow-y-auto transition-opacity duration-150 ${pending ? "opacity-60" : ""}`}>
            {notes.length === 0 && (
              <EmptyState title={filtered ? "Nenhuma nota encontrada" : "Ainda não há notas"}>
                {filtered ? "Tente outra busca ou limpe os filtros." : "Use o botão + para capturar uma ideia, ou carregue dados de exemplo no Cérebro."}
              </EmptyState>
            )}
            {notes.map((n) => (
              <li key={n.id}>
                <button onClick={() => select(n.id)} aria-current={selected === n.id} className={`row-hover flex w-full items-start gap-3 border-b border-border px-3 py-3 text-left ${selected === n.id ? "bg-accent-soft" : ""}`}>
                  <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: typeColor(n.type) }} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{n.title}</span>
                    {n.summary && <span className="mt-0.5 line-clamp-2 block text-sm text-muted">{n.summary}</span>}
                    <span className="mt-1 block text-xs text-muted">
                      {TYPE_LABELS[n.type as keyof typeof TYPE_LABELS] ?? n.type} · {n.stage} · {timeAgo(n.created_at)}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      }
      empty={<PaneEmpty title="Selecione uma nota">Leia, edite e veja as conexões ao lado da lista.</PaneEmpty>}
      detail={
        selected && (
          <NotePanel
            key={selected}
            noteId={selected}
            aiReady={aiReady}
            variant="pane"
            onClose={() => select(null)}
            onSelect={select}
            onChanged={() => router.refresh()}
            onDeleted={() => router.refresh()}
            onLocalGraph={(d) => focusNode(selected, { local: d })}
          />
        )
      }
    />
  );
}
