import { after } from "next/server";
import { z } from "zod";
import { getAppContext } from "@/lib/access";
import { aiProvider } from "@/lib/ai/llm";
import { analyzableKind, analyzeVerdict, fileExtension, MAX_TEXT_ANALYZE_BYTES } from "@/lib/files/rules";
import { createAdminClient } from "@/lib/supabase/admin";
import { drainQueues } from "@/lib/workers/drain";

export const maxDuration = 300;

const Body = z.object({
  path: z.string().min(1).max(500),
  fileName: z.string().min(1).max(255),
  mimeType: z.string().max(200).optional(),
  noteId: z.string().uuid().nullish(),
  /** Pede ao Jarvis para ler o arquivo e criar notas (quando o tipo permite). */
  analyze: z.boolean().optional(),
  note: z.string().max(5000).optional(),
});

/**
 * Passo 2 do upload: confirma que o arquivo chegou ao Storage, cataloga em `attachments` e,
 * se pedido, cria uma fonte para o pipeline analisar (PDF, imagem, áudio e texto).
 */
export async function POST(req: Request) {
  const ctx = await getAppContext();
  if (!ctx) return new Response("unauthorized", { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Dados inválidos." }, { status: 400 });
  const { path, fileName, mimeType, noteId, analyze, note } = parsed.data;

  // O caminho tem de estar na pasta de arquivos DESTE workspace (impede apontar para arquivos alheios)
  if (!path.startsWith(`${ctx.workspaceId}/files/`) || path.includes("..")) {
    return Response.json({ error: "Caminho inválido." }, { status: 400 });
  }
  const admin = createAdminClient();

  // O arquivo precisa existir de fato; o tamanho vem do Storage (não confiamos no cliente)
  const folder = path.slice(0, path.lastIndexOf("/"));
  const name = path.slice(path.lastIndexOf("/") + 1);
  const { data: listed, error: listErr } = await admin.storage.from("captures").list(folder, { search: name, limit: 5 });
  const object = listed?.find((o) => o.name === name);
  if (listErr || !object) return Response.json({ error: "O arquivo não chegou ao armazenamento. Tente enviar de novo." }, { status: 400 });
  const size = Number((object.metadata as { size?: number } | null)?.size ?? 0);

  if (noteId) {
    const { data: n } = await admin.from("notes").select("id").eq("id", noteId).eq("workspace_id", ctx.workspaceId).maybeSingle();
    if (!n) return Response.json({ error: "Nota não encontrada." }, { status: 404 });
  }

  let sourceId: string | null = null;
  let analysis: { requested: boolean; started: boolean; reason?: string } = { requested: Boolean(analyze), started: false };
  const kind = analyzableKind(fileName, mimeType);
  if (analyze) {
    const verdict = analyzeVerdict(kind, size);
    if (!verdict.ok) analysis = { requested: true, started: false, reason: verdict.reason };
    else if (aiProvider().kind === "none") {
      analysis = { requested: true, started: false, reason: "a Claude API ainda não está conectada (veja Ajustes)" };
    } else if (kind) {
      // Texto vira a própria captura (lemos o conteúdo); os demais são lidos do Storage pelo pipeline
      let rawText: string | null = note ?? null;
      if (kind === "text") {
        const { data: blob } = await admin.storage.from("captures").download(path);
        const text = blob ? (await blob.text()).slice(0, MAX_TEXT_ANALYZE_BYTES) : "";
        rawText = note ? `${note}\n\n${text}` : text;
      }
      const { data: src, error: srcErr } = await admin
        .from("sources")
        .insert({
          workspace_id: ctx.workspaceId,
          channel: "web",
          kind,
          idempotency_key: `file:${path}`,
          raw_text: rawText,
          storage_path: kind === "text" ? null : path,
          metadata: { mime_type: mimeType ?? null, file_ext: fileExtension(fileName), file_name: fileName, file_size: size },
          context_note_id: noteId ?? null,
        })
        .select("id")
        .single();
      if (srcErr) return Response.json({ error: `Falha ao iniciar a análise: ${srcErr.message}` }, { status: 500 });
      sourceId = src.id as string;
      analysis = { requested: true, started: true };
      after(() => drainQueues({ captures: 1, embeddings: 0 }).then(() => undefined));
    }
  }

  const { data: att, error } = await admin
    .from("attachments")
    .insert({
      workspace_id: ctx.workspaceId,
      note_id: noteId ?? null,
      source_id: sourceId,
      storage_path: path,
      file_name: fileName,
      mime_type: mimeType ?? null,
      size_bytes: size,
    })
    .select("id")
    .single();
  if (error) return Response.json({ error: `Falha ao registrar o arquivo: ${error.message}` }, { status: 500 });
  return Response.json({ attachmentId: att.id, sourceId, size, analysis });
}
