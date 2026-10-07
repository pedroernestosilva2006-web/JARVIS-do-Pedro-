"use client";

import { useState } from "react";
import { NOTE_TYPES, TYPE_LABELS, type NoteType } from "@jarvis/core";
import { IconChevron, IconClose, IconSliders } from "@/components/icons";
import { typeColor } from "@/components/ui";
import { DEFAULT_SETTINGS, GROUP_COLORS, type GraphSettings } from "./graph-settings";

function Section({ title, open, onToggle, children }: { title: string; open: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <section className="border-b border-border last:border-b-0">
      <h3>
        <button onClick={onToggle} aria-expanded={open} className="flex w-full items-center gap-2 px-4 py-3 text-left text-[0.95rem] font-semibold hover:bg-surface-2">
          <IconChevron width={16} height={16} className={`transition-transform duration-150 ${open ? "rotate-90" : ""}`} />
          {title}
        </button>
      </h3>
      {open && <div className="space-y-3.5 px-4 pb-4">{children}</div>}
    </section>
  );
}

function Switch({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span>{label}</span>
      <button
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 shrink-0 rounded-full border ${checked ? "border-accent bg-accent" : "border-border-strong bg-surface-2"}`}
      >
        <span className={`absolute top-0.5 h-4.5 w-4.5 rounded-full ${checked ? "left-[22px] bg-on-accent" : "left-0.5 bg-[#bbb]"} transition-all duration-150`} style={{ width: 18, height: 18 }} />
      </button>
    </div>
  );
}

function Slider({ label, value, min = 0, max = 1, step = 0.05, onChange }: { label: string; value: number; min?: number; max?: number; step?: number; onChange: (v: number) => void }) {
  return (
    <label className="block text-sm">
      <span className="block">{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="mt-1 w-full" />
    </label>
  );
}

/**
 * Painel de configurações do grafo, igual ao do Obsidian: flutuante, recolhível, com quatro seções
 * sanfona — Filtros, Grupos, Exibição e Forças.
 */
export function GraphSettingsPanel({
  settings,
  onChange,
  onClose,
  typeCounts,
  allTags,
  onAnimate,
  animating,
  onReheat,
}: {
  settings: GraphSettings;
  onChange: (patch: Partial<GraphSettings>) => void;
  onClose: () => void;
  typeCounts: Map<string, number>;
  allTags: [string, number][];
  onAnimate: () => void;
  animating: boolean;
  onReheat: () => void;
}) {
  const [open, setOpen] = useState<Record<string, boolean>>({ filtros: true, grupos: false, exibicao: false, forcas: false });
  const toggle = (k: string) => setOpen((o) => ({ ...o, [k]: !o[k] }));

  return (
    <div role="region" aria-label="Configurações do grafo" className="slide-in-right flex min-h-0 max-h-full flex-col overflow-hidden rounded-xl border border-border-strong bg-surface shadow-2xl">
      <header className="flex items-center gap-1 border-b border-border px-3 py-2">
        <IconSliders width={18} height={18} className="ml-1 text-muted" />
        <h2 className="ml-1 mr-auto text-[0.95rem] font-semibold">Configurações</h2>
        <button onClick={() => onChange(DEFAULT_SETTINGS)} className="btn-ghost !py-1" aria-label="Restaurar padrões">
          Restaurar
        </button>
        <button onClick={onClose} aria-label="Recolher configurações" className="btn-ghost !p-1.5">
          <IconClose width={18} height={18} />
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <Section title="Filtros" open={open.filtros!} onToggle={() => toggle("filtros")}>
          <label className="block">
            <span className="sr-only">Buscar nos nós</span>
            <input value={settings.search} onChange={(e) => onChange({ search: e.target.value })} placeholder="Buscar nos nós…" className="field !py-1.5 text-sm" />
            <span className="mt-1 block text-xs text-muted">Aceita tipo:pessoa · tag:vendas · #ia</span>
          </label>
          <div>
            <p className="label mb-1">Tipos</p>
            <ul className="space-y-0.5">
              {NOTE_TYPES.filter((t) => typeCounts.has(t)).map((t) => (
                <li key={t}>
                  <label className="row-hover flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm">
                    <input
                      type="checkbox"
                      checked={!settings.hiddenTypes.includes(t)}
                      onChange={() => onChange({ hiddenTypes: settings.hiddenTypes.includes(t) ? settings.hiddenTypes.filter((x) => x !== t) : [...settings.hiddenTypes, t as NoteType] })}
                    />
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: typeColor(t) }} />
                    {TYPE_LABELS[t]}
                    <span className="ml-auto text-xs text-muted">{typeCounts.get(t)}</span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
          {allTags.length > 0 && (
            <div>
              <p className="label mb-1">Tags {settings.tags.length > 0 && <button className="ml-1 text-accent-text underline" onClick={() => onChange({ tags: [] })}>limpar</button>}</p>
              <div className="flex flex-wrap gap-1.5">
                {allTags.slice(0, 24).map(([t, n]) => (
                  <button key={t} className="chip !py-0.5 text-xs" aria-pressed={settings.tags.includes(t)} onClick={() => onChange({ tags: settings.tags.includes(t) ? settings.tags.filter((x) => x !== t) : [...settings.tags, t] })}>
                    #{t} <span className="text-muted">{n}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          <Switch label="Mostrar notas órfãs" checked={settings.showOrphans} onChange={(v) => onChange({ showOrphans: v })} />
          <Switch label="Sugestões da IA" checked={settings.showSuggested} onChange={(v) => onChange({ showSuggested: v })} />
          <label className="block text-sm">
            <span className="block">Período de criação</span>
            <select value={settings.period} onChange={(e) => onChange({ period: e.target.value as GraphSettings["period"] })} className="field mt-1 !py-1.5 text-sm">
              <option value="all">Todo o período</option>
              <option value="7">Últimos 7 dias</option>
              <option value="30">Últimos 30 dias</option>
              <option value="90">Últimos 90 dias</option>
              <option value="365">Último ano</option>
            </select>
          </label>
        </Section>

        <Section title="Grupos" open={open.grupos!} onToggle={() => toggle("grupos")}>
          <p className="text-xs text-muted">Pinte nós por consulta. O primeiro grupo que casar vence. Ex.: tipo:pessoa · tag:vendas · trecho do título.</p>
          <ul className="space-y-2">
            {settings.groups.map((g) => (
              <li key={g.id} className="flex items-center gap-2">
                <input
                  type="color"
                  value={g.color}
                  aria-label="Cor do grupo"
                  onChange={(e) => onChange({ groups: settings.groups.map((x) => (x.id === g.id ? { ...x, color: e.target.value } : x)) })}
                  className="h-8 w-9 shrink-0 cursor-pointer rounded border border-border bg-transparent p-0.5"
                />
                <input
                  value={g.query}
                  aria-label="Consulta do grupo"
                  placeholder="tipo:pessoa"
                  onChange={(e) => onChange({ groups: settings.groups.map((x) => (x.id === g.id ? { ...x, query: e.target.value } : x)) })}
                  className="field !py-1.5 text-sm"
                />
                <button onClick={() => onChange({ groups: settings.groups.filter((x) => x.id !== g.id) })} aria-label="Remover grupo" className="btn-ghost !p-1.5">
                  <IconClose width={16} height={16} />
                </button>
              </li>
            ))}
          </ul>
          <button
            className="btn-outline w-full"
            onClick={() => onChange({ groups: [...settings.groups, { id: Math.random().toString(36).slice(2, 9), query: "", color: GROUP_COLORS[settings.groups.length % GROUP_COLORS.length]! }] })}
          >
            + Novo grupo
          </button>
        </Section>

        <Section title="Exibição" open={open.exibicao!} onToggle={() => toggle("exibicao")}>
          <Switch label="Setas" checked={settings.arrows} onChange={(v) => onChange({ arrows: v })} />
          <Slider label="Fade dos rótulos" value={settings.labelFade} onChange={(v) => onChange({ labelFade: v })} />
          <Slider label="Tamanho dos nós" value={settings.nodeSize} min={0.4} max={2.5} step={0.1} onChange={(v) => onChange({ nodeSize: v })} />
          <Slider label="Espessura das linhas" value={settings.linkWidth} min={0.5} max={4} step={0.25} onChange={(v) => onChange({ linkWidth: v })} />
          <button className="btn-primary w-full" onClick={onAnimate} disabled={animating}>
            {animating ? "Animando…" : "▶ Animar (ver crescer)"}
          </button>
        </Section>

        <Section title="Forças" open={open.forcas!} onToggle={() => toggle("forcas")}>
          <Slider label="Força central" value={settings.center} onChange={(v) => onChange({ center: v })} />
          <Slider label="Força de repulsão" value={settings.repel} onChange={(v) => onChange({ repel: v })} />
          <Slider label="Força dos links" value={settings.linkForce} onChange={(v) => onChange({ linkForce: v })} />
          <Slider label="Distância dos links" value={settings.linkDistance} onChange={(v) => onChange({ linkDistance: v })} />
          <button className="btn-outline w-full" onClick={onReheat}>
            Reorganizar
          </button>
        </Section>
      </div>
    </div>
  );
}
