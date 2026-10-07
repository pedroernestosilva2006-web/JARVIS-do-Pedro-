"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Graph from "graphology";
import louvain from "graphology-communities-louvain";
import FA2Layout from "graphology-layout-forceatlas2/worker";
import forceAtlas2 from "graphology-layout-forceatlas2";
import type Sigma from "sigma";
import { NOTE_TYPES, TYPE_COLORS, TYPE_LABELS, TYPE_TONES, communityColor, nodeColor, nodeSize, nodeTone, type NoteType } from "@jarvis/core";
import { CheckerMark } from "@/components/brand/motifs";
import { NoteDrawer } from "@/components/graph/NoteDrawer";
import type { GraphSnapshot } from "@/lib/types";

type ColorMode = "mono" | "type" | "community";

// Cores opacas (pré-misturadas com o fundo #1e1e1e): alfa em arestas WebGL varia entre GPUs
const EDGE_COLOR = "#2a2a2a";
const EDGE_SUGGESTED = "#4a1d1b";
const EDGE_HIGHLIGHT = "#bdbdbd";
const EDGE_SUGGESTED_HIGHLIGHT = "#e5322d";
const DIM_NODE = "#262626";
const SIGNAL = "#e5322d";

/**
 * Grafo global estilo Obsidian (WebGL / Sigma.js + Graphology):
 * cor por tipo ou comunidade (Louvain), tamanho ∝ √grau, rótulos com fade por zoom,
 * hover destaca vizinhança, ForceAtlas2 em web worker com posições salvas no banco,
 * filtros (tipo, órfãs, sugestões) e animação "ver o cérebro crescer".
 */
