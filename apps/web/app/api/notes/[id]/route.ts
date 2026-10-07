import { getAppContext } from "@/lib/access";

/** Detalhes de uma nota para o painel do cérebro: conteúdo, conexões, arquivos e fontes. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAppContext();
  if (!ctx) return new Response("unauthorized", { status: 401 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("not found", { status: 404 });
  const { db, workspaceId } = ctx;

  const { data: note } = await db
    .from("notes")
    .select("id, type, title, content_md, summary, properties, stage, para_bucket, aliases, created_by, created_at, updated_at")
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (!note) return new Response("not found", { status: 404 });

  const [{ data: outgoing }, { data: incoming }, { data: sources }] = await Promise.all([
    db
      .from("links")
      .select("id, relation, status, rationale, other:notes!links_to_note_fkey(id, title, type)")
      .eq("workspace_id", workspaceId)
      .eq("from_note", id)
      .neq("status", "rejected"),
    db
      .from("links")
      .select("id, relation, status, rationale, other:notes!links_from_note_fkey(id, title, type)")
      .eq("workspace_id", workspaceId)
      .eq("to_note", id)
      .neq("status", "rejected"),
    db.from("note_sources").select("source_id, excerpt").eq("workspace_id", workspaceId).eq("note_id", id),
  ]);

  // Arquivos da nota: anexados direto a ela, ou os que originaram as fontes dela
  const sourceIds = (sources ?? []).map((s) => s.source_id as string);
  const filter = sourceIds.length ? `note_id.eq.${id},source_id.in.(${sourceIds.join(",")})` : `note_id.eq.${id}`;
  const { data: files } = await db
    .from("attachments")
    .select("id, file_name, mime_type, size_bytes, created_at")
    .eq("workspace_id", workspaceId)
    .or(filter)
    .order("created_at", { ascending: false });

  return Response.json({
    note,
    links: [
      ...(outgoing ?? []).map((l) => ({ ...l, direction: "out" as const })),
      ...(incoming ?? []).map((l) => ({ ...l, direction: "in" as const })),
    ],
    files: files ?? [],
    excerpts: (sources ?? []).map((s) => s.excerpt).filter(Boolean),
  });
}
