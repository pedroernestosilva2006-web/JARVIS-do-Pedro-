/**
 * Parser de [[wikilinks]] estilo Obsidian.
 * Suporta [[Título]], [[Título|apelido]] e [[Título#seção]].
 */

export interface Wikilink {
  target: string;
  alias?: string;
  heading?: string;
  start: number;
  end: number;
}

const WIKILINK_RE = /\[\[([^\[\]\n|#]+)(?:#([^\[\]\n|]+))?(?:\|([^\[\]\n]+))?\]\]/g;

export function parseWikilinks(markdown: string): Wikilink[] {
  const links: Wikilink[] = [];
  for (const m of markdown.matchAll(WIKILINK_RE)) {
    const target = m[1]!.trim();
    if (!target) continue;
    links.push({
      target,
      heading: m[2]?.trim() || undefined,
      alias: m[3]?.trim() || undefined,
      start: m.index!,
      end: m.index! + m[0].length,
    });
  }
  return links;
}

/** Alvos únicos (case-insensitive), preservando a primeira grafia. */
export function uniqueWikilinkTargets(markdown: string): string[] {
  const seen = new Map<string, string>();
  for (const l of parseWikilinks(markdown)) {
    const key = l.target.toLowerCase();
    if (!seen.has(key)) seen.set(key, l.target);
  }
  return [...seen.values()];
}

/** Substitui wikilinks por um renderizador customizado (ex.: links HTML). */
export function replaceWikilinks(
  markdown: string,
  render: (link: Wikilink) => string,
): string {
  return markdown.replace(WIKILINK_RE, (full, target, heading, alias, offset) =>
    render({
      target: String(target).trim(),
      heading: heading ? String(heading).trim() : undefined,
      alias: alias ? String(alias).trim() : undefined,
      start: offset,
      end: offset + full.length,
    }),
  );
}
