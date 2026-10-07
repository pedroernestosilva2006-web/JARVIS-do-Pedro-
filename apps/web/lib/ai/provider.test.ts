import { describe, expect, it } from "vitest";
import { defaultModels, embeddingsConfigured, resolveAiProvider, supportsAnthropicExtras } from "./provider";

describe("resolveAiProvider", () => {
  it("a chave direta da Anthropic tem prioridade", () => {
    expect(resolveAiProvider({ ANTHROPIC_API_KEY: "sk-ant", AI_GATEWAY_API_KEY: "gw" })).toMatchObject({ kind: "anthropic", apiKey: "sk-ant" });
  });
  it("sem chave da Anthropic usa o AI Gateway (chave ou token OIDC da Vercel)", () => {
    expect(resolveAiProvider({ AI_GATEWAY_API_KEY: "gw" })).toEqual({ kind: "gateway", authToken: "gw", baseURL: "https://ai-gateway.vercel.sh" });
    expect(resolveAiProvider({ VERCEL_OIDC_TOKEN: "oidc", AI_GATEWAY_BASE_URL: "https://x" })).toEqual({ kind: "gateway", authToken: "oidc", baseURL: "https://x" });
  });
  it("sem nada devolve none", () => {
    expect(resolveAiProvider({})).toEqual({ kind: "none" });
  });
});

describe("modelos e recursos", () => {
  it("o gateway usa slugs com prefixo do provedor", () => {
    expect(defaultModels("gateway").extract).toMatch(/^anthropic\//);
    expect(defaultModels("anthropic").chat).toBe("claude-sonnet-5-5");
  });
  it("fallback server-side e effort só na API direta", () => {
    expect(supportsAnthropicExtras("anthropic", "claude-sonnet-5-5")).toBe(true);
    expect(supportsAnthropicExtras("gateway", "anthropic/claude-sonnet-4.5")).toBe(false);
    expect(supportsAnthropicExtras("anthropic", "claude-haiku-4-5")).toBe(false);
  });
  it("embeddings dependem da OPENAI_API_KEY", () => {
    expect(embeddingsConfigured({})).toBe(false);
    expect(embeddingsConfigured({ OPENAI_API_KEY: "sk" })).toBe(true);
  });
});
