"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Graph from "graphology";
import louvain from "graphology-communities-louvain";
import type Sigma from "sigma";
import {
  NOTE_TYPES,
  TYPE_LABELS,
  matchesQuery,
  neighborhood,
  nodeSize,
  periodCutoff,
} from "@jarvis/core";
import {
  IconPlus,
  IconSearch,
  IconSliders,
  IconTarget,
} from "@/components/icons";
import {
  Checklist,
  type OnboardingStatus,
} from "@/components/onboarding/Checklist";
import { NotePanel } from "@/components/note/NotePanel";
import { Skeleton, typeColor } from "@/components/ui";
import { useFocusNode } from "@/components/shell/useFocusNode";
import { GraphLayout, type SimNode } from "@/lib/graph/layout";
import type { GraphSnapshot } from "@/lib/types";
import { emit, on } from "@/lib/ui-events";
import {
  DEFAULT_SETTINGS,
  forceParams,
  loadSettings,
  saveSettings,
  type GraphSettings,
} from "./graph-settings";
import { GraphSettingsPanel } from "./GraphSettingsPanel";

// Cores opacas (pré-misturadas com o fundo #1e1e1e): alfa em arestas WebGL varia entre GPUs
const BG = "#1e1e1e";
const EDGE = "#3b3b3b";
const EDGE_SUGGESTED = "#4f417c";
const EDGE_HIGHLIGHT = "#a3a3a3";
const EDGE_SUGGESTED_HIGHLIGHT = "#8b6cef";
const DIM_NODE = "#333333";
const ACCENT = "#8b6cef";

/** Rótulo no hover: cartão escuro com a cor do nó (em vez da caixa branca padrão do Sigma). */
function drawHover(
  ctx: CanvasRenderingContext2D,
  data: {
    x: number;
    y: number;
    size: number;
    label?: string | null;
    color: string;
  },
  settings: { labelSize: number; labelFont: string },
) {
  const size = settings.labelSize;
  ctx.font = `500 ${size}px ${settings.labelFont}`;
  if (data.label) {
    const w = ctx.measureText(data.label).width;
    const x = data.x + data.size + 5;
    const y = data.y - size / 2 - 5;
    ctx.fillStyle = "#2b2b2b";
    ctx.strokeStyle = "#4b4b4b";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(x, y, w + 14, size + 10, 7);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#e6e6e6";
    ctx.fillText(data.label, x + 7, data.y + size / 3);
  }
  ctx.beginPath();
  ctx.arc(data.x, data.y, data.size, 0, Math.PI * 2);
  ctx.fillStyle = data.color;
  ctx.fill();
}

/**
 * O Cérebro: grafo em tela cheia (Sigma.js + Graphology, layout d3-force) no estilo do Obsidian.
 * Camadas por cima: busca/comando, configurações (Filtros · Grupos · Exibição · Forças), legenda,
 * controles de câmera e o painel da nota (lateral direito, não modal).
 */
