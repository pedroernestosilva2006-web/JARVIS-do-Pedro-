import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { describeImage, readPdf } from "@/lib/ai/extract";
import { recordUsage } from "@/lib/ai/llm";
import { transcribe } from "@/lib/ai/transcribe";
import { downloadTelegramFile } from "@/lib/capture/telegram";
import type { SourceRow } from "@/lib/types";

/**
 * Etapa 1 do pipeline: qualquer entrada → texto.
 * Áudio → transcrição · imagem → OCR/descrição · PDF → leitura nativa · link → artigo limpo.
 */
export async function normalizeSource(db: SupabaseClient, source: SourceRow): Promise<string> {
  const caption = source.raw_text ?? "";
  switch (source.kind) {
    case "text":
      return caption;
    case "link":
      return `${caption}\n\n${await fetchReadable(source.url ?? caption)}`.trim();
    case "audio": {
      const file = await loadFile(db, source);
      const { text, model } = await transcribe(file.data, file.name);
      const minutes = Number(source.metadata.duration_seconds ?? 0) / 60;
      await recordUsage(source.workspace_id, "transcribe", model, {}, "openai", minutes);
      return caption ? `${caption}\n\n${text}` : text;
    }
    case "image": {
      const file = await loadFile(db, source);
      return describeImage(source.workspace_id, file.data, file.mimeType, caption || undefined);
    }
    case "pdf": {
      const file = await loadFile(db, source);
      const text = await readPdf(source.workspace_id, file.data);
      return caption ? `${caption}\n\n${text}` : text;
    }
  }
}

/**
 * Baixa o arquivo da captura. Telegram: baixa via Bot API (≤ 20 MB) e arquiva no Storage
 * (bucket 'captures', caminho <workspace>/<source>.<ext>) na primeira vez.
 */
async function loadFile(
  db: SupabaseClient,
  source: SourceRow,
): Promise<{ data: ArrayBuffer; mimeType: string; name: string }> {
  const mimeType = String(source.metadata.mime_type ?? "application/octet-stream");
  const ext = String(source.metadata.file_ext ?? mimeType.split("/")[1] ?? "bin");
  const name = `${source.id}.${ext}`;

  if (source.storage_path) {
    const { data, error } = await db.storage.from("captures").download(source.storage_path);
    if (error || !data) throw new Error(`Storage download: ${error?.message}`);
    return { data: await data.arrayBuffer(), mimeType, name };
  }

  const fileId = source.metadata.telegram_file_id;
  if (typeof fileId !== "string") throw new Error("Captura sem arquivo associado");
  const data = await downloadTelegramFile(fileId);
  const path = `${source.workspace_id}/${name}`;
  const { error } = await db.storage.from("captures").upload(path, data, { contentType: mimeType, upsert: true });
  if (!error) {
    await db.from("sources").update({ storage_path: path }).eq("id", source.id).eq("workspace_id", source.workspace_id);
  } else {
    console.error("Falha ao arquivar captura no Storage", error.message);
  }
  return { data, mimeType, name };
}

/** Busca uma página e extrai texto legível (título + corpo, sem scripts/menus). */
export async function fetchReadable(url: string, maxChars = 40_000): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (JARVIS segundo cérebro)" },
    signal: AbortSignal.timeout(15_000),
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`Falha ao buscar link (${res.status})`);
  const html = await res.text();
  return htmlToText(html).slice(0, maxChars);
}

export function htmlToText(html: string): string {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? "";
  const main =
    html.match(/<article[\s\S]*?<\/article>/i)?.[0] ??
    html.match(/<main[\s\S]*?<\/main>/i)?.[0] ??
    html.match(/<body[\s\S]*?<\/body>/i)?.[0] ??
    html;
  const body = main
    .replace(/<(script|style|nav|header|footer|aside|noscript|svg|form)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<\/(p|div|h[1-6]|li|br|tr|section)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n\n")
    .trim();
  return title ? `# ${decodeEntities(title)}\n\n${body}` : body;
}

function decodeEntities(s: string) {
  return s.replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"');
}
