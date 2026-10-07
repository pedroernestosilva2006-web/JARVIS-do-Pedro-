import "server-only";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { ExtractedKnowledge, LinkJudgement } from "@jarvis/core";
import { env } from "@/lib/env";
import type { z } from "zod";
import { jsonInstruction, parseStructured } from "./json-output";
import { aiProvider, anthropic, recordUsage, textOf } from "./llm";
import { EXTRACT_SYSTEM, extractUserMessage } from "./prompts/extract";
import { LINK_JUDGE_SYSTEM } from "./prompts/link-judge";
import { PDF_PROMPT, VISION_PROMPT } from "./prompts/vision";

/** Etapa 3: extração estruturada com structured outputs (schema Zod em @jarvis/core). */
export async function extractKnowledge(
  workspaceId: string,
  input: Parameters<typeof extractUserMessage>[0],
): Promise<ExtractedKnowledge> {
  const model = env.extractModel();
  return structured(workspaceId, "extract", {
    model,
    maxTokens: 16000,
    system: EXTRACT_SYSTEM,
    user: extractUserMessage(input),
    schema: ExtractedKnowledge,
  });
}

type ImageMediaType = "image/jpeg" | "image/png" | "image/gif" | "image/webp";

/** Etapa 1 (imagem): OCR + descrição via Claude vision. */
export async function describeImage(
  workspaceId: string,
  data: ArrayBuffer,
  mediaType: string,
  caption?: string,
): Promise<string> {
  const model = env.extractModel();
  const media = (["image/jpeg", "image/png", "image/gif", "image/webp"].includes(mediaType)
    ? mediaType
    : "image/jpeg") as ImageMediaType;
  const res = await anthropic().messages.create({
    model,
    max_tokens: 8000,
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: media, data: Buffer.from(data).toString("base64") } },
          { type: "text", text: caption ? `${VISION_PROMPT}\n\nLegenda do Pedro: ${caption}` : VISION_PROMPT },
        ],
      },
    ],
  });
  await recordUsage(workspaceId, "vision", model, res.usage);
  return textOf(res);
}

/** Etapa 1 (PDF): suporte nativo a PDF do Claude. */
export async function readPdf(workspaceId: string, data: ArrayBuffer): Promise<string> {
  const model = env.extractModel();
  const res = await anthropic().messages.create({
    model,
    max_tokens: 16000,
    messages: [
      {
        role: "user",
        content: [
          { type: "document", source: { type: "base64", media_type: "application/pdf", data: Buffer.from(data).toString("base64") } },
          { type: "text", text: PDF_PROMPT },
        ],
      },
    ],
  });
  await recordUsage(workspaceId, "vision", model, res.usage);
  return textOf(res);
}

/** Camada 3 de linking: relação tipada + rationale para um par candidato. */
export async function judgeLink(
  workspaceId: string,
  a: { title: string; summary: string | null },
  b: { title: string; summary: string | null },
): Promise<LinkJudgement> {
  try {
    return await structured(workspaceId, "link_judge", {
      model: env.extractModel(),
      maxTokens: 1024,
      system: LINK_JUDGE_SYSTEM,
      user: `Nota A: ${a.title}\n${a.summary ?? ""}\n\nNota B: ${b.title}\n${b.summary ?? ""}`,
      schema: LinkJudgement,
    });
  } catch (err) {
    // O juiz é opcional: se falhar, o link semântico segue pela similaridade (ver suggestLinks)
    console.error("judgeLink falhou", err instanceof Error ? err.message : err);
    return { relation: "relacionado", confidence: 0.5, rationale: "" };
  }
}

type StructuredParams<T extends z.ZodType> = {
  model: string;
  maxTokens: number;
  system: string;
  user: string;
  schema: T;
};

/**
 * Saída estruturada validada por Zod. Na API direta da Anthropic usa structured outputs nativo;
 * em outros provedores (AI Gateway) pede JSON puro, valida e tenta de novo uma vez se vier inválido.
 */
async function structured<T extends z.ZodType>(
  workspaceId: string,
  operation: "extract" | "link_judge",
  p: StructuredParams<T>,
): Promise<z.infer<T>> {
  const client = anthropic();
  if (aiProvider().kind === "anthropic") {
    const res = await client.messages.parse({
      model: p.model,
      max_tokens: p.maxTokens,
      system: [{ type: "text", text: p.system, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: p.user }],
      output_config: { format: zodOutputFormat(p.schema) },
    });
    await recordUsage(workspaceId, operation, p.model, res.usage);
    if (res.stop_reason === "max_tokens") throw new Error("Resposta truncada (max_tokens)");
    if (!res.parsed_output) throw new Error(`Sem saída válida (stop_reason=${res.stop_reason})`);
    return res.parsed_output as z.infer<T>;
  }

  const system = [{ type: "text" as const, text: p.system + jsonInstruction(p.schema), cache_control: { type: "ephemeral" as const } }];
  let lastError = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await client.messages.create({
      model: p.model,
      max_tokens: p.maxTokens,
      system,
      messages: [{ role: "user", content: attempt === 0 ? p.user : `${p.user}\n\n(Tentativa anterior inválida: ${lastError}. Responda só com o JSON.)` }],
    });
    await recordUsage(workspaceId, operation, p.model, res.usage);
    try {
      return parseStructured(textOf(res), p.schema);
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }
  throw new Error(`Saída estruturada inválida após 2 tentativas: ${lastError}`);
}
