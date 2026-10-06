import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ENTITY_THRESHOLDS,
  LONG_SOURCE_CHARS,
  chunkText,
  extractionSegments,
  aiLinkStatus,
  buildIngestPlan,
  resolveEntity,
  SESSION_CONTEXT_KEY,
  type EntityType,
  type ExtractedKnowledge,
  type NoteType,
  type PlannedNote,
} from "@jarvis/core";
import { embed, toPgVector } from "@/lib/ai/embed";
import { extractKnowledge } from "@/lib/ai/extract";
import { recordUsage } from "@/lib/ai/llm";
import { env } from "@/lib/env";
import type { SourceRow } from "@/lib/types";
import { createNote, upsertLink } from "./notes-repo";
import { normalizeSource } from "./normalize";

/**
 * Pipeline de ingestão (fonte → notas atômicas conectadas):
 *  1. normalizar  2. extrair (structured outputs)  3. planejar (@jarvis/core)
 *  4. entity resolution  5. criar notas + proveniência  6. links determinísticos
 * Embeddings e links semânticos acontecem na fila 'embeddings' (disparada por trigger).
 */

export interface IngestResult {
  sourceId: string;
  contextTitle: string | null;
  created: { id: string; type: NoteType; title: string }[];
  reused: { id: string; type: NoteType; title: string }[];
  pendingReview: number;
  linksCreated: number;
  skipped?: string;
}

export async function processSource(db: SupabaseClient, workspaceId: string, sourceId: string): Promise<IngestResult> {
  const { data: source, error } = await db
    .from("sources")
    .select("*")
    .eq("id", sourceId)
    .eq("workspace_id", workspaceId)
    .single<SourceRow & { normalized_text: string | null }>();
  if (error || !source) throw new Error(`Fonte não encontrada: ${sourceId}`);

  const empty: IngestResult = { sourceId, contextTitle: null, created: [], reused: [], pendingReview: 0, linksCreated: 0 };
  if (source.status === "done") return { ...empty, skipped: "já processada" };

  await db
    .from("sources")
    .update({ status: "processing", attempts: source.attempts + 1, error: null })
    .eq("id", sourceId)
    .eq("workspace_id", workspaceId);

  // 1. Normalizar (reaproveita transcrição/OCR de uma tentativa anterior)
  const text = source.normalized_text ?? (await normalizeSource(db, source));
  if (!source.normalized_text) {
    await db.from("sources").update({ normalized_text: text }).eq("id", sourceId).eq("workspace_id", workspaceId);
  }
  if (!text.trim()) {
    await markDone(db, workspaceId, sourceId);
    return { ...empty, skipped: "captura vazia" };
  }

  // Contexto de sessão (/evento, /livro)
  let sessionContext: { id: string; type: NoteType; title: string } | null = null;
  if (source.context_note_id) {
    const { data } = await db
      .from("notes")
      .select("id, type, title")
      .eq("id", source.context_note_id)
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    sessionContext = data;
  }

  // Fontes longas: chunks com embedding para o RAG (livro, transcrição de 1 h)
  if (text.length > LONG_SOURCE_CHARS) await storeChunks(db, workspaceId, sourceId, text);

  // 2. Extrair (em partes quando a fonte é longa; a entity resolution une as entidades entre partes)
  const segments = extractionSegments(text);
  const results: IngestResult[] = [];
  for (const [i, segment] of segments.entries()) {
    const extracted = await extractKnowledge(workspaceId, {
      text: segments.length > 1 ? `[Parte ${i + 1} de ${segments.length}]\n${segment}` : segment,
      kind: source.kind,
      channel: source.channel,
      capturedAt: source.captured_at,
      sessionContext,
    });
    results.push(await persistExtraction(db, workspaceId, sourceId, extracted, sessionContext));
  }
  await markDone(db, workspaceId, sourceId);
  return mergeResults(sourceId, results);
}

