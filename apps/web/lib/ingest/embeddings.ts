import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SEMANTIC_THRESHOLDS, aiLinkStatus, semanticLinkStatus, type LinkStatus } from "@jarvis/core";
import { embed, noteEmbeddingText, toPgVector } from "@/lib/ai/embed";
import { judgeLink } from "@/lib/ai/extract";
import { recordUsage } from "@/lib/ai/llm";
import { env } from "@/lib/env";
import { upsertLink } from "./notes-repo";

/**
 * Fila 'embeddings': gera embeddings em lote e roda o link-suggester (camadas 2 e 3)
 * para notas recém-criadas.
 */
export async function processEmbeddings(
  db: SupabaseClient,
  jobs: { workspaceId: string; noteId: string }[],
): Promise<{ embedded: number; suggested: number }> {
  if (!jobs.length) return { embedded: 0, suggested: 0 };
  const { data: notes, error } = await db
    .from("notes")
    .select("id, workspace_id, type, title, summary, content_md, embedding, created_at, created_by")
    .in("id", [...new Set(jobs.map((j) => j.noteId))]);
  if (error) throw new Error(`processEmbeddings: ${error.message}`);

  // Garante que o job pertence ao workspace informado (defesa em profundidade com service_role)
  const allowed = new Set(jobs.map((j) => `${j.workspaceId}:${j.noteId}`));
  const pending = (notes ?? []).filter((n) => !n.embedding && allowed.has(`${n.workspace_id}:${n.id}`));
  if (!pending.length) return { embedded: 0, suggested: 0 };

  const { vectors, tokens } = await embed(pending.map(noteEmbeddingText));
  let suggested = 0;
  for (const [i, note] of pending.entries()) {
    const vector = vectors[i]!;
    const { error: upErr } = await db
      .from("notes")
      .update({ embedding: toPgVector(vector), embedded_at: new Date().toISOString() })
      .eq("id", note.id)
      .eq("workspace_id", note.workspace_id);
    if (upErr) throw new Error(`salvar embedding: ${upErr.message}`);
    // Só sugere links para notas novas (evita reprocessar o grafo a cada edição)
    const isNew = Date.now() - new Date(note.created_at).getTime() < 24 * 3600 * 1000;
    if (isNew && note.type !== "tarefa") suggested += await suggestLinks(db, note, vector);
  }
  const byWorkspace = new Map<string, number>();
  for (const n of pending) byWorkspace.set(n.workspace_id, (byWorkspace.get(n.workspace_id) ?? 0) + 1);
  for (const [ws, count] of byWorkspace) {
    await recordUsage(ws, "embed", env.embedModel(), { input_tokens: Math.round((tokens * count) / pending.length) }, "openai");
  }
  return { embedded: pending.length, suggested };
}

async function suggestLinks(
  db: SupabaseClient,
  note: { id: string; workspace_id: string; title: string; summary: string | null },
  vector: number[],
): Promise<number> {
  const ws = note.workspace_id;
  const { data: existing } = await db
    .from("links")
    .select("from_note, to_note")
    .eq("workspace_id", ws)
    .or(`from_note.eq.${note.id},to_note.eq.${note.id}`);
  const linked = new Set((existing ?? []).flatMap((l) => [l.from_note, l.to_note]));
  linked.add(note.id);

  const { data: neighbors, error } = await db.rpc("match_notes", {
    p_workspace: ws,
    query_embedding: toPgVector(vector),
    match_count: SEMANTIC_THRESHOLDS.topK + linked.size,
    p_exclude: [...linked],
  });
  if (error) throw new Error(`match_notes: ${error.message}`);

  const useJudge = process.env.JARVIS_LINK_JUDGE !== "off";
  let count = 0;
  for (const n of ((neighbors ?? []) as { id: string; title: string; summary: string | null; similarity: number }[]).slice(
    0,
    SEMANTIC_THRESHOLDS.topK,
  )) {
    const semantic = semanticLinkStatus(n.similarity);
    if (!semantic) continue;
    let relation: "relacionado" | "apoia" | "contradiz" | "exemplo_de" | "inspira" = "relacionado";
    let rationale: string | null = null;
    let status: LinkStatus = semantic;
    let confidence = n.similarity;
    if (useJudge) {
      const j = await judgeLink(ws, note, n);
      if (j.relation === "nenhuma") continue;
      relation = j.relation;
      rationale = j.rationale;
      confidence = Math.min(n.similarity, j.confidence);
      // O mais conservador entre limiar semântico e confiança do juiz
      status = semantic === "accepted" && aiLinkStatus(j.confidence) === "accepted" ? "accepted" : "suggested";
    }
    await upsertLink(db, ws, { from: note.id, to: n.id, relation, origin: "ai_semantic", status, confidence, rationale });
    count++;
  }
  return count;
}
