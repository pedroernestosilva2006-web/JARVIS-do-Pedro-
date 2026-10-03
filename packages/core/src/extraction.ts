import { z } from "zod";
import { ENTITY_TYPES } from "./taxonomy";

/**
 * Contrato da extração estruturada (etapa 3 do pipeline).
 * O LLM preenche este schema via structured outputs; o pipeline transforma em notas + links.
 * Todos os campos são obrigatórios (strings ausentes = null, listas ausentes = []),
 * o que mantém o schema compatível com structured outputs estritos.
 */

export const CAPTURE_TYPES = [
  "evento",
  "livro",
  "conversa",
  "ideia",
  "reflexao",
  "conteudo_web",
] as const;

export const ExtractedEntity = z.object({
  name: z.string().describe("Nome canônico da entidade, ex.: 'Aaron Ross'"),
  type: z.enum(ENTITY_TYPES),
  role: z
    .string()
    .nullable()
    .describe("Papel na captura, ex.: palestrante, autor, cliente"),
});
export type ExtractedEntity = z.infer<typeof ExtractedEntity>;

export const ExtractedInsight = z.object({
  title: z
    .string()
    .describe("Título-afirmação em PT-BR, uma única ideia. Ex.: 'Objeção de preço esconde objeção de valor'"),
  body_md: z.string().describe("Corpo em markdown, nas palavras do Pedro quando possível"),
  evidence_excerpt: z
    .string()
    .describe("Trecho LITERAL da fonte que embasa o insight. Nunca invente."),
  related_entities: z
    .array(z.string())
    .describe("Nomes de entidades (da lista entities) relacionadas a este insight"),
  applies_to: z
    .string()
    .nullable()
    .describe("Como aplicar em vendas/IA/negócio do Pedro (o 'Express')"),
});
export type ExtractedInsight = z.infer<typeof ExtractedInsight>;

export const ExtractedKnowledge = z.object({
  capture_type: z.enum(CAPTURE_TYPES),
  summary: z.string().describe("Resumo da captura em 1-2 frases"),
  context: z.object({
    event_name: z.string().nullable(),
    book_title: z.string().nullable(),
    book_author: z.string().nullable(),
    date: z.string().nullable().describe("Data ISO (YYYY-MM-DD) se mencionada"),
  }),
  entities: z.array(ExtractedEntity),
  insights: z.array(ExtractedInsight),
  quotes: z.array(z.object({ text: z.string(), author: z.string().nullable() })),
  ideas: z
    .array(z.object({ title: z.string(), body_md: z.string() }))
    .describe("Ideias de negócio/produto/conteúdo que o Pedro teve"),
  action_items: z.array(z.string()),
});
export type ExtractedKnowledge = z.infer<typeof ExtractedKnowledge>;

/** Resultado da decisão de relação tipada entre duas notas (camada 3 de linking). */
export const LinkJudgement = z.object({
  relation: z.enum(["relacionado", "apoia", "contradiz", "exemplo_de", "inspira", "nenhuma"]),
  confidence: z.number().describe("0 a 1"),
  rationale: z.string().describe("Uma linha em PT-BR explicando a conexão"),
});
export type LinkJudgement = z.infer<typeof LinkJudgement>;
