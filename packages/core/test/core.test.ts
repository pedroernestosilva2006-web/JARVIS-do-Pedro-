import { describe, expect, it } from "vitest";
import {
  aiLinkStatus,
  extractUrl,
  normalizeName,
  nodeSize,
  parseCommand,
  parseWikilinks,
  replaceWikilinks,
  resolveEntity,
  semanticLinkStatus,
  slugify,
  trigramSimilarity,
  uniqueWikilinkTargets,
  ExtractedKnowledge,
} from "../src";

describe("slugify / normalizeName", () => {
  it("remove acentos e pontuação", () => {
    expect(slugify("Receita Previsível — 2ª edição!")).toBe("receita-previsivel-2a-edicao");
    expect(slugify("???")).toBe("nota");
  });
  it("normaliza nomes ignorando parênteses", () => {
    expect(normalizeName("Aaron Ross (autor)")).toBe("aaron ross");
    expect(normalizeName("  JOÃO   da Silva ")).toBe("joao da silva");
  });
});

describe("wikilinks", () => {
  const md = "Ver [[Receita Previsível]] e [[SPIN Selling|SPIN]] e [[Aaron Ross#Bio]]. De novo [[receita previsível]].";
  it("extrai alvo, alias e seção", () => {
    const links = parseWikilinks(md);
    expect(links.map((l) => l.target)).toEqual([
      "Receita Previsível",
      "SPIN Selling",
      "Aaron Ross",
      "receita previsível",
    ]);
    expect(links[1]!.alias).toBe("SPIN");
    expect(links[2]!.heading).toBe("Bio");
  });
  it("deduplica sem diferenciar maiúsculas", () => {
    expect(uniqueWikilinkTargets(md)).toEqual(["Receita Previsível", "SPIN Selling", "Aaron Ross"]);
  });
  it("substitui por renderização customizada", () => {
    expect(replaceWikilinks("a [[B|c]] d", (l) => `<${l.target}:${l.alias}>`)).toBe("a <B:c> d");
  });
  it("ignora colchetes vazios", () => {
    expect(parseWikilinks("[[ ]] [[]]")).toEqual([]);
  });
});

describe("entity resolution", () => {
  const candidates = [
    { id: "1", title: "Aaron Ross", type: "pessoa", aliases: ["A. Ross"] },
    { id: "2", title: "Receita Previsível", type: "livro", aliases: [] },
    { id: "3", title: "Aaron Rosa", type: "empresa", aliases: [] },
  ];
  it("reutiliza match exato por alias normalizado", () => {
    expect(resolveEntity({ name: "Aaron Ross (autor)", type: "pessoa" }, candidates)).toMatchObject({
      action: "reuse",
      candidateId: "1",
    });
  });
  it("respeita o tipo", () => {
    expect(resolveEntity({ name: "Receita Previsível", type: "pessoa" }, candidates).action).not.toBe("reuse");
  });
  it("pergunta quando a similaridade é média (via embedding)", () => {
    const d = resolveEntity({ name: "Ross", type: "pessoa" }, [
      { ...candidates[0]!, embeddingSimilarity: 0.8 },
    ]);
    expect(d).toMatchObject({ action: "ask", candidateId: "1" });
  });
  it("cria quando não há candidato parecido", () => {
    expect(resolveEntity({ name: "Neil Rackham", type: "pessoa" }, candidates).action).toBe("create");
  });
  it("trigram é simétrico e 1 para iguais", () => {
    expect(trigramSimilarity("Receita", "receita")).toBe(1);
    expect(trigramSimilarity("abc", "xyz")).toBe(0);
  });
});

describe("linking", () => {
  it("aplica limiares semânticos", () => {
    expect(semanticLinkStatus(0.85)).toBe("accepted");
    expect(semanticLinkStatus(0.75)).toBe("suggested");
    expect(semanticLinkStatus(0.5)).toBeNull();
  });
  it("links da IA abaixo de 0.8 nascem sugeridos", () => {
    expect(aiLinkStatus(0.79)).toBe("suggested");
    expect(aiLinkStatus(0.8)).toBe("accepted");
  });
});

describe("comandos e captura", () => {
  it("interpreta comandos do bot", () => {
    expect(parseCommand("/evento RD Summit 2026")).toEqual({ command: "evento", arg: "RD Summit 2026" });
    expect(parseCommand("/livro@JarvisBot Receita Previsível")).toEqual({ command: "livro", arg: "Receita Previsível" });
    expect(parseCommand("/p o que aprendi sobre outbound?")).toEqual({ command: "pergunta", arg: "o que aprendi sobre outbound?" });
    expect(parseCommand("/fim")).toEqual({ command: "fim", arg: "" });
    expect(parseCommand("/desconhecido x")).toBeNull();
    expect(parseCommand("texto normal")).toBeNull();
  });
  it("extrai URL", () => {
    expect(extractUrl("olha isso https://exemplo.com/a?b=1 legal")).toBe("https://exemplo.com/a?b=1");
  });
});

describe("grafo", () => {
  it("tamanho cresce com raiz do grau e MOC é maior", () => {
    expect(nodeSize(0)).toBe(3);
    expect(nodeSize(4)).toBe(8);
    expect(nodeSize(4, "moc")).toBe(11);
  });
});

describe("schema de extração", () => {
  it("valida um payload mínimo", () => {
    const parsed = ExtractedKnowledge.parse({
      capture_type: "evento",
      summary: "Palestra sobre outbound",
      context: { event_name: "RD Summit 2026", book_title: null, book_author: null, date: null },
      entities: [{ name: "Aaron Ross", type: "pessoa", role: "palestrante" }],
      insights: [
        {
          title: "Cadência de 8 toques supera 3 toques em outbound B2B",
          body_md: "...",
          evidence_excerpt: "oito toques",
          related_entities: ["Aaron Ross"],
          applies_to: null,
        },
      ],
      quotes: [],
      ideas: [],
      action_items: [],
    });
    expect(parsed.insights).toHaveLength(1);
  });
});
