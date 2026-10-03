import "server-only";
import OpenAI from "openai";
import { env } from "@/lib/env";

/** Interface de embeddings (1536 dimensões — casa com o schema). Troque o provedor aqui. */
export const EMBEDDING_DIMENSIONS = 1536;

let client: OpenAI | null = null;
function openai(): OpenAI {
  client ??= new OpenAI({ apiKey: env.openaiApiKey() });
  return client;
}

export async function embed(texts: string[]): Promise<{ vectors: number[][]; tokens: number }> {
  if (texts.length === 0) return { vectors: [], tokens: 0 };
  const res = await openai().embeddings.create({
    model: env.embedModel(),
    input: texts.map((t) => t.slice(0, 24_000)),
    dimensions: EMBEDDING_DIMENSIONS,
  });
  return {
    vectors: res.data.sort((a, b) => a.index - b.index).map((d) => d.embedding),
    tokens: res.usage.total_tokens,
  };
}

export async function embedOne(text: string): Promise<number[]> {
  const { vectors } = await embed([text]);
  return vectors[0]!;
}

/** pgvector aceita o literal '[0.1,0.2,...]'. */
export function toPgVector(v: number[]): string {
  return `[${v.join(",")}]`;
}

/** Texto canônico de uma nota para embedding. */
export function noteEmbeddingText(note: { type: string; title: string; summary: string | null; content_md: string }) {
  return `${note.type}: ${note.title}\n${note.summary ?? ""}\n${note.content_md}`.trim();
}
