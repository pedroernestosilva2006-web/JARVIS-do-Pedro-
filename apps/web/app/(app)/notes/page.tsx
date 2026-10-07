import Link from "next/link";
import { NOTE_TYPES, TYPE_LABELS, isNoteType } from "@jarvis/core";
import { PageHeader } from "@/components/brand/motifs";
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
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-6 md:px-10 md:py-10">
      <PageHeader
        index="02 — Notas"
        section="Atômicas · Conectadas"
        title="Tudo é nota"
        subtitle="Insights, pessoas, livros, eventos, ideias e MOCs. Busque, filtre ou crie uma nova."
        actions={
        <div className="flex flex-wrap items-center gap-3"><Link href="/timeline" className="text-[10.5px] uppercase tracking-[0.14em] text-muted hover:text-foreground">Timeline</Link>
        <form action={createNoteAction} className="flex gap-2">
            <select name="type" defaultValue="insight" className="field !w-auto !py-1.5 text-sm">
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
              className="field text-sm "
            />
            <button className="btn-primary px-3">Criar</button>
          </form></div>
        }
      />

      <form className="flex flex-wrap gap-2">
        <input
          name="q"
          defaultValue={q}
          placeholder="Buscar…"
          className="field flex-1 text-sm "
        />
        <select name="type" defaultValue={typeFilter ?? ""} className="field !w-auto !py-1.5 text-sm">
          <option value="">Todos os tipos</option>
          {NOTE_TYPES.map((t) => (
            <option key={t} value={t}>
              {TYPE_LABELS[t]}
            </option>
          ))}
        </select>
        <button className="btn-outline px-4">Buscar</button>
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
