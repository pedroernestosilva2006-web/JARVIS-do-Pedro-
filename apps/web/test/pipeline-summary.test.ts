import { describe, expect, it } from "vitest";
import { summarizeResult } from "@/lib/ingest/pipeline";

describe("summarizeResult", () => {
  it("monta a resposta do canal com contagens e insights", () => {
    const text = summarizeResult(
      {
        sourceId: "s",
        contextTitle: "RD Summit 2026",
        created: [
          { id: "1", type: "insight", title: "Cadência de 8 toques supera 3" },
          { id: "2", type: "insight", title: "IA personaliza o primeiro toque" },
          { id: "3", type: "pessoa", title: "Fulana" },
        ],
        reused: [{ id: "4", type: "livro", title: "Receita Previsível" }],
        pendingReview: 1,
        linksCreated: 5,
      },
      "https://jarvis.app",
    );
    expect(text).toContain('Registrei em "RD Summit 2026": 2 insights, 1 pessoa.');
    expect(text).toContain("Receita Previsível");
    expect(text).toContain("1 entidade(s) parecida(s)");
    expect(text).toContain("• Cadência de 8 toques supera 3");
    expect(text).toContain("https://jarvis.app/inbox");
  });
});
