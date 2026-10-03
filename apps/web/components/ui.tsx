import Link from "next/link";
import { TYPE_COLORS, TYPE_LABELS, isNoteType } from "@jarvis/core";

export function TypeBadge({ type }: { type: string }) {
  const color = isNoteType(type) ? TYPE_COLORS[type] : "#888";
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-2 py-0.5 text-xs text-muted">
      <span className="h-2 w-2 rounded-full" style={{ background: color }} />
      {isNoteType(type) ? TYPE_LABELS[type] : type}
    </span>
  );
}

export function StageBadge({ stage }: { stage: string }) {
  const icon = stage === "perene" ? "🌳" : stage === "broto" ? "🌿" : "🌱";
  return <span className="text-xs text-muted" title={stage}>{icon} {stage}</span>;
}

export function NoteLink({ id, title, type }: { id: string; title: string; type?: string }) {
  return (
    <Link href={`/notes/${id}`} className="group inline-flex items-center gap-2 hover:text-accent">
      {type && (
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: isNoteType(type) ? TYPE_COLORS[type] : "#888" }} />
      )}
      <span className="group-hover:underline">{title}</span>
    </Link>
  );
}

export function Card({ title, children, actions }: { title?: string; children: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-panel p-4">
      {(title || actions) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          {title && <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">{title}</h2>}
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
    default: "border border-border bg-panel-2 hover:border-accent",
    primary: "bg-accent-2 text-white hover:bg-accent",
    danger: "border border-red-900 text-red-300 hover:bg-red-950",
    ghost: "text-muted hover:text-foreground",
  }[variant];
  return (
    <button {...props} className={`rounded-md px-2.5 py-1 text-sm disabled:opacity-50 ${styles} ${props.className ?? ""}`}>
      {children}
    </button>
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
