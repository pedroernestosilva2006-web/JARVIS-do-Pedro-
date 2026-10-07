import Link from "next/link";
import { TYPE_COLORS, TYPE_LABELS, isNoteType } from "@jarvis/core";

export function typeColor(type?: string) {
  return type && isNoteType(type) ? TYPE_COLORS[type] : "#9aa5b1";
}

export function typeLabel(type: string) {
  return isNoteType(type) ? TYPE_LABELS[type] : type;
}

export function TypeBadge({ type }: { type: string }) {
  return (
    <span className="chip chip-static">
      <span className="h-2 w-2 rounded-full" style={{ background: typeColor(type) }} />
      {typeLabel(type)}
    </span>
  );
}

export function StageBadge({ stage }: { stage: string }) {
  const filled = stage === "perene" ? 3 : stage === "broto" ? 2 : 1;
  return (
    <span className="chip chip-static" title={`Estágio: ${stage}`}>
      <span className="flex gap-0.5" aria-hidden="true">
        {[1, 2, 3].map((i) => (
          <span key={i} className={`h-1.5 w-1.5 rounded-full ${i <= filled ? "bg-accent" : "bg-border-strong"}`} />
        ))}
      </span>
      {stage}
    </span>
  );
}

export function NoteLink({ id, title, type }: { id: string; title: string; type?: string }) {
  return (
    <Link href={`/notes?sel=${id}`} className="group inline-flex items-center gap-2 text-foreground hover:text-accent-text">
      {type && <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: typeColor(type) }} />}
      <span>{title}</span>
    </Link>
  );
}

export function Card({ title, children, actions, id }: { title?: string; children: React.ReactNode; actions?: React.ReactNode; id?: string }) {
  return (
    <section id={id} className="surface rounded-xl p-5">
      {(title || actions) && (
        <div className="mb-4 flex items-center justify-between gap-2">
          {title && <h2 className="text-base font-semibold text-foreground">{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function Button({
  children,
  variant = "default",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "default" | "primary" | "danger" | "ghost" }) {
  const styles = {
    default: "btn-outline",
    primary: "btn-primary",
    danger: "btn-outline !border-danger/50 !text-danger",
    ghost: "btn-ghost",
  }[variant];
  return (
    <button {...props} className={`${styles} ${props.className ?? ""}`}>
      {children}
    </button>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
        {subtitle && <p className="mt-1 max-w-xl text-sm text-muted">{subtitle}</p>}
      </div>
      {actions}
    </header>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden="true" />;
}

/** Linhas de esqueleto para listas enquanto carregam (em vez de tela vazia). */
export function ListSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="space-y-2 p-3" role="status" aria-label="Carregando">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
      <p className="text-base font-medium text-foreground">{title}</p>
      {children && <p className="max-w-sm text-sm text-muted">{children}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function timeAgo(iso: string): string {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "agora";
  if (s < 3600) return `há ${Math.floor(s / 60)} min`;
  if (s < 86400) return `há ${Math.floor(s / 3600)} h`;
  if (s < 86400 * 30) return `há ${Math.floor(s / 86400)} d`;
  return new Date(iso).toLocaleDateString("pt-BR");
}
