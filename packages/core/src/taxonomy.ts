/**
 * Taxonomia do JARVIS — fonte única de verdade para tipos de nó, relações,
 * eixo PARA e estágios de maturidade. Ver docs/TAXONOMY.md.
 */

export const NOTE_TYPES = [
  // Contexto / tempo
  "evento",
  "diario",
  // Entidades
  "pessoa",
  "empresa",
  "livro",
  "conceito",
  "ferramenta",
  "lugar",
  // Conhecimento
  "insight",
  "citacao",
  "pergunta",
  // Ação
  "ideia",
  "projeto",
  "tarefa",
  // Navegação
  "moc",
] as const;
export type NoteType = (typeof NOTE_TYPES)[number];

/** Tipos que representam entidades resolvíveis (dedupe por alias/trigram/embedding). */
export const ENTITY_TYPES = [
  "pessoa",
  "empresa",
  "livro",
  "conceito",
  "ferramenta",
  "lugar",
  "evento",
] as const satisfies readonly NoteType[];
export type EntityType = (typeof ENTITY_TYPES)[number];

export const SOURCE_KINDS = ["audio", "text", "image", "link", "pdf"] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];

export const CHANNELS = ["telegram", "whatsapp", "web", "email", "api"] as const;
export type Channel = (typeof CHANNELS)[number];

export const PARA_BUCKETS = ["projeto", "area", "recurso", "arquivo"] as const;
export type ParaBucket = (typeof PARA_BUCKETS)[number];

export const STAGES = ["semente", "broto", "perene"] as const;
export type Stage = (typeof STAGES)[number];

export const RELATIONS = [
  "relacionado",
  "menciona",
  "aprendido_em",
  "autor_de",
  "palestrante_em",
  "conheci_em",
  "apoia",
  "contradiz",
  "exemplo_de",
  "parte_de",
  "inspira",
] as const;
export type Relation = (typeof RELATIONS)[number];

export const LINK_ORIGINS = ["wikilink", "ai_entity", "ai_semantic", "manual"] as const;
export type LinkOrigin = (typeof LINK_ORIGINS)[number];

export const LINK_STATUSES = ["suggested", "accepted", "rejected"] as const;
export type LinkStatus = (typeof LINK_STATUSES)[number];

/** Áreas de responsabilidade sugeridas para o Pedro (eixo PARA = "area"). */
export const DEFAULT_AREAS = [
  "Vendas & IA",
  "Negócios/Empreendedorismo",
  "Liderança & Gestão",
  "Marketing & Conteúdo",
  "Saúde & Performance",
  "Finanças",
  "Relacionamentos",
] as const;

/** Paleta estilo Obsidian (fundo escuro) por tipo de nó. */
export const TYPE_COLORS: Record<NoteType, string> = {
  insight: "#a882ff",
  citacao: "#c4a7ff",
  pergunta: "#8b9cff",
  evento: "#ff9f43",
  diario: "#d9a066",
  livro: "#4cd27a",
  pessoa: "#4aa8ff",
  empresa: "#38c6d9",
  conceito: "#9aa5b1",
  ferramenta: "#7fd1b9",
  lugar: "#b5a17f",
  ideia: "#ffd43b",
  projeto: "#ff5c5c",
  tarefa: "#ff8a8a",
  moc: "#ffffff",
};

export const TYPE_LABELS: Record<NoteType, string> = {
  evento: "Evento",
  diario: "Diário",
  pessoa: "Pessoa",
  empresa: "Empresa",
  livro: "Livro",
  conceito: "Conceito",
  ferramenta: "Ferramenta",
  lugar: "Lugar",
  insight: "Insight",
  citacao: "Citação",
  pergunta: "Pergunta",
  ideia: "Ideia",
  projeto: "Projeto",
  tarefa: "Tarefa",
  moc: "MOC",
};

export function isNoteType(value: string): value is NoteType {
  return (NOTE_TYPES as readonly string[]).includes(value);
}

export function isRelation(value: string): value is Relation {
  return (RELATIONS as readonly string[]).includes(value);
}
