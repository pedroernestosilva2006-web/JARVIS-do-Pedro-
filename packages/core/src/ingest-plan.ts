import type { ExtractedKnowledge } from "./extraction";
import { normalizeName } from "./slug";
import type { EntityType, NoteType, ParaBucket, Relation } from "./taxonomy";

/**
 * Transforma a saída da extração num plano de notas + links, sem tocar no banco.
 * O pipeline depois resolve entidades (reuse/ask/create), persiste e cria os links.
 */

export interface PlannedNote {
  key: string;
  type: NoteType;
  title: string;
  content_md: string;
  summary: string | null;
  properties: Record<string, unknown>;
  para_bucket: ParaBucket;
  /** Trecho literal da fonte que embasa a nota (proveniência). */
  excerpt: string | null;
  /** Entidades passam por entity resolution antes de serem criadas. */
  resolve: boolean;
}

export interface PlannedLink {
  from: string;
  to: string;
  relation: Relation;
  confidence: number;
}

export interface IngestPlan {
  /** Chave da nota de contexto (evento/livro) — "ctx" quando veio da sessão. */
  contextKey: string | null;
  notes: PlannedNote[];
  links: PlannedLink[];
}

export const SESSION_CONTEXT_KEY = "ctx";

/** Confiança atribuída a links estruturais vindos da extração. */
const STRUCTURAL = 0.9;

export function entityKey(type: string, name: string): string {
  return `entity:${type}:${normalizeName(name)}`;
}

function firstSentence(text: string, max = 240): string | null {
  const clean = text.replace(/[#>*_`]/g, "").replace(/\s+/g, " ").trim();
  if (!clean) return null;
  const m = clean.match(/^.+?[.!?](\s|$)/);
  const s = (m?.[0] ?? clean).trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

export function buildIngestPlan(
  extracted: ExtractedKnowledge,
  sessionContext: { type: NoteType; title: string } | null,
): IngestPlan {
  const notes = new Map<string, PlannedNote>();
  const links: PlannedLink[] = [];
  const link = (from: string, to: string | null, relation: Relation, confidence = STRUCTURAL) => {
    if (!to || from === to) return;
    if (links.some((l) => l.from === from && l.to === to && l.relation === relation)) return;
    links.push({ from, to, relation, confidence });
  };

  const addEntity = (type: EntityType, name: string, properties: Record<string, unknown> = {}) => {
    const key = entityKey(type, name);
    if (!notes.has(key)) {
      notes.set(key, {
        key,
        type,
        title: name.trim(),
        content_md: "",
        summary: null,
        properties,
        para_bucket: "recurso",
        excerpt: null,
        resolve: true,
      });
    }
    return key;
  };

  // --- Contexto: sessão ativa > evento/livro detectado na captura -----------------
  let contextKey: string | null = null;
  let contextType: NoteType | null = null;
  let contextTitle: string | null = null;
  if (sessionContext) {
    contextKey = SESSION_CONTEXT_KEY;
    contextType = sessionContext.type;
    contextTitle = sessionContext.title;
  } else if (extracted.context.event_name) {
    contextKey = addEntity("evento", extracted.context.event_name, extracted.context.date ? { data: extracted.context.date } : {});
    contextType = "evento";
    contextTitle = extracted.context.event_name;
  } else if (extracted.context.book_title) {
    const props = extracted.context.book_author ? { autor: extracted.context.book_author } : {};
    contextKey = addEntity("livro", extracted.context.book_title, props);
    contextType = "livro";
    contextTitle = extracted.context.book_title;
  }

  // Autor do livro de contexto
  if (contextType === "livro" && extracted.context.book_author) {
    link(addEntity("pessoa", extracted.context.book_author), contextKey, "autor_de");
  }

  // --- Entidades -------------------------------------------------------------------
  const byName = new Map<string, string>();
  for (const e of extracted.entities) {
    // A entidade que É o contexto não vira nota duplicada
    if (contextTitle && e.type === contextType && normalizeName(e.name) === normalizeName(contextTitle)) {
      byName.set(normalizeName(e.name), contextKey!);
      continue;
    }
    const key = addEntity(e.type, e.name);
    byName.set(normalizeName(e.name), key);
    const role = (e.role ?? "").toLowerCase();
    if (e.type === "pessoa" && contextType === "evento" && /palestr|speaker|keynote|painel/.test(role)) {
      link(key, contextKey, "palestrante_em");
    } else if (e.type === "pessoa" && contextType === "livro" && /autor|author|escrit/.test(role)) {
      link(key, contextKey, "autor_de");
    } else if (e.type === "pessoa" && contextType === "evento") {
      link(key, contextKey, "conheci_em", 0.75);
    }
  }
  const resolveName = (name: string) => byName.get(normalizeName(name)) ?? null;

  // --- Insights (notas atômicas) ------------------------------------------------------
  extracted.insights.forEach((ins, i) => {
    const key = `insight:${i}`;
    const content = ins.applies_to ? `${ins.body_md.trim()}\n\n**Como aplicar:** ${ins.applies_to.trim()}` : ins.body_md.trim();
    notes.set(key, {
      key,
      type: "insight",
      title: ins.title.trim(),
      content_md: content,
      summary: firstSentence(ins.body_md),
      properties: {},
      para_bucket: "recurso",
      excerpt: ins.evidence_excerpt,
      resolve: false,
    });
    link(key, contextKey, "aprendido_em");
    for (const name of ins.related_entities) link(key, resolveName(name), "menciona");
  });

  // --- Citações ----------------------------------------------------------------------
  extracted.quotes.forEach((q, i) => {
    const key = `quote:${i}`;
    const text = q.text.trim().replace(/^["“]|["”]$/g, "");
    notes.set(key, {
      key,
      type: "citacao",
      title: `“${text.length > 110 ? `${text.slice(0, 109)}…` : text}”`,
      content_md: `> ${text}${q.author ? `\n\n— ${q.author}` : ""}`,
      summary: null,
      properties: q.author ? { autor: q.author } : {},
      para_bucket: "recurso",
      excerpt: text,
      resolve: false,
    });
    link(key, contextKey, "aprendido_em");
    if (q.author) link(key, resolveName(q.author) ?? addEntity("pessoa", q.author), "menciona");
  });

  // --- Ideias e tarefas -------------------------------------------------------------
  extracted.ideas.forEach((idea, i) => {
    const key = `idea:${i}`;
    notes.set(key, {
      key,
      type: "ideia",
      title: idea.title.trim(),
      content_md: idea.body_md.trim(),
      summary: firstSentence(idea.body_md),
      properties: {},
      para_bucket: "projeto",
      excerpt: null,
      resolve: false,
    });
    link(key, contextKey, "aprendido_em");
  });
  extracted.action_items.forEach((task, i) => {
    const key = `task:${i}`;
    notes.set(key, {
      key,
      type: "tarefa",
      title: task.trim(),
      content_md: "",
      summary: null,
      properties: { feito: false },
      para_bucket: "projeto",
      excerpt: null,
      resolve: false,
    });
    link(key, contextKey, "relacionado");
  });

  return { contextKey, notes: [...notes.values()], links };
}
