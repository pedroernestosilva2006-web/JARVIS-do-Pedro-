"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { STAGES, isNoteType } from "@jarvis/core";
import { createNote, syncWikilinks, upsertLink } from "@/lib/ingest/notes-repo";
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