export function GraphView({ focusId, aiReady = false }: { focusId?: string; aiReady?: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sigmaRef = useRef<Sigma | null>(null);
  const graphRef = useRef<Graph | null>(null);
  const layoutRef = useRef<FA2Layout | null>(null);
  const stateRef = useRef<{ hovered: string | null; neighbors: Set<string>; selected: string | null; selNeighbors: Set<string> }>({
    hovered: null,
    neighbors: new Set(),
    selected: null,
    selNeighbors: new Set(),
  });

  const [snapshot, setSnapshot] = useState<GraphSnapshot | null>(null);
  const [error, setError] = useState("");
  const [colorMode, setColorMode] = useState<ColorMode>("mono");
  const [hiddenTypes, setHiddenTypes] = useState<Set<NoteType>>(new Set());
  const [hideOrphans, setHideOrphans] = useState(false);
  const [showSuggested, setShowSuggested] = useState(true);
  const [labelThreshold, setLabelThreshold] = useState(7);
  const [selectedId, setSelectedId] = useState<string | null>(focusId ?? null);
  const [showFilters, setShowFilters] = useState(false);
  const [edgeInfo, setEdgeInfo] = useState<string>("");
  const [search, setSearch] = useState("");
  const [layoutRunning, setLayoutRunning] = useState(false);
  const [timeCut, setTimeCut] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);

  // Filtros vivem em ref para os reducers do Sigma lerem sem recriar o renderer
  const filtersRef = useRef({ hiddenTypes, hideOrphans, showSuggested, timeCut });
  const colorModeRef = useRef<ColorMode>(colorMode);

  const loadSnapshot = useCallback(() => {
    fetch("/api/graph")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.statusText))))
      .then(setSnapshot)
      .catch((e) => setError(String(e)));
  }, []);

  useEffect(() => {
    loadSnapshot();
    // Qualquer adição/edição (modal "Adicionar", painel da nota) redesenha o cérebro
    window.addEventListener("jarvis:changed", loadSnapshot);
    return () => window.removeEventListener("jarvis:changed", loadSnapshot);
  }, [loadSnapshot]);

  /** Seleciona um ponto: destaca a vizinhança de forma persistente e centraliza a câmera. */
  const selectNode = useCallback((id: string | null, moveCamera = false) => {
    const g = graphRef.current;
    const r = sigmaRef.current;
    setSelectedId(id);
    stateRef.current = {
      ...stateRef.current,
      selected: id, // mesmo que o nó ainda não esteja no grafo (nota recém-criada): vale após recarregar
      selNeighbors: id && g?.hasNode(id) ? new Set(g.neighbors(id)) : new Set(),
    };
    if (r && id && moveCamera && g?.hasNode(id)) {
      const d = r.getNodeDisplayData(id);
      if (d) r.getCamera().animate({ x: d.x, y: d.y, ratio: 0.3 }, { duration: 500 });
    }
    r?.refresh({ skipIndexation: true });
  }, []);

  const timeRange = useMemo(() => {
    if (!snapshot?.nodes.length) return null;
    const ts = snapshot.nodes.map((n) => new Date(n.created_at).getTime());
    return { min: Math.min(...ts), max: Math.max(...ts) };
  }, [snapshot]);

  const savePositions = useCallback(async () => {
    const g = graphRef.current;
    if (!g) return;
    const positions = g.mapNodes((id, a) => ({ id, x: a.x as number, y: a.y as number }));
    await fetch("/api/graph", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(positions) });
  }, []);

  const runLayout = useCallback(
    (ms = 4000) => {
      const g = graphRef.current;
      if (!g || g.order === 0) return;
      layoutRef.current?.kill();
      const settings = forceAtlas2.inferSettings(g);
      // Gravidade forte: componentes desconectados (ex.: um livro isolado) não se afastam do centro
      const layout = new FA2Layout(g, {
        settings: { ...settings, strongGravityMode: true, gravity: 0.6, barnesHutOptimize: g.order > 500, slowDown: 5 },
      });
      layoutRef.current = layout;
      layout.start();
      setLayoutRunning(true);
      setTimeout(() => {
        layout.stop();
        setLayoutRunning(false);
        // As posições mudaram: recentraliza a câmera no grafo inteiro
        sigmaRef.current?.refresh();
        sigmaRef.current?.getCamera().animatedReset({ duration: 500 });
        void savePositions();
      }, ms);
    },
    [savePositions],
  );

  // Monta o grafo + renderer uma vez por snapshot
  useEffect(() => {
    if (!snapshot || !containerRef.current) return;
    let cancelled = false;
    const g = new Graph({ type: "undirected", multi: false, allowSelfLoops: false });
    let needsLayout = false;
    for (const n of snapshot.nodes) {
      if (n.x == null || n.y == null) needsLayout = true;
      g.addNode(n.id, {
        label: n.title,
        x: n.x ?? Math.random() * 100,
        y: n.y ?? Math.random() * 100,
        size: nodeSize(n.degree, n.type),
        noteType: n.type,
        degree: n.degree,
        createdAt: new Date(n.created_at).getTime(),
        typeColor: nodeColor(n.type),
        toneColor: nodeTone(n.type),
      });
    }
    for (const e of snapshot.edges) {
      if (!g.hasNode(e.source) || !g.hasNode(e.target) || e.source === e.target) continue;
      if (g.hasEdge(e.source, e.target)) {
        // Mantém a aresta aceita se houver mais de uma relação entre o par
        if (e.status === "accepted") g.setEdgeAttribute(g.edge(e.source, e.target)!, "status", "accepted");
        continue;
      }
      g.addEdge(e.source, e.target, { status: e.status, relation: e.relation, rationale: e.rationale, size: 1 });
    }
    if (g.order > 1) {
      const communities = louvain(g);
      g.forEachNode((id) => g.setNodeAttribute(id, "communityColor", communityColor(communities[id] ?? 0)));
    }
    graphRef.current = g;

    import("sigma").then(({ default: SigmaCtor }) => {
      if (cancelled || !containerRef.current) return;
      const renderer = new SigmaCtor(g, containerRef.current, {
        renderEdgeLabels: false,
        enableEdgeEvents: true,
        defaultEdgeColor: EDGE_COLOR,
        labelColor: { color: "#d4d4d4" },
        labelSize: 12,
        labelFont: "ui-sans-serif, system-ui, sans-serif",
        labelRenderedSizeThreshold: 7,
        labelDensity: 0.7,
        zIndex: true,
        stagePadding: 90,
        minCameraRatio: 0.05,
        maxCameraRatio: 10,
        nodeReducer: (node, data) => {
          const f = filtersRef.current;
          const s = stateRef.current;
          const res: Record<string, unknown> = { ...data };
          const mode = colorModeRef.current;
          res.color = mode === "community" ? (data.communityColor ?? data.typeColor) : mode === "type" ? data.typeColor : data.toneColor;
          if (
            f.hiddenTypes.has(data.noteType as NoteType) ||
            (f.hideOrphans && (data.degree as number) === 0) ||
            (f.timeCut != null && (data.createdAt as number) > f.timeCut)
          ) {
            res.hidden = true;
            return res;
          }
          const active = s.hovered ?? s.selected;
          const near = s.hovered ? s.neighbors : s.selNeighbors;
          if (active) {
            if (node === active || near.has(node) || node === s.selected) {
              res.zIndex = 1;
              res.forceLabel = true;
              if (node === active || node === s.selected) res.color = SIGNAL;
            } else {
              res.color = DIM_NODE;
              res.label = "";
              res.zIndex = 0;
            }
          }
          return res;
        },
        edgeReducer: (edge, data) => {
          const f = filtersRef.current;
          const s = stateRef.current;
          const res: Record<string, unknown> = { ...data };
          const suggested = data.status === "suggested";
          if (suggested && !f.showSuggested) {
            res.hidden = true;
            return res;
          }
          res.color = suggested ? EDGE_SUGGESTED : EDGE_COLOR;
          const active = s.hovered ?? s.selected;
          if (active) {
            const [a, b] = g.extremities(edge);
            if (a === active || b === active) {
              res.color = suggested ? EDGE_SUGGESTED_HIGHLIGHT : EDGE_HIGHLIGHT;
              res.size = 1.5;
            } else res.hidden = true;
          }
          return res;
        },
      });
      sigmaRef.current = renderer;

      renderer.on("enterNode", ({ node }) => {
        stateRef.current = { ...stateRef.current, hovered: node, neighbors: new Set(g.neighbors(node)) };
        renderer.refresh({ skipIndexation: true });
      });
      renderer.on("leaveNode", () => {
        stateRef.current = { ...stateRef.current, hovered: null, neighbors: new Set() };
        renderer.refresh({ skipIndexation: true });
      });
      renderer.on("clickNode", ({ node }) => selectNode(node, true));
      renderer.on("clickStage", () => selectNode(null));
      renderer.on("enterEdge", ({ edge }) => {
        const a = g.getEdgeAttributes(edge);
        const [s, t] = g.extremities(edge);
        setEdgeInfo(
          `${g.getNodeAttribute(s, "label")} — ${a.relation}${a.status === "suggested" ? " (sugerida)" : ""} — ${g.getNodeAttribute(t, "label")}${a.rationale ? `: ${a.rationale}` : ""}`,
        );
      });
      renderer.on("leaveEdge", () => setEdgeInfo(""));

      if (needsLayout) runLayout(g.order > 2000 ? 8000 : 4000);
      // Mantém a seleção (ou o foco vindo da URL) depois de recarregar o grafo
      const keep = stateRef.current.selected ?? focusId ?? null;
      if (keep && g.hasNode(keep)) selectNode(keep, !stateRef.current.selected);
    });

    return () => {
      cancelled = true;
      layoutRef.current?.kill();
      sigmaRef.current?.kill();
      sigmaRef.current = null;
    };
  }, [snapshot, focusId, runLayout, selectNode]);

  // Re-render quando filtros mudam
  useEffect(() => {
    filtersRef.current = { hiddenTypes, hideOrphans, showSuggested, timeCut };
    colorModeRef.current = colorMode;
    sigmaRef.current?.setSetting("labelRenderedSizeThreshold", labelThreshold);
    sigmaRef.current?.refresh({ skipIndexation: true });
  }, [hiddenTypes, hideOrphans, showSuggested, colorMode, labelThreshold, timeCut]);

  // Animação: "ver o cérebro crescer" por ordem cronológica
  useEffect(() => {
    if (!playing || !timeRange) return;
    const start = performance.now();
    const duration = 8000;
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      setTimeCut(timeRange.min + p * (timeRange.max - timeRange.min));
      if (p < 1) raf = requestAnimationFrame(tick);
      else {
        setPlaying(false);
        setTimeCut(null);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, timeRange]);

  function focusSearch(e: React.FormEvent) {
    e.preventDefault();
    const g = graphRef.current;
    const r = sigmaRef.current;
    if (!g || !r || !search.trim()) return;
    const q = search.toLowerCase();
    const id = g.findNode((_, a) => String(a.label).toLowerCase().includes(q));
    if (!id) return;
    selectNode(id, true);
  }

  const typeCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const n of snapshot?.nodes ?? []) m.set(n.type, (m.get(n.type) ?? 0) + 1);
    return m;
  }, [snapshot]);

  return (
    <div className="relative h-[calc(100vh-52px)] w-full bg-[radial-gradient(ellipse_at_50%_40%,#141414_0%,#0a0a0a_70%)] md:h-screen">
      <div ref={containerRef} className="absolute inset-0" />

      {error && <p className="absolute left-4 top-4 text-red-400">Erro ao carregar o grafo: {error}</p>}
      {snapshot && snapshot.nodes.length === 0 && (
        <p className="absolute inset-0 flex items-center justify-center text-muted">
          Seu grafo está vazio. Toque em “+ Adicionar” para guardar sua primeira nota ou arquivo.
        </p>
      )}

      {/* Painel de controles */}
      <button
        onClick={() => setShowFilters((v) => !v)}
        className="surface absolute left-3 top-3 z-20 rounded-sm px-3 py-2 text-[10.5px] uppercase tracking-[0.14em] md:hidden"
      >
        {showFilters ? "Fechar" : "Filtros"}
      </button>
      <div
        className={`surface absolute left-3 top-3 max-h-[calc(100%-24px)] w-72 space-y-4 overflow-y-auto rounded-sm p-4 text-sm shadow-2xl max-md:top-14 ${
          showFilters ? "" : "max-md:hidden"
        }`}
      >
        <div className="kicker flex items-center justify-between">
          <span>Cérebro</span>
          <CheckerMark className="text-foreground/50" />
        </div>
        <form onSubmit={focusSearch}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar nó…"
            className="field w-full "
          />
        </form>
        <div className="flex gap-1">
          {(["mono", "type", "community"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setColorMode(m)}
              className={`flex-1 rounded-full px-2 py-1 text-[10px] uppercase tracking-[0.12em] ${
                colorMode === m ? "bg-foreground text-background" : "border border-border text-muted hover:text-foreground"
              }`}
            >
              {m === "mono" ? "Mono" : m === "type" ? "Tipo" : "Grupos"}
            </button>
          ))}
        </div>
        <div className="space-y-1">
          {NOTE_TYPES.filter((t) => typeCounts.has(t)).map((t) => (
            <label key={t} className="flex cursor-pointer items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={!hiddenTypes.has(t)}
                onChange={() => {
                  const next = new Set(hiddenTypes);
                  if (next.has(t)) next.delete(t);
                  else next.add(t);
                  setHiddenTypes(next);
                }}
              />
              <span className="h-2 w-2 rounded-full" style={{ background: colorMode === "type" ? TYPE_COLORS[t] : TYPE_TONES[t] }} />
              {TYPE_LABELS[t]} <span className="ml-auto text-muted">{typeCounts.get(t)}</span>
            </label>
          ))}
        </div>
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" checked={hideOrphans} onChange={(e) => setHideOrphans(e.target.checked)} /> Esconder órfãs
        </label>
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" checked={showSuggested} onChange={(e) => setShowSuggested(e.target.checked)} />
          Sugestões da IA <span className="ml-auto inline-block h-px w-5 bg-[var(--signal)]" />
        </label>
        <label className="block text-xs text-muted">
          Rótulos (fade por zoom)
          <input type="range" min={0} max={20} value={labelThreshold} onChange={(e) => setLabelThreshold(Number(e.target.value))} className="w-full" />
        </label>
        <div className="flex gap-1">
          <button onClick={() => runLayout()} disabled={layoutRunning} className="btn-outline flex-1 px-2 py-1.5 !text-[10px] disabled:opacity-50">
            {layoutRunning ? "Organizando…" : "Reorganizar"}
          </button>
          <button onClick={() => setPlaying(true)} disabled={playing || !timeRange} className="btn-outline flex-1 px-2 py-1.5 !text-[10px] disabled:opacity-50">
            ▶ Crescer
          </button>
        </div>
        {timeCut != null && <p className="text-xs text-muted">{new Date(timeCut).toLocaleDateString("pt-BR")}</p>}
        <div className="grid grid-cols-2 gap-px border-t border-border bg-border pt-px">
          <div className="bg-panel py-2">
            <div className="display text-lg text-foreground">{snapshot?.nodes.length ?? 0}</div>
            <div className="kicker">notas</div>
          </div>
          <div className="bg-panel py-2 pl-3">
            <div className="display text-lg text-foreground">{snapshot?.edges.length ?? 0}</div>
            <div className="kicker">conexões</div>
          </div>
        </div>
      </div>

      {/* Painel do ponto selecionado: ler, editar, anexar e navegar sem sair do grafo */}
      {selectedId && (
        <NoteDrawer
          key={selectedId}
          noteId={selectedId}
          aiReady={aiReady}
          onClose={() => selectNode(null)}
          onSelect={(id) => selectNode(id, true)}
          onChanged={loadSnapshot}
        />
      )}

      {edgeInfo && (
        <div className="surface absolute bottom-3 left-1/2 max-w-xl -translate-x-1/2 rounded-sm px-3 py-2 text-xs">
          {edgeInfo}
        </div>
      )}
    </div>
  );
}
