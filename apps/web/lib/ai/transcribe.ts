import "server-only";
import OpenAI, { toFile } from "openai";
import { env } from "@/lib/env";

/**
 * Interface de transcrição. Implementação atual: OpenAI (aceita OGG/Opus do Telegram, limite 25 MB).
 * Os modelos gpt-4o-*-transcribe saem do ar em 26/02/2027: ajuste JARVIS_TRANSCRIBE_MODEL
 * (ex.: gpt-transcribe) ou troque o provedor (Deepgram, AssemblyAI, Groq) mantendo esta assinatura.
 */
export const MAX_TRANSCRIBE_BYTES = 25 * 1024 * 1024;

let client: OpenAI | null = null;

export async function transcribe(
  audio: ArrayBuffer,
  fileName = "audio.ogg",
): Promise<{ text: string; model: string }> {
  if (audio.byteLength > MAX_TRANSCRIBE_BYTES) {
    throw new Error("Áudio maior que 25 MB — divida a gravação.");
  }
  client ??= new OpenAI({ apiKey: env.openaiApiKey() });
  const model = env.transcribeModel();
  const res = await client.audio.transcriptions.create({
    file: await toFile(Buffer.from(audio), fileName),
    model,
    language: "pt",
  });
  return { text: res.text, model };
}
