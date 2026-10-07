import type { SourceKind } from "@jarvis/core";

/** Regras de arquivos (puras, testáveis): tamanho, nomes e quais tipos o Jarvis consegue analisar. */

/** Limite do plano Free do Supabase Storage (por arquivo). */
export const MAX_FILE_BYTES = 50 * 1024 * 1024;
/** Arquivos de texto até este tamanho são lidos como texto para o Jarvis analisar. */
export const MAX_TEXT_ANALYZE_BYTES = 400 * 1024;
/** Limites dos provedores de IA para análise (áudio 25 MB na transcrição; Telegram não se aplica aqui). */
export const MAX_ANALYZE_BYTES: Record<string, number> = { audio: 25 * 1024 * 1024, image: 5 * 1024 * 1024, pdf: 32 * 1024 * 1024 };

const TEXT_EXT = new Set(["txt", "md", "markdown", "csv", "json", "log", "html", "htm", "xml", "yml", "yaml", "srt", "vtt"]);

/** Nome seguro para o caminho no Storage (sem acento, espaço ou barra) — o nome original fica no banco. */
export function safeStorageName(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  const base = dot > 0 ? fileName.slice(0, dot) : fileName;
  const ext = dot > 0 ? fileName.slice(dot + 1) : "";
  const clean = (s: string) =>
    s
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-zA-Z0-9_-]+/g, "-") // sem pontos: impede "..", "." e travessia de caminho
      .replace(/^-+|-+$/g, "")
      .slice(0, 60);
  const b = clean(base) || "arquivo";
  const e = clean(ext).slice(0, 10);
  return e ? `${b}.${e}` : b;
}

export function fileExtension(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  return dot > 0 ? fileName.slice(dot + 1).toLowerCase() : "";
}

/** Tipo que o pipeline sabe analisar, ou null (o arquivo só é guardado). */
export function analyzableKind(fileName: string, mimeType: string | null | undefined): SourceKind | null {
  const mime = (mimeType ?? "").toLowerCase();
  if (mime === "application/pdf" || fileExtension(fileName) === "pdf") return "pdf";
  if (mime.startsWith("image/") && mime !== "image/svg+xml") return "image";
  if (mime.startsWith("audio/") || ["mp3", "m4a", "wav", "ogg", "oga", "opus", "webm", "aac", "flac"].includes(fileExtension(fileName))) return "audio";
  if (mime.startsWith("text/") || TEXT_EXT.has(fileExtension(fileName)) || mime === "application/json") return "text";
  return null;
}

/** Pode ser analisado pelo Jarvis dado o tamanho? Devolve o motivo quando não. */
export function analyzeVerdict(kind: SourceKind | null, size: number): { ok: true } | { ok: false; reason: string } {
  if (!kind) return { ok: false, reason: "tipo de arquivo que o Jarvis ainda não lê (ele fica guardado)" };
  const max = kind === "text" ? MAX_TEXT_ANALYZE_BYTES : MAX_ANALYZE_BYTES[kind];
  if (max && size > max) return { ok: false, reason: `grande demais para analisar (limite ${Math.round(max / 1024 / 1024 || 1)} MB)` };
  return { ok: true };
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

/** Rótulo curto do tipo para a interface. */
export function fileTypeLabel(fileName: string, mimeType: string | null | undefined): string {
  const k = analyzableKind(fileName, mimeType);
  if (k === "pdf") return "PDF";
  if (k === "image") return "Imagem";
  if (k === "audio") return "Áudio";
  if (k === "text") return "Texto";
  const ext = fileExtension(fileName);
  return ext ? ext.toUpperCase() : "Arquivo";
}
