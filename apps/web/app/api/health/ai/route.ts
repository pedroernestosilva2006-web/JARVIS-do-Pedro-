import { getAppContext } from "@/lib/access";
import { anthropic, aiProvider, recordUsage } from "@/lib/ai/llm";
import { env } from "@/lib/env";

/** Teste de conexão com o Claude (botão em Ajustes): uma chamada mínima, sem expor chaves. */
export async function POST() {
  const ctx = await getAppContext();
  if (!ctx) return new Response("unauthorized", { status: 401 });
  const provider = aiProvider();
  if (provider.kind === "none") {
    return Response.json({ ok: false, error: "Nenhuma chave configurada: defina ANTHROPIC_API_KEY (ou AI_GATEWAY_API_KEY) na Vercel e faça Redeploy." });
  }
  const model = env.extractModel();
  const t0 = Date.now();
  try {
    const msg = await anthropic().messages.create({ model, max_tokens: 16, messages: [{ role: "user", content: "Responda apenas: ok" }] });
    await recordUsage(ctx.workspaceId, "chat", model, msg.usage, provider.kind);
    return Response.json({ ok: true, provider: provider.kind, model, ms: Date.now() - t0 });
  } catch (e) {
    const status = (e as { status?: number }).status;
    const hint =
      status === 401 ? "Chave inválida ou revogada." : status === 404 ? `Modelo “${model}” não encontrado (ajuste JARVIS_EXTRACT_MODEL).` : status === 429 ? "Limite de uso/saldo da API atingido." : "Falha ao chamar a API.";
    return Response.json({ ok: false, provider: provider.kind, model, error: `${hint}${status ? ` (HTTP ${status})` : ""}` });
  }
}
