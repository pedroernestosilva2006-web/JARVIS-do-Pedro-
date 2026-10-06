import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { NOTE_TYPES, RELATIONS, STAGES } from "@jarvis/core";
import { embedOne, toPgVector } from "@/lib/ai/embed";
import { createNote, findNoteByTitle, syncWikilinks, upsertLink } from "@/lib/ingest/notes-repo";

/**
 * Ferramentas do Jarvis — as MESMAS para o chat web, o Telegram e o servidor MCP.
 * Cada tool tem schema JSON (para o modelo / clientes MCP) e schema Zod (validação na execução).
 */

export interface ToolContext {
  db: SupabaseClient;
  workspaceId: string;
}

interface JarvisTool<S extends z.ZodType> {
  name: string;
  description: string;
  schema: S;
  write?: boolean;
  run: (ctx: ToolContext, input: z.infer<S>) => Promise<unknown>;
}

function tool<S extends z.ZodType>(t: JarvisTool<S>): JarvisTool<S> {
  return t;
}

async function safeEmbed(text: string): Promise<string | null> {
  if (!process.env.OPENAI_API_KEY) return null;
  try {
    return toPgVector(await embedOne(text));
  } catch (err) {
    console.error("embedding da consulta falhou; seguindo só com full-text", err);
    return null;
  }
}

async function resolveNoteId(ctx: ToolContext, idOrTitle: string): Promise<string | null> {
  if (/^[0-9a-f-]{36}$/i.test(idOrTitle)) return idOrTitle;
  return (await findNoteByTitle(ctx.db, ctx.workspaceId, idOrTitle.replace(/^\[\[|\]\]$/g, "")))?.id ?? null;
}

export const searchKnowledge = tool({
  name: "search_knowledge",
  description:
    "Busca híbrida (palavra-chave + semântica) nas notas do Pedro, trazendo também o contexto vizinho no grafo (evento, livro, pessoa, MOC). Use SEMPRE antes de responder sobre o que o Pedro sabe ou aprendeu.",
  schema: z.object({
    query: z.string().describe("Pergunta ou termos de busca em PT-BR"),
    types: z.array(z.enum(NOTE_TYPES)).optional().describe("Filtrar por tipos de nota"),
    limit: z.number().int().min(1).max(30).optional(),
  }),
  run: async (ctx, { query, types, limit }) => {
    const embedding = await safeEmbed(query);
    const { data, error } = await ctx.db.rpc("hybrid_search", {
      p_workspace: ctx.workspaceId,
      query_text: query,
      query_embedding: embedding,
      match_count: limit ?? 8,
      p_types: types?.length ? types : null,
    });
    if (error) throw new Error(error.message);
    const hits = (data ?? []) as { id: string; type: string; title: string; summary: string | null; created_at: string }[];
    // GraphRAG leve: 1 salto a partir das 3 melhores notas
    const context = await Promise.all(
      hits.slice(0, 3).map(async (h) => {
        const { data: n } = await ctx.db.rpc("get_neighbors", { p_workspace: ctx.workspaceId, p_note: h.id, p_depth: 1 });
        return {
          from: h.title,
          neighbors: ((n ?? []) as { id: string; type: string; title: string; depth: number }[])
            .filter((x) => x.depth === 1)
            .slice(0, 8)
            .map((x) => `${x.type}: ${x.title}`),
        };
      }),
    );
    // Trechos literais de fontes longas (livros, transcrições) — RAG sobre os chunks
    let source_passages: { source_id: string; content: string; similarity: number }[] = [];
    if (embedding) {
      const { data: chunks } = await ctx.db.rpc("match_chunks", {
        p_workspace: ctx.workspaceId,
        query_embedding: embedding,
        match_count: 3,
      });
      source_passages = ((chunks ?? []) as { source_id: string; content: string; similarity: number }[])
        .filter((c) => c.similarity >= 0.3)
        .map((c) => ({ source_id: c.source_id, content: c.content.slice(0, 1500), similarity: c.similarity }));
    }
    return { results: hits, graph_context: context, source_passages };
  },
});

export const getNote = tool({
  name: "get_note",
  description: "Lê uma nota completa (por id ou título), com backlinks, links de saída e trechos das fontes de origem.",
  schema: z.object({ note: z.string().describe("id (uuid) ou título exato da nota") }),
  run: async (ctx, { note }) => {
    const id = await resolveNoteId(ctx, note);
    if (!id) return { error: `Nota "${note}" não encontrada` };
    const [{ data: n }, { data: outgoing }, { data: incoming }, { data: sources }] = await Promise.all([
      ctx.db
        .from("notes")
        .select("id, type, title, content_md, summary, properties, stage, para_bucket, aliases, created_at")
        .eq("id", id)
        .eq("workspace_id", ctx.workspaceId)
        .maybeSingle(),
      ctx.db
        .from("links")
        .select("relation, status, rationale, to:notes!links_to_note_fkey(id, title, type)")
        .eq("workspace_id", ctx.workspaceId)
        .eq("from_note", id)
        .neq("status", "rejected"),
      ctx.db
        .from("links")
        .select("relation, status, rationale, from:notes!links_from_note_fkey(id, title, type)")
        .eq("workspace_id", ctx.workspaceId)
        .eq("to_note", id)
        .neq("status", "rejected"),
      ctx.db
        .from("note_sources")
        .select("excerpt, source:sources(channel, kind, captured_at)")
        .eq("workspace_id", ctx.workspaceId)
        .eq("note_id", id),
    ]);
    if (!n) return { error: "Nota não encontrada" };
    return { note: n, outgoing, backlinks: incoming, sources };
  },
});

