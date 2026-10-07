import { TYPE_COLORS, TYPE_TONES, isNoteType } from "./taxonomy";

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
