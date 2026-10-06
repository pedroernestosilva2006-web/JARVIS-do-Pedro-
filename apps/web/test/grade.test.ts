import { describe, expect, it } from "vitest";
import { excerptIsGrounded, grade } from "@/evals/grade";

describe("eval: grade", () => {
  it("evidência literal ou levemente limpa é aceita; inventada não", () => {
    const src = "É... a maioria das respostas em outbound vem depois do quarto toque, tipo.";
    expect(excerptIsGrounded("a maioria das respostas em outbound vem depois do quarto toque", src)).toBe(true);
    expect(excerptIsGrounded("A maioria das respostas vem depois do quarto toque", src)).toBe(true);
    expect(excerptIsGrounded("empresas com CRM limpo vendem 3x mais", src)).toBe(false);
  });
  it("aponta título que não é afirmação", () => {
    const checks = grade(
      { id: "x", kind: "text", session: null, text: "abc def", expect: {} },
      {
        capture_type: "reflexao",
        summary: "",
        context: { event_name: null, book_title: null, book_author: null, date: null },
        entities: [],
        insights: [{ title: "Objeções?", body_md: "", evidence_excerpt: "abc def", related_entities: [], applies_to: null }],
        quotes: [],
        ideas: [],
        action_items: [],
      },
    );
    expect(checks.find((c) => c.name === "insight0:titulo_afirmacao")?.pass).toBe(false);
    expect(checks.find((c) => c.name === "insight0:evidencia_ancorada")?.pass).toBe(true);
  });
});
