"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Graph from "graphology";
import louvain from "graphology-communities-louvain";
import FA2Layout from "graphology-layout-forceatlas2/worker";
import forceAtlas2 from "graphology-layout-forceatlas2";
import type Sigma from "sigma";
import { NOTE_TYPES, TYPE_COLORS, TYPE_LABELS, communityColor, nodeColor, nodeSize, type NoteType } from "@jarvis/core";
import type { GraphSnapshot } from "@/lib/types";

type ColorMode = "type" | "community";

// Cores opacas (pré-misturadas com o fundo #1e1e1e): alfa em arestas WebGL varia entre GPUs
const EDGE_COLOR = "#3a3a3a";
const EDGE_SUGGESTED = "#5a4a86";
const EDGE_HIGHLIGHT = "#a0a0a0";
const EDGE_SUGGESTED_HIGHLIGHT = "#9b7fe6";
const DIM_NODE = "#333333";

/**
 * Grafo global estilo Obsidian (WebGL / Sigma.js + Graphology):
 * cor por tipo ou comunidade (Louvain), tamanho ∝ √grau, rótulos com fade por zoom,
 * hover destaca vizinhança, ForceAtlas2 em web worker com posições salvas no banco,
 * filtros (tipo, órfãs, sugestões) e animação "ver o cérebro crescer".
 */