function mergeResults(sourceId: string, results: IngestResult[]): IngestResult {
  const createdIds = new Set<string>();
  const merged: IngestResult = { sourceId, contextTitle: null, created: [], reused: [], pendingReview: 0, linksCreated: 0 };
  for (const r of results) {
    merged.contextTitle ??= r.contextTitle;
    for (const n of r.created) {
      createdIds.add(n.id);
      merged.created.push(n);
    }
    merged.pendingReview += r.pendingReview;
    merged.linksCreated += r.linksCreated;
  }
  // Entidade criada numa parte e reutilizada em outra conta só como criada
  const reused = new Map<string, IngestResult["reused"][number]>();
  for (const n of results.flatMap((r) => r.reused)) if (!createdIds.has(n.id)) reused.set(n.id, n);
  merged.reused = [...reused.values()];
  return merged;
}

/** Guarda a fonte longa em chunks com embedding (idempotente por fonte). */
async function storeChunks(db: SupabaseClient, workspaceId: string, sourceId: string, text: string) {
  const { count } = await db
    .from("chunks")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .eq("source_id", sourceId);
  if (count) return;
  const pieces = chunkText(text);
  const embeddings: (string | null)[] = [];
  for (let i = 0; i < pieces.length; i += 64) {
    const { vectors, tokens } = await embed(pieces.slice(i, i + 64));
    embeddings.push(...vectors.map(toPgVector));
    await recordUsage(workspaceId, "embed", env.embedModel(), { input_tokens: tokens }, "openai");
  }
  const { error } = await db.from("chunks").insert(
    pieces.map((content, ordinal) => ({
      workspace_id: workspaceId,
      source_id: sourceId,
      ordinal,
      content,
      embedding: embeddings[ordinal],
    })),
  );
  if (error) throw new Error(`chunks: ${error.message}`);
}

/** Etapas 3–6. Separado para ser reaproveitado pelo eval e por capturas já estruturadas. */
export async function persistExtraction(
  db: SupabaseClient,
  workspaceId: string,
  sourceId: string,
  extracted: ExtractedKnowledge,
  sessionContext: { id: string; type: NoteType; title: string } | null,
): Promise<IngestResult> {
  const plan = buildIngestPlan(extracted, sessionContext);
  const ids = new Map<string, string>();
  if (sessionContext) ids.set(SESSION_CONTEXT_KEY, sessionContext.id);

  const result: IngestResult = {
    sourceId,
    contextTitle: sessionContext?.title ?? plan.notes.find((n) => n.key === plan.contextKey)?.title ?? null,
    created: [],
    reused: [],
    pendingReview: 0,
    linksCreated: 0,
  };

  for (const planned of plan.notes) {
    if (planned.resolve) {
      const decision = await resolvePlannedEntity(db, workspaceId, planned);
      if (decision.action === "reuse") {
        ids.set(planned.key, decision.candidateId);
        result.reused.push({ id: decision.candidateId, type: planned.type, title: decision.title });
        await mergeProperties(db, workspaceId, decision.candidateId, planned.properties);
        continue;
      }
      const created = await createNote(db, workspaceId, toNewNote(planned));
      ids.set(planned.key, created.id);
      result.created.push({ id: created.id, type: planned.type, title: planned.title });
      if (decision.action === "ask") {
        // Similar mas não idêntica: cria e pede ao Pedro para confirmar merge na Inbox
        result.pendingReview++;
        await db.from("review_items").insert({
          workspace_id: workspaceId,
          kind: "entity_match",
          note_id: created.id,
          payload: { candidate_id: decision.candidateId, candidate_title: decision.title, score: decision.score },
        });
      }
      continue;
    }
    const created = await createNote(db, workspaceId, toNewNote(planned));
    ids.set(planned.key, created.id);
    result.created.push({ id: created.id, type: planned.type, title: planned.title });
  }

  // Proveniência: toda nota criada aponta para a fonte (com o trecho literal, quando houver)
  const provenance = plan.notes
    .filter((n) => result.created.some((c) => c.id === ids.get(n.key)))
    .map((n) => ({ workspace_id: workspaceId, note_id: ids.get(n.key)!, source_id: sourceId, excerpt: n.excerpt }));
  if (provenance.length) {
    const { error } = await db.from("note_sources").upsert(provenance, { onConflict: "note_id,source_id", ignoreDuplicates: true });
    if (error) throw new Error(`note_sources: ${error.message}`);
  }

  for (const l of plan.links) {
    const from = ids.get(l.from);
    const to = ids.get(l.to);
    if (!from || !to) continue;
    await upsertLink(db, workspaceId, {
      from,
      to,
      relation: l.relation,
      origin: "ai_entity",
      confidence: l.confidence,
      status: aiLinkStatus(l.confidence),
    });
    result.linksCreated++;
  }
  return result;
}

