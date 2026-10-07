import { after } from "next/server";
import { randomUUID } from "node:crypto";
import { extractUrl, type NormalizedCapture, type SourceKind } from "@jarvis/core";
import { saveCapture } from "@/lib/capture/store";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAppContext } from "@/lib/access";
import { drainQueues } from "@/lib/workers/drain";

export const maxDuration = 300;

const MAX_UPLOAD = 25 * 1024 * 1024;

function kindFromMime(mime: string): SourceKind | null {
  if (mime === "application/pdf") return "pdf";
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("audio/") || mime === "video/webm" || mime === "video/mp4") return "audio";
  return null;
}

/** Captura pela web/PWA: texto, link ou arquivo (áudio, imagem, PDF). multipart/form-data. */
export async function POST(req: Request) {
  const ctx = await getAppContext();
  if (!ctx) return new Response("unauthorized", { status: 401 });
  const { workspaceId, user } = ctx;

  const form = await req.formData();
  const text = String(form.get("text") ?? "").trim();
  const file = form.get("file");
  const contextNoteId = String(form.get("context_note_id") ?? "") || null;

  const capture: NormalizedCapture = {
    channel: "web",
    kind: "text",
    externalUserId: user.id,
    idempotencyKey: `web:${randomUUID()}`,
    text: text || undefined,
    metadata: { user_id: user.id },
    capturedAt: new Date().toISOString(),
  };
  let storagePath: string | null = null;

  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_UPLOAD) return Response.json({ error: "Arquivo acima de 25 MB" }, { status: 413 });
    const kind = kindFromMime(file.type);
    if (!kind) return Response.json({ error: `Tipo não suportado: ${file.type}` }, { status: 415 });
    const ext = file.name.split(".").pop() ?? file.type.split("/")[1] ?? "bin";
    storagePath = `${workspaceId}/${randomUUID()}.${ext}`;
    // Upload com service_role, sempre dentro da pasta do workspace do usuário autenticado
    const { error } = await createAdminClient()
      .storage.from("captures")
      .upload(storagePath, await file.arrayBuffer(), { contentType: file.type });
    if (error) return Response.json({ error: error.message }, { status: 500 });
    capture.kind = kind;
    capture.metadata = { ...capture.metadata, mime_type: file.type, file_ext: ext, file_name: file.name, file_size: file.size };
  } else if (text) {
    const url = extractUrl(text);
    if (url && text.replace(url, "").trim().length < 40) {
      capture.kind = "link";
      capture.url = url;
    }
  } else {
    return Response.json({ error: "Envie um texto, link ou arquivo" }, { status: 400 });
  }

  const { sourceId } = await saveCapture(workspaceId, capture, contextNoteId, storagePath);
  after(() => drainQueues({ captures: 1, embeddings: 0 }).then(() => undefined));
  return Response.json({ sourceId });
}
