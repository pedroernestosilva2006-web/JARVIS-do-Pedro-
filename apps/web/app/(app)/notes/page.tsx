import Link from "next/link";
import { NOTE_TYPES, TYPE_LABELS, isNoteType } from "@jarvis/core";
import { Card, NoteLink, StageBadge, TypeBadge, timeAgo } from "@/components/ui";
import { requireWorkspace } from "@/lib/workspace";
import { createNoteAction } from "../actions";

export const metadata = { title: "Notas — JARVIS" };

export default async function NotesPage({ searchParams }: { searchParams: Promise<{ q?: string; type?: string }> }) {
  const { q, type } = await searchParams;
  const { supabase, workspaceId } = await requireWorkspace();
  const typeFilter = type && isNoteType(type) ? type : null;

  let notes: { id: string; type: string; title: string; summary: string | null; stage: string; created_at: string }[] = [];
  if (q?.trim()) {
    // Busca por palavra-chave (FTS em português); a busca semântica fica no chat/MCP
    const { data } = await supabase.rpc("hybrid_search", {
      p_workspace: workspaceId,
      query_text: q,
      match_count: 30,
      p_types: typeFilter ? [typeFilter] : null,
    });
    notes = data ?? [];
    if (!notes.length) {
      const { data: byTitle } = await supabase
        .from("notes")
        .select("id, type, title, summary, stage, created_at")
        .eq("workspace_id", workspaceId)
        .ilike("title", `%${q.replace(/[%_]/g, "")}%`)
        .limit(30);
      notes = byTitle ?? [];
    }
  } else {
    let query = supabase
      .from("notes")
      .select("id, type, title, summary, stage, created_at")
      .eq("workspace_id", workspaceId)
      .order("updated_at", { ascending: false })
      .limit(100);
    if (typeFilter) query = query.eq("type", typeFilter);
    notes = (await query).data ?? [];
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Notas</h1>
          <p className="text-sm text-muted">Tudo é nota: insights, pessoas, livros, eventos, ideias, MOCs.</p>
        </div>
        <form action={createNoteAction} className="flex gap-2">
          <select name="type" defaultValue="insight" className="rounded-md border border-border bg-panel px-2 text-sm">
            {NOTE_TYPES.map((t) => (
              <option key={t} value={t}>
                {TYPE_LABELS[t]}
              </option>
            ))}
          </select>
          <input
            name="title"
            required
            placeholder="Título da nova nota"
            className="rounded-md border border-border bg-panel px-3 py-1.5 text-sm outline-none focus:border-accent"
          />
          <button className="rounded-md bg-accent-2 px-3 text-sm text-white hover:bg-accent">Criar</button>
        </form>
      </header>

      <form className="flex flex-wrap gap-2">
        <input
          name="q"
          defaultValue={q}
          placeholder="Buscar…"
          className="flex-1 rounded-md border border-border bg-panel px-3 py-2 text-sm outline-none focus:border-accent"
        />
        <select name="type" defaultValue={typeFilter ?? ""} className="rounded-md border border-border bg-panel px-2 text-sm">
          <option value="">Todos os tipos</option>
          {NOTE_TYPES.map((t) => (
            <option key={t} value={t}>
              {TYPE_LABELS[t]}
            </option>
          ))}
        </select>
        <button className="rounded-md border border-border px-3 text-sm hover:border-accent">Buscar</button>
        {(q || typeFilter) && (
          <Link href="/notes" className="self-center text-xs text-muted hover:text-foreground">
            limpar
          </Link>
        )}
      </form>

      <Card>
        {!notes.length && <p className="text-sm text-muted">Nenhuma nota encontrada.</p>}
        <ul className="divide-y divide-border">
          {notes.map((n) => (
            <li key={n.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
              <TypeBadge type={n.type} />
              <NoteLink id={n.id} title={n.title} />
              <StageBadge stage={n.stage} />
              <span className="ml-auto text-xs text-muted">{timeAgo(n.created_at)}</span>
              {n.summary && <p className="w-full truncate text-xs text-muted">{n.summary}</p>}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
