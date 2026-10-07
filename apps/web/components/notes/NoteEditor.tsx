"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { NOTE_TYPES, STAGES, TYPE_LABELS } from "@jarvis/core";
import { deleteNoteAction, saveNoteAction } from "@/app/(app)/actions";
import { completeWikilink, openWikilinkQuery } from "@/lib/wikilink-autocomplete";

type Suggestion = { id: string; title: string; type: string };

/** Textarea markdown com autocomplete ao digitar [[ */
function WikilinkTextarea({
  value,
  onChange,
  className,
  excludeId,
}: {
  value: string;
  onChange: (v: string) => void;
  className: string;
  excludeId: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [query, setQuery] = useState<string | null>(null);
  const [items, setItems] = useState<Suggestion[]>([]);
  const [active, setActive] = useState(0);

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
        className={className}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          refresh(e.target.value, e.target.selectionStart);
        }}
        onClick={(e) => refresh(value, e.currentTarget.selectionStart)}
        onKeyDown={(e) => {
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
            setQuery(null);
          }
        }}
        placeholder="Escreva em markdown. Digite [[ para ligar a outra nota."
      />
      {open && (
        <ul className="absolute bottom-2 left-2 z-10 w-80 overflow-hidden rounded-md border border-border bg-panel shadow-xl">
          <li className="px-3 py-1 text-xs text-muted">Ligar a… (↑↓ Enter)</li>
          {items.map((it, i) => (
            <li key={it.id}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(it.title);
                }}
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm ${i === active ? "bg-accent-2/40" : "hover:bg-panel-2"}`}
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

interface Props {
  note: { id: string; title: string; content_md: string; summary: string | null; type: string; stage: string; aliases: string[] };
  renderedHtml: string;
  startEditing?: boolean;
  /** Chamado depois de salvar (o painel do grafo atualiza o conteúdo e o desenho). */
  onSaved?: () => void;
  /** Esconde o título grande (o painel já mostra o seu). */
  compactTitle?: boolean;
}

/** Visualização/edição de nota. Markdown com [[wikilinks]] — ao salvar, os links do grafo são sincronizados. */
export function NoteEditor({ note, renderedHtml, startEditing, onSaved, compactTitle }: Props) {
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
        onSaved?.();
      } catch (e) {
        setMsg(`Erro: ${e instanceof Error ? e.message : e}`);
      }
    });

  if (!editing) {
    return (
      <div>
        <div className="mb-2 flex items-start justify-between gap-4">
          <h1 className={compactTitle ? "text-lg font-medium leading-snug text-foreground" : "text-2xl font-medium leading-snug tracking-tight text-foreground md:text-3xl"}>{note.title}</h1>
          <button onClick={() => setEditing(true)} className="btn-outline shrink-0 px-3.5 py-1.5">
            Editar
          </button>
        </div>
        {note.summary && <p className="mb-6 border-l border-border pl-3 text-muted">{note.summary}</p>}
        {note.content_md ? (
          <div className="prose-jarvis" dangerouslySetInnerHTML={{ __html: renderedHtml }} />
        ) : (
          <p className="text-sm italic text-muted">Nota vazia. Clique em Editar e escreva com suas palavras — use [[Título]] para conectar.</p>
        )}
        {msg && <p className="mt-2 text-xs text-muted">{msg}</p>}
      </div>
    );
  }

  const field = "field text-sm";
  return (
    <div className="space-y-3">
      <input className={`${field} text-lg font-semibold`} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
      <div className="flex flex-wrap gap-2">
        <select className="field !w-auto !py-1.5 text-sm" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
          {NOTE_TYPES.map((t) => (
            <option key={t} value={t}>
              {TYPE_LABELS[t]}
            </option>
          ))}
        </select>
        <select className="field !w-auto !py-1.5 text-sm" value={form.stage} onChange={(e) => setForm({ ...form, stage: e.target.value })}>
          {STAGES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <input className="flex-1 field !w-auto !py-1.5 text-sm" placeholder="Apelidos (separados por vírgula)" value={form.aliases} onChange={(e) => setForm({ ...form, aliases: e.target.value })} />
      </div>
      <input className={field} placeholder="Resumo em 1-2 frases" value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} />
      <WikilinkTextarea
        className={`${field} min-h-[320px] font-mono`}
        value={form.content_md}
        onChange={(content_md) => setForm((f) => ({ ...f, content_md }))}
        excludeId={note.id}
      />
      <div className="flex items-center gap-2">
        <button disabled={pending} onClick={save} className="btn-primary px-3 py-1.5 disabled:opacity-50">
          {pending ? "Salvando…" : "Salvar"}
        </button>
        <button onClick={() => setEditing(false)} className="px-2 text-[11px] uppercase tracking-[0.14em] text-muted hover:text-foreground">
          Cancelar
        </button>
        <button
          onClick={() => confirm("Apagar esta nota e suas conexões?") && start(() => deleteNoteAction(note.id))}
          className="ml-auto text-[11px] uppercase tracking-[0.14em] text-[var(--signal)] hover:opacity-80"
        >
          Apagar
        </button>
      </div>
      {msg && <p className="text-xs text-muted">{msg}</p>}
    </div>
  );
}
