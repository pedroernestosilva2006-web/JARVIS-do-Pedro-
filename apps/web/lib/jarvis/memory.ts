import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { embedOne, toPgVector } from "@/lib/ai/embed";
import { anthropic, recordUsage, textOf } from "@/lib/ai/llm";
import { EPISODIC_SUMMARY_SYSTEM } from "@/lib/ai/prompts/memory";
import { env } from "@/lib/env";

const MIN_MESSAGES = 4;

type Block = { type: string; text?: string };

/** Só o texto trocado (sem tool_use/tool_result/thinking), para resumir barato. */
export function conversationTranscript(rows: { role: string; content: unknown }[], maxChars = 30_000): string {
  const lines: string[] = [];
  for (const r of rows) {
    const blocks: Block[] = typeof r.content === "string" ? [{ type: "text", text: r.content }] : ((r.content as Block[]) ?? []);
    const text = blocks
      .filter((b) => b.type === "text" && b.text)
      .map((b) => b.text)
      .join("\n")
      .trim();
    if (text) lines.push(`${r.role === "user" ? "Pedro" : "JARVIS"}: ${text}`);
  }
  const all = lines.join("\n\n");
  return all.length > maxChars ? all.slice(-maxChars) : all;
}

/**
 * Memória episódica: resume a conversa e guarda o resumo com embedding em `conversations`.
 * Roda depois da resposta (after()). Pula conversas curtas ou já resumidas após a última mensagem.
 */
export async function summarizeConversation(db: SupabaseClient, workspaceId: string, conversationId: string) {
  const [{ data: conv }, { data: rows }] = await Promise.all([
    db.from("conversations").select("summarized_at").eq("id", conversationId).eq("workspace_id", workspaceId).single(),
    db
      .from("messages")
      .select("role, content, created_at")
      .eq("workspace_id", workspaceId)
      .eq("conversation_id", conversationId)
      .order("created_at"),
  ]);
  if (!conv || !rows || rows.length < MIN_MESSAGES) return false;
  const last = rows[rows.length - 1]!.created_at as string;
  if (conv.summarized_at && conv.summarized_at >= last) return false;

  const transcript = conversationTranscript(rows);
  if (!transcript) return false;
  const model = env.extractModel();
  const res = await anthropic().messages.create({
    model,
    max_tokens: 800,
    system: [{ type: "text", text: EPISODIC_SUMMARY_SYSTEM, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: transcript }],
  });
  await recordUsage(workspaceId, "memory", model, res.usage);
  const summary = textOf(res);
  if (!summary) return false;
  const embedding = process.env.OPENAI_API_KEY ? toPgVector(await embedOne(summary)) : null;
  await db
    .from("conversations")
    .update({ summary, embedding, summarized_at: new Date().toISOString() })
    .eq("id", conversationId)
    .eq("workspace_id", workspaceId);
  return true;
}
