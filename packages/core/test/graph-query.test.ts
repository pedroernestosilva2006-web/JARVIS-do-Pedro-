import { describe, expect, it } from "vitest";
import { matchesQuery, neighborhood, periodCutoff } from "../src";

const n = (title: string, type: string, tags: string[] = [], stage = "semente") => ({ title, type, tags, stage });

describe("matchesQuery", () => {
  it("casa por tipo (id ou nome), tag, estágio e trecho do título — sem acento", () => {
    const aaron = n("Aaron Ross", "pessoa", ["vendas"]);
    expect(matchesQuery(aaron, "tipo:pessoa")).toBe(true);
    expect(matchesQuery(aaron, "type:Pessoa")).toBe(true);
    expect(matchesQuery(aaron, "tipo:livro")).toBe(false);
    expect(matchesQuery(aaron, "tag:vendas")).toBe(true);
    expect(matchesQuery(aaron, "#vendas")).toBe(true);
    expect(matchesQuery(aaron, "#ia")).toBe(false);
    expect(matchesQuery(aaron, "estagio:semente")).toBe(true);
    expect(matchesQuery(aaron, "ross")).toBe(true);
    expect(matchesQuery(n("Cadência de toques", "insight"), "cadencia")).toBe(true);
  });
  it("todos os termos precisam bater; consulta vazia não casa (a não ser que pedido)", () => {
    const x = n("Receita Previsível", "livro", ["vendas"]);
    expect(matchesQuery(x, "tipo:livro tag:vendas previsivel")).toBe(true);
    expect(matchesQuery(x, "tipo:livro tag:ia")).toBe(false);
    expect(matchesQuery(x, "  ")).toBe(false);
    expect(matchesQuery(x, "", { emptyMatchesAll: true })).toBe(true);
  });
});

describe("neighborhood", () => {
  const edges = [
    { source: "a", target: "b" },
    { source: "b", target: "c" },
    { source: "c", target: "d" },
    { source: "x", target: "y" },
  ];
  it("percorre a profundidade pedida nos dois sentidos", () => {
    expect([...neighborhood(edges, "a", 1)].sort()).toEqual(["a", "b"]);
    expect([...neighborhood(edges, "c", 1)].sort()).toEqual(["b", "c", "d"]);
    expect([...neighborhood(edges, "a", 3)].sort()).toEqual(["a", "b", "c", "d"]);
  });
  it("nó isolado devolve só ele mesmo", () => {
    expect([...neighborhood(edges, "z", 2)]).toEqual(["z"]);
  });
});

describe("periodCutoff", () => {
  it("converte dias em corte e 'all' em null", () => {
    expect(periodCutoff("all")).toBeNull();
    expect(periodCutoff("7", 8 * 86_400_000)).toBe(86_400_000);
  });
});
