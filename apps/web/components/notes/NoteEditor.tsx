"use client";

import { useState, useTransition } from "react";
import { NOTE_TYPES, STAGES, TYPE_LABELS } from "@jarvis/core";
import { deleteNoteAction, saveNoteAction } from "@/app/(app)/actions";

interface Props {
  note: { id: string; title: string; content_md: string; summary: string | null; type: string; stage: string; aliases: string[] };
  renderedHtml: string;
  startEditing?: boolean;
}

/** Visualização/edição de nota. Markdown com [[wikilinks]] — ao salvar, os links do grafo são sincronizados. */
export function NoteEditor({ note, renderedHtml, startEditing }: Props) {
  const [editing, setEditing] = useState(!!startEditing);
  const [form, setForm] = useState({
    title: note.title,
    content_md: note.content_md,
    summary: note.summary ?? "",
    type: note.type,
    stage: note.stage,
    aliases: note.aliases.join(", "),
  });
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();

  const save = () =>
    start(async () => {
      try {
        const r = await saveNoteAction(note.id, form);
        setMsg(`Salvo. Links: +${r.added} −${r.removed}`);
        setEditing(false);
      } catch (e) {
        setMsg(`Erro: ${e instanceof Error ? e.message : e}`);
      }
    });

  if (!editing) {
    return (
      <div>
        <div className="mb-2 flex items-start justify-between gap-4">
          <h1 className="text-2xl font-bold">{note.title}</h1>
          <button onClick={() => setEditing(true)} className="shrink-0 rounded-md border border-border px-2.5 py-1 text-sm hover:border-accent">
            Editar
          </button>
        </div>
        {note.summary && <p className="mb-4 text-muted">{note.summary}</p>}
        {note.content_md ? (
          <div className="prose-jarvis" dangerouslySetInnerHTML={{ __html: renderedHtml }} />
        ) : (
          <p className="text-sm italic text-muted">Nota vazia. Clique em Editar e escreva com suas palavras — use [[Título]] para conectar.</p>
        )}
        {msg && <p className="mt-2 text-xs text-muted">{msg}</p>}
      </div>
    );
  }

  const field = "w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent";
  return (
    <div className="space-y-3">
      <input className={`${field} text-lg font-semibold`} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
      <div className="flex flex-wrap gap-2">
        <select className="rounded-md border border-border bg-background px-2 py-1 text-sm" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
          {NOTE_TYPES.map((t) => (
            <option key={t} value={t}>
              {TYPE_LABELS[t]}
            </option>
          ))}
        </select>
        <select className="rounded-md border border-border bg-background px-2 py-1 text-sm" value={form.stage} onChange={(e) => setForm({ ...form, stage: e.target.value })}>
          {STAGES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <input className="flex-1 rounded-md border border-border bg-background px-2 py-1 text-sm" placeholder="Apelidos (separados por vírgula)" value={form.aliases} onChange={(e) => setForm({ ...form, aliases: e.target.value })} />
      </div>
      <input className={field} placeholder="Resumo em 1-2 frases" value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} />
      <textarea
        className={`${field} min-h-[320px] font-mono`}
        value={form.content_md}
        onChange={(e) => setForm({ ...form, content_md: e.target.value })}
        placeholder="Escreva em markdown. Use [[Título de outra nota]] para criar conexões."
      />
      <div className="flex items-center gap-2">
        <button disabled={pending} onClick={save} className="rounded-md bg-accent-2 px-3 py-1.5 text-sm text-white hover:bg-accent disabled:opacity-50">
          {pending ? "Salvando…" : "Salvar"}
        </button>
        <button onClick={() => setEditing(false)} className="px-2 text-sm text-muted hover:text-foreground">
          Cancelar
        </button>
        <button
          onClick={() => confirm("Apagar esta nota e suas conexões?") && start(() => deleteNoteAction(note.id))}
          className="ml-auto text-sm text-red-400 hover:text-red-300"
        >
          Apagar
        </button>
      </div>
      {msg && <p className="text-xs text-muted">{msg}</p>}
    </div>
  );
}
