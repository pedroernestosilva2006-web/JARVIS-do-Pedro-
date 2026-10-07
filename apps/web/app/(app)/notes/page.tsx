import { NotesBrowser, type NoteListItem } from "@/components/notes/NotesBrowser";
import { aiProvider } from "@/lib/ai/llm";
import { requireWorkspace } from "@/lib/workspace";

export const metadata = { title: "Notas — JARVIS" };

const COLS = "id, type, title, summary, stage, created_at";

export default async function NotesPage({ searchParams }: { searchParams: Promise<{ q?: string; type?: string; stage?: string; sel?: string }> }) {
  const { q, type, stage, sel } = await searchParams;
  const { supabase, workspaceId } = await requireWorkspace();

  let notes: NoteListItem[] = [];
  const search = q?.trim();
  if (search) {
    // Busca por palavra-chave (FTS em português) + títulos; a busca semântica fica no chat/MCP
    const { data } = await supabase.rpc("hybrid_search", { p_workspace: workspaceId, query_text: search, match_count: 30, p_types: type ? [type] : null });
    notes = (data ?? []) as NoteListItem[];
    if (!notes.length) {
      const { data: byTitle } = await supabase
        .from("notes")
        .select(COLS)
        .eq("workspace_id", workspaceId)
        .ilike("title", `%${search.replace(/[%_,()]/g, "")}%`)
        .limit(30);
      notes = (byTitle ?? []) as NoteListItem[];
    }
  } else {
    let query = supabase.from("notes").select(COLS).eq("workspace_id", workspaceId).order("updated_at", { ascending: false }).limit(300);
    if (type) query = query.eq("type", type);
    const { data } = await query;
    notes = (data ?? []) as NoteListItem[];
  }
  if (stage) notes = notes.filter((n) => n.stage === stage);

  // Contagem por tipo para os chips (sempre sobre todo o acervo)
  const { data: all } = await supabase.from("notes").select("type").eq("workspace_id", workspaceId).limit(5000);
  const counts: Record<string, number> = {};
  for (const r of all ?? []) counts[r.type as string] = (counts[r.type as string] ?? 0) + 1;

  return (
    <NotesBrowser
      notes={notes}
      typeCounts={counts}
      q={search ?? ""}
      type={type ?? ""}
      stage={stage ?? ""}
      sel={sel && /^[0-9a-f-]{36}$/i.test(sel) ? sel : null}
      aiReady={aiProvider().kind !== "none"}
    />
  );
}
