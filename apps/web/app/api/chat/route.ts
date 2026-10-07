import type Anthropic from "@anthropic-ai/sdk";
import { after } from "next/server";
import { z } from "zod";
import { runJarvis, type JarvisEvent } from "@/lib/jarvis/agent";
import { summarizeConversation } from "@/lib/jarvis/memory";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAppContext } from "@/lib/access";

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
  const ctx = await getAppContext();
  if (!ctx) return new Response("unauthorized", { status: 401 });
  const { db: supabase, workspaceId } = ctx;
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return new Response("bad request", { status: 400 });

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
  let saved = false;
  let markDone!: () => void;
  const streamDone = new Promise<void>((resolve) => (markDone = resolve));
  // Memória episódica: resume a conversa depois que a resposta terminou (não atrasa o streaming)
  after(async () => {
    await streamDone;
    if (!saved) return;
    await summarizeConversation(createAdminClient(), workspaceId, conversationId!).catch((e) =>
      console.error("resumo da conversa falhou", e),
    );
  });
  const stream = new ReadableStream({
    async start(controller) {
      // Se o cliente fechou a aba, enqueue lança; seguimos para salvar a conversa mesmo assim
      const send = (e: JarvisEvent | { type: "meta" | "done"; conversationId: string }) => {
        try {
          controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
        } catch {}
      };
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
        saved = true;
      } catch (err) {
        send({ type: "error", message: err instanceof Error ? err.message : String(err) });
      }
      send({ type: "done", conversationId: conversationId! });
      try {
        controller.close();
      } catch {}
      markDone();
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
}
