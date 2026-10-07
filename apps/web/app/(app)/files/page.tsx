import Link from "next/link";
import { PageHeader } from "@/components/brand/motifs";
import { AddPanel } from "@/components/add/AddPanel";
import { Button, Card, timeAgo } from "@/components/ui";
import { aiProvider } from "@/lib/ai/llm";
import { fileTypeLabel, formatBytes } from "@/lib/files/rules";
import { requireWorkspace } from "@/lib/workspace";
import { deleteAttachmentAction } from "../actions";

export const metadata = { title: "Arquivos — JARVIS" };

export default async function FilesPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const { supabase, workspaceId } = await requireWorkspace();

  let query = supabase
    .from("attachments")
    .select("id, file_name, mime_type, size_bytes, created_at, note:notes(id, title)")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (q?.trim()) query = query.ilike("file_name", `%${q.replace(/[%_,()]/g, "")}%`);
  const { data: files } = await query;
  const total = (files ?? []).reduce((a, f) => a + (f.size_bytes ?? 0), 0);

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-6 md:px-10 md:py-10">
      <PageHeader
        index="03 — Arquivos"
        section="Biblioteca"
        title="Tudo o que você guardou"
        subtitle="PDFs, imagens, áudios e textos. Marque “Jarvis analisar” ao enviar para virarem notas no cérebro."
      />

      <Card title="Enviar arquivos">
        <AddPanel aiReady={aiProvider().kind !== "none"} />
      </Card>

      <form className="flex gap-2">
        <input name="q" defaultValue={q} placeholder="Buscar pelo nome do arquivo…" className="field" />
        <button className="btn-outline shrink-0 px-4">Buscar</button>
      </form>

      <Card title={`${files?.length ?? 0} arquivo(s) · ${formatBytes(total)}`}>
        {!files?.length && <p className="text-sm text-muted">Nenhum arquivo ainda. Arraste um para a caixa acima.</p>}
        <ul className="divide-y divide-border">
          {(files ?? []).map((f) => {
            const note = f.note as unknown as { id: string; title: string } | null;
            return (
              <li key={f.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 text-sm">
                <span className="kicker w-14 shrink-0">{fileTypeLabel(f.file_name, f.mime_type)}</span>
                <a href={`/api/files/${f.id}/download`} className="min-w-0 flex-1 truncate hover:underline">
                  {f.file_name}
                </a>
                {note && (
                  <Link href={`/graph?focus=${note.id}`} className="max-w-[12rem] truncate text-xs text-muted hover:text-foreground">
                    ↳ {note.title}
                  </Link>
                )}
                <span className="text-xs text-muted">{formatBytes(f.size_bytes ?? 0)}</span>
                <span className="text-xs text-muted">{timeAgo(f.created_at)}</span>
                <form action={deleteAttachmentAction.bind(null, f.id)}>
                  <Button variant="ghost" title="Apagar arquivo">
                    Apagar
                  </Button>
                </form>
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}
