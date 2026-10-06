import { normalizeName } from "./slug";
import type { EntityType } from "./taxonomy";

/**
 * Entity resolution: decide se uma entidade extraída é uma nota existente.
 *
 * Score combina (max) três sinais:
 *  - match exato de nome/alias normalizado → 1.0
 *  - similaridade de trigramas (como pg_trgm) entre nomes normalizados
 *  - similaridade de embedding (cosseno), quando disponível
 *
 * Decisão: ≥ 0.9 reutiliza; 0.75–0.9 pergunta (fila de revisão); < 0.75 cria.
 */

export const ENTITY_THRESHOLDS = { reuse: 0.9, ask: 0.75 } as const;

export interface EntityCandidate {
  id: string;
  title: string;
  type: string;
  aliases: string[];
  /** Similaridade de cosseno já calculada no banco (0..1), opcional. */
  embeddingSimilarity?: number;
}

export type ResolutionDecision =
  | { action: "reuse"; candidateId: string; score: number }
  | { action: "ask"; candidateId: string; score: number }
  | { action: "create"; score: number };

/** Trigramas no estilo pg_trgm: palavra com padding "  " no início e " " no fim. */
export function trigrams(text: string): Set<string> {
  const out = new Set<string>();
  for (const word of normalizeName(text).split(" ")) {
    if (!word) continue;
    const padded = `  ${word} `;
    for (let i = 0; i < padded.length - 2; i++) out.add(padded.slice(i, i + 3));
  }
  return out;
}

/** Similaridade de Jaccard sobre trigramas (equivalente a `similarity()` do pg_trgm). */
export function trigramSimilarity(a: string, b: string): number {
  const ta = trigrams(a);
  const tb = trigrams(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / (ta.size + tb.size - inter);
}

export function scoreCandidate(name: string, candidate: EntityCandidate): number {
  const target = normalizeName(name);
  const names = [candidate.title, ...candidate.aliases];
  if (names.some((n) => normalizeName(n) === target)) return 1;
  const trigram = Math.max(...names.map((n) => trigramSimilarity(name, n)));
  return Math.max(trigram, candidate.embeddingSimilarity ?? 0);
}

export function resolveEntity(
  entity: { name: string; type: EntityType },
  candidates: EntityCandidate[],
  thresholds: { reuse: number; ask: number } = ENTITY_THRESHOLDS,
): ResolutionDecision {
  let best: { id: string; score: number } | null = null;
  for (const c of candidates) {
    if (c.type !== entity.type) continue;
    const score = scoreCandidate(entity.name, c);
    if (!best || score > best.score) best = { id: c.id, score };
  }
  if (!best) return { action: "create", score: 0 };
  if (best.score >= thresholds.reuse) return { action: "reuse", candidateId: best.id, score: best.score };
  if (best.score >= thresholds.ask) return { action: "ask", candidateId: best.id, score: best.score };
  return { action: "create", score: best.score };
}