function toNewNote(n: PlannedNote) {
  return {
    type: n.type,
    title: n.title,
    content_md: n.content_md,
    summary: n.summary,
    properties: n.properties,
    para_bucket: n.para_bucket,
    created_by: "ai" as const,
  };
}

async function resolvePlannedEntity(db: SupabaseClient, workspaceId: string, planned: PlannedNote) {
  const { data: candidates, error } = await db.rpc("find_entity_candidates", {
    p_workspace: workspaceId,
    p_name: planned.title,
    p_type: planned.type,
  });
  if (error) throw new Error(`find_entity_candidates: ${error.message}`);
  const rows = (candidates ?? []) as {
    id: string;
    title: string;
    type: string;
    aliases: string[];
    embedding_similarity: number | null;
  }[];
  const decision = resolveEntity(
    { name: planned.title, type: planned.type as EntityType },
    rows.map((r) => ({ ...r, embeddingSimilarity: r.embedding_similarity ?? undefined })),
    ENTITY_THRESHOLDS,
  );
  const title = decision.action === "create" ? planned.title : rows.find((r) => r.id === decision.candidateId)!.title;
  return { ...decision, title };
}

/** Completa propriedades ausentes de uma entidade reutilizada (nunca sobrescreve o que o Pedro editou). */
async function mergeProperties(db: SupabaseClient, workspaceId: string, noteId: string, props: Record<string, unknown>) {
  if (!Object.keys(props).length) return;
  const { data } = await db.from("notes").select("properties").eq("id", noteId).eq("workspace_id", workspaceId).single();
  const current = (data?.properties ?? {}) as Record<string, unknown>;
  const merged = { ...props, ...current };
  if (Object.keys(merged).length !== Object.keys(current).length) {
    await db.from("notes").update({ properties: merged }).eq("id", noteId).eq("workspace_id", workspaceId);
  }
}

async function markDone(db: SupabaseClient, workspaceId: string, sourceId: string) {
  await db
    .from("sources")
    .update({ status: "done", processed_at: new Date().toISOString() })
    .eq("id", sourceId)
    .eq("workspace_id", workspaceId);
}

/** Mensagem de retorno no canal: "Registrei o evento X, 5 insights, 2 pessoas…". */
export function summarizeResult(r: IngestResult, appUrl: string): string {
  if (r.skipped) return `Nada novo para registrar (${r.skipped}).`;
  const counts = new Map<string, number>();
  for (const n of r.created) counts.set(n.type, (counts.get(n.type) ?? 0) + 1);
  const label: Record<string, [string, string]> = {
    insight: ["insight", "insights"],
    pessoa: ["pessoa", "pessoas"],
    citacao: ["citação", "citações"],
    ideia: ["ideia", "ideias"],
    tarefa: ["tarefa", "tarefas"],
    livro: ["livro", "livros"],
    evento: ["evento", "eventos"],
    empresa: ["empresa", "empresas"],
    conceito: ["conceito", "conceitos"],
    ferramenta: ["ferramenta", "ferramentas"],
  };
  const order = Object.keys(label);
  const parts = [...counts]
    .sort(([a], [b]) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99))
    .map(([t, c]) => `${c} ${(label[t] ?? [t, t])[c === 1 ? 0 : 1]}`);
  const head = r.contextTitle ? `Registrei em "${r.contextTitle}": ` : "Registrei: ";
  const lines = [head + (parts.length ? parts.join(", ") : "nenhuma nota nova") + "."];
  if (r.reused.length) lines.push(`Conectei com o que você já tinha: ${r.reused.map((n) => n.title).slice(0, 5).join(", ")}.`);
  if (r.pendingReview) lines.push(`${r.pendingReview} entidade(s) parecida(s) com notas antigas aguardam sua revisão.`);
  const insights = r.created.filter((n) => n.type === "insight").slice(0, 5);
  if (insights.length) lines.push("", ...insights.map((n) => `• ${n.title}`));
  lines.push("", `Ver na Inbox: ${appUrl}/inbox`);
  return lines.join("\n");
}
