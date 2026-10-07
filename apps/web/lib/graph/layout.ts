import { forceLink, forceManyBody, forceSimulation, forceX, forceY, type Simulation, type SimulationLinkDatum } from "d3-force";

export interface SimNode {
  id: string;
  x: number;
  y: number;
  fx?: number | null;
  fy?: number | null;
}
export interface LayoutParams {
  centerStrength: number;
  chargeStrength: number;
  linkStrength: number;
  linkDistance: number;
}

/**
 * Layout de forças (d3-force) com as mesmas alavancas do Obsidian: força central, repulsão,
 * força e distância dos links. Roda no loop de animação do navegador; "assenta" sozinho
 * (alpha → 0) e avisa para salvar as posições. Arrastar um nó o prende (fx/fy) e reaquece.
 */
export class GraphLayout {
  private sim: Simulation<SimNode, SimulationLinkDatum<SimNode>>;
  private raf = 0;
  private running = false;
  private dragging = false;
  readonly nodes: SimNode[];
  private readonly byId = new Map<string, SimNode>();

  constructor(
    nodes: SimNode[],
    links: { source: string; target: string }[],
    params: LayoutParams,
    private readonly onTick: () => void,
    private readonly onSettle: () => void,
    initialAlpha: number,
  ) {
    this.nodes = nodes;
    for (const n of nodes) this.byId.set(n.id, n);
    this.sim = forceSimulation<SimNode>(nodes)
      .alpha(initialAlpha)
      .alphaDecay(0.035)
      .velocityDecay(0.5)
      .force("link", forceLink<SimNode, SimulationLinkDatum<SimNode>>(links.map((l) => ({ ...l }))).id((d) => d.id))
      .force("charge", forceManyBody<SimNode>().distanceMax(450).theta(0.9))
      .force("x", forceX<SimNode>(0))
      .force("y", forceY<SimNode>(0))
      .stop();
    this.setParams(params, false);
  }

  setParams(p: LayoutParams, reheat = true) {
    (this.sim.force("link") as ReturnType<typeof forceLink<SimNode, SimulationLinkDatum<SimNode>>>).strength(p.linkStrength).distance(p.linkDistance);
    (this.sim.force("charge") as ReturnType<typeof forceManyBody<SimNode>>).strength(p.chargeStrength);
    (this.sim.force("x") as ReturnType<typeof forceX<SimNode>>).strength(p.centerStrength);
    (this.sim.force("y") as ReturnType<typeof forceY<SimNode>>).strength(p.centerStrength);
    if (reheat) this.reheat(0.5);
  }

  reheat(alpha = 0.6) {
    this.sim.alpha(Math.max(this.sim.alpha(), alpha));
    this.start();
  }

  start() {
    if (this.running) return;
    this.running = true;
    const ticksPerFrame = this.nodes.length > 3000 ? 1 : 2;
    const frame = () => {
      if (!this.running) return;
      for (let i = 0; i < ticksPerFrame; i++) this.sim.tick();
      this.onTick();
      if (this.sim.alpha() <= this.sim.alphaMin() && !this.dragging) {
        this.running = false;
        this.onSettle();
        return;
      }
      this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);
  }

  /** Prende o nó numa posição (arrasto). */
  drag(id: string, x: number, y: number) {
    const n = this.byId.get(id);
    if (!n) return;
    this.dragging = true;
    n.fx = x;
    n.fy = y;
    this.sim.alphaTarget(0.25);
    this.start();
  }

  release(id: string) {
    const n = this.byId.get(id);
    if (n) {
      n.fx = null;
      n.fy = null;
    }
    this.dragging = false;
    this.sim.alphaTarget(0);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.sim.stop();
  }
}
