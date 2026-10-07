"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { NOTE_TYPES, STAGES, TYPE_LABELS } from "@jarvis/core";
import { AddPanel } from "@/components/add/AddPanel";
import { IconBack, IconClose, IconDownload, IconTarget, IconTrash } from "@/components/icons";
import { Skeleton, typeColor } from "@/components/ui";
import { createLinkedNoteAction, removeNoteAction, reviewLinkAction, saveNoteAction } from "@/app/(app)/actions";
import { fileTypeLabel, formatBytes } from "@/lib/files/rules";
import { renderMarkdown } from "@/lib/markdown";
import { relationLabel } from "@/lib/relations";
import { notifyChanged, on, resolveNoteId, toast } from "@/lib/ui-events";
import { WikilinkTextarea } from "./WikilinkTextarea";

interface LinkRow {
  id: string;
  relation: string;
  status: string;
  rationale: string | null;
  confidence: number | null;
  direction: "in" | "out";
  other: { id: string; title: string; type: string } | null;
}
interface Detail {
  note: { id: string; type: string; title: string; content_md: string; summary: string | null; stage: string; aliases: string[]; created_by: string; created_at: string };
  links: LinkRow[];
  files: { id: string; file_name: string; mime_type: string | null; size_bytes: number }[];
  excerpts: string[];
  tags: string[];
}

/**
 * Painel de uma nota: título editável, tipo/estágio como chips, conteúdo em markdown (leitura/edição),
 * conexões por relação, sugestões da IA com aceitar/recusar, arquivos e grafo local.
 * `side` = painel direito do Cérebro (não modal); `pane` = coluna de leitura das listas.
 */
