"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { STAGES, isNoteType, slugify } from "@jarvis/core";
import { DEMO_LINKS, DEMO_NOTES } from "@/lib/demo/data";
import { createNote, syncWikilinks, upsertLink } from "@/lib/ingest/notes-repo";
import { createAdminClient } from "@/lib/supabase/admin";
import { pairingCode, randomToken, sha256 } from "@/lib/security";
import { createClient } from "@/lib/supabase/server";
import { requireWorkspace } from "@/lib/workspace";

/** Server actions do app. Todas usam o cliente do usuário (RLS) + workspace explícito. */

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function createNoteAction(formData: FormData) {
  const { supabase, workspaceId } = await requireWorkspace();
  const type = String(formData.get("type") ?? "insight");
  const title = String(formData.get("title") ?? "").trim();
  if (!title || !isNoteType(type)) return;
  const note = await createNote(supabase, workspaceId, { type, title, created_by: "user" });
  redirect(`/notes/${note.id}?edit=1`);
}

export async function saveNoteAction(noteId: string, input: { title: string; content_md: string; summary: string; type: string; stage: string; aliases: string }) {
  const { supabase, workspaceId } = await requireWorkspace();
  if (!isNoteType(input.type) || !(STAGES as readonly string[]).includes(input.stage)) throw new Error("tipo/estágio inválido");
  const { error } = await supabase
    .from("notes")
    .update({
      title: input.title.trim(),
      content_md: input.content_md,
      summary: input.summary.trim() || null,
      type: input.type,
      stage: input.stage,
      aliases: input.aliases.split(",").map((a) => a.trim()).filter(Boolean),
    })
    .eq("id", noteId)
    .eq("workspace_id", workspaceId);
  if (error) throw new Error(error.message);
  const sync = await syncWikilinks(supabase, workspaceId, noteId, input.content_md);
  revalidatePath(`/notes/${noteId}`);
  return sync;
}

export async function deleteNoteAction(noteId: string) {
  const { supabase, workspaceId } = await requireWorkspace();
  await supabase.from("notes").delete().eq("id", noteId).eq("workspace_id", workspaceId);
  redirect("/notes");
}

export async function setStageAction(noteId: string, stage: (typeof STAGES)[number]) {
  const { supabase, workspaceId } = await requireWorkspace();
  await supabase.from("notes").update({ stage }).eq("id", noteId).eq("workspace_id", workspaceId);
  revalidatePath("/inbox");
}

export async function reviewLinkAction(linkId: string, status: "accepted" | "rejected") {
  const { supabase, workspaceId } = await requireWorkspace();
  await supabase.from("links").update({ status }).eq("id", linkId).eq("workspace_id", workspaceId);
  revalidatePath("/inbox");
}

export async function linkToRelatedAction(fromId: string, toId: string) {
  const { supabase, workspaceId } = await requireWorkspace();
  await upsertLink(supabase, workspaceId, { from: fromId, to: toId, relation: "relacionado", origin: "manual" });
  revalidatePath(`/notes/${fromId}`);
}

export async function resolveReviewItemAction(itemId: string, decision: "accept" | "dismiss") {
  const { supabase, workspaceId } = await requireWorkspace();
  const { data: item } = await supabase
    .from("review_items")
    .select("kind, note_id, payload")
    .eq("id", itemId)
    .eq("workspace_id", workspaceId)
    .single();
  if (!item) return;
  if (decision === "accept") {
    const p = item.payload as Record<string, string>;
    if (item.kind === "entity_match" && p.candidate_id) {
      // A nota nova (note_id) é fundida na entidade existente
      await supabase.rpc("merge_notes", { p_workspace: workspaceId, p_keep: p.candidate_id, p_merge: item.note_id });
    } else if (item.kind === "duplicate" && p.keep_id) {
      await supabase.rpc("merge_notes", { p_workspace: workspaceId, p_keep: p.keep_id, p_merge: item.note_id });
    } else if (item.kind === "moc_proposal") {
      const ids = (item.payload as { note_ids?: string[] }).note_ids ?? [];
      const moc = await createNote(supabase, workspaceId, {
        type: "moc",
        title: `MOC: ${p.hub_title}`,
        content_md: "Mapa gerado a partir de um cluster do grafo. Reescreva com suas palavras.",
        created_by: "user",
      });
      for (const id of ids) await upsertLink(supabase, workspaceId, { from: id, to: moc.id, relation: "parte_de", origin: "manual" });
    }
  }
  await supabase
    .from("review_items")
    .update({ status: decision === "accept" ? "accepted" : "dismissed", resolved_at: new Date().toISOString() })
    .eq("id", itemId)
    .eq("workspace_id", workspaceId);
  revalidatePath("/inbox");
}

