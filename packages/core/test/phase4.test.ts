import { describe, expect, it } from "vitest";
import {
  chunkText,
  exportFileName,
  extractionSegments,
  noteToMarkdown,
  parseCommand,
  uniqueExportPaths,
} from "../src";

describe("chunkText", () => {
  const para = (n: number) => `Parágrafo ${n}. ` + "palavra ".repeat(60).trim() + ".";
  const text = Array.from({ length: 30 }, (_, i) => para(i)).join("\n\n");

  it("texto curto vira um único chunk", () => {
    expect(chunkText("curto")).toEqual(["curto"]);
    expect(chunkText("   ")).toEqual([]);
  });
  it("respeita o tamanho, corta em parágrafo e cobre o texto todo", () => {
    const chunks = chunkText(text, 1000, 100);
    expect(chunks.length).toBeGreaterThan(5);
    expect(chunks.every((c) => c.length <= 1000)).toBe(true);
    expect(chunks.every((c) => c.startsWith("Parágrafo") || /^\S/.test(c))).toBe(true);
    expect(chunks.at(-1)).toContain("Parágrafo 29");
    expect(chunks[0]).toContain("Parágrafo 0");
  });
  it("nunca corta no meio de palavra", () => {
    const words = "abcdefghij ".repeat(500);
    for (const c of chunkText(words, 333, 40)) expect(c.split(" ").every((w) => w === "abcdefghij")).toBe(true);
  });
  it("segmentos de extração não se sobrepõem", () => {
    const segs = extractionSegments(text, 3000);
    expect(segs.join("\n\n").length).toBeLessThanOrEqual(text.length);
    expect(segs.join(" ")).toContain("Parágrafo 15");
  });
});

describe("exportação Markdown (Obsidian)", () => {
  const note = {
    id: "n1",
    type: "insight",
    title: "Objeção de preço esconde objeção de valor",
    content_md: "Quando falam de preço, faltou implicação.",
    summary: "Preço é sintoma.",
    properties: { fonte: "SPIN: Selling" },
    para_bucket: "area",
    stage: "broto",
    aliases: [],
    created_at: "2026-09-24T10:00:00Z",
    updated_at: "2026-09-25T10:00:00Z",
  };

  it("nomes de arquivo seguros", () => {
    expect(exportFileName('A/B: "c"? #tag [x]')).toBe("A B c tag x");
    expect(exportFileName("...")).toBe("Sem título");
  });
  it("gera frontmatter, corpo e conexões com campos inline", () => {
    const md = noteToMarkdown(note, [
      { to_title: "SPIN Selling", relation: "aprendido_em", status: "accepted", rationale: null },
      { to_title: "Perguntas: implicação", relation: "apoia", status: "suggested", rationale: "reforça" },
    ]);
    expect(md.startsWith("---\njarvis_id: n1\ntipo: insight\n")).toBe(true);
    expect(md).toContain('fonte: "SPIN: Selling"');
    expect(md).toContain('tags: ["jarvis/insight"]');
    expect(md).toContain("- aprendido_em:: [[SPIN Selling]]");
    expect(md).toContain("## Sugestões da IA (não revisadas)");
    expect(md).toContain("- apoia? [[Perguntas implicação]] — reforça");
  });
  it("título com sufixo vira alias para os links continuarem resolvendo", () => {
    const md = noteToMarkdown(note, [], "Objeção de preço esconde objeção de valor (2)");
    expect(md).toContain('aliases: ["Objeção de preço esconde objeção de valor"]');
  });
  it("caminhos únicos por pasta de tipo", () => {
    const paths = uniqueExportPaths([
      { id: "a", type: "ideia", title: "Webinar" },
      { id: "b", type: "ideia", title: "webinar" },
      { id: "c", type: "pessoa", title: "Aaron Ross" },
    ]);
    expect(paths.get("a")!.path).toBe("Ideias/Webinar.md");
    expect(paths.get("b")!.path).toBe("Ideias/webinar (2).md");
    expect(paths.get("c")!.path).toBe("Pessoas/Aaron Ross.md");
  });
});

describe("comando /brief", () => {
  it("dia por padrão, semana com argumento", () => {
    expect(parseCommand("/brief")).toEqual({ command: "brief", arg: "dia" });
    expect(parseCommand("/resumo semana")).toEqual({ command: "brief", arg: "semana" });
  });
});
