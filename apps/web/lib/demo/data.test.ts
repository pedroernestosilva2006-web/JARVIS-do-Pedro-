import { isNoteType, isRelation } from "@jarvis/core";
import { describe, expect, it } from "vitest";
import { DEMO_LINKS, DEMO_NOTES } from "./data";

describe("dados de exemplo", () => {
  const titles = new Set(DEMO_NOTES.map((n) => n.title));
  it("têm cerca de 40 notas com títulos únicos e tipos válidos", () => {
    expect(DEMO_NOTES.length).toBeGreaterThanOrEqual(38);
    expect(DEMO_NOTES.length).toBeLessThanOrEqual(45);
    expect(titles.size).toBe(DEMO_NOTES.length);
    expect(DEMO_NOTES.every((n) => isNoteType(n.type))).toBe(true);
  });
  it("incluem evento, livro, pessoas e insights", () => {
    const types = new Set(DEMO_NOTES.map((n) => n.type));
    for (const t of ["evento", "livro", "pessoa", "insight", "projeto", "tarefa", "moc"]) expect(types.has(t as never)).toBe(true);
  });
  it("todo link aponta para notas existentes, com relação válida e sem laço", () => {
    for (const l of DEMO_LINKS) {
      expect(titles.has(l.from), `origem: ${l.from}`).toBe(true);
      expect(titles.has(l.to), `destino: ${l.to}`).toBe(true);
      expect(isRelation(l.relation)).toBe(true);
      expect(l.from).not.toBe(l.to);
    }
  });
  it("não há links duplicados e há sugestões da IA para revisar", () => {
    const keys = DEMO_LINKS.map((l) => `${l.from}|${l.to}|${l.relation}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(DEMO_LINKS.filter((l) => l.suggested).length).toBeGreaterThanOrEqual(3);
  });
  it("todo wikilink do conteúdo aponta para uma nota existente", () => {
    for (const n of DEMO_NOTES) {
      for (const m of n.content.matchAll(/\[\[([^\]]+)\]\]/g)) expect(titles.has(m[1]!), `${n.title} → [[${m[1]}]]`).toBe(true);
    }
  });
  it("notas da IA nascem como semente", () => {
    expect(DEMO_NOTES.filter((n) => n.by === "ai").every((n) => n.stage === "semente")).toBe(true);
  });
});
