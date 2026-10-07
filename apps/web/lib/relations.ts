/** Nome legível de uma relação do grafo ("aprendido_em" → "Aprendido em"). */
export function relationLabel(relation: string): string {
  const s = relation.replaceAll("_", " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}
