import { describe, expect, it } from "vitest";
import { buildIngestPlan, entityKey, type ExtractedKnowledge } from "../src";

const base: ExtractedKnowledge = {
  capture_type: "evento",
  summary: "Palestra de outbound",
  context: { event_name: "RD Summit 2026", book_title: null, book_author: null, date: "2026-09-24" },
  entities: [
    { name: "Aaron Ross", type: "pessoa", role: "palestrante" },
    { name: "RD Summit 2026", type: "evento", role: null },
    { name: "Receita Previsível", type: "livro", role: null },
  ],
  insights: [
    {
      title: "Cadência de 8 toques supera 3 toques em outbound B2B",
      body_md: "A maioria das respostas vem depois do 4º toque. Isso muda o planejamento.",
      evidence_excerpt: "a maioria responde depois do quarto toque",
      related_entities: ["Aaron Ross", "Receita Previsível", "Entidade inexistente"],
      applies_to: "Ajustar a cadência do SDR de IA para 8 toques.",
    },
  ],
  quotes: [{ text: "Previsibilidade vem de especialização", author: "Aaron Ross" }],
  ideas: [{ title: "Webinar sobre cadência com IA", body_md: "Mostrar dados." }],
  action_items: ["Revisar cadência atual"],
};

describe("buildIngestPlan", () => {
  it("cria contexto a partir do evento e não duplica a entidade do evento", () => {
    const plan = buildIngestPlan(base, null);
    const evento = entityKey("evento", "RD Summit 2026");
    expect(plan.contextKey).toBe(evento);
    expect(plan.notes.filter((n) => n.type === "evento")).toHaveLength(1);
    expect(plan.notes.find((n) => n.key === evento)?.properties).toEqual({ data: "2026-09-24" });
  });

  it("gera links estruturais tipados", () => {
    const plan = buildIngestPlan(base, null);
    const evento = entityKey("evento", "RD Summit 2026");
    const aaron = entityKey("pessoa", "Aaron Ross");
    const rels = plan.links.map((l) => `${l.from}|${l.relation}|${l.to}`);
    expect(rels).toContain(`${aaron}|palestrante_em|${evento}`);
    expect(rels).toContain(`insight:0|aprendido_em|${evento}`);
    expect(rels).toContain(`insight:0|menciona|${aaron}`);
    expect(rels).toContain(`insight:0|menciona|${entityKey("livro", "Receita Previsível")}`);
    expect(rels).toContain(`quote:0|menciona|${aaron}`);
    expect(rels).toContain(`idea:0|aprendido_em|${evento}`);
    // entidade citada mas não extraída é ignorada (nunca inventar)
    expect(rels.some((r) => r.includes("inexistente"))).toBe(false);
  });

  it("insight leva 'Como aplicar', resumo e proveniência", () => {
    const ins = buildIngestPlan(base, null).notes.find((n) => n.key === "insight:0")!;
    expect(ins.content_md).toContain("**Como aplicar:** Ajustar a cadência");
    expect(ins.summary).toBe("A maioria das respostas vem depois do 4º toque.");
    expect(ins.excerpt).toBe("a maioria responde depois do quarto toque");
    expect(ins.resolve).toBe(false);
  });

  it("contexto de sessão tem prioridade sobre o detectado", () => {
    const plan = buildIngestPlan(base, { type: "evento", title: "Outro Evento" });
    expect(plan.contextKey).toBe("ctx");
    // RD Summit vira entidade comum, Aaron vira 'palestrante_em' do contexto da sessão
    expect(plan.links).toContainEqual(
      expect.objectContaining({ from: entityKey("pessoa", "Aaron Ross"), to: "ctx", relation: "palestrante_em" }),
    );
  });

  it("contexto de livro liga o autor", () => {
    const plan = buildIngestPlan(
      {
        ...base,
        context: { event_name: null, book_title: "SPIN Selling", book_author: "Neil Rackham", date: null },
        entities: [],
      },
      null,
    );
    expect(plan.links).toContainEqual(
      expect.objectContaining({
        from: entityKey("pessoa", "Neil Rackham"),
        to: entityKey("livro", "SPIN Selling"),
        relation: "autor_de",
      }),
    );
  });

  it("captura sem contexto não cria links de contexto", () => {
    const plan = buildIngestPlan(
      { ...base, context: { event_name: null, book_title: null, book_author: null, date: null }, entities: [] },
      null,
    );
    expect(plan.contextKey).toBeNull();
    expect(plan.links.filter((l) => l.relation === "aprendido_em")).toHaveLength(0);
  });
});
