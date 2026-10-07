import { TimelineBrowser, type TimelineEntry } from "@/components/timeline/TimelineBrowser";
import { aiProvider } from "@/lib/ai/llm";
import { daysAgoIso, daysFromNowIso } from "@/lib/dates";
import { requireWorkspace } from "@/lib/workspace";

export const metadata = { title: "Timeline — JARVIS" };

/** Tudo o que entrou no cérebro, mês a mês: notas (eventos/diário pela data própria) e arquivos. */
export default async function TimelinePage({ searchParams }: { searchParams: Promise<{ sel?: string }> }) {
  const { sel } = await searchParams;
  const { supabase, workspaceId } = await requireWorkspace();
  const [{ data: notes }, { data: files }] = await Promise.all([
    supabase.rpc("timeline", { p_workspace: workspaceId, p_from: daysAgoIso(365), p_to: daysFromNowIso(365), p_types: null }),
    supabase
      .from("attachments")
      .select("id, file_name, mime_type, size_bytes, created_at, note:notes(id, title)")
      .eq("workspace_id", workspaceId)
      .gte("created_at", daysAgoIso(365))
      .order("created_at", { ascending: false })
      .limit(300),
  ]);
  const entries: TimelineEntry[] = [
    ...((notes ?? []) as { id: string; type: string; title: string; summary: string | null; happened_at: string; note_count: number }[]).map((n) => ({
      kind: "note" as const,
      id: n.id,
      at: n.happened_at,
      type: n.type,
      title: n.title,
      summary: n.summary,
      learned: n.note_count,
    })),
    ...(files ?? []).map((f) => ({
      kind: "file" as const,
      id: f.id,
      at: f.created_at,
      title: f.file_name,
      file: { ...f, note: f.note as unknown as { id: string; title: string } | null },
    })),
  ].sort((a, b) => +new Date(b.at) - +new Date(a.at));
  return <TimelineBrowser entries={entries} sel={sel && /^[0-9a-f-]{36}$/i.test(sel) ? sel : null} aiReady={aiProvider().kind !== "none"} />;
}
