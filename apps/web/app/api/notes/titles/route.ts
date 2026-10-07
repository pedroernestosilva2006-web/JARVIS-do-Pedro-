import { getAppContext } from "@/lib/access";

/** Títulos para o autocomplete de [[wikilinks]] (cliente do usuário → RLS). */
export async function GET(req: Request) {
  const ctx = await getAppContext();
  if (!ctx) return new Response("unauthorized", { status: 401 });
  const { db: supabase, workspaceId } = ctx;
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim().replace(/[%_\\]/g, "").slice(0, 100);
  let query = supabase
    .from("notes")
    .select("id, title, type")
    .eq("workspace_id", workspaceId)
    .order("updated_at", { ascending: false }).limit(8);
  if (q) query = query.ilike("title", `%${q}%`);
  const { data, error } = await query;
  if (error) return new Response(error.message, { status: 500 });
  return Response.json(data);
}
