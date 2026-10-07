import { describe, expect, it } from "vitest";
import { z } from "zod";
import { extractJsonObject, jsonInstruction, parseStructured } from "./json-output";

describe("extractJsonObject", () => {
  it("aceita JSON puro, com cerca de markdown e com texto em volta", () => {
    expect(extractJsonObject('{"a":1}')).toEqual({ a: 1 });
    expect(extractJsonObject('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extractJsonObject('Claro! Aqui está: {"a":{"b":[1,2]}} Espero que ajude.')).toEqual({ a: { b: [1, 2] } });
  });
  it("não se confunde com chaves dentro de strings", () => {
    expect(extractJsonObject('{"t":"usa } e { e \\" aspas"}')).toEqual({ t: 'usa } e { e " aspas' });
  });
  it("falha com mensagem clara se faltar JSON ou estiver cortado", () => {
    expect(() => extractJsonObject("sem json")).toThrow(/não contém/);
    expect(() => extractJsonObject('{"a":')).toThrow(/incompleto/);
  });
});

describe("parseStructured", () => {
  const schema = z.object({ titulo: z.string(), n: z.number() });
  it("valida contra o schema", () => {
    expect(parseStructured('{"titulo":"x","n":2}', schema)).toEqual({ titulo: "x", n: 2 });
  });
  it("aponta o campo inválido", () => {
    expect(() => parseStructured('{"titulo":"x","n":"dois"}', schema)).toThrow(/n:/);
  });
  it("gera instrução com o JSON Schema", () => {
    const ins = jsonInstruction(schema);
    expect(ins).toContain('"titulo"');
    expect(ins).not.toContain("$schema");
  });
});
