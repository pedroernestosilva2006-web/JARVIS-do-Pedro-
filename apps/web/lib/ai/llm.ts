import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { resolveAiProvider, type AiProvider } from "./provider";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Interface do provedor de LLM. Todo acesso ao Claude passa por aqui
 * (modelo configurável por env + registro de uso por workspace em ai_usage).
 */
let client: Anthropic | null = null;

export function aiProvider(): AiProvider {
  return resolveAiProvider(process.env);
}

export function anthropic(): Anthropic {
  if (client) return client;
  const p = aiProvider();
  if (p.kind === "none") {
    throw new Error("IA não configurada: defina ANTHROPIC_API_KEY ou habilite o Vercel AI Gateway (AI_GATEWAY_API_KEY).");
  }
  client =
    p.kind === "anthropic"
      ? new Anthropic({ apiKey: p.apiKey, baseURL: p.baseURL })
      : new Anthropic({ apiKey: null, authToken: p.authToken, baseURL: p.baseURL });
  return client;
}

export type AiOperation = "extract" | "chat" | "embed" | "transcribe" | "vision" | "link_judge" | "brief" | "memory";

export async function recordUsage(
  workspaceId: string,
  operation: AiOperation,
  model: string,
  usage: {
    input_tokens?: number | null;
    output_tokens?: number | null;
    cache_read_input_tokens?: number | null;
    cache_creation_input_tokens?: number | null;
  },
  provider = "anthropic",
  units = 0,
): Promise<void> {
  if (process.env.JARVIS_DISABLE_USAGE === "1") return; // evals/scripts locais
  const { error } = await createAdminClient()
    .from("ai_usage")
    .insert({
      workspace_id: workspaceId,
      provider,
      model,
      operation,
      input_tokens: usage.input_tokens ?? 0,
      output_tokens: usage.output_tokens ?? 0,
      cache_read_tokens: usage.cache_read_input_tokens ?? 0,
      cache_write_tokens: usage.cache_creation_input_tokens ?? 0,
      units,
    });
  if (error) console.error("ai_usage insert falhou", error.message);
}

/** Concatena os blocos de texto de uma resposta. */
export function textOf(message: Anthropic.Message): string {
  return message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}
