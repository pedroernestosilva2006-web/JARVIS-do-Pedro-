import { z } from "zod";
import { getAppContext } from "@/lib/access";

async function context() {
  const ctx = await getAppContext();
  return ctx ? { supabase: ctx.db, workspaceId: ctx.workspaceId } : null;
}
/** Snapshot leve do grafo (id/tipo/grau/x/y + arestas). */
export async function GET(req: Request) {
  const ctx = await context();
  if (!ctx) return new Response("unauthorized", { status: 401 });
  const url = new URL(req.url);
  const { data, error } = await ctx.supabase.rpc("graph_snapshot", {
    p_workspace: ctx.workspaceId,
    p_include_suggested: url.searchParams.get("suggested") !== "0",
  });
  if (error) return new Response(error.message, { status: 500 });

  // Tags por nota (para filtros e grupos). O PostgREST devolve no máximo 1000 linhas por página.
  const tagsByNote = new Map<string, string[]>();
  for (let page = 0; page < 30; page++) {
    const { data: rows, error: tagErr } = await ctx.supabase
      .from("note_tags")
      .select("note_id, tag:tags(name)")
      .eq("workspace_id", ctx.workspaceId)
      .order("note_id")
      .range(page * 1000, page * 1000 + 999);
    if (tagErr) {
      console.error("graph: tags indisponíveis", tagErr.message); // o grafo segue sem tags
      break;
    }
    for (const r of rows ?? []) {
      const name = (r.tag as unknown as { name: string } | null)?.name;
      if (name) tagsByNote.set(r.note_id, [...(tagsByNote.get(r.note_id) ?? []), name]);
    }
    if ((rows?.length ?? 0) < 1000) break;
  }
  const snapshot = data as { nodes: { id: string }[]; edges: unknown[] };
  return Response.json({ ...snapshot, nodes: snapshot.nodes.map((n) => ({ ...n, tags: tagsByNote.get(n.id) ?? [] })) });
}

const Positions = z.array(z.object({ id: z.string().uuid(), x: z.number(), y: z.number() })).max(50_000);

/** Salva posições do layout (ForceAtlas2) para o grafo abrir instantâneo. */
export async function POST(req: Request) {
  const ctx = await context();
  if (!ctx) return new Response("unauthorized", { status: 401 });
  const parsed = Positions.safeParse(await req.json());
  if (!parsed.success) return new Response("bad request", { status: 400 });
  const { error } = await ctx.supabase.rpc("save_graph_positions", {
    p_workspace: ctx.workspaceId,
    p_positions: parsed.data,
  });
  if (error) return new Response(error.message, { status: 500 });
  return Response.json({ saved: parsed.data.length });
}