export function GraphView({ focusId }: { focusId?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sigmaRef = useRef<Sigma | null>(null);
  const graphRef = useRef<Graph | null>(null);
  const layoutRef = useRef<FA2Layout | null>(null);
  const stateRef = useRef<{ hovered: string | null; neighbors: Set<string> }>({ hovered: null, neighbors: new Set() });

  const [snapshot, setSnapshot] = useState<GraphSnapshot | null>(null);
  const [error, setError] = useState("");
  const [colorMode, setColorMode] = useState<ColorMode>("type");
  const [hiddenTypes, setHiddenTypes] = useState<Set<NoteType>>(new Set());
  const [hideOrphans, setHideOrphans] = useState(false);
  const [showSuggested, setShowSuggested] = useState(true);
  const [labelThreshold, setLabelThreshold] = useState(7);
  const [selected, setSelected] = useState<GraphSnapshot["nodes"][number] | null>(null);
  const [edgeInfo, setEdgeInfo] = useState<string>("");
  const [search, setSearch] = useState("");
  const [layoutRunning, setLayoutRunning] = useState(false);
  const [timeCut, setTimeCut] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);

  // Filtros vivem em ref para os reducers do Sigma lerem sem recriar o renderer
  const filtersRef = useRef({ hiddenTypes, hideOrphans, showSuggested, timeCut });
  const colorModeRef = useRef<ColorMode>(colorMode);

  useEffect(() => {
    fetch("/api/graph")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.statusText))))
      .then(setSnapshot)
      .catch((e) => setError(String(e)));
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
      const layout = new FA2Layout(g, { settings: { ...settings, barnesHutOptimize: g.order > 500, slowDown: 5 } });
      layoutRef.current = layout;
      layout.start();
      setLayoutRunning(true);
      setTimeout(() => {
        layout.stop();
        setLayoutRunning(false);
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
        labelColor: { color: "#dcddde" },
        labelSize: 12,
        labelFont: "ui-sans-serif, system-ui, sans-serif",
        labelRenderedSizeThreshold: 7,
        labelDensity: 0.7,
        zIndex: true,
        minCameraRatio: 0.05,
        maxCameraRatio: 10,
        nodeReducer: (node, data) => {
          const f = filtersRef.current;
          const s = stateRef.current;
          const res: Record<string, unknown> = { ...data };
          res.color = colorModeRef.current === "community" ? (data.communityColor ?? data.typeColor) : data.typeColor;
          if (
            f.hiddenTypes.has(data.noteType as NoteType) ||
            (f.hideOrphans && (data.degree as number) === 0) ||
            (f.timeCut != null && (data.createdAt as number) > f.timeCut)
          ) {
            res.hidden = true;
            return res;
          }
          if (s.hovered) {
            if (node === s.hovered || s.neighbors.has(node)) {
              res.zIndex = 1;
              res.forceLabel = true;
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
          if (s.hovered) {
            const [a, b] = g.extremities(edge);
            if (a === s.hovered || b === s.hovered) {
              res.color = suggested ? EDGE_SUGGESTED_HIGHLIGHT : EDGE_HIGHLIGHT;
              res.size = 1.5;
            } else res.hidden = true;
          }
          return res;
        },
      });
      sigmaRef.current = renderer;

      renderer.on("enterNode", ({ node }) => {
        stateRef.current = { hovered: node, neighbors: new Set(g.neighbors(node)) };
        renderer.refresh({ skipIndexation: true });
      });
      renderer.on("leaveNode", () => {
        stateRef.current = { hovered: null, neighbors: new Set() };
        renderer.refresh({ skipIndexation: true });
      });
      renderer.on("clickNode", ({ node }) => {
        setSelected(snapshot.nodes.find((n) => n.id === node) ?? null);
      });
      renderer.on("clickStage", () => setSelected(null));
      renderer.on("enterEdge", ({ edge }) => {
        const a = g.getEdgeAttributes(edge);
        const [s, t] = g.extremities(edge);
        setEdgeInfo(
          `${g.getNodeAttribute(s, "label")} — ${a.relation}${a.status === "suggested" ? " (sugerida)" : ""} — ${g.getNodeAttribute(t, "label")}${a.rationale ? `: ${a.rationale}` : ""}`,
        );
      });
      renderer.on("leaveEdge", () => setEdgeInfo(""));

      if (needsLayout) runLayout(g.order > 2000 ? 8000 : 4000);
      if (focusId && g.hasNode(focusId)) {
        const d = renderer.getNodeDisplayData(focusId);
        if (d) renderer.getCamera().animate({ x: d.x, y: d.y, ratio: 0.3 }, { duration: 600 });
        setSelected(snapshot.nodes.find((n) => n.id === focusId) ?? null);
        stateRef.current = { hovered: focusId, neighbors: new Set(g.neighbors(focusId)) };
      }
    });

    return () => {
      cancelled = true;
      layoutRef.current?.kill();
      sigmaRef.current?.kill();
      sigmaRef.current = null;
    };
  }, [snapshot, focusId, runLayout]);

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
    const d = r.getNodeDisplayData(id);
    if (d) r.getCamera().animate({ x: d.x, y: d.y, ratio: 0.25 }, { duration: 500 });
    stateRef.current = { hovered: id, neighbors: new Set(g.neighbors(id)) };
    r.refresh({ skipIndexation: true });
    setSelected(snapshot?.nodes.find((n) => n.id === id) ?? null);
  }

  const typeCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const n of snapshot?.nodes ?? []) m.set(n.type, (m.get(n.type) ?? 0) + 1);
    return m;
  }, [snapshot]);

  return (
    <div className="relative h-[calc(100vh-52px)] w-full bg-[#1e1e1e] md:h-screen">
      <div ref={containerRef} className="absolute inset-0" />

      {error && <p className="absolute left-4 top-4 text-red-400">Erro ao carregar o grafo: {error}</p>}
      {snapshot && snapshot.nodes.length === 0 && (
        <p className="absolute inset-0 flex items-center justify-center text-muted">
          Seu grafo está vazio. Capture algo na Inbox ou pelo Telegram.
        </p>
      )}

      {/* Painel de controles */}
      <div className="absolute left-3 top-3 max-h-[calc(100%-24px)] w-64 space-y-3 overflow-y-auto rounded-lg border border-border bg-panel/95 p-3 text-sm shadow-xl">
        <form onSubmit={focusSearch}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar nó…"
            className="w-full rounded-md border border-border bg-background px-2 py-1 outline-none focus:border-accent"
          />
        </form>
        <div className="flex gap-1">
          {(["type", "community"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setColorMode(m)}
              className={`flex-1 rounded px-2 py-1 text-xs ${colorMode === m ? "bg-accent-2 text-white" : "bg-panel-2 text-muted"}`}
            >
              {m === "type" ? "Cor por tipo" : "Comunidades"}
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
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: TYPE_COLORS[t] }} />
              {TYPE_LABELS[t]} <span className="ml-auto text-muted">{typeCounts.get(t)}</span>
            </label>
          ))}
        </div>
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" checked={hideOrphans} onChange={(e) => setHideOrphans(e.target.checked)} /> Esconder órfãs
        </label>
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" checked={showSuggested} onChange={(e) => setShowSuggested(e.target.checked)} />
          Mostrar sugestões da IA <span className="ml-auto inline-block h-0.5 w-5 bg-[#9b7fe6]" />
        </label>
        <label className="block text-xs text-muted">
          Rótulos (fade por zoom)
          <input type="range" min={0} max={20} value={labelThreshold} onChange={(e) => setLabelThreshold(Number(e.target.value))} className="w-full" />
        </label>
        <div className="flex gap-1">
          <button onClick={() => runLayout()} disabled={layoutRunning} className="flex-1 rounded bg-panel-2 px-2 py-1 text-xs hover:text-accent disabled:opacity-50">
            {layoutRunning ? "Organizando…" : "Reorganizar"}
          </button>
          <button onClick={() => setPlaying(true)} disabled={playing || !timeRange} className="flex-1 rounded bg-panel-2 px-2 py-1 text-xs hover:text-accent disabled:opacity-50">
            ▶ Ver crescer
          </button>
        </div>
        {timeCut != null && <p className="text-xs text-muted">{new Date(timeCut).toLocaleDateString("pt-BR")}</p>}
        <p className="text-xs text-muted">
          {snapshot?.nodes.length ?? 0} notas · {snapshot?.edges.length ?? 0} conexões
        </p>
      </div>

      {/* Nó selecionado */}
      {selected && (
        <div className="absolute right-3 top-3 w-72 rounded-lg border border-border bg-panel/95 p-4 shadow-xl">
          <div className="mb-1 flex items-center gap-2 text-xs text-muted">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: nodeColor(selected.type) }} />
            {TYPE_LABELS[selected.type] ?? selected.type} · {selected.stage} · {selected.degree} conexões
          </div>
          <h3 className="font-semibold">{selected.title}</h3>
          <div className="mt-3 flex gap-3 text-sm">
            <Link href={`/notes/${selected.id}`} className="text-accent hover:underline">
              Abrir nota →
            </Link>
            <button onClick={() => setSelected(null)} className="ml-auto text-muted hover:text-foreground">
              fechar
            </button>
          </div>
        </div>
      )}

      {edgeInfo && (
        <div className="absolute bottom-3 left-1/2 max-w-xl -translate-x-1/2 rounded-md border border-border bg-panel/95 px-3 py-2 text-xs">
          {edgeInfo}
        </div>
      )}
    </div>
  );
}
