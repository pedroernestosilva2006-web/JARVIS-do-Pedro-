"use client";

import { createClient } from "@/lib/supabase/client";
import { MAX_FILE_BYTES } from "./rules";

export interface UploadResult {
  ok: boolean;
  error?: string;
  attachmentId?: string;
  analysis?: { requested: boolean; started: boolean; reason?: string };
}

async function readError(res: Response): Promise<string> {
  try {
    const j = await res.json();
    if (j?.error) return String(j.error);
  } catch {}
  return res.status === 413 ? "Arquivo grande demais." : `Erro ${res.status}`;
}

/**
 * Envia um arquivo em 3 passos: pede URL assinada → envia direto ao Storage → confirma/cataloga.
 * Não passa pela Vercel (limite de ~4,5 MB por requisição).
 */
export async function uploadFile(
  file: File,
  opts: { noteId?: string | null; analyze: boolean; note?: string },
  onStage?: (stage: string) => void,
): Promise<UploadResult> {
  if (file.size > MAX_FILE_BYTES) return { ok: false, error: `Acima de ${MAX_FILE_BYTES / 1024 / 1024} MB.` };
  try {
    onStage?.("preparando");
    const signRes = await fetch("/api/files/sign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileName: file.name, mimeType: file.type || undefined, size: file.size }),
    });
    if (!signRes.ok) return { ok: false, error: await readError(signRes) };
    const { path, token } = (await signRes.json()) as { path: string; token: string };

    onStage?.("enviando");
    const { error: upErr } = await createClient()
      .storage.from("captures")
      .uploadToSignedUrl(path, token, file, { contentType: file.type || "application/octet-stream" });
    if (upErr) return { ok: false, error: `Falha no envio: ${upErr.message}` };

    onStage?.("guardando");
    const commitRes = await fetch("/api/files/commit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        path,
        fileName: file.name,
        mimeType: file.type || undefined,
        noteId: opts.noteId ?? null,
        analyze: opts.analyze,
        note: opts.note,
      }),
    });
    if (!commitRes.ok) return { ok: false, error: await readError(commitRes) };
    const body = (await commitRes.json()) as { attachmentId: string; analysis: UploadResult["analysis"] };
    return { ok: true, attachmentId: body.attachmentId, analysis: body.analysis };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Falha de rede." };
  }
}

/** Avisa o resto da tela (grafo, listas) que algo mudou. */
export function notifyChanged() {
  window.dispatchEvent(new Event("jarvis:changed"));
}
