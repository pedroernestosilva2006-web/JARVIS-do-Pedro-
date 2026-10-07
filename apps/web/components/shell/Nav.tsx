"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { IconFiles, IconGraph, IconInbox, IconMore, IconNotes, IconPlus, IconSettings, IconSpark, IconTimeline } from "@/components/icons";
import { emit } from "@/lib/ui-events";

type Item = { href: string; label: string; icon: React.ReactNode; match?: (p: string) => boolean };

const ITEMS: Item[] = [
  { href: "/graph", label: "Cérebro", icon: <IconGraph /> },
  { href: "/notes", label: "Notas", icon: <IconNotes /> },
  { href: "/timeline", label: "Timeline", icon: <IconTimeline /> },
  { href: "/files", label: "Arquivos", icon: <IconFiles /> },
];

const isActive = (path: string, href: string) => path === href || path.startsWith(`${href}/`);

function Tip({ children }: { children: React.ReactNode }) {
  return (
    <span
      role="tooltip"
      className="pointer-events-none absolute left-full top-1/2 z-50 ml-2 -translate-y-1/2 whitespace-nowrap rounded-md border border-border bg-surface-2 px-2.5 py-1 text-sm text-foreground opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100"
    >
      {children}
    </span>
  );
}

function RailButton({ label, onClick, children, active, badge }: { label: string; onClick: () => void; children: React.ReactNode; active?: boolean; badge?: number }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className={`group relative flex h-10 w-10 items-center justify-center rounded-lg ${active ? "bg-accent-soft text-foreground" : "text-muted hover:bg-surface-2 hover:text-foreground"}`}
    >
      {children}
      {!!badge && (
        <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-semibold text-on-accent">
          {badge > 99 ? "99+" : badge}
        </span>
      )}
      <Tip>{label}</Tip>
    </button>
  );
}

function RailLink({ href, label, icon, active }: { href: string; label: string; icon: React.ReactNode; active: boolean }) {
  return (
    <Link
      href={href}
      aria-label={label}
      aria-current={active ? "page" : undefined}
      className={`group relative flex h-10 w-10 items-center justify-center rounded-lg ${active ? "bg-accent-soft text-foreground" : "text-muted hover:bg-surface-2 hover:text-foreground"}`}
    >
      {active && <span className="absolute -left-[9px] h-5 w-[3px] rounded-r bg-accent" />}
      {icon}
      <Tip>{label}</Tip>
    </Link>
  );
}

/** Rail fino de ícones (desktop) e barra de abas inferior (celular). */
export function Nav({ reviewCount }: { reviewCount: number }) {
  const path = usePathname();
  const [more, setMore] = useState(false);
  // Fecha o menu "Mais" ao trocar de tela
  const [prevPath, setPrevPath] = useState(path);
  if (path !== prevPath) {
    setPrevPath(path);
    setMore(false);
  }

  return (
    <>
      {/* Desktop */}
      <nav aria-label="Principal" className="hidden w-14 shrink-0 flex-col items-center gap-1 border-r border-border bg-background py-3 md:flex">
        <Link href="/graph" aria-label="JARVIS — início" className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg text-accent-text hover:bg-surface-2">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
            <circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" />
            <ellipse cx="12" cy="12" rx="9" ry="4" transform="rotate(-25 12 12)" />
            <circle cx="19" cy="7.5" r="1.2" fill="currentColor" stroke="none" />
          </svg>
        </Link>
        <button
          onClick={() => emit("jarvis:palette")}
          aria-label="Adicionar ou buscar (Ctrl+K)"
          className="group relative mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-accent text-on-accent hover:bg-[#9d82f2]"
        >
          <IconPlus />
          <Tip>
            Adicionar ou buscar <span className="kbd ml-1">Ctrl K</span>
          </Tip>
        </button>
        {ITEMS.map((it) => (
          <RailLink key={it.href} href={it.href} label={it.label} icon={it.icon} active={isActive(path, it.href)} />
        ))}
        <RailButton label="Jarvis — chat rápido (J)" onClick={() => emit("jarvis:dock")} active={path.startsWith("/chat")}>
          <IconSpark />
        </RailButton>
        <div className="mt-auto flex flex-col items-center gap-1">
          <RailButton label={reviewCount ? `Revisar (${reviewCount})` : "Revisar"} onClick={() => emit("jarvis:review")} badge={reviewCount}>
            <IconInbox />
          </RailButton>
          <RailLink href="/settings" label="Ajustes" icon={<IconSettings />} active={isActive(path, "/settings")} />
        </div>
      </nav>

      {/* Celular */}
      <nav aria-label="Principal" className="fixed inset-x-0 bottom-0 z-40 flex h-14 items-stretch border-t border-border bg-background pb-[env(safe-area-inset-bottom)] md:hidden">
        <TabLink href="/graph" label="Cérebro" icon={<IconGraph />} active={isActive(path, "/graph")} />
        <TabLink href="/notes" label="Notas" icon={<IconNotes />} active={isActive(path, "/notes")} />
        <button onClick={() => emit("jarvis:palette")} aria-label="Adicionar" className="flex flex-1 items-center justify-center">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-accent text-on-accent">
            <IconPlus />
          </span>
        </button>
        <TabLink href="/files" label="Arquivos" icon={<IconFiles />} active={isActive(path, "/files")} />
        <button onClick={() => emit("jarvis:dock")} className={`flex flex-1 flex-col items-center justify-center gap-0.5 text-[11px] ${path.startsWith("/chat") ? "text-foreground" : "text-muted"}`}>
          <IconSpark />
          Jarvis
        </button>
        <button onClick={() => setMore((v) => !v)} aria-expanded={more} className={`relative flex flex-1 flex-col items-center justify-center gap-0.5 text-[11px] ${more ? "text-foreground" : "text-muted"}`}>
          <IconMore />
          Mais
          {!!reviewCount && <span className="absolute right-[22%] top-1.5 h-2 w-2 rounded-full bg-accent" />}
        </button>
      </nav>
      {more && (
        <div className="fixed inset-0 z-30 md:hidden" onClick={() => setMore(false)}>
          <div className="slide-in-up absolute inset-x-3 bottom-[4.25rem] rounded-xl border border-border bg-surface-2 p-2 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <MoreLink href="/timeline" label="Timeline" icon={<IconTimeline />} />
            <button onClick={() => { setMore(false); emit("jarvis:review"); }} className="row-hover flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-base">
              <IconInbox /> Revisar {reviewCount ? `(${reviewCount})` : ""}
            </button>
            <MoreLink href="/settings" label="Ajustes" icon={<IconSettings />} />
          </div>
        </div>
      )}
    </>
  );
}

function TabLink({ href, label, icon, active }: { href: string; label: string; icon: React.ReactNode; active: boolean }) {
  return (
    <Link href={href} aria-current={active ? "page" : undefined} className={`flex flex-1 flex-col items-center justify-center gap-0.5 text-[11px] ${active ? "text-foreground" : "text-muted"}`}>
      <span className={active ? "text-accent-text" : ""}>{icon}</span>
      {label}
    </Link>
  );
}

function MoreLink({ href, label, icon }: { href: string; label: string; icon: React.ReactNode }) {
  return (
    <Link href={href} className="row-hover flex items-center gap-3 rounded-lg px-3 py-3 text-base">
      {icon} {label}
    </Link>
  );
}