export async function saveProfileAction(formData: FormData) {
  const { supabase, workspaceId } = await requireWorkspace();
  await supabase
    .from("workspaces")
    .update({ profile_md: String(formData.get("profile_md") ?? ""), name: String(formData.get("name") ?? "Meu cérebro") })
    .eq("id", workspaceId);
  revalidatePath("/settings");
}

export async function createPairingCodeAction(): Promise<string> {
  const { supabase, workspaceId } = await requireWorkspace();
  const code = pairingCode();
  const { error } = await supabase.from("channel_link_codes").insert({ code, workspace_id: workspaceId });
  if (error) throw new Error(error.message);
  return code;
}

export async function createApiTokenAction(name: string): Promise<string> {
  const { supabase, workspaceId } = await requireWorkspace();
  const token = randomToken("jv");
  const { error } = await supabase
    .from("api_tokens")
    .insert({ workspace_id: workspaceId, name: name || "MCP", token_hash: sha256(token) });
  if (error) throw new Error(error.message);
  revalidatePath("/settings");
  return token; // mostrado uma única vez
}

export async function revokeApiTokenAction(id: string) {
  const { supabase, workspaceId } = await requireWorkspace();
  await supabase.from("api_tokens").delete().eq("id", id).eq("workspace_id", workspaceId);
  revalidatePath("/settings");
}

export async function disconnectChannelAction(id: string) {
  const { supabase, workspaceId } = await requireWorkspace();
  await supabase.from("channel_identities").delete().eq("id", id).eq("workspace_id", workspaceId);
  revalidatePath("/settings");
}


/** Cria uma nota nova já ligada a outra (botão "Nova nota ligada" no painel do cérebro). */
export async function createLinkedNoteAction(fromId: string, title: string): Promise<{ id: string } | { error: string }> {
  const { supabase, workspaceId } = await requireWorkspace();
  const clean = title.trim();
  if (!clean) return { error: "Dê um título à nota." };
  const { data: from } = await supabase.from("notes").select("id").eq("id", fromId).eq("workspace_id", workspaceId).maybeSingle();
  if (!from) return { error: "Nota de origem não encontrada." };
  const note = await createNote(supabase, workspaceId, { type: "insight", title: clean, created_by: "user" });
  await upsertLink(supabase, workspaceId, { from: fromId, to: note.id, relation: "relacionado", origin: "manual" });
  revalidatePath("/notes");
  return { id: note.id };
}

/** Apaga um arquivo (do Storage e do catálogo). */
export async function deleteAttachmentAction(id: string) {
  const { workspaceId } = await requireWorkspace();
  const admin = createAdminClient();
  const { data } = await admin.from("attachments").select("storage_path").eq("id", id).eq("workspace_id", workspaceId).maybeSingle();
  if (!data) return;
  await admin.storage.from("captures").remove([data.storage_path]);
  await admin.from("attachments").delete().eq("id", id).eq("workspace_id", workspaceId);
  revalidatePath("/files");
}

/** Apaga uma nota sem redirecionar (usado pelo painel do grafo). */
export async function removeNoteAction(noteId: string) {
  const { supabase, workspaceId } = await requireWorkspace();
  await supabase.from("notes").delete().eq("id", noteId).eq("workspace_id", workspaceId);
  revalidatePath("/notes");
}

