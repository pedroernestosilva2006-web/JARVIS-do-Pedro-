"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { TYPE_LABELS, isNoteType } from "@jarvis/core";
import { AddPanel } from "@/components/add/AddPanel";
import { NoteEditor } from "@/components/notes/NoteEditor";
import { createLinkedNoteAction } from "@/app/(app)/actions";
import { fileTypeLabel, formatBytes } from "@/lib/files/rules";
import { renderMarkdown } from "@/lib/markdown";

interface Detail {
  note: {
    id: string;
    type: string;
    title: string;
    content_md: string;
    summary: string | null;
    stage: string;
    aliases: string[];
    created_by: string;
  };
  links: { id: string; relation: string; status: string; rationale: string | null; direction: "in" | "out"; other: { id: string; title: string; type: string } | null }[];
  files: { id: string; file_name: string; mime_type: string | null; size_bytes: number }[];
  excerpts: string[];
}

/**
 * Painel que abre ao clicar num ponto do cérebro: lê, edita, navega pelas conexões,
 * anexa arquivos e cria notas ligadas — tudo sem sair do grafo.
 */
export function NoteDrawer({
  noteId,
  aiReady,
  onClose,
  onSelect,
  onChanged,
}: {
  noteId: string;
  aiReady: boolean;
  onClose: () => void;
  onSelect: (id: string) => void;
  onChanged: () => void;
}) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState("");
  const [showAttach, setShowAttach] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [creating, setCreating] = useState(false);

  const load = useCallback(() => {
    fetch(`/api/notes/${noteId}`)
      .then((res) => {
        if (!res.ok) throw new Error(res.status === 404 ? "Nota não encontrada." : "Não foi possível carregar a nota.");
        return res.json();
      })
      .then((d: Detail) => {
        setError("");
        setDetail(d);
      })
      .catch((e: Error) => setError(e.message));
  }, [noteId]);

  useEffect(() => {
    load(); // o pai usa key={noteId}: trocar de nota remonta o painel com estado limpo
  }, [load]);

  // Recarrega quando algo muda (ex.: arquivo anexado)
  useEffect(() => {
    const h = () => load();
    window.addEventListener("jarvis:changed", h);
    return () => window.removeEventListener("jarvis:changed", h);
  }, [load]);

  async function createLinked(e: React.FormEvent) {
    e.preventDefault();
    if (!newTitle.trim() || creating) return;
    setCreating(true);
    const r = await createLinkedNoteAction(noteId, newTitle);
    setCreating(false);
    if ("error" in r) return setError(r.error);
    setNewTitle("");
    onChanged();
    onSelect(r.id);
  }

  const note = detail?.note;
  const out = detail?.links.filter((l) => l.direction === "out" && l.other) ?? [];
  const inn = detail?.links.filter((l) => l.direction === "in" && l.other) ?? [];

  return (
    <aside
      aria-label="Detalhes da nota"
      className="surface-raised fixed inset-x-0 bottom-0 z-30 flex max-h-[78vh] flex-col overflow-hidden border-x-0 shadow-2xl md:absolute md:inset-y-3 md:left-auto md:right-3 md:max-h-none md:w-[26rem] md:rounded-sm md:border-x"
    >
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <span className="kicker flex items-center gap-2">
          <span className="h-1.5 w-1.5 bg-[var(--signal)]" />
          {note && isNoteType(note.type) ? TYPE_LABELS[note.type] : "Nota"}
          {note && <span className="text-border-strong">·</span>}
          {note?.stage}
        </span>
        <div className="ml-auto flex items-center gap-3">
          {note && (
            <Link href={`/notes/${note.id}`} className="text-[10.5px] uppercase tracking-[0.14em] text-muted hover:text-foreground">
              Abrir página
            </Link>
          )}
          <button onClick={onClose} aria-label="Fechar" className="text-muted hover:text-foreground">
            ✕
          </button>
        </div>
      </div>

      <div className="flex-1 space-y-6 overflow-y-auto px-4 py-4">
        {error && <p className="text-sm text-[var(--signal)]">{error}</p>}
        {!detail && !error && <p className="text-sm text-muted">Carregando…</p>}

        {note && (
          <>
            <section>
              {note.summary && <p className="mb-3 border-l border-border pl-3 text-sm text-muted">{note.summary}</p>}
              <NoteEditor
                key={note.id + note.content_md.length}
                note={{ ...note, aliases: note.aliases ?? [] }}
                renderedHtml={renderMarkdown(note.content_md ?? "")}
                compactTitle
                onSaved={() => {
                  void load();
                  onChanged();
                }}
              />
            </section>

            <section>
              <h3 className="kicker mb-2 flex items-center justify-between">
                <span>Arquivos ({detail.files.length})</span>
                <button onClick={() => setShowAttach((v) => !v)} className="text-[10.5px] uppercase tracking-[0.14em] text-foreground hover:text-[var(--signal)]">
                  {showAttach ? "Fechar" : "+ Anexar"}
                </button>
              </h3>
              {detail.files.length === 0 && !showAttach && <p className="text-xs text-muted">Nenhum arquivo nesta nota.</p>}
              <ul className="divide-y divide-border border-y border-border text-sm">
                {detail.files.map((f) => (
                  <li key={f.id} className="flex items-center gap-3 py-2">
                    <span className="kicker w-12 shrink-0">{fileTypeLabel(f.file_name, f.mime_type)}</span>
                    <a href={`/api/files/${f.id}/download?inline=1`} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 truncate hover:underline">
                      {f.file_name}
                    </a>
                    <span className="shrink-0 text-xs text-muted">{formatBytes(f.size_bytes)}</span>
                    <a href={`/api/files/${f.id}/download`} className="shrink-0 text-xs text-muted hover:text-foreground" title="Baixar">
                      ↓
                    </a>
                  </li>
                ))}
              </ul>
              {showAttach && (
                <div className="mt-3">
                  <AddPanel noteId={note.id} aiReady={aiReady} compact />
                </div>
              )}
            </section>

            <section>
              <h3 className="kicker mb-2">Conexões ({out.length + inn.length})</h3>
              {out.length + inn.length === 0 && <p className="text-xs text-muted">Sem conexões ainda. Crie uma nota ligada abaixo ou use [[Título]] ao editar.</p>}
              <ul className="space-y-1 text-sm">
                {[...out, ...inn].map((l) => (
                  <li key={l.id} className={l.status === "suggested" ? "opacity-60" : ""} title={l.rationale ?? undefined}>
                    <button onClick={() => l.other && onSelect(l.other.id)} className="group flex w-full items-baseline gap-2 text-left">
                      <span className="kicker w-24 shrink-0 truncate">{l.direction === "out" ? l.relation : `← ${l.relation}`}</span>
                      <span className="underline decoration-transparent underline-offset-4 group-hover:decoration-[var(--signal)]">{l.other?.title}</span>
                      {l.status === "suggested" && <span className="text-[10px] text-[var(--signal)]">sugerida</span>}
                    </button>
                  </li>
                ))}
              </ul>
              <form onSubmit={createLinked} className="mt-3 flex gap-2">
                <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Nova nota ligada a esta…" className="field !py-1.5 text-sm" />
                <button disabled={creating || !newTitle.trim()} className="btn-outline shrink-0 px-3 disabled:opacity-40">
                  Criar
                </button>
              </form>
            </section>

            {detail.excerpts.length > 0 && (
              <section>
                <h3 className="kicker mb-2">De onde veio</h3>
                {detail.excerpts.map((x, i) => (
                  <blockquote key={i} className="mb-2 border-l border-foreground pl-3 text-xs italic text-muted">
                    “{x}”
                  </blockquote>
                ))}
              </section>
            )}
          </>
        )}
      </div>
    </aside>
  );
}