export function GraphView({
  focusId,
  localDepth,
  aiReady,
  onboarding,
}: {
  focusId?: string;
  localDepth?: number;
  aiReady: boolean;
  onboarding: OnboardingStatus;
}) {
  const goFocus = useFocusNode();
  const containerRef = useRef<HTMLDivElement>(null);
  const sigmaRef = useRef<Sigma | null>(null);
  const graphRef = useRef<Graph | null>(null);
  const layoutRef = useRef<GraphLayout | null>(null);
  const dirtyRef = useRef(false);
  const stateRef = useRef<{
    hovered: string | null;
    neighbors: Set<string>;
    selected: string | null;
    selNeighbors: Set<string>;
  }>({
    hovered: null,
    neighbors: new Set(),
    selected: null,
    selNeighbors: new Set(),
  });
  // Derivados lidos pelos reducers do Sigma (atualizados em efeitos, nunca durante o render)
  const visibleRef = useRef<Set<string>>(new Set());
  const colorRef = useRef<Map<string, string>>(new Map());
  const settingsRef = useRef<GraphSettings>(DEFAULT_SETTINGS);

  const [snapshot, setSnapshot] = useState<GraphSnapshot | null>(null);
  const [error, setError] = useState("");
  const [settings, setSettings] = useState<GraphSettings>(DEFAULT_SETTINGS);
  const [settingsReady, setSettingsReady] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(focusId ?? null);
  const [local, setLocal] = useState<{ id: string; depth: number } | null>(
    focusId && localDepth ? { id: focusId, depth: localDepth } : null,
  );
  const [edgeInfo, setEdgeInfo] = useState("");
  const [timeCut, setTimeCut] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [mobile, setMobile] = useState(false);

  // Configurações persistidas no navegador (carrega depois da hidratação)
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    // Fora do corpo síncrono do efeito: só lemos o navegador depois da hidratação
    Promise.resolve().then(() => {
      setSettings(loadSettings());
      setSettingsReady(true);
      setPanelOpen(window.innerWidth >= 1024 && !focusId);
      setMobile(mq.matches);
    });
    const h = (e: MediaQueryListEvent) => setMobile(e.matches);
    mq.addEventListener("change", h);
    return () => mq.removeEventListener("change", h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (settingsReady) saveSettings(settings);
  }, [settings, settingsReady]);
  const patchSettings = useCallback(
    (p: Partial<GraphSettings>) => setSettings((s) => ({ ...s, ...p })),
    [],
  );

  const loadSnapshot = useCallback(() => {
    fetch("/api/graph")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.statusText))))
      .then(setSnapshot)
      .catch((e) => setError(String(e)));
  }, []);
  useEffect(() => {
    loadSnapshot();
    return on("jarvis:changed", loadSnapshot);
  }, [loadSnapshot]);

  const nodeById = useMemo(
    () => new Map((snapshot?.nodes ?? []).map((n) => [n.id, n])),
    [snapshot],
  );
  const typeCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const n of snapshot?.nodes ?? [])
      m.set(n.type, (m.get(n.type) ?? 0) + 1);
    return m;
  }, [snapshot]);
  const allTags = useMemo(() => {
    const m = new Map<string, number>();
    for (const n of snapshot?.nodes ?? [])
      for (const t of n.tags ?? []) m.set(t, (m.get(t) ?? 0) + 1);
    return [...m].sort((a, b) => b[1] - a[1]);
  }, [snapshot]);
  const timeRange = useMemo(() => {
    if (!snapshot?.nodes.length) return null;
    const ts = snapshot.nodes.map((n) => new Date(n.created_at).getTime());
    return { min: Math.min(...ts), max: Math.max(...ts) };
  }, [snapshot]);

  const savePositions = useCallback(async () => {
    const g = graphRef.current;
    if (!g || !dirtyRef.current) return;
    dirtyRef.current = false;
    const positions = g.mapNodes((id, a) => ({
      id,
      x: a.x as number,
      y: a.y as number,
    }));
    await fetch("/api/graph", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(positions),
    }).catch(() => {});
  }, []);

  /** Seleciona um nó: destaca a vizinhança de forma persistente e (opcional) centraliza a câmera. */
  const selectNode = useCallback((id: string | null, moveCamera = false) => {
    const g = graphRef.current;
    const r = sigmaRef.current;
    setSelectedId(id);
    stateRef.current = {
      ...stateRef.current,
      selected: id,
      selNeighbors: id && g?.hasNode(id) ? new Set(g.neighbors(id)) : new Set(),
    };
    if (r && id && moveCamera && g?.hasNode(id)) {
      const d = r.getNodeDisplayData(id);
      if (d) {
        // O painel da nota cobre parte da tela: a câmera põe o nó no centro da área livre
        const cam = r.getCamera();
        const ratio = Math.min(cam.getState().ratio, 0.5); // aproxima um pouco, sem "pular" para perto demais
        const { width: W, height: H } = r.getDimensions();
        const narrow = W < 768;
        const dx = narrow ? 0 : -208; // painel lateral de ~26rem
        const dy = narrow ? -H * 0.32 : 0; // folha inferior de ~64% da altura
        const cur = cam.getState();
        const a = r.viewportToFramedGraph({ x: W / 2, y: H / 2 });
        const b = r.viewportToFramedGraph({ x: W / 2 + 100, y: H / 2 + 100 });
        const k = {
          x: ((b.x - a.x) / 100) * (ratio / cur.ratio),
          y: ((b.y - a.y) / 100) * (ratio / cur.ratio),
        };
        cam.animate(
          { x: d.x - dx * k.x, y: d.y - dy * k.y, ratio },
          { duration: 450 },
        );
      }
    }
    r?.refresh({ skipIndexation: true });
  }, []);

  /** Enquadra os nós visíveis (usado ao abrir/mudar a profundidade do grafo local). */
  const fitVisible = useCallback(() => {
    const r = sigmaRef.current;
    const gr = graphRef.current;
    if (!r || !gr) return;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    gr.forEachNode((id) => {
      if (!visibleRef.current.has(id)) return;
      const d = r.getNodeDisplayData(id);
      if (!d) return;
      minX = Math.min(minX, d.x);
      maxX = Math.max(maxX, d.x);
      minY = Math.min(minY, d.y);
      maxY = Math.max(maxY, d.y);
    });
    if (!Number.isFinite(minX)) return;
    const span = Math.max(maxX - minX, maxY - minY);
    r.getCamera().animate(
      {
        x: (minX + maxX) / 2,
        y: (minY + maxY) / 2,
        ratio: Math.min(1.2, Math.max(0.1, span * 1.6 + 0.1)),
      },
      { duration: 500 },
    );
  }, []);
  useEffect(() => {
    if (!local) return;
    const t = setTimeout(fitVisible, 350);
    return () => clearTimeout(t);
  }, [local, fitVisible]);

  // Derivados (visibilidade e cor) sempre que filtros/grupos/local/tempo mudam
  useEffect(() => {
    settingsRef.current = settings;
    if (!snapshot) return;
    const cutoff = periodCutoff(settings.period);
    const localSet = local
      ? neighborhood(snapshot.edges, local.id, local.depth)
      : null;
    const visible = new Set<string>();
    const colors = new Map<string, string>();
    for (const n of snapshot.nodes) {
      const qn = { title: n.title, type: n.type, stage: n.stage, tags: n.tags };
      colors.set(
        n.id,
        settings.groups.find((g) => g.query.trim() && matchesQuery(qn, g.query))
          ?.color ?? typeColor(n.type),
      );
      if (settings.hiddenTypes.includes(n.type)) continue;
      if (
        settings.tags.length &&
        !(n.tags ?? []).some((t) => settings.tags.includes(t))
      )
        continue;
      if (!settings.showOrphans && n.degree === 0) continue;
      if (cutoff && new Date(n.created_at).getTime() < cutoff) continue;
      if (timeCut != null && new Date(n.created_at).getTime() > timeCut)
        continue;
      if (settings.search.trim() && !matchesQuery(qn, settings.search))
        continue;
      if (localSet && !localSet.has(n.id)) continue;
      visible.add(n.id);
    }
    visibleRef.current = visible;
    colorRef.current = colors;
    const r = sigmaRef.current;
    if (r) {
      r.setSetting("labelRenderedSizeThreshold", settings.labelFade * 20);
      r.refresh({ skipIndexation: true });
    }
  }, [snapshot, settings, local, timeCut]);

  // Forças mudaram: atualiza o layout em andamento
  useEffect(() => {
    layoutRef.current?.setParams(forceParams(settings));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    settings.center,
    settings.repel,
    settings.linkForce,
    settings.linkDistance,
  ]);

  // Monta o grafo + renderer uma vez por snapshot
  useEffect(() => {
    if (!snapshot || !containerRef.current || !settingsReady) return;
    let cancelled = false;
    const g = new Graph({
      type: "directed",
      multi: false,
      allowSelfLoops: false,
    });

    // Posições: as salvas; nós novos nascem perto de um vizinho (evita explosão no layout)
    const adj = new Map<string, string[]>();
    for (const e of snapshot.edges) {
      (adj.get(e.source) ?? adj.set(e.source, []).get(e.source)!).push(
        e.target,
      );
      (adj.get(e.target) ?? adj.set(e.target, []).get(e.target)!).push(
        e.source,
      );
    }
    const saved = new Map(
      snapshot.nodes
        .filter((n) => n.x != null && n.y != null)
        .map((n) => [n.id, { x: n.x as number, y: n.y as number }]),
    );
    const radius = Math.sqrt(snapshot.nodes.length) * 22 + 30;
    const pos = new Map<string, { x: number; y: number }>(saved);
    for (const n of snapshot.nodes) {
      if (pos.has(n.id)) continue;
      const near = (adj.get(n.id) ?? []).map((id) => pos.get(id)).find(Boolean);
      const jitter = () => (Math.random() - 0.5) * 30;
      pos.set(
        n.id,
        near
          ? { x: near.x + jitter(), y: near.y + jitter() }
          : {
              x: (Math.random() - 0.5) * radius * 2,
              y: (Math.random() - 0.5) * radius * 2,
            },
      );
    }

    for (const n of snapshot.nodes) {
      const p = pos.get(n.id)!;
      g.addNode(n.id, {
        label: n.title,
        x: p.x,
        y: p.y,
        size: nodeSize(n.degree, n.type) * 0.8,
        degree: n.degree,
      });
    }
    for (const e of snapshot.edges) {
      if (!g.hasNode(e.source) || !g.hasNode(e.target) || e.source === e.target)
        continue;
      if (g.hasEdge(e.source, e.target) || g.hasEdge(e.target, e.source)) {
        // Mantém a aresta aceita se houver mais de uma relação entre o par
        const ex = g.hasEdge(e.source, e.target)
          ? g.edge(e.source, e.target)
          : g.edge(e.target, e.source);
        if (ex && e.status === "accepted")
          g.setEdgeAttribute(ex, "status", "accepted");
        continue;
      }
      g.addEdge(e.source, e.target, {
        status: e.status,
        relation: e.relation,
        rationale: e.rationale,
        size: 1,
      });
    }
    if (g.order > 1 && g.size > 0) {
      try {
        louvain.assign(g); // comunidades ficam disponíveis (consultas futuras); cor padrão é por tipo
      } catch {
        /* grafo sem estrutura suficiente */
      }
    }
    graphRef.current = g;

    // Sigma usa WebGL: só pode ser importado no navegador (nunca durante o SSR)
    Promise.all([import("sigma"), import("sigma/rendering")]).then(
      ([{ default: SigmaCtor }, { EdgeArrowProgram }]) => {
        if (cancelled || !containerRef.current) return;
        const renderer = new SigmaCtor(g, containerRef.current, {
          renderEdgeLabels: false,
          enableEdgeEvents: true,
          defaultEdgeColor: EDGE,
          labelColor: { color: "#dcddde" },
          labelSize: 13,
          labelFont: "Inter Variable, ui-sans-serif, system-ui, sans-serif",
          labelRenderedSizeThreshold: settingsRef.current.labelFade * 20,
          labelDensity: 0.8,
          zIndex: true,
          stagePadding: window.innerWidth < 768 ? 28 : 80,
          minCameraRatio: 0.03,
          maxCameraRatio: 12,
          edgeProgramClasses: { arrow: EdgeArrowProgram },
          defaultDrawNodeHover: drawHover,
          nodeReducer: (node, data) => {
            const s = settingsRef.current;
            const st = stateRef.current;
            const res: Record<string, unknown> = {
              ...data,
              size: (data.size as number) * s.nodeSize,
            };
            if (!visibleRef.current.has(node)) {
              res.hidden = true;
              return res;
            }
            res.color = colorRef.current.get(node) ?? "#9aa5b1";
            const active = st.hovered ?? st.selected;
            if (active) {
              const near = st.hovered ? st.neighbors : st.selNeighbors;
              if (node === active || near.has(node) || node === st.selected) {
                res.zIndex = 1;
                res.forceLabel = true;
                if (node === st.selected) {
                  res.color = ACCENT;
                  res.size = (res.size as number) * 1.25;
                }
              } else {
                res.color = DIM_NODE;
                res.label = "";
                res.zIndex = 0;
              }
            }
            return res;
          },
          edgeReducer: (edge, data) => {
            const s = settingsRef.current;
            const st = stateRef.current;
            const res: Record<string, unknown> = { ...data };
            const [a, b] = g.extremities(edge);
            const suggested = data.status === "suggested";
            if (
              (suggested && !s.showSuggested) ||
              !visibleRef.current.has(a) ||
              !visibleRef.current.has(b)
            ) {
              res.hidden = true;
              return res;
            }
            res.type = s.arrows ? "arrow" : "line";
            res.color = suggested ? EDGE_SUGGESTED : EDGE;
            res.size = s.linkWidth;
            const active = st.hovered ?? st.selected;
            if (active) {
              if (a === active || b === active) {
                res.color = suggested
                  ? EDGE_SUGGESTED_HIGHLIGHT
                  : EDGE_HIGHLIGHT;
                res.size = s.linkWidth * 1.6;
              } else res.hidden = true;
            }
            return res;
          },
        });
        sigmaRef.current = renderer;
        renderer.setSetting(
          "labelRenderedSizeThreshold",
          settingsRef.current.labelFade * 20,
        );

        // Layout de forças (d3-force). Com posições salvas ele só "assenta"; sem elas, abre o cérebro.
        let userDragged = false;
        const simNodes: SimNode[] = snapshot.nodes.map((n) => ({
          id: n.id,
          x: pos.get(n.id)!.x,
          y: pos.get(n.id)!.y,
        }));
        const simLinks = g.mapEdges((_, __, s, t) => ({
          source: s,
          target: t,
        }));
        const fresh = simNodes.length > 0 && saved.size < simNodes.length;
        const layout = new GraphLayout(
          simNodes,
          simLinks,
          forceParams(settingsRef.current),
          () => {
            for (const n of simNodes) {
              const a = g.getNodeAttributes(n.id);
              a.x = n.x;
              a.y = n.y;
            }
            dirtyRef.current = true;
            renderer.refresh();
          },
          () => {
            // Terminou de assentar: mantém o foco no nó selecionado; senão, enquadra tudo (só no primeiro layout)
            const sel = stateRef.current.selected;
            if (userDragged)
              userDragged = false; // o usuário mexeu: não puxa a câmera de volta
            else if (sel && g.hasNode(sel)) selectNode(sel, true);
            else if (fresh)
              renderer.getCamera().animatedReset({ duration: 400 });
            void savePositions();
          },
          fresh ? 1 : 0.06,
        );
        layoutRef.current = layout;
        layout.start();

        // Hover / clique
        renderer.on("enterNode", ({ node }) => {
          stateRef.current = {
            ...stateRef.current,
            hovered: node,
            neighbors: new Set(g.neighbors(node)),
          };
          renderer.refresh({ skipIndexation: true });
          if (containerRef.current)
            containerRef.current.style.cursor = "pointer";
        });
        renderer.on("leaveNode", () => {
          stateRef.current = {
            ...stateRef.current,
            hovered: null,
            neighbors: new Set(),
          };
          renderer.refresh({ skipIndexation: true });
          if (containerRef.current)
            containerRef.current.style.cursor = "default";
        });
        renderer.on("clickNode", ({ node }) => selectNode(node, true));
        renderer.on("clickStage", () => selectNode(null));
        renderer.on("enterEdge", ({ edge }) => {
          const a = g.getEdgeAttributes(edge);
          const [s, t] = g.extremities(edge);
          setEdgeInfo(
            `${g.getNodeAttribute(s, "label")} — ${String(a.relation).replaceAll("_", " ")}${a.status === "suggested" ? " (sugerida pela IA)" : ""} — ${g.getNodeAttribute(t, "label")}${a.rationale ? `: ${a.rationale}` : ""}`,
          );
        });
        renderer.on("leaveEdge", () => setEdgeInfo(""));

        // Arrastar um ponto o move (a física reage); a posição é salva ao assentar
        let dragged: string | null = null;
        renderer.on("downNode", ({ node }) => {
          dragged = node;
          userDragged = true;
        });
        renderer.getMouseCaptor().on("mousemovebody", (e) => {
          if (!dragged) return;
          const p = renderer.viewportToGraph(e);
          layout.drag(dragged, p.x, p.y);
          e.preventSigmaDefault();
          e.original.preventDefault();
          e.original.stopPropagation();
        });
        renderer.getMouseCaptor().on("mouseup", () => {
          if (dragged) layout.release(dragged);
          dragged = null;
        });

        // Mantém a seleção (ou o foco vindo da URL) depois de recarregar o grafo
        const keep = stateRef.current.selected ?? focusId ?? null;
        if (keep && g.hasNode(keep))
          selectNode(keep, !stateRef.current.selected);
      },
    );

    return () => {
      cancelled = true;
      layoutRef.current?.stop();
      layoutRef.current = null;
      sigmaRef.current?.kill();
      sigmaRef.current = null;
    };
  }, [snapshot, settingsReady, focusId, selectNode, savePositions]);

  // Eventos de fora (barra de comando, gaveta, Jarvis)
  useEffect(
    () =>
      on<{ id: string }>(
        "jarvis:focus",
        (d) => d?.id && selectNode(d.id, true),
      ),
    [selectNode],
  );
  useEffect(
    () =>
      on<{ id: string; depth: number }>("jarvis:local", (d) => {
        if (!d?.id) return;
        setLocal({ id: d.id, depth: d.depth });
        selectNode(d.id, true);
      }),
    [selectNode],
  );

  // Animar: "ver o cérebro crescer" por ordem cronológica
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

  const camera = (fn: "in" | "out" | "reset") => {
    const c = sigmaRef.current?.getCamera();
    if (!c) return;
    if (fn === "in") c.animatedZoom({ duration: 200 });
    else if (fn === "out") c.animatedUnzoom({ duration: 200 });
    else c.animatedReset({ duration: 350 });
  };

  const noteOpen = !!selectedId;
  const empty = snapshot && snapshot.nodes.length === 0;
  const guideDone = onboarding.claudeOk && onboarding.hasCaptured;
  const localNote = local ? nodeById.get(local.id) : null;
  // Em telas pequenas só um painel por vez
  const showSettings = panelOpen && !(mobile && noteOpen);

  return (
    <div
      className="relative h-full w-full overflow-hidden"
      style={{ background: BG }}
    >
      <div
        ref={containerRef}
        className="absolute inset-0"
        aria-label="Grafo de notas"
        role="img"
      />

      {!snapshot && !error && (
        <div
          className="absolute inset-0 flex items-center justify-center"
          role="status"
          aria-label="Carregando o cérebro"
        >
          <div className="grid grid-cols-5 gap-6 opacity-70">
            {Array.from({ length: 15 }, (_, i) => (
              <Skeleton key={i} className="h-5 w-5 rounded-full" />
            ))}
          </div>
        </div>
      )}
      {error && (
        <p className="absolute left-4 top-16 text-danger">
          Erro ao carregar o grafo: {error}
        </p>
      )}

      {empty && (
        <div className="absolute inset-0 flex items-center justify-center overflow-y-auto p-4">
          <div className="surface w-full max-w-md rounded-2xl p-6 shadow-2xl">
            <h1 className="text-xl font-semibold">Seu cérebro está vazio</h1>
            <p className="mt-1 text-sm text-muted">
              Comece guardando uma ideia, um link ou um arquivo — ou carregue
              dados de exemplo para ver o grafo funcionando.
            </p>
            <div className="mt-4">
              <Checklist status={onboarding} />
            </div>
          </div>
        </div>
      )}

      {/* Canto superior esquerdo: comando + primeiros passos */}
      <div className="absolute left-3 top-3 z-10 flex max-w-[calc(100%-5rem)] flex-wrap items-start gap-2">
        <button
          onClick={() => emit("jarvis:palette")}
          className="surface flex h-10 items-center gap-2 rounded-lg px-3 text-sm text-muted shadow-lg hover:text-foreground"
          aria-label="Buscar, capturar ou perguntar (Ctrl+K)"
        >
          <IconSearch width={18} height={18} />
          <span className="hidden sm:inline">Buscar ou capturar…</span>
          <span className="kbd hidden sm:inline">Ctrl K</span>
        </button>
        {!empty && !guideDone && (
          <div className="relative">
            <button
              onClick={() => setShowGuide((v) => !v)}
              className="surface flex h-10 items-center gap-2 rounded-lg px-3 text-sm shadow-lg"
              aria-expanded={showGuide}
            >
              <span className="h-2 w-2 rounded-full bg-accent" /> Primeiros
              passos
            </button>
            {showGuide && (
              <div className="surface slide-in-up absolute left-0 top-12 z-20 w-[min(22rem,calc(100vw-2rem))] rounded-xl p-4 shadow-2xl">
                <Checklist status={onboarding} />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Grafo local: barra superior central */}
      {local && (
        <div className="surface slide-in-up absolute left-3 top-16 z-10 flex max-w-[calc(100%-1.5rem)] flex-wrap items-center gap-2 rounded-xl px-3 py-2 text-sm shadow-lg">
          <span className="font-medium">Grafo local</span>
          <span className="max-w-[10rem] truncate text-muted">
            {localNote?.title ?? ""}
          </span>
          <div role="group" aria-label="Profundidade" className="flex gap-1">
            {[1, 2, 3].map((d) => (
              <button
                key={d}
                className="chip !py-0"
                aria-pressed={local.depth === d}
                onClick={() => setLocal({ ...local, depth: d })}
              >
                {d}
              </button>
            ))}
          </div>
          <button className="btn-ghost !py-0.5" onClick={() => setLocal(null)}>
            Ver tudo
          </button>
        </div>
      )}

      {/* Configurações (canto superior direito, recolhível) */}
      <div
        className={`absolute top-3 z-10 flex max-h-[calc(100%-1.5rem)] flex-col items-end gap-2 ${noteOpen && !mobile ? "right-[27.5rem]" : "right-3"} max-md:left-3 max-md:right-3 max-md:top-auto max-md:bottom-3 max-md:items-stretch`}
      >
        {showSettings ? (
          <div className="flex min-h-0 w-80 max-w-full flex-col max-h-[calc(100dvh-9rem)] max-md:max-h-[58dvh] max-md:w-auto">
            <GraphSettingsPanel
              settings={settings}
              onChange={patchSettings}
              onClose={() => setPanelOpen(false)}
              typeCounts={typeCounts}
              allTags={allTags}
              onAnimate={() => setPlaying(true)}
              animating={playing}
              onReheat={() => layoutRef.current?.reheat(0.9)}
            />
          </div>
        ) : (
          !(mobile && noteOpen) && (
            <button
              onClick={() => setPanelOpen(true)}
              className="surface flex h-10 items-center gap-2 rounded-lg px-3 text-sm shadow-lg max-md:self-end"
              aria-label="Abrir configurações do grafo"
            >
              <IconSliders width={18} height={18} />
              <span className="hidden sm:inline">Configurações</span>
            </button>
          )
        )}
      </div>

      {/* Câmera */}
      {!empty && (
        <div
          className={`absolute z-10 flex flex-col gap-1.5 ${noteOpen && !mobile ? "right-[27.5rem]" : "right-3"} bottom-3 max-md:bottom-20 ${showSettings && mobile ? "hidden" : ""}`}
        >
          <button
            onClick={() => camera("in")}
            aria-label="Aproximar"
            className="surface flex h-9 w-9 items-center justify-center rounded-lg shadow-lg hover:text-accent-text"
          >
            <IconPlus width={18} height={18} />
          </button>
          <button
            onClick={() => camera("out")}
            aria-label="Afastar"
            className="surface flex h-9 w-9 items-center justify-center rounded-lg shadow-lg hover:text-accent-text"
          >
            <span className="block h-0.5 w-3.5 rounded bg-current" />
          </button>
          <button
            onClick={() => camera("reset")}
            aria-label="Recentrar o grafo"
            className="surface flex h-9 w-9 items-center justify-center rounded-lg shadow-lg hover:text-accent-text"
          >
            <IconTarget width={18} height={18} />
          </button>
        </div>
      )}

      {/* Legenda de cores por tipo */}
      {snapshot &&
        snapshot.nodes.length > 0 &&
        !(mobile && (noteOpen || showSettings)) && (
          <ul
            aria-label="Legenda de cores por tipo"
            className="surface absolute bottom-3 left-3 z-10 flex max-w-[calc(100%-5rem)] flex-wrap gap-x-3.5 gap-y-1 rounded-xl px-3 py-2 text-xs shadow-lg max-md:bottom-[4.5rem] max-md:flex-nowrap max-md:overflow-x-auto md:max-w-[min(34rem,calc(100%-24rem))]"
          >
            {NOTE_TYPES.filter((t) => typeCounts.has(t)).map((t) => (
              <li
                key={t}
                className="flex shrink-0 items-center gap-1.5 text-muted"
              >
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ background: typeColor(t) }}
                />
                {TYPE_LABELS[t]}
              </li>
            ))}
          </ul>
        )}

      {timeCut != null && (
        <p className="surface absolute bottom-16 left-1/2 z-10 -translate-x-1/2 rounded-lg px-3 py-1.5 text-sm">
          {new Date(timeCut).toLocaleDateString("pt-BR")}
        </p>
      )}
      {edgeInfo && (
        <div className="surface absolute bottom-14 left-1/2 z-10 max-w-xl -translate-x-1/2 rounded-lg px-3 py-2 text-sm max-md:bottom-28">
          {edgeInfo}
        </div>
      )}

      {/* Painel da nota: lateral direito (celular: folha inferior). Não é modal. */}
      {selectedId && (
        <aside
          aria-label="Nota selecionada"
          className="slide-in-right absolute z-20 border-border-strong bg-surface shadow-2xl max-md:inset-x-0 max-md:bottom-0 max-md:h-[64%] max-md:rounded-t-2xl max-md:border-t md:inset-y-0 md:right-0 md:w-[26rem] md:border-l"
        >
          <NotePanel
            key={selectedId}
            noteId={selectedId}
            aiReady={aiReady}
            variant="side"
            onClose={() => selectNode(null)}
            onSelect={(id) => selectNode(id, true)}
            onChanged={loadSnapshot}
            onLocalGraph={(depth) => {
              setLocal({ id: selectedId, depth });
              goFocus(selectedId);
            }}
          />
        </aside>
      )}
    </div>
  );
}
