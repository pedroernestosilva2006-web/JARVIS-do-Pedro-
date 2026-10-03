import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { env } from "@/lib/env";
import { anthropic, recordUsage } from "@/lib/ai/llm";
import { JARVIS_SYSTEM, profileBlock } from "@/lib/ai/prompts/chat";
import { anthropicTools, runTool, type ToolContext } from "./tools";

type MessageParam = Anthropic.Beta.Messages.BetaMessageParam;

export type JarvisEvent =
  | { type: "text"; text: string }
  | { type: "tool"; name: string }
  | { type: "error"; message: string };

const MAX_TURNS = 8;

/** Modelos que aceitam o fallback server-side ("default") na Claude API. */
function supportsDefaultFallback(model: string) {
  return /^claude-(sonnet-5-5|opus-5|fable-5)/.test(model);
}

async function buildSystem(ctx: ToolContext): Promise<Anthropic.Beta.Messages.BetaTextBlockParam[]> {
  const [{ data: ws }, { data: projects }] = await Promise.all([
    ctx.db.from("workspaces").select("profile_md").eq("id", ctx.workspaceId).single(),
    ctx.db
      .from("notes")
      .select("title")
      .eq("workspace_id", ctx.workspaceId)
      .eq("type", "projeto")
      .neq("para_bucket", "arquivo")
      .order("title")
      .limit(20),
  ]);
  // Data (sem hora) para não invalidar o cache a cada request
  const today = new Date().toISOString().slice(0, 10);
  return [
    { type: "text", text: JARVIS_SYSTEM, cache_control: { type: "ephemeral" } },
    {
      type: "text",
      text: profileBlock(ws?.profile_md ?? "", (projects ?? []).map((p) => p.title), today),
      cache_control: { type: "ephemeral" },
    },
  ];
}

/**
 * Loop agêntico do Jarvis (streaming). Append-only: devolve as mensagens novas
 * (assistant + tool_result) exatamente como vieram, para persistir e reenviar sem edição.
 */
export async function runJarvis(
  ctx: ToolContext,
  history: MessageParam[],
  onEvent: (e: JarvisEvent) => void = () => {},
): Promise<{ newMessages: MessageParam[]; finalText: string }> {
  const model = env.chatModel();
  const system = await buildSystem(ctx);
  const tools = anthropicTools();
  const messages = [...history];
  const newMessages: MessageParam[] = [];
  let finalText = "";

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const stream = anthropic().beta.messages.stream({
      model,
      max_tokens: 16000,
      system,
      tools,
      messages,
      output_config: { effort: (process.env.JARVIS_CHAT_EFFORT as "low" | "medium" | "high") ?? "medium" },
      ...(supportsDefaultFallback(model)
        ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }
        : {}),
    });
    stream.on("text", (delta) => onEvent({ type: "text", text: delta }));
    const message = await stream.finalMessage();
    await recordUsage(ctx.workspaceId, "chat", message.model ?? model, message.usage);

    const assistant: MessageParam = { role: "assistant", content: message.content };
    messages.push(assistant);
    newMessages.push(assistant);
    finalText = message.content
      .filter((b): b is Anthropic.Beta.Messages.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    if (message.stop_reason === "refusal") {
      onEvent({ type: "error", message: "O modelo recusou esta solicitação." });
      break;
    }
    if (message.stop_reason === "pause_turn") continue;
    const toolUses = message.content.filter(
      (b): b is Anthropic.Beta.Messages.BetaToolUseBlock => b.type === "tool_use",
    );
    if (!toolUses.length) break;
    if (message.stop_reason === "max_tokens") {
      onEvent({ type: "error", message: "Resposta truncada (max_tokens)." });
      break;
    }

    // Todas as tool_results num único turno de usuário (mantém chamadas paralelas)
    const results = await Promise.all(
      toolUses.map(async (tu) => {
        onEvent({ type: "tool", name: tu.name });
        const r = await runTool(ctx, tu.name, tu.input);
        return { type: "tool_result" as const, tool_use_id: tu.id, content: r.content, is_error: r.isError };
      }),
    );
    const toolTurn: MessageParam = { role: "user", content: results };
    messages.push(toolTurn);
    newMessages.push(toolTurn);
  }
  return { newMessages, finalText };
}
