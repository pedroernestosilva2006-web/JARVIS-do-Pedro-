import Link from "next/link";
import { TYPE_LABELS, TYPE_TONES, isNoteType } from "@jarvis/core";

function tone(type?: string) {
  return type && isNoteType(type) ? TYPE_TONES[type] : "#808080";
}

export function TypeBadge({ type }: { type: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-2 py-0.5 text-[10.5px] uppercase tracking-[0.14em] text-muted">
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: tone(type) }} />
      {isNoteType(type) ? TYPE_LABELS[type] : type}
    </span>
  );
}

export function StageBadge({ stage }: { stage: string }) {
  const filled = stage === "perene" ? 3 : stage === "broto" ? 2 : 1;
  return (
    <span className="inline-flex items-center gap-1.5 text-[10.5px] uppercase tracking-[0.14em] text-muted" title={`estágio: ${stage}`}>
      <span className="flex gap-0.5">
        {[1, 2, 3].map((i) => (
          <span key={i} className={`h-1.5 w-1.5 ${i <= filled ? "bg-foreground" : "bg-border-strong"}`} />
        ))}
      </span>
      {stage}
    </span>
  );
}

export function NoteLink({ id, title, type }: { id: string; title: string; type?: string }) {
  return (
    <Link href={`/notes/${id}`} className="group inline-flex items-center gap-2 text-foreground">
      {type && <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: tone(type) }} />}
      <span className="underline decoration-transparent underline-offset-4 transition group-hover:decoration-[var(--signal)]">{title}</span>
    </Link>
  );
}

export function Card({ title, children, actions }: { title?: string; children: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <section className="surface rounded-sm p-5">
      {(title || actions) && (
        <div className="mb-4 flex items-center justify-between gap-2 border-b border-border pb-3">
          {title && <h2 className="kicker">{title}</h2>}
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
    default: "btn-outline px-3 py-1.5",
    primary: "btn-primary px-3.5 py-1.5",
    danger: "btn-outline px-3 py-1.5 !border-[var(--signal)]/50 !text-[var(--signal)]",
    ghost: "px-2 py-1 text-[11px] uppercase tracking-[0.14em] text-muted hover:text-foreground",
  }[variant];
  return (
    <button {...props} className={`disabled:opacity-50 ${styles} ${props.className ?? ""}`}>
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
