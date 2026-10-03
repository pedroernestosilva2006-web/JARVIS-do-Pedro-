import "server-only";
import type { NormalizedCapture } from "@jarvis/core";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Grava uma captura normalizada como source 'pending'. O trigger do banco enfileira no pgmq.
 * Idempotente: a mesma mensagem reenviada pelo webhook não gera duas fontes.
 */
export async function saveCapture(
  workspaceId: string,
  capture: NormalizedCapture,
  contextNoteId: string | null,
  storagePath: string | null = null,
): Promise<{ sourceId: string | null; duplicate: boolean }> {
  const db = createAdminClient();
  const { data, error } = await db
    .from("sources")
    .insert({
      workspace_id: workspaceId,
      channel: capture.channel,
      kind: capture.kind,
      idempotency_key: capture.idempotencyKey,
      raw_text: capture.text ?? null,
      url: capture.url ?? null,
      storage_path: storagePath,
      metadata: capture.metadata,
      context_note_id: contextNoteId,
      captured_at: capture.capturedAt,
    })
    .select("id")
    .single();
  if (error?.code === "23505") return { sourceId: null, duplicate: true };
  if (error) throw new Error(`saveCapture: ${error.message}`);
  return { sourceId: data.id, duplicate: false };
}

/** Contexto de sessão ativo (/evento, /livro) para um remetente. */
export async function activeSessionContext(
  workspaceId: string,
  channel: string,
  externalUserId: string,
): Promise<string | null> {
  const { data } = await createAdminClient()
    .from("capture_sessions")
    .select("context_note_id")
    .eq("workspace_id", workspaceId)
    .eq("channel", channel)
    .eq("external_user_id", externalUserId)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1);
  return data?.[0]?.context_note_id ?? null;
}
