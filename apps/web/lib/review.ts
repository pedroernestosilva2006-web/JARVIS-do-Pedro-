import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Total de itens para revisar (sementes + conexões sugeridas + decisões pendentes). */
export async function reviewCount(db: SupabaseClient, workspaceId: string): Promise<number> {
  const head = { count: "exact" as const, head: true };
  const [a, b, c] = await Promise.all([
    db.from("notes").select("id", head).eq("workspace_id", workspaceId).eq("stage", "semente"),
    db.from("links").select("id", head).eq("workspace_id", workspaceId).eq("status", "suggested"),
    db.from("review_items").select("id", head).eq("workspace_id", workspaceId).eq("status", "open"),
  ]);
  return (a.count ?? 0) + (b.count ?? 0) + (c.count ?? 0);
}