export function NotePanel({
  noteId,
  aiReady,
  variant = "pane",
  onClose,
  onSelect,
  onLocalGraph,
  onChanged,
  onDeleted,
}: {
  noteId: string;
  aiReady: boolean;
  variant?: "side" | "pane";
  onClose?: () => void;
  onSelect: (id: string) => void;
  onLocalGraph?: (depth: number) => void;
  onChanged?: () => void;
  onDeleted?: () => void;
}) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ title: "", content: "", summary: "" });
  const [showAttach, setShowAttach] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [depth, setDepth] = useState(1);
  const [pending, start] = useTransition();
  const titleRef = useRef<HTMLInputElement>(null);

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
    return on("jarvis:changed", load);
  }, [load]);

  const note = detail?.note;

  const save = useCallback(
    (patch: Partial<{ title: string; content_md: string; summary: string; type: string; stage: string }>, after?: () => void) => {
      if (!note) return;
      start(async () => {
        try {
          await saveNoteAction(note.id, {
            title: patch.title ?? note.title,
            content_md: patch.content_md ?? note.content_md ?? "",
            summary: patch.summary ?? note.summary ?? "",
            type: patch.type ?? note.type,
            stage: patch.stage ?? note.stage,
            aliases: note.aliases.join(", "),
          });
          load();
          notifyChanged();
          onChanged?.();
          after?.();
        } catch (e) {
          toast(e instanceof Error ? e.message : "Não foi possível salvar.", "error");
        }
      });
    },
    [note, load, onChanged],
  );

  // Esc: sai da edição; fora dela, fecha o painel
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if (editing) {
        e.preventDefault();
        setEditing(false);
      } else if (onClose) {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editing, onClose]);

  const accepted = useMemo(() => (detail?.links ?? []).filter((l) => l.status === "accepted" && l.other), [detail]);
  const suggested = useMemo(() => (detail?.links ?? []).filter((l) => l.status === "suggested" && l.other), [detail]);
  const groups = useMemo(() => {
    const m = new Map<string, LinkRow[]>();
    for (const l of accepted) {
      const key = l.direction === "out" ? relationLabel(l.relation) : `${relationLabel(l.relation)} (recebida)`;
      m.set(key, [...(m.get(key) ?? []), l]);
    }
    return [...m];
  }, [accepted]);

  async function onBodyClick(e: React.MouseEvent) {
    const a = (e.target as HTMLElement).closest<HTMLAnchorElement>("a.wikilink");
    if (!a) return;
    e.preventDefault();
    const title = decodeURIComponent(new URL(a.href).searchParams.get("title") ?? "");
    const id = await resolveNoteId(title);
    if (id) onSelect(id);
    else toast(`A nota “${title}” ainda não existe. Crie-a na barra de comando.`, "error");
  }

  async function createLinked(e: React.FormEvent) {
    e.preventDefault();
    if (!newTitle.trim() || !note) return;
    const r = await createLinkedNoteAction(note.id, newTitle);
    if ("error" in r) return toast(r.error, "error");
    setNewTitle("");
    notifyChanged();
    onSelect(r.id);
  }

  if (error)
    return (
      <div className="p-6 text-sm">
        <p className="text-danger">{error}</p>
        {onClose && (
          <button onClick={onClose} className="btn-outline mt-3">
            Fechar
          </button>
        )}
      </div>
    );
  if (!note || !detail)
    return (
      <div className="space-y-4 p-5" role="status" aria-label="Carregando nota">
        <Skeleton className="h-6 w-24" />
        <Skeleton className="h-8 w-3/4" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-24 w-full" />
      </div>
    );

  return (
    <article className="flex h-full min-h-0 flex-col" aria-label={`Nota: ${note.title}`}>
      <header className="space-y-3 border-b border-border px-4 pb-3 pt-3">
        <div className="flex items-center gap-2">
          {variant === "pane" && onClose && (
            <button onClick={onClose} className="btn-ghost !p-2 md:hidden" aria-label="Voltar à lista">
              <IconBack />
            </button>
          )}
          <label className="chip relative" title="Tipo da nota (clique para mudar)">
            <span className="h-2 w-2 rounded-full" style={{ background: typeColor(note.type) }} />
            <span className="text-foreground">{TYPE_LABELS[note.type as keyof typeof TYPE_LABELS] ?? note.type}</span>
            <select
              value={note.type}
              onChange={(e) => save({ type: e.target.value })}
              aria-label="Tipo"
              className="absolute inset-0 cursor-pointer opacity-0"
            >
              {NOTE_TYPES.map((t) => (
                <option key={t} value={t} className="bg-surface-2">
                  {TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </label>
          <div role="group" aria-label="Estágio" className="flex gap-1">
            {STAGES.map((s) => (
              <button key={s} className="chip" aria-pressed={note.stage === s} onClick={() => note.stage !== s && save({ stage: s })}>
                {s}
              </button>
            ))}
          </div>
          {variant === "side" && onClose && (
            <button onClick={onClose} className="btn-ghost ml-auto !p-2" aria-label="Fechar painel (Esc)">
              <IconClose />
            </button>
          )}
        </div>
        <input
          ref={titleRef}
          defaultValue={note.title}
          aria-label="Título da nota"
          onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== note.title && save({ title: e.target.value.trim() })}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") {
              e.currentTarget.value = note.title;
              e.currentTarget.blur();
              e.stopPropagation();
            }
          }}
          className="w-full rounded-md bg-transparent px-1 py-0.5 text-xl font-semibold leading-snug outline-none hover:bg-surface-2 focus:bg-surface-2"
        />
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
          <span>{note.created_by === "ai" ? "Criada pela IA" : "Criada por você"}</span>
          {detail.tags.map((t) => (
            <span key={t} className="chip chip-static !py-0 text-xs">
              #{t}
            </span>
          ))}
          <div role="group" aria-label="Modo" className="ml-auto flex overflow-hidden rounded-lg border border-border">
            <button onClick={() => setEditing(false)} aria-pressed={!editing} className={`px-3 py-1 text-sm ${!editing ? "bg-surface-2 text-foreground" : "text-muted hover:text-foreground"}`}>
              Leitura
            </button>
            <button
              onClick={() => {
                setDraft({ title: note.title, content: note.content_md ?? "", summary: note.summary ?? "" });
                setEditing(true);
              }}
              aria-pressed={editing}
              className={`px-3 py-1 text-sm ${editing ? "bg-surface-2 text-foreground" : "text-muted hover:text-foreground"}`}
            >
              Edição
            </button>
          </div>
        </div>
      </header>

      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-4 py-4">
        {/* Conteúdo */}
        <section>
          {editing ? (
            <div className="space-y-2">
              <input className="field text-sm" aria-label="Resumo" placeholder="Resumo em 1–2 frases" value={draft.summary} onChange={(e) => setDraft({ ...draft, summary: e.target.value })} />
              <WikilinkTextarea
                value={draft.content}
                onChange={(content) => setDraft((d) => ({ ...d, content }))}
                excludeId={note.id}
                autoFocus
                onSave={() => save({ content_md: draft.content, summary: draft.summary }, () => setEditing(false))}
              />
              <div className="flex items-center gap-2">
                <button disabled={pending} onClick={() => save({ content_md: draft.content, summary: draft.summary }, () => setEditing(false))} className="btn-primary">
                  {pending ? "Salvando…" : "Salvar"}
                </button>
                <button onClick={() => setEditing(false)} className="btn-ghost">
                  Cancelar
                </button>
                <span className="ml-auto hidden text-xs text-muted sm:inline">
                  <span className="kbd">Ctrl</span> + <span className="kbd">S</span> salva · <span className="kbd">Esc</span> cancela
                </span>
              </div>
            </div>
          ) : (
            <div onClick={onBodyClick}>
              {note.summary && <p className="mb-3 border-l-2 border-accent pl-3 text-[0.95rem] text-muted">{note.summary}</p>}
              {note.content_md ? (
                <div className="prose-jarvis text-[0.95rem]" dangerouslySetInnerHTML={{ __html: renderMarkdown(note.content_md) }} />
              ) : (
                <p className="text-sm text-muted">
                  Nota vazia.{" "}
                  <button className="text-accent-text underline underline-offset-2" onClick={() => { setDraft({ title: note.title, content: "", summary: note.summary ?? "" }); setEditing(true); }}>
                    Escreva com suas palavras
                  </button>{" "}
                  — use [[Título]] para conectar.
                </p>
              )}
            </div>
          )}
        </section>

        {/* Grafo local */}
        {onLocalGraph && (
          <section aria-label="Grafo local" className="flex flex-wrap items-center gap-2">
            <button onClick={() => onLocalGraph(depth)} className="btn-outline">
              <IconTarget width={18} height={18} /> Abrir grafo local
            </button>
            <div role="group" aria-label="Profundidade" className="flex items-center gap-1">
              <span className="label mr-1">Profundidade</span>
              {[1, 2, 3].map((d) => (
                <button key={d} className="chip" aria-pressed={depth === d} onClick={() => setDepth(d)}>
                  {d}
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Sugestões da IA */}
        {suggested.length > 0 && (
          <section aria-label="Sugestões da IA">
            <h3 className="mb-2 text-sm font-semibold">Sugestões da IA ({suggested.length})</h3>
            <ul className="space-y-2">
              {suggested.map((l) => (
                <li key={l.id} className="rounded-lg border border-accent/40 bg-accent-soft p-3 text-sm">
                  <p>
                    <span className="text-muted">{l.direction === "out" ? relationLabel(l.relation) : `${relationLabel(l.relation)} (recebida)`}: </span>
                    <button className="font-medium underline-offset-2 hover:underline" onClick={() => l.other && onSelect(l.other.id)}>
                      {l.other?.title}
                    </button>
                    {l.confidence != null && <span className="ml-1 text-xs text-muted">({Math.round(l.confidence * 100)}%)</span>}
                  </p>
                  {l.rationale && <p className="mt-1 text-xs text-muted">{l.rationale}</p>}
                  <div className="mt-2 flex gap-2">
                    <button className="btn-primary !py-1" onClick={() => start(async () => { await reviewLinkAction(l.id, "accepted"); load(); notifyChanged(); })}>
                      Aceitar
                    </button>
                    <button className="btn-outline !py-1" onClick={() => start(async () => { await reviewLinkAction(l.id, "rejected"); load(); notifyChanged(); })}>
                      Recusar
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Conexões por relação */}
        <section aria-label="Conexões">
          <h3 className="mb-2 text-sm font-semibold">Conexões ({accepted.length})</h3>
          {groups.length === 0 && <p className="text-sm text-muted">Sem conexões ainda. Crie uma nota ligada abaixo ou use [[Título]] ao editar.</p>}
          <div className="space-y-3">
            {groups.map(([label, rows]) => (
              <div key={label}>
                <p className="mb-1 text-xs font-medium text-muted">{label}</p>
                <ul className="flex flex-wrap gap-1.5">
                  {rows.map((l) => (
                    <li key={l.id}>
                      <button onClick={() => l.other && onSelect(l.other.id)} className="chip" title={l.rationale ?? undefined}>
                        <span className="h-2 w-2 rounded-full" style={{ background: typeColor(l.other!.type) }} />
                        {l.other!.title}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <form onSubmit={createLinked} className="mt-3 flex gap-2">
            <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} aria-label="Título da nova nota ligada" placeholder="Nova nota ligada a esta…" className="field !py-1.5 text-sm" />
            <button disabled={!newTitle.trim()} className="btn-outline shrink-0">
              Criar
            </button>
          </form>
        </section>

        {/* Arquivos */}
        <section aria-label="Arquivos">
          <h3 className="mb-2 flex items-center justify-between text-sm font-semibold">
            <span>Arquivos ({detail.files.length})</span>
            <button onClick={() => setShowAttach((v) => !v)} className="btn-ghost !py-0.5">
              {showAttach ? "Fechar" : "Anexar arquivo"}
            </button>
          </h3>
          {detail.files.length === 0 && !showAttach && <p className="text-sm text-muted">Nenhum arquivo anexado.</p>}
          <ul className="divide-y divide-border">
            {detail.files.map((f) => (
              <li key={f.id} className="flex items-center gap-3 py-2 text-sm">
                <span className="chip chip-static !py-0 text-xs">{fileTypeLabel(f.file_name, f.mime_type)}</span>
                <a href={`/api/files/${f.id}/download?inline=1`} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 truncate hover:text-accent-text">
                  {f.file_name}
                </a>
                <span className="shrink-0 text-xs text-muted">{formatBytes(f.size_bytes)}</span>
                <a href={`/api/files/${f.id}/download`} aria-label={`Baixar ${f.file_name}`} className="btn-ghost !p-1.5">
                  <IconDownload width={18} height={18} />
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

        {detail.excerpts.length > 0 && (
          <section aria-label="Origem">
            <h3 className="mb-2 text-sm font-semibold">De onde veio</h3>
            {detail.excerpts.map((x, i) => (
              <blockquote key={i} className="mb-2 border-l-2 border-border-strong pl-3 text-sm text-muted">
                “{x}”
              </blockquote>
            ))}
          </section>
        )}

        <section>
          <button
            onClick={() => {
              if (!confirm(`Apagar “${note.title}” e suas conexões?`)) return;
              start(async () => {
                await removeNoteAction(note.id);
                notifyChanged();
                onDeleted?.();
                onClose?.();
              });
            }}
            className="btn-ghost !text-danger"
          >
            <IconTrash width={18} height={18} /> Apagar nota
          </button>
        </section>
      </div>
    </article>
  );
}
