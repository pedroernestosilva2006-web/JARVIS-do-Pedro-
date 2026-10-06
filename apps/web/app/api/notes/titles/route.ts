import { createClient } from "@/lib/supabase/server";

/** Títulos para o autocomplete de [[wikilinks]] (cliente do usuário → RLS). */
export async function GET(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("unauthorized", { status: 401 });
  const { data: workspaceId } = await supabase.rpc("bootstrap_workspace", {});
  if (!workspaceId) return new Response("workspace", { status: 500 });
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
