import { FilesBrowser } from "@/components/files/FilesBrowser";
import type { FileItem } from "@/components/files/FileDetail";
import { requireWorkspace } from "@/lib/workspace";

export const metadata = { title: "Arquivos — JARVIS" };

export default async function FilesPage({ searchParams }: { searchParams: Promise<{ sel?: string }> }) {
  const { sel } = await searchParams;
  const { supabase, workspaceId } = await requireWorkspace();
  const { data } = await supabase
    .from("attachments")
    .select("id, file_name, mime_type, size_bytes, created_at, note:notes(id, title)")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(500);
  const files = (data ?? []).map((f) => ({ ...f, note: f.note as unknown as { id: string; title: string } | null })) as FileItem[];
  return <FilesBrowser files={files} sel={sel && /^[0-9a-f-]{36}$/i.test(sel) ? sel : null} />;
}
