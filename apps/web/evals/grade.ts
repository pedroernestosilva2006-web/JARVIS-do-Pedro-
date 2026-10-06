import { normalizeName, type ExtractedKnowledge } from "@jarvis/core";

export interface GoldenCase {
  id: string;
  kind: string;
  session: { type: "evento" | "livro"; title: string } | null;
  text: string;
  expect: {
    capture_type?: string[];
    min_insights?: number;
    max_insights?: number;
    entities?: string[];
    action_items_min?: number;
    min_ideas?: number;
    min_quotes?: number;
  };
}

export interface Check {
  name: string;
  pass: boolean;
  detail?: string;
}

/** Trecho de evidência precisa existir na captura (com tolerância a pontuação/acentos/caixa). */
export function excerptIsGrounded(excerpt: string, source: string): boolean {
  const e = normalizeName(excerpt);
  const s = normalizeName(source);
  if (!e) return false;
  if (s.includes(e)) return true;
  // Tolerância: ≥ 80% das palavras do trecho aparecem na fonte (limpeza de vícios de fala)
  const words = e.split(" ").filter((w) => w.length > 2);
  if (!words.length) return false;
  const hits = words.filter((w) => s.includes(w)).length;
  return hits / words.length >= 0.8;
}

/** Avaliação determinística de uma extração contra o caso dourado. */
export function grade(c: GoldenCase, out: ExtractedKnowledge): Check[] {
  const checks: Check[] = [];
  const e = c.expect;
  if (e.capture_type) {
    checks.push({ name: "capture_type", pass: e.capture_type.includes(out.capture_type), detail: out.capture_type });
  }
  const n = out.insights.length;
  if (e.min_insights !== undefined || e.max_insights !== undefined) {
    const ok = n >= (e.min_insights ?? 0) && n <= (e.max_insights ?? Infinity);
    checks.push({ name: "qtd_insights", pass: ok, detail: `${n} (esperado ${e.min_insights ?? 0}–${e.max_insights ?? "∞"})` });
  }
  for (const name of e.entities ?? []) {
    const target = normalizeName(name);
    const found = out.entities.some((x) => normalizeName(x.name).includes(target) || target.includes(normalizeName(x.name)));
    checks.push({ name: `entidade:${name}`, pass: found, detail: out.entities.map((x) => x.name).join(", ") });
  }
  if (e.action_items_min) {
    checks.push({ name: "tarefas", pass: out.action_items.length >= e.action_items_min, detail: String(out.action_items.length) });
  }
  if (e.min_ideas) checks.push({ name: "ideias", pass: out.ideas.length >= e.min_ideas, detail: String(out.ideas.length) });
  if (e.min_quotes) checks.push({ name: "citacoes", pass: out.quotes.length >= e.min_quotes, detail: String(out.quotes.length) });

  // Regras de atomização válidas para todo caso
  for (const [i, ins] of out.insights.entries()) {
    checks.push({
      name: `insight${i}:evidencia_ancorada`,
      pass: excerptIsGrounded(ins.evidence_excerpt, c.text),
      detail: ins.evidence_excerpt.slice(0, 80),
    });
    checks.push({
      name: `insight${i}:titulo_afirmacao`,
      pass: ins.title.trim().split(/\s+/).length >= 4 && !ins.title.trim().endsWith("?"),
      detail: ins.title,
    });
  }
  return checks;
}
