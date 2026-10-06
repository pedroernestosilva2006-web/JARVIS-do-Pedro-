import "server-only";
import type { NormalizedCapture } from "@jarvis/core";
import { extractUrl } from "@jarvis/core";
import { env } from "@/lib/env";

/** Adaptador do Telegram Bot API: update → NormalizedCapture, envio de mensagens e download de arquivos. */

/** Limite da Bot API para download (getFile). Um Local Bot API Server remove esse limite. */
export const TELEGRAM_MAX_DOWNLOAD_BYTES = 20 * 1024 * 1024;

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
}

interface TelegramFileRef {
  file_id: string;
  file_unique_id: string;
  file_size?: number;
  mime_type?: string;
  file_name?: string;
  duration?: number;
}

export interface TelegramMessage {
  message_id: number;
  date: number;
  chat: { id: number; type: string };
  from?: { id: number; first_name?: string; username?: string };
  text?: string;
  caption?: string;
  voice?: TelegramFileRef;
  audio?: TelegramFileRef;
  photo?: (TelegramFileRef & { width: number; height: number })[];
  document?: TelegramFileRef;
}

async function call<T>(method: string, body: unknown): Promise<T> {
  const res = await fetch(`${env.telegramApiBase()}/bot${env.telegramBotToken()}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as { ok: boolean; result: T; description?: string };
  if (!json.ok) throw new Error(`Telegram ${method}: ${json.description}`);
  return json.result;
}

export async function sendTelegramMessage(chatId: number | string, text: string): Promise<void> {
  // Telegram limita mensagens a 4096 caracteres
  for (let i = 0; i < text.length; i += 4000) {
    await call("sendMessage", {
      chat_id: chatId,
      text: text.slice(i, i + 4000),
      link_preview_options: { is_disabled: true },
    });
  }
}

export async function sendTelegramTyping(chatId: number | string): Promise<void> {
  await call("sendChatAction", { chat_id: chatId, action: "typing" }).catch(() => undefined);
}

export async function downloadTelegramFile(fileId: string): Promise<ArrayBuffer> {
  const file = await call<{ file_path?: string; file_size?: number }>("getFile", { file_id: fileId });
  if (!file.file_path) throw new Error("Arquivo indisponível (Bot API baixa até 20 MB)");
  const res = await fetch(`${env.telegramApiBase()}/file/bot${env.telegramBotToken()}/${file.file_path}`);
  if (!res.ok) throw new Error(`Download do Telegram falhou (${res.status})`);
  return res.arrayBuffer();
}

/** Converte um update em captura normalizada. Retorna null para updates sem conteúdo útil. */
export function telegramToCapture(update: TelegramUpdate): NormalizedCapture | null {
  const msg = update.message;
  if (!msg?.from) return null;
  const base = {
    channel: "telegram" as const,
    externalUserId: String(msg.from.id),
    idempotencyKey: `tg:${msg.chat.id}:${msg.message_id}`,
    capturedAt: new Date(msg.date * 1000).toISOString(),
    metadata: {
      chat_id: msg.chat.id,
      message_id: msg.message_id,
      from_username: msg.from.username ?? null,
    } as Record<string, unknown>,
  };

  const fileMeta = (f: TelegramFileRef, fallbackMime: string, ext: string) => {
    base.metadata.telegram_file_id = f.file_id;
    base.metadata.mime_type = f.mime_type ?? fallbackMime;
    base.metadata.file_ext = f.file_name?.split(".").pop() ?? ext;
    base.metadata.file_size = f.file_size ?? null;
    if (f.duration) base.metadata.duration_seconds = f.duration;
    return { ref: f.file_id, mimeType: f.mime_type ?? fallbackMime, sizeBytes: f.file_size, fileName: f.file_name };
  };

  const voice = msg.voice ?? msg.audio;
  if (voice) {
    return { ...base, kind: "audio", text: msg.caption, file: fileMeta(voice, "audio/ogg", "ogg") };
  }
  if (msg.photo?.length) {
    // Maior resolução que caiba no limite de download
    const best =
      [...msg.photo].reverse().find((p) => (p.file_size ?? 0) <= TELEGRAM_MAX_DOWNLOAD_BYTES) ?? msg.photo[0]!;
    return { ...base, kind: "image", text: msg.caption, file: fileMeta(best, "image/jpeg", "jpg") };
  }
  if (msg.document) {
    const mime = msg.document.mime_type ?? "";
    const kind = mime === "application/pdf" ? "pdf" : mime.startsWith("image/") ? "image" : mime.startsWith("audio/") ? "audio" : null;
    if (!kind) return null;
    return { ...base, kind, text: msg.caption, file: fileMeta(msg.document, mime, mime.split("/")[1] ?? "bin") };
  }
  if (msg.text) {
    const url = extractUrl(msg.text);
    // Link "puro" (mensagem é basicamente a URL) → captura de link
    if (url && msg.text.replace(url, "").trim().length < 40) {
      return { ...base, kind: "link", text: msg.text, url };
    }
    return { ...base, kind: "text", text: msg.text };
  }
  return null;
}
