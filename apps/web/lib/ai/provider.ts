/**
 * Escolha do provedor de LLM (função pura, testável).
 *  - "anthropic": ANTHROPIC_API_KEY direta.
 *  - "gateway": Vercel AI Gateway, sem chave da Anthropic (AI_GATEWAY_API_KEY, ou o token OIDC
 *    que a Vercel injeta em runtime). Os modelos usam o formato "anthropic/<modelo>".
 *  - "none": nenhum dos dois — as chamadas de IA falham com mensagem clara.
 */
export type AiProvider =
  | { kind: "anthropic"; apiKey: string; baseURL?: string }
  | { kind: "gateway"; authToken: string; baseURL: string }
  | { kind: "none" };

export const DEFAULT_GATEWAY_URL = "https://ai-gateway.vercel.sh";

export function resolveAiProvider(e: Record<string, string | undefined>): AiProvider {
  if (e.ANTHROPIC_API_KEY) return { kind: "anthropic", apiKey: e.ANTHROPIC_API_KEY, baseURL: e.ANTHROPIC_BASE_URL };
  const token = e.AI_GATEWAY_API_KEY || e.VERCEL_OIDC_TOKEN;
  if (token) return { kind: "gateway", authToken: token, baseURL: e.AI_GATEWAY_BASE_URL || DEFAULT_GATEWAY_URL };
  return { kind: "none" };
}

/** Modelos padrão por provedor. Sempre sobrescrevíveis por JARVIS_*_MODEL (slugs do gateway podem mudar). */
export function defaultModels(kind: AiProvider["kind"]): { extract: string; chat: string } {
  return kind === "gateway"
    ? { extract: "anthropic/claude-haiku-4.5", chat: "anthropic/claude-sonnet-4.5" }
    : { extract: "claude-haiku-4-5", chat: "claude-sonnet-5-5" };
}

/** Recursos beta/específicos da API direta da Anthropic (fallbacks server-side, effort) não valem no gateway. */
export function supportsAnthropicExtras(kind: AiProvider["kind"], model: string): boolean {
  return kind === "anthropic" && /^claude-(sonnet-5-5|opus-5|fable-5)/.test(model);
}

export function embeddingsConfigured(e: Record<string, string | undefined>): boolean {
  return Boolean(e.OPENAI_API_KEY);
}
