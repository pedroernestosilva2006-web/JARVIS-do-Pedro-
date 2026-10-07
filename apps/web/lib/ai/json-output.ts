import { z } from "zod";

/** Extrai o primeiro objeto JSON de um texto (aceita cercas ```json e texto antes/depois). */
export function extractJsonObject(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = (fenced?.[1] ?? text).trim();
  const start = body.indexOf("{");
  if (start === -1) throw new Error("A resposta não contém um objeto JSON.");
  // Procura o fechamento balanceado, respeitando strings e escapes
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < body.length; i++) {
    const ch = body[i]!;
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}" && --depth === 0) return JSON.parse(body.slice(start, i + 1));
  }
  throw new Error("JSON incompleto na resposta (possível corte por max_tokens).");
}

/** Valida a saída do modelo contra o schema Zod, com mensagem de erro útil para uma nova tentativa. */
export function parseStructured<T extends z.ZodType>(text: string, schema: T): z.infer<T> {
  const parsed = schema.safeParse(extractJsonObject(text));
  if (!parsed.success) {
    throw new Error(`JSON fora do schema: ${parsed.error.issues.slice(0, 5).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
  }
  return parsed.data;
}

/** Instrução para provedores sem structured outputs nativo. */
export function jsonInstruction(schema: z.ZodType): string {
  const js = z.toJSONSchema(schema, { target: "draft-7" }) as Record<string, unknown>;
  delete js.$schema;
  return `\n\nResponda SOMENTE com um objeto JSON válido (sem texto antes ou depois, sem markdown) que siga exatamente este JSON Schema:\n${JSON.stringify(js)}`;
}
