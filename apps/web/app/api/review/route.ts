import { getAppContext } from "@/lib/access";
import { reviewCount } from "@/lib/review";

/** Fila de revisão: sementes, conexões sugeridas pela IA e decisões pendentes (merge/MOC). `?count=1` devolve só o total. */
export async function GET(req: Request) {
  const ctx = await getAppContext();
  if (!ctx) return new Response("unauthorized", { status: 401 });
  const { db, workspaceId } = ctx;
  const onlyCount = new URL(req.url).searchParams.get("count") === "1";

  if (onlyCount) return Response.json({ count: await reviewCount(db, workspaceId) });

  const [seeds, links, items] = await Promise.all([
    db.from("notes").select("id, type, title, summary, created_at").eq("workspace_id", workspaceId).eq("stage", "semente").order("created_at", { ascending: false }).limit(30),
    db
      .from("links")
      .select("id, relation, rationale, confidence, from:notes!links_from_note_fkey(id, title, type), to:notes!links_to_note_fkey(id, title, type)")
      .eq("workspace_id", workspaceId)
      .eq("status", "suggested")
      .order("created_at", { ascending: false })
      .limit(30),
    db.from("review_items").select("id, kind, payload, note_id, created_at").eq("workspace_id", workspaceId).eq("status", "open").order("created_at", { ascending: false }).limit(30),
  ]);
  return Response.json({ seeds: seeds.data ?? [], links: links.data ?? [], items: items.data ?? [] });
}
