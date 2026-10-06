import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { strToU8, zipSync } from "fflate";
import { noteToMarkdown, uniqueExportPaths, type ExportLink, type ExportNote } from "@jarvis/core";

const PAGE = 1000;

async function fetchAll<T>(query: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>) {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await query(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) return out;
  }
}

/**
 * Gera um vault do Obsidian (.zip) com todas as notas do workspace:
 * <Tipo>/<Título>.md com frontmatter e conexões. Sem embeddings nem fontes brutas.
 */
export async function buildVaultZip(db: SupabaseClient, workspaceId: string): Promise<{ zip: Uint8Array; count: number }> {
  const notes = await fetchAll<ExportNote>((from, to) =>
    db
      .from("notes")
      .select("id, type, title, content_md, summary, properties, para_bucket, stage, aliases, created_at, updated_at")
      .eq("workspace_id", workspaceId)
      .order("created_at")
      .range(from, to),
  );
  const links = await fetchAll<{ from_note: string; to_note: string; relation: string; status: string; rationale: string | null }>(
    (from, to) =>
      db
        .from("links")
        .select("from_note, to_note, relation, status, rationale")
        .eq("workspace_id", workspaceId)
        .neq("status", "rejected")
        .order("created_at")
        .range(from, to),
  );

  const paths = uniqueExportPaths(notes);
  const outgoing = new Map<string, ExportLink[]>();
  for (const l of links) {
    const target = paths.get(l.to_note);
    if (!target || !paths.has(l.from_note)) continue;
    const list = outgoing.get(l.from_note) ?? [];
    // O destino é referenciado pelo nome real do arquivo (pode ter sufixo de desambiguação)
    list.push({ to_title: target.fileTitle, relation: l.relation, status: l.status, rationale: l.rationale });
    outgoing.set(l.from_note, list);
  }

  const files: Record<string, Uint8Array> = {};
  for (const n of notes) {
    const p = paths.get(n.id)!;
    files[p.path] = strToU8(noteToMarkdown(n, outgoing.get(n.id) ?? [], p.fileTitle));
  }
  files["LEIA-ME.md"] = strToU8(
    `# Exportação do JARVIS\n\nGerada em ${new Date().toISOString()} com ${notes.length} notas.\n\n` +
      "Abra esta pasta como um vault no Obsidian. As conexões ficam em `## Conexões` como `relação:: [[Nota]]` " +
      "(compatível com o plugin Dataview). Sugestões da IA não revisadas aparecem separadas.\n",
  );
  return { zip: zipSync(files, { level: 6 }), count: notes.length };
}
