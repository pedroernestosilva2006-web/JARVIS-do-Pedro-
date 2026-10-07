/**
 * Motivos visuais do JARVIS (inspirados nas referências): ondas de linhas finas, esfera com
 * órbitas e "estrelas" vermelhas, marcador quadriculado e cabeçalhos com tipografia larga.
 * Tudo em SVG gerado deterministicamente (sem imagens externas, leve e nítido em qualquer tela).
 */

/** Campo de ondas: dezenas de curvas finas defasadas, formando uma "fita" em movimento. */
export function WaveField({
  lines = 42,
  width = 1200,
  height = 600,
  amplitude = 120,
  className = "",
  opacity = 0.55,
}: {
  lines?: number;
  width?: number;
  height?: number;
  amplitude?: number;
  className?: string;
  opacity?: number;
}) {
  const paths: string[] = [];
  for (let i = 0; i < lines; i++) {
    const t = i / (lines - 1);
    const phase = t * Math.PI * 1.4;
    const amp = amplitude * (0.35 + 0.65 * Math.sin(t * Math.PI));
    const base = height * (0.32 + 0.42 * t);
    const pts: string[] = [];
    for (let x = 0; x <= width; x += width / 48) {
      const u = x / width;
      const y =
        base +
        Math.sin(u * Math.PI * 2.1 + phase) * amp * 0.6 +
        Math.sin(u * Math.PI * 0.9 - phase * 0.7) * amp * 0.4;
      pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
    }
    paths.push(`M${pts.join(" L")}`);
  }
  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid slice" className={className} aria-hidden>
      <defs>
        <linearGradient id="wave-fade" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.35" stopColor="#fff" stopOpacity="1" />
          <stop offset="0.7" stopColor="#fff" stopOpacity="0.8" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <g className="wave-drift" stroke="url(#wave-fade)" strokeWidth="0.6" fill="none" opacity={opacity}>
        {paths.map((d, i) => (
          <path key={i} d={d} />
        ))}
      </g>
    </svg>
  );
}

/** Estrela de quatro pontas (o "brilho" das referências). */
export function Sparkle({ x, y, r = 6, color = "#ffffff" }: { x: number; y: number; r?: number; color?: string }) {
  const d = `M${x},${y - r} Q${x},${y} ${x + r},${y} Q${x},${y} ${x},${y + r} Q${x},${y} ${x - r},${y} Q${x},${y} ${x},${y - r} Z`;
  return <path d={d} fill={color} />;
}

/** Esfera com órbitas elípticas, estrelas brancas e dois acentos vermelhos. */
export function OrbitSphere({ className = "", size = 520 }: { className?: string; size?: number }) {
  const c = size / 2;
  const R = size * 0.2;
  const orbits = [
    { rx: size * 0.44, ry: size * 0.16, rot: -18 },
    { rx: size * 0.4, ry: size * 0.22, rot: 32 },
    { rx: size * 0.46, ry: size * 0.12, rot: 74 },
    { rx: size * 0.34, ry: size * 0.34, rot: 0 },
  ];
  return (
    <svg viewBox={`0 0 ${size} ${size}`} className={className} aria-hidden>
      <defs>
        <radialGradient id="sphere-light" cx="38%" cy="32%" r="75%">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.35" stopColor="#d9d9d9" />
          <stop offset="0.75" stopColor="#6e6e6e" />
          <stop offset="1" stopColor="#1a1a1a" />
        </radialGradient>
        <radialGradient id="sphere-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0.6" stopColor="#ffffff" stopOpacity="0.12" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx={c} cy={c} r={R * 1.7} fill="url(#sphere-glow)" />
      <g className="orbit-spin" stroke="#ffffff" strokeOpacity="0.35" strokeWidth="0.8" fill="none">
        {orbits.map((o, i) => (
          <ellipse key={i} cx={c} cy={c} rx={o.rx} ry={o.ry} transform={`rotate(${o.rot} ${c} ${c})`} />
        ))}
      </g>
      <circle cx={c} cy={c} r={R} fill="url(#sphere-light)" />
      {/* ranhuras finas sobre a esfera (linhas de latitude) */}
      <g stroke="#0a0a0a" strokeOpacity="0.18" strokeWidth="0.6" fill="none">
        {[-0.6, -0.3, 0, 0.3, 0.6].map((k) => (
          <ellipse key={k} cx={c} cy={c + k * R} rx={R * Math.sqrt(1 - k * k)} ry={R * 0.12 * Math.sqrt(1 - k * k)} />
        ))}
      </g>
      <Sparkle x={c - size * 0.38} y={c - size * 0.06} r={5} />
      <Sparkle x={c + size * 0.31} y={c - size * 0.27} r={6} />
      <Sparkle x={c + size * 0.12} y={c + size * 0.4} r={4} />
      <Sparkle x={c - size * 0.18} y={c + size * 0.3} r={4} />
      <Sparkle x={c - size * 0.33} y={c - size * 0.34} r={9} color="var(--signal)" />
      <Sparkle x={c + size * 0.36} y={c + size * 0.33} r={8} color="var(--signal)" />
    </svg>
  );
}

/** Marca do JARVIS: ponto central com uma órbita e um brilho vermelho. */
export function JarvisMark({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <ellipse cx="12" cy="12" rx="10.5" ry="4.2" transform="rotate(-25 12 12)" stroke="currentColor" strokeOpacity="0.55" strokeWidth="1" fill="none" />
      <circle cx="12" cy="12" r="4.2" fill="currentColor" />
      <Sparkle x={20} y={4.5} r={2.6} color="var(--signal)" />
    </svg>
  );
}

/** Marcador quadriculado (os pequenos "pixels" das referências). */
export function CheckerMark({ className = "" }: { className?: string }) {
  const cells = [
    [0, 0], [2, 0], [4, 0], [1, 1], [3, 1], [5, 1], [0, 2], [2, 2], [4, 2],
  ];
  return (
    <svg viewBox="0 0 6 3" className={`h-[9px] w-[18px] ${className}`} aria-hidden shapeRendering="crispEdges">
      {cells.map(([x, y]) => (
        <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill="currentColor" />
      ))}
    </svg>
  );
}

/** Cabeçalho de página: rótulos pequenos em linha, título largo e uma linha fina. */
export function PageHeader({
  index,
  section,
  title,
  subtitle,
  actions,
}: {
  index: string;
  section: string;
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="relative overflow-hidden border-b border-border pb-6">
      <div className="kicker flex items-center gap-3">
        <span>{index}</span>
        <span className="h-px flex-1 bg-border" />
        <span>{section}</span>
      </div>
      <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="display text-2xl text-foreground md:text-[2rem]">{title}</h1>
          {subtitle && <p className="mt-3 max-w-xl text-sm text-muted">{subtitle}</p>}
        </div>
        {actions}
      </div>
      <CheckerMark className="absolute bottom-3 right-0 text-foreground/70" />
    </header>
  );
}

/** Número grande + legenda (referência: "22% reduction in average well cycle time"). */
export function Stat({ value, label, highlight = false }: { value: string | number; label: string; highlight?: boolean }) {
  return (
    <div className={`flex min-h-[132px] flex-col justify-between p-5 ${highlight ? "surface-raised" : "surface"}`}>
      <CheckerMark className="self-end text-foreground/60" />
      <div>
        <div className="display border-b border-border pb-2 text-3xl text-foreground">{value}</div>
        <p className="mt-2 text-xs leading-relaxed text-muted">{label}</p>
      </div>
    </div>
  );
}
