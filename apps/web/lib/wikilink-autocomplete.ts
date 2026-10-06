/** Lógica pura do autocomplete de [[wikilinks]] (testável sem DOM). */

/** Se o cursor está dentro de um "[[..." ainda aberto, devolve o termo digitado e onde ele começa. */
export function openWikilinkQuery(text: string, caret: number): { query: string; start: number } | null {
  const before = text.slice(0, caret);
  const m = before.match(/\[\[([^[\]\n|#]{0,80})$/);
  if (!m) return null;
  return { query: m[1]!, start: caret - m[1]!.length };
}

/** Insere o título escolhido fechando o link; devolve o novo texto e a nova posição do cursor. */
export function completeWikilink(text: string, caret: number, title: string): { text: string; caret: number } {
  const open = openWikilinkQuery(text, caret);
  if (!open) return { text, caret };
  const after = text.slice(caret);
  const closing = after.startsWith("]]") ? "" : "]]";
  const next = text.slice(0, open.start) + title + closing + after;
  const pos = open.start + title.length + 2;
  return { text: next, caret: pos };
}
