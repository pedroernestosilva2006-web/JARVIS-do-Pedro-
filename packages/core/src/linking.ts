import type { LinkStatus } from "./taxonomy";

/**
 * Limiares de link semântico (camada 2). Calibre olhando ~50 casos reais.
 * cos ≥ accept → accepted; suggest ≤ cos < accept → suggested; abaixo → descartado.
 */
export const SEMANTIC_THRESHOLDS = {
  accept: 0.8,
  suggest: 0.7,
  topK: 5,
} as const;

/** Regra inviolável: links da IA com confiança < 0.8 nascem 'suggested'. */
export const AI_LINK_ACCEPT_CONFIDENCE = 0.8;

export function semanticLinkStatus(
  similarity: number,
  thresholds: { accept: number; suggest: number } = SEMANTIC_THRESHOLDS,
): LinkStatus | null {
  if (similarity >= thresholds.accept) return "accepted";
  if (similarity >= thresholds.suggest) return "suggested";
  return null;
}

export function aiLinkStatus(confidence: number): LinkStatus {
  return confidence >= AI_LINK_ACCEPT_CONFIDENCE ? "accepted" : "suggested";
}

/** Distância de cosseno (pgvector `<=>`) → similaridade. */
export function distanceToSimilarity(distance: number): number {
  return 1 - distance;
}

/** Quando um cluster sem MOC passa deste tamanho, propor um MOC. */
export const MOC_CLUSTER_MIN_SIZE = 7;

/** Sementes mais velhas que isto entram no lembrete de revisão. */
export const STALE_SEED_DAYS = 30;
