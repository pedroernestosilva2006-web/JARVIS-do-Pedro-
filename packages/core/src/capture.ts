import type { Channel, SourceKind } from "./taxonomy";

/**
 * Contrato entre adaptadores de canal (Telegram, WhatsApp, web…) e o pipeline.
 * Trocar de canal nunca deve exigir mudança no pipeline.
 */
export interface NormalizedCapture {
  channel: Channel;
  kind: SourceKind;
  /** Identidade do remetente no canal (ex.: telegram user id). */
  externalUserId: string;
  /** Chave de idempotência — webhooks reenviam mensagens. */
  idempotencyKey: string;
  text?: string;
  url?: string;
  /** Arquivo a baixar (o adaptador sabe como resolver). */
  file?: { ref: string; mimeType: string; sizeBytes?: number; fileName?: string };
  metadata: Record<string, unknown>;
  capturedAt: string;
}

export type CaptureCommand =
  | { command: "evento"; arg: string }
  | { command: "livro"; arg: string }
  | { command: "fim"; arg: "" }
  | { command: "conectar"; arg: string }
  | { command: "start"; arg: string }
  | { command: "ajuda"; arg: "" }
  | { command: "pergunta"; arg: string };

const COMMANDS = new Set(["evento", "livro", "fim", "conectar", "start", "ajuda", "help", "pergunta", "p"]);

/** Interpreta comandos do bot: /evento RD Summit 2026, /livro Receita Previsível, /fim, /p <pergunta>… */
export function parseCommand(text: string | undefined): CaptureCommand | null {
  if (!text) return null;
  const m = text.trim().match(/^\/([a-zA-Z_]+)(?:@\w+)?(?:\s+([\s\S]*))?$/);
  if (!m) return null;
  const cmd = m[1]!.toLowerCase();
  const arg = (m[2] ?? "").trim();
  if (!COMMANDS.has(cmd)) return null;
  switch (cmd) {
    case "help":
    case "ajuda":
      return { command: "ajuda", arg: "" };
    case "fim":
      return { command: "fim", arg: "" };
    case "p":
    case "pergunta":
      return { command: "pergunta", arg };
    default:
      return { command: cmd as "evento" | "livro" | "conectar" | "start", arg };
  }
}

/** Extrai a primeira URL de um texto (para capturas de link). */
export function extractUrl(text: string | undefined): string | undefined {
  return text?.match(/https?:\/\/[^\s<>"]+/)?.[0];
}
