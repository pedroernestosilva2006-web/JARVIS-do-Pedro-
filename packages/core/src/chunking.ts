/**
 * Divide textos longos (livro, transcrição de 1 h) em trechos para RAG e para extração em partes.
 * Corta preferencialmente em parágrafo, depois em frase, nunca no meio de palavra.
 */

/** A partir deste tamanho a fonte ganha chunks para RAG. */
export const LONG_SOURCE_CHARS = 8_000;
/** Tamanho de cada parte enviada à extração (evita estourar a saída do modelo). */
export const EXTRACTION_SEGMENT_CHARS = 24_000;

export function chunkText(text: string, size = 2_000, overlap = 200): string[] {
  const clean = text.replace(/\r\n/g, "\n").trim();
  if (!clean) return [];
  if (clean.length <= size) return [clean];
  const chunks: string[] = [];
  let start = 0;
  while (start < clean.length) {
    let end = Math.min(start + size, clean.length);
    if (end < clean.length) {
      const window = clean.slice(start, end);
      const minCut = Math.floor(size * 0.5);
      const para = window.lastIndexOf("\n\n");
      const sentence = Math.max(window.lastIndexOf(". "), window.lastIndexOf("? "), window.lastIndexOf("! "));
      const space = window.lastIndexOf(" ");
      const cut = para > minCut ? para : sentence > minCut ? sentence + 1 : space > minCut ? space : window.length;
      end = start + cut;
    }
    const piece = clean.slice(start, end).trim();
    if (piece) chunks.push(piece);
    if (end >= clean.length) break;
    // Sobreposição alinhada ao início de uma palavra
    let next = Math.max(end - overlap, start + 1);
    const ws = clean.indexOf(" ", next);
    if (ws !== -1 && ws < end) next = ws + 1;
    start = next;
  }
  return chunks;
}

/** Segmentos sem sobreposição para extração em partes. */
export function extractionSegments(text: string, size = EXTRACTION_SEGMENT_CHARS): string[] {
  return chunkText(text, size, 0);
}
