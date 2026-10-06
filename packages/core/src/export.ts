import type { Relation } from "./taxonomy";

/**
 * Exportação para Markdown compatível com Obsidian (backup e "saída" local-first).
 * Um arquivo por nota em <Tipo>/<Título>.md, frontmatter YAML e conexões como campos
 * inline `relação:: [[Título]]` (legíveis pelo Dataview).
 */

export interface ExportNote {
  id: string;
  type: string;
  title: string;
  content_md: string;
  summary: string | null;
  properties: Record<string, unknown>;
  para_bucket: string;
  stage: string;
  aliases: string[];
  created_at: string;
  updated_at: string;
}

export interface ExportLink {
  to_title: string;
  relation: Relation | string;
  status: string;
  rationale: string | null;
}

const FOLDERS: Record<string, string> = {
  evento: "Eventos",
  diario: "Diário",
  pessoa: "Pessoas",
  empresa: "Empresas",
  livro: "Livros",
  conceito: "Conceitos",
  ferramenta: "Ferramentas",
  lugar: "Lugares",
  insight: "Insights",
  citacao: "Citações",
  pergunta: "Perguntas",
  ideia: "Ideias",
  projeto: "Projetos",
  tarefa: "Tarefas",
  moc: "MOCs",
};

/** Nome de arquivo seguro em Windows/macOS/Linux e que o Obsidian resolve pelo título. */
export function exportFileName(title: string): string {
  const safe = title
    .replace(/[\\/:*?"<>|#^[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+/, "")
    .slice(0, 120)
    .trim();
  return safe || "Sem título";
}

export function exportFolder(type: string): string {
  return FOLDERS[type] ?? "Outros";
}

function yamlString(v: string): string {
  return /^[\w À-ÿ.,()-]+$/.test(v) && !/^(true|false|null|yes|no|\d)/i.test(v) ? v : JSON.stringify(v);
}

function yamlValue(v: unknown): string {
  if (v === null || v === undefined) return "null";
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (typeof v === "string") return yamlString(v);
  return JSON.stringify(v); // JSON é YAML válido para objetos/listas
}

/**
 * Converte uma nota em Markdown. `fileTitle` é o nome real do arquivo (pode ter sufixo de desambiguação);
 * nesse caso o título original vira alias, para os [[wikilinks]] continuarem resolvendo.
 */
export function noteToMarkdown(note: ExportNote, links: ExportLink[], fileTitle = exportFileName(note.title)): string {
  const aliases = [...note.aliases];
  if (fileTitle !== note.title && !aliases.includes(note.title)) aliases.unshift(note.title);
  const fm: [string, unknown][] = [
    ["jarvis_id", note.id],
    ["tipo", note.type],
    ["estagio", note.stage],
    ["para", note.para_bucket],
    ["criado", note.created_at],
    ["atualizado", note.updated_at],
  ];
  if (aliases.length) fm.push(["aliases", aliases]);
  if (note.summary) fm.push(["resumo", note.summary]);
  for (const [k, v] of Object.entries(note.properties ?? {})) fm.push([k, v]);
  fm.push(["tags", [`jarvis/${note.type}`]]);

  const lines = ["---", ...fm.map(([k, v]) => `${k}: ${yamlValue(v)}`), "---", ""];
  if (note.content_md.trim()) lines.push(note.content_md.trim(), "");
  const accepted = links.filter((l) => l.status === "accepted");
  const suggested = links.filter((l) => l.status === "suggested");
  if (accepted.length) {
    lines.push("## Conexões", "");
    for (const l of accepted) {
      lines.push(`- ${l.relation}:: [[${exportFileName(l.to_title)}]]${l.rationale ? ` — ${l.rationale}` : ""}`);
    }
    lines.push("");
  }
  if (suggested.length) {
    lines.push("## Sugestões da IA (não revisadas)", "");
    for (const l of suggested) lines.push(`- ${l.relation}? [[${exportFileName(l.to_title)}]]${l.rationale ? ` — ${l.rationale}` : ""}`);
    lines.push("");
  }
  return lines.join("\n");
}

/** Caminhos únicos (dois "Ideia X" viram "Ideia X" e "Ideia X (2)"). */
export function uniqueExportPaths(notes: { id: string; type: string; title: string }[]): Map<string, { path: string; fileTitle: string }> {
  const used = new Set<string>();
  const out = new Map<string, { path: string; fileTitle: string }>();
  for (const n of notes) {
    const base = exportFileName(n.title);
    let fileTitle = base;
    for (let i = 2; used.has(fileTitle.toLowerCase()); i++) fileTitle = `${base} (${i})`;
    used.add(fileTitle.toLowerCase());
    out.set(n.id, { path: `${exportFolder(n.type)}/${fileTitle}.md`, fileTitle });
  }
  return out;
}