/** Popula ~40 notas de exemplo (evento, livro, pessoas, insights…) marcadas com properties.demo. */
export async function loadDemoDataAction(): Promise<{ added: number; error?: string }> {
  const { supabase, workspaceId } = await requireWorkspace();
  const { count } = await supabase.from("notes").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId).eq("properties->>demo", "true");
  if (count) return { added: 0, error: "Os dados de exemplo já estão carregados." };

  const now = Date.now();
  const day = 86_400_000;
  const rows = DEMO_NOTES.map((n) => ({
    workspace_id: workspaceId,
    type: n.type,
    title: n.title,
    slug: `${slugify(n.title)}-exemplo`,
    content_md: n.content,
    summary: n.summary ?? null,
    properties: { ...(n.properties ?? {}), demo: true, ...(n.type === "evento" ? { data: new Date(now - n.daysAgo * day).toISOString().slice(0, 10) } : {}) },
    stage: n.stage,
    created_by: n.by,
    para_bucket: "recurso",
    aliases: [],
    created_at: new Date(now - n.daysAgo * day).toISOString(),
  }));
  const { data: inserted, error } = await supabase.from("notes").insert(rows).select("id, title");
  if (error || !inserted) return { added: 0, error: error?.message ?? "Não foi possível criar as notas de exemplo." };
  const idByTitle = new Map(inserted.map((r) => [r.title as string, r.id as string]));

  const links = DEMO_LINKS.flatMap((l) => {
    const from = idByTitle.get(l.from);
    const to = idByTitle.get(l.to);
    if (!from || !to) return [];
    return [
      {
        workspace_id: workspaceId,
        from_note: from,
        to_note: to,
        relation: l.relation,
        origin: l.suggested ? "ai_semantic" : "manual",
        status: l.suggested ? "suggested" : "accepted",
        confidence: l.suggested?.confidence ?? null,
        rationale: l.suggested?.rationale ?? null,
      },
    ];
  });
  const rollback = async (msg: string) => {
    await clearDemoDataAction();
    return { added: 0, error: `${msg} Nada foi mantido; tente de novo.` };
  };
  const { error: linkErr } = await supabase.from("links").insert(links);
  if (linkErr) return rollback(`Erro nas conexões: ${linkErr.message}.`);

  // Tags: só as que NÃO existiam são marcadas (color = "demo") e podem ser apagadas depois
  const tagNames = [...new Set(DEMO_NOTES.flatMap((n) => n.tags ?? []))];
  const { data: existing } = await supabase.from("tags").select("name").eq("workspace_id", workspaceId).in("name", tagNames);
  const had = new Set((existing ?? []).map((t) => t.name as string));
  const { error: tagErr } = await supabase.from("tags").upsert(
    tagNames.filter((n) => !had.has(n)).map((name) => ({ workspace_id: workspaceId, name, color: "demo" })),
    { onConflict: "workspace_id,name", ignoreDuplicates: true },
  );
  if (tagErr) return rollback(`Erro nas tags: ${tagErr.message}.`);
  const { data: tags } = await supabase.from("tags").select("id, name").eq("workspace_id", workspaceId).in("name", tagNames);
  const tagId = new Map((tags ?? []).map((t) => [t.name as string, t.id as string]));
  const noteTags = DEMO_NOTES.flatMap((n) => (n.tags ?? []).flatMap((t) => (idByTitle.get(n.title) && tagId.get(t) ? [{ workspace_id: workspaceId, note_id: idByTitle.get(n.title)!, tag_id: tagId.get(t)! }] : [])));
  if (noteTags.length) {
    const { error: ntErr } = await supabase.from("note_tags").insert(noteTags);
    if (ntErr) return rollback(`Erro ao ligar tags: ${ntErr.message}.`);
  }

  revalidatePath("/", "layout");
  return { added: inserted.length };
}

/** Apaga só as notas de exemplo (conexões e tags das notas saem junto, em cascata). */
export async function clearDemoDataAction(): Promise<{ removed: number }> {
  const { supabase, workspaceId } = await requireWorkspace();
  const { data } = await supabase.from("notes").delete().eq("workspace_id", workspaceId).eq("properties->>demo", "true").select("id");
  // Só as tags criadas pelo exemplo (color = "demo") e que ficaram sem nenhuma nota; as do usuário ficam
  const { data: tags } = await supabase.from("tags").select("id").eq("workspace_id", workspaceId).eq("color", "demo");
  const ids = (tags ?? []).map((t) => t.id as string);
  if (ids.length) {
    const { data: used } = await supabase.from("note_tags").select("tag_id").eq("workspace_id", workspaceId).in("tag_id", ids);
    const usedIds = new Set((used ?? []).map((u) => u.tag_id as string));
    const orphan = ids.filter((id) => !usedIds.has(id));
    if (orphan.length) await supabase.from("tags").delete().eq("workspace_id", workspaceId).in("id", orphan);
  }
  revalidatePath("/", "layout");
  return { removed: data?.length ?? 0 };
}

/** Cria uma nota vazia (sem redirecionar) e devolve o id — usada pela lista de notas. */
export async function createQuickNoteAction(title: string): Promise<{ id: string } | { error: string }> {
  const { supabase, workspaceId } = await requireWorkspace();
  const clean = title.trim();
  if (!clean) return { error: "Dê um título à nota." };
  const note = await createNote(supabase, workspaceId, { type: "insight", title: clean, created_by: "user" });
  revalidatePath("/notes");
  return { id: note.id };
}