export const getNeighbors = tool({
  name: "get_neighbors",
  description: "Subgrafo local de uma nota: notas conectadas até N saltos.",
  schema: z.object({
    note: z.string().describe("id ou título"),
    depth: z.number().int().min(1).max(3).optional(),
    include_suggested: z.boolean().optional(),
  }),
  run: async (ctx, { note, depth, include_suggested }) => {
    const id = await resolveNoteId(ctx, note);
    if (!id) return { error: `Nota "${note}" não encontrada` };
    const { data, error } = await ctx.db.rpc("get_neighbors", {
      p_workspace: ctx.workspaceId,
      p_note: id,
      p_depth: depth ?? 1,
      p_include_suggested: include_suggested ?? false,
    });
    if (error) throw new Error(error.message);
    return data;
  },
});

export const timeline = tool({
  name: "timeline",
  description: "Eventos, diário e notas por período (visão Calendar). Datas ISO.",
  schema: z.object({
    from: z.string().describe("YYYY-MM-DD"),
    to: z.string().describe("YYYY-MM-DD"),
    types: z.array(z.enum(NOTE_TYPES)).optional(),
  }),
  run: async (ctx, { from, to, types }) => {
    const { data, error } = await ctx.db.rpc("timeline", {
      p_workspace: ctx.workspaceId,
      p_from: from,
      p_to: `${to}T23:59:59Z`,
      p_types: types?.length ? types : null,
    });
    if (error) throw new Error(error.message);
    return data;
  },
});

export const createNoteTool = tool({
  name: "create_note",
  description:
    "Cria uma nota. Use [[Título]] no conteúdo para ligar a outras notas. Exige confirmação explícita do Pedro, exceto quando ele disser 'salva'.",
  write: true,
  schema: z.object({
    type: z.enum(NOTE_TYPES),
    title: z.string().describe("Para insights, um título-afirmação"),
    content_md: z.string(),
    summary: z.string().optional(),
  }),
  run: async (ctx, input) => {
    const note = await createNote(ctx.db, ctx.workspaceId, { ...input, created_by: "ai" });
    await syncWikilinks(ctx.db, ctx.workspaceId, note.id, input.content_md);
    return { created: note };
  },
});

export const updateNote = tool({
  name: "update_note",
  description: "Atualiza título, conteúdo, resumo ou estágio de uma nota. Exige confirmação explícita.",
  write: true,
  schema: z.object({
    note: z.string().describe("id ou título"),
    title: z.string().optional(),
    content_md: z.string().optional(),
    summary: z.string().optional(),
    stage: z.enum(STAGES).optional(),
  }),
  run: async (ctx, { note, ...patch }) => {
    const id = await resolveNoteId(ctx, note);
    if (!id) return { error: `Nota "${note}" não encontrada` };
    const { error } = await ctx.db.from("notes").update(patch).eq("id", id).eq("workspace_id", ctx.workspaceId);
    if (error) throw new Error(error.message);
    if (patch.content_md !== undefined) await syncWikilinks(ctx.db, ctx.workspaceId, id, patch.content_md);
    return { updated: id };
  },
});

export const linkNotes = tool({
  name: "link_notes",
  description: "Cria uma ligação tipada entre duas notas, com uma linha de justificativa.",
  write: true,
  schema: z.object({
    from: z.string().describe("id ou título"),
    to: z.string().describe("id ou título"),
    relation: z.enum(RELATIONS),
    rationale: z.string(),
  }),
  run: async (ctx, { from, to, relation, rationale }) => {
    const [a, b] = await Promise.all([resolveNoteId(ctx, from), resolveNoteId(ctx, to)]);
    if (!a || !b) return { error: "Uma das notas não foi encontrada" };
    await upsertLink(ctx.db, ctx.workspaceId, { from: a, to: b, relation, rationale, origin: "manual" });
    return { linked: { from: a, to: b, relation } };
  },
});

