import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

async function context() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: workspaceId } = await supabase.rpc("bootstrap_workspace", {});
  return workspaceId ? { supabase, workspaceId: workspaceId as string } : null;
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
  return Response.json(data);
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
