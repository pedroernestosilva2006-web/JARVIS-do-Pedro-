import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { runJarvis, type JarvisEvent } from "@/lib/jarvis/agent";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 300;

const Body = z.object({
  conversationId: z.string().uuid().nullish(),
  message: z.string().min(1).max(20_000),
});

/**
 * Chat com o Jarvis. Resposta em NDJSON: {type:"meta"|"text"|"tool"|"error"|"done", ...}.
 * Usa o cliente do usuário (RLS) para tudo — inclusive nas tools.
 */
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("unauthorized", { status: 401 });
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return new Response("bad request", { status: 400 });

  const { data: workspaceId, error: wsErr } = await supabase.rpc("bootstrap_workspace", {});
  if (wsErr || !workspaceId) return new Response("workspace", { status: 500 });

  let conversationId = parsed.data.conversationId ?? null;
  if (!conversationId) {
    const { data, error } = await supabase
      .from("conversations")
      .insert({ workspace_id: workspaceId, channel: "web", title: parsed.data.message.slice(0, 80) })
      .select("id")
      .single();
    if (error) return new Response(error.message, { status: 500 });
    conversationId = data.id as string;
  }

  const { data: rows } = await supabase
    .from("messages")
    .select("role, content")
    .eq("conversation_id", conversationId)
    .order("created_at");
  const history = (rows ?? []).map((r) => ({ role: r.role, content: r.content })) as Anthropic.Beta.Messages.BetaMessageParam[];
  const userMessage: Anthropic.Beta.Messages.BetaMessageParam = { role: "user", content: parsed.data.message };

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (e: JarvisEvent | { type: "meta" | "done"; conversationId: string }) =>
        controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
      send({ type: "meta", conversationId: conversationId! });
      try {
        const { newMessages } = await runJarvis({ db: supabase, workspaceId }, [...history, userMessage], send);
        // Persistência append-only: a conversa é reenviada exatamente como gerada
        const toSave = [userMessage, ...newMessages].map((m, i) => ({
          workspace_id: workspaceId,
          conversation_id: conversationId,
          role: m.role,
          content: m.content,
          created_at: new Date(Date.now() + i).toISOString(),
        }));
        await supabase.from("messages").insert(toSave);
        await supabase.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversationId);
      } catch (err) {
        send({ type: "error", message: err instanceof Error ? err.message : String(err) });
      }
      send({ type: "done", conversationId: conversationId! });
      controller.close();
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
}