export const listReviewQueue = tool({
  name: "list_review_queue",
  description: "Pendências de revisão: sementes não revisadas, links sugeridos pela IA e entidades parecidas.",
  schema: z.object({}),
  run: async (ctx) => {
    const [{ data: seeds }, { data: links }, { data: items }] = await Promise.all([
      ctx.db
        .from("notes")
        .select("id, type, title, created_at")
        .eq("workspace_id", ctx.workspaceId)
        .eq("stage", "semente")
        .order("created_at", { ascending: false })
        .limit(20),
      ctx.db
        .from("links")
        .select("id, relation, rationale, confidence, from:notes!links_from_note_fkey(title), to:notes!links_to_note_fkey(title)")
        .eq("workspace_id", ctx.workspaceId)
        .eq("status", "suggested")
        .limit(20),
      ctx.db
        .from("review_items")
        .select("id, kind, payload, created_at")
        .eq("workspace_id", ctx.workspaceId)
        .eq("status", "open")
        .limit(20),
    ]);
    return { seeds, suggested_links: links, review_items: items };
  },
});

export const remember = tool({
  name: "remember",
  description: "Guarda um fato durável sobre o Pedro (preferência, meta, fato, pessoa) na memória do Jarvis.",
  write: true,
  schema: z.object({ fact: z.string(), kind: z.enum(["preference", "goal", "fact", "person"]).optional() }),
  run: async (ctx, { fact, kind }) => {
    const embedding = await safeEmbed(fact);
    const { error } = await ctx.db
      .from("memories")
      .insert({ workspace_id: ctx.workspaceId, content: fact, kind: kind ?? "fact", embedding });
    if (error) throw new Error(error.message);
    return { remembered: fact };
  },
});

export const recall = tool({
  name: "recall",
  description:
    "Recupera memórias duráveis sobre o Pedro e resumos de conversas passadas (memória episódica) relevantes para um assunto.",
  schema: z.object({ query: z.string() }),
  run: async (ctx, { query }) => {
    const embedding = await safeEmbed(query);
    if (!embedding) {
      const { data } = await ctx.db
        .from("memories")
        .select("content, kind")
        .eq("workspace_id", ctx.workspaceId)
        .ilike("content", `%${query.replace(/[%_]/g, "")}%`)
        .limit(10);
      return data;
    }
    const [memories, episodes] = await Promise.all([
      ctx.db.rpc("match_memories", { p_workspace: ctx.workspaceId, query_embedding: embedding, match_count: 8 }),
      ctx.db.rpc("match_conversations", { p_workspace: ctx.workspaceId, query_embedding: embedding, match_count: 3 }),
    ]);
    if (memories.error) throw new Error(memories.error.message);
    return { memories: memories.data, past_conversations: episodes.data ?? [] };
  },
});

export const synthesize = tool({
  name: "synthesize",
  description:
    "Reúne o material (até 20 notas com resumos) sobre um tema para você escrever uma nota-síntese ou MOC com citações [[Título]]. Depois, ofereça salvar com create_note (type 'moc' ou 'insight').",
  schema: z.object({ topic: z.string() }),
  run: async (ctx, { topic }) => {
    const embedding = await safeEmbed(topic);
    const { data, error } = await ctx.db.rpc("hybrid_search", {
      p_workspace: ctx.workspaceId,
      query_text: topic,
      query_embedding: embedding,
      match_count: 20,
    });
    if (error) throw new Error(error.message);
    return { topic, material: data, instructions: "Cite cada afirmação com [[Título]] da nota de origem." };
  },
});

export const JARVIS_TOOLS = [
  searchKnowledge,
  getNote,
  getNeighbors,
  timeline,
  createNoteTool,
  updateNote,
  linkNotes,
  listReviewQueue,
  remember,
  recall,
  synthesize,
] as const;

/** JSON Schema de cada tool (para a Messages API e para tools/list do MCP). */
export function toolJsonSchema(t: (typeof JARVIS_TOOLS)[number]) {
  const schema = z.toJSONSchema(t.schema, { target: "draft-7" }) as Record<string, unknown>;
  delete schema.$schema;
  return schema as Anthropic.Tool.InputSchema;
}

export function anthropicTools(): Anthropic.Tool[] {
  return JARVIS_TOOLS.map((t) => ({ name: t.name, description: t.description, input_schema: toolJsonSchema(t) }));
}

/** Executa uma tool validando a entrada. Erros viram resultado com is_error (nunca derrubam o loop). */
export async function runTool(
  ctx: ToolContext,
  name: string,
  input: unknown,
): Promise<{ content: string; isError: boolean }> {
  const t = JARVIS_TOOLS.find((x) => x.name === name);
  if (!t) return { content: `Ferramenta desconhecida: ${name}`, isError: true };
  const parsed = t.schema.safeParse(input);
  if (!parsed.success) return { content: `Entrada inválida: ${parsed.error.message}`, isError: true };
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const out = await t.run(ctx, parsed.data as any);
    return { content: JSON.stringify(out ?? null).slice(0, 60_000), isError: false };
  } catch (err) {
    return { content: err instanceof Error ? err.message : String(err), isError: true };
  }
}
