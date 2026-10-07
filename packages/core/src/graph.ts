import { TYPE_COLORS, TYPE_LABELS, TYPE_TONES, isNoteType } from "./taxonomy";

/** Tamanho do nó = f(grau). A raiz evita que um hub engula a tela (regra do Obsidian). */
export function nodeSize(degree: number, type?: string): number {
  const base = 3 + 2.5 * Math.sqrt(Math.max(0, degree));
  return type === "moc" ? base + 3 : base;
}

export function nodeColor(type: string): string {
  return isNoteType(type) ? TYPE_COLORS[type] : "#888888";
}

export function nodeTone(type: string): string {
  return isNoteType(type) ? TYPE_TONES[type] : "#808080";
}

/** Paleta para colorir por comunidade (Louvain). */
export const COMMUNITY_PALETTE = [
  "#a882ff", "#ff9f43", "#4cd27a", "#4aa8ff", "#ffd43b", "#ff5c5c",
  "#38c6d9", "#f78fb3", "#7fd1b9", "#c9a0dc", "#e1b12c", "#70a1ff",
];

export function communityColor(community: number): string {
  return COMMUNITY_PALETTE[Math.abs(community) % COMMUNITY_PALETTE.length]!;
}

// ---------------------------------------------------------------------------
// Consultas de grupos/filtros e grafo local (estilo Obsidian). Lógica pura, sem DOM.
// ---------------------------------------------------------------------------

/** minúsculas e sem acentos, para comparar "Cadência" com "cadencia". */
export function fold(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

export interface QueryNode {
  title: string;
  type: string;
  stage?: string;
  tags?: string[];
}

/**
 * Consulta de grupo/busca. Termos separados por espaço, todos precisam bater (E):
 *   tipo:pessoa  (ou type:)   → tipo da nota (id ou nome em português)
 *   tag:vendas   (ou #vendas) → tem a tag
 *   estagio:semente           → estágio
 *   qualquer outra coisa      → trecho do título
 * Consulta vazia não casa com nada (grupo sem regra não pinta ninguém).
 */
export function matchesQuery(node: QueryNode, query: string, opts: { emptyMatchesAll?: boolean } = {}): boolean {
  const tokens = query.trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) return !!opts.emptyMatchesAll;
  const title = fold(node.title);
  const typeId = fold(node.type);
  const typeLabel = isNoteType(node.type) ? fold(TYPE_LABELS[node.type]) : typeId;
  const tags = (node.tags ?? []).map(fold);
  return tokens.every((raw) => {
    const t = fold(raw);
    const m = t.match(/^(tipo|type|tag|estagio|stage):(.*)$/);
    if (m) {
      const v = m[2]!;
      if (!v) return true;
      if (m[1] === "tipo" || m[1] === "type") return typeId === v || typeLabel === v;
      if (m[1] === "tag") return tags.includes(v.replace(/^#/, ""));
      return fold(node.stage ?? "") === v;
    }
    if (t.startsWith("#") && t.length > 1) return tags.includes(t.slice(1));
    return title.includes(t);
  });
}

/** Nós a até `depth` saltos de `center` (inclui o próprio centro). Arestas tratadas como não direcionadas. */
export function neighborhood(edges: { source: string; target: string }[], center: string, depth: number): Set<string> {
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    (adj.get(e.source) ?? adj.set(e.source, []).get(e.source)!).push(e.target);
    (adj.get(e.target) ?? adj.set(e.target, []).get(e.target)!).push(e.source);
  }
  const seen = new Set([center]);
  let frontier = [center];
  for (let d = 0; d < Math.max(0, Math.min(depth, 6)) && frontier.length; d++) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const n of adj.get(id) ?? []) {
        if (!seen.has(n)) {
          seen.add(n);
          next.push(n);
        }
      }
    }
    frontier = next;
  }
  return seen;
}

/** Corte de data para o filtro de período ("7", "30", "90", "365" dias; "all" = sem corte). */
export function periodCutoff(period: string, now = Date.now()): number | null {
  const days = Number(period);
  return Number.isFinite(days) && days > 0 ? now - days * 86_400_000 : null;
}
