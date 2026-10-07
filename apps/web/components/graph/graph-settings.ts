import type { NoteType } from "@jarvis/core";

export interface Group {
  id: string;
  query: string;
  color: string;
}

/** Configurações do grafo (painel flutuante estilo Obsidian). Guardadas no navegador. */
export interface GraphSettings {
  // Filtros
  search: string;
  hiddenTypes: NoteType[];
  tags: string[];
  showOrphans: boolean;
  showSuggested: boolean;
  period: "all" | "7" | "30" | "90" | "365";
  // Grupos
  groups: Group[];
  // Exibição
  arrows: boolean;
  labelFade: number; // 0..1 — quanto maior, menos rótulos aparecem
  nodeSize: number; // multiplicador
  linkWidth: number; // multiplicador
  // Forças (0..1, como no Obsidian)
  center: number;
  repel: number;
  linkForce: number;
  linkDistance: number;
}

export const DEFAULT_SETTINGS: GraphSettings = {
  search: "",
  hiddenTypes: [],
  tags: [],
  showOrphans: true,
  showSuggested: true,
  period: "all",
  groups: [],
  arrows: false,
  labelFade: 0.35,
  nodeSize: 1,
  linkWidth: 1,
  center: 0.3,
  repel: 0.5,
  linkForce: 0.5,
  linkDistance: 0.3,
};

export const GROUP_COLORS = ["#ff9f43", "#4cd27a", "#4aa8ff", "#ffd43b", "#38c6d9", "#f472b6", "#fb7185", "#9aa5b1"];

const KEY = "jarvis:graph:v2";

export function loadSettings(): GraphSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(s: GraphSettings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // modo privado / armazenamento bloqueado: a configuração só vale nesta sessão
  }
}

/** Traduz os controles 0..1 em parâmetros do d3-force. */
export function forceParams(s: Pick<GraphSettings, "center" | "repel" | "linkForce" | "linkDistance">) {
  return {
    centerStrength: s.center * 0.12,
    chargeStrength: -(10 + s.repel * 150),
    linkStrength: 0.05 + s.linkForce * 0.85,
    linkDistance: 12 + s.linkDistance * 110,
  };
}
