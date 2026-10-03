import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  slugify,
  uniqueWikilinkTargets,
  type LinkOrigin,
  type LinkStatus,
  type NoteType,
  type ParaBucket,
  type Relation,
} from "@jarvis/core";

/**
 * Acesso a notas/links compartilhado por pipeline, server actions e tools do Jarvis.
 * Funciona com o cliente do usuário (RLS) ou admin (sempre filtrando workspace_id).
 */

export interface NewNote {
  type: NoteType;
  title: string;
  content_md?: string;
  summary?: string | null;
  properties?: Record<string, unknown>;
  para_bucket?: ParaBucket;
  aliases?: string[];
  created_by?: "user" | "ai";
  stage?: "semente" | "broto" | "perene";
}

export async function createNote(
  db: SupabaseClient,
  workspaceId: string,
  note: NewNote,
): Promise<{ id: string; slug: string }> {
  const base = slugify(note.title);
  for (let attempt = 0; attempt < 20; attempt++) {
    const slug = attempt === 0 ? base : `${base}-${attempt + 1}`;
    const { data, error } = await db
      .from("notes")
      .insert({
        workspace_id: workspaceId,
        type: note.type,
        title: note.title.trim().slice(0, 300),
        slug,
        content_md: note.content_md ?? "",
        summary: note.summary ?? null,
        properties: note.properties ?? {},
        para_bucket: note.para_bucket ?? "recurso",
        aliases: note.aliases ?? [],
        // Notas da IA sempre nascem 'semente' (regra inviolável)
        stage: note.created_by === "ai" ? "semente" : (note.stage ?? "semente"),
        created_by: note.created_by ?? "user",
      })
      .select("id, slug")
      .single();
    if (!error) return data;
    if (error.code !== "23505") throw new Error(`createNote: ${error.message}`);
  }
  throw new Error(`createNote: não foi possível gerar slug único para "${note.title}"`);
}

export async function upsertLink(
  db: SupabaseClient,
  workspaceId: string,
  link: {
    from: string;
    to: string;
    relation: Relation;
    origin: LinkOrigin;
    status?: LinkStatus;
    confidence?: number | null;
    rationale?: string | null;
  },
): Promise<void> {
  if (link.from === link.to) return;
  const { error } = await db.from("links").upsert(
    {
      workspace_id: workspaceId,
      from_note: link.from,
      to_note: link.to,
      relation: link.relation,
      origin: link.origin,
      status: link.status ?? "accepted",
      confidence: link.confidence ?? null,
      rationale: link.rationale ?? null,
    },
    { onConflict: "from_note,to_note,relation", ignoreDuplicates: true },
  );
  if (error) throw new Error(`upsertLink: ${error.message}`);
}

/** Encontra nota por título ou alias (case-insensitive). */
export async function findNoteByTitle(
  db: SupabaseClient,
  workspaceId: string,
  title: string,
): Promise<{ id: string; title: string; type: string } | null> {
  const t = title.trim();
  const { data } = await db
    .from("notes")
    .select("id, title, type")
    .eq("workspace_id", workspaceId)
    .ilike("title", t.replace(/[%_\\]/g, (c) => `\\${c}`))
    .limit(1);
  if (data?.[0]) return data[0];
  const { data: byAlias } = await db
    .from("notes")
    .select("id, title, type")
    .eq("workspace_id", workspaceId)
    .contains("aliases", [t])
    .limit(1);
  return byAlias?.[0] ?? null;
}

/**
 * Sincroniza links de origem 'wikilink' com o conteúdo da nota:
 * cria os que apareceram (gerando notas-stub para alvos inexistentes, como o Obsidian)
 * e remove os que sumiram do texto.
 */
export async function syncWikilinks(
  db: SupabaseClient,
  workspaceId: string,
  noteId: string,
  contentMd: string,
): Promise<{ added: number; removed: number }> {
  const targets = uniqueWikilinkTargets(contentMd);
  const targetIds = new Set<string>();
  for (const target of targets) {
    const found = await findNoteByTitle(db, workspaceId, target);
    const id = found?.id ?? (await createNote(db, workspaceId, { type: "conceito", title: target })).id;
    if (id !== noteId) targetIds.add(id);
  }

  const { data: existing } = await db
    .from("links")
    .select("id, to_note")
    .eq("workspace_id", workspaceId)
    .eq("from_note", noteId)
    .eq("origin", "wikilink");
  const existingTargets = new Map((existing ?? []).map((l) => [l.to_note as string, l.id as string]));

  let added = 0;
  for (const id of targetIds) {
    if (!existingTargets.has(id)) {
      await upsertLink(db, workspaceId, { from: noteId, to: id, relation: "menciona", origin: "wikilink" });
      added++;
    }
  }
  const toRemove = [...existingTargets].filter(([to]) => !targetIds.has(to)).map(([, id]) => id);
  if (toRemove.length) await db.from("links").delete().eq("workspace_id", workspaceId).in("id", toRemove);
  return { added, removed: toRemove.length };
}
