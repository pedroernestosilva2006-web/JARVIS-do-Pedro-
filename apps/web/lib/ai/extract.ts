import "server-only";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { ExtractedKnowledge, LinkJudgement } from "@jarvis/core";
import { env } from "@/lib/env";
import { anthropic, recordUsage, textOf } from "./llm";
import { EXTRACT_SYSTEM, extractUserMessage } from "./prompts/extract";
import { LINK_JUDGE_SYSTEM } from "./prompts/link-judge";
import { PDF_PROMPT, VISION_PROMPT } from "./prompts/vision";

/** Etapa 3: extração estruturada com structured outputs (schema Zod em @jarvis/core). */
export async function extractKnowledge(
  workspaceId: string,
  input: Parameters<typeof extractUserMessage>[0],
): Promise<ExtractedKnowledge> {
  const model = env.extractModel();
  const res = await anthropic().messages.parse({
    model,
    max_tokens: 16000,
    system: [{ type: "text", text: EXTRACT_SYSTEM, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: extractUserMessage(input) }],
    output_config: { format: zodOutputFormat(ExtractedKnowledge) },
  });
  await recordUsage(workspaceId, "extract", model, res.usage);
  if (res.stop_reason === "max_tokens") throw new Error("Extração truncada (max_tokens)");
  if (!res.parsed_output) throw new Error(`Extração sem saída válida (stop_reason=${res.stop_reason})`);
  return res.parsed_output;
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
  const model = env.extractModel();
  const res = await anthropic().messages.parse({
    model,
    max_tokens: 1024,
    system: [{ type: "text", text: LINK_JUDGE_SYSTEM, cache_control: { type: "ephemeral" } }],
    messages: [
      {
        role: "user",
        content: `Nota A: ${a.title}\n${a.summary ?? ""}\n\nNota B: ${b.title}\n${b.summary ?? ""}`,
      },
    ],
    output_config: { format: zodOutputFormat(LinkJudgement) },
  });
  await recordUsage(workspaceId, "link_judge", model, res.usage);
  return res.parsed_output ?? { relation: "nenhuma", confidence: 0, rationale: "" };
}
