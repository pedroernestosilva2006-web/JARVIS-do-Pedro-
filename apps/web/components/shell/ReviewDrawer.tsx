"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { IconClose } from "@/components/icons";
import { typeColor, Skeleton } from "@/components/ui";
import { resolveReviewItemAction, reviewLinkAction, setStageAction } from "@/app/(app)/actions";
import { emit, notifyChanged, on } from "@/lib/ui-events";

type Rel = { id: string; title: string; type: string } | null;
interface Review {
  seeds: { id: string; type: string; title: string; summary: string | null }[];
  links: { id: string; relation: string; rationale: string | null; confidence: number | null; from: Rel; to: Rel }[];
  items: { id: string; kind: string; payload: Record<string, unknown>; note_id: string | null }[];
}

function itemText(kind: string, p: Record<string, unknown>) {
  if (kind === "entity_match") return `“${p.candidate_title}” parece ser a mesma entidade de uma nota nova. Fundir?`;
  if (kind === "duplicate") return `“${p.merge_title}” parece duplicata de “${p.keep_title}”. Fundir?`;
  if (kind === "moc_proposal") return `Cluster de ${p.size} notas em torno de “${p.hub_title}” sem mapa (MOC). Criar um?`;
  if (kind === "orphan") return `“${p.title}” está órfã (sem conexões).`;
  return JSON.stringify(p);
}

/** Gaveta "Revisar (N)": sementes, conexões sugeridas pela IA e decisões pendentes — no lugar da antiga Inbox. */
export function ReviewDrawer({ onClosed }: { onClosed?: () => void }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<Review | null>(null);
  const [, start] = useTransition();

  const load = useCallback(() => {
    fetch("/api/review")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setData(d))
      .catch(() => {});
  }, []);

  useEffect(() => on("jarvis:review", () => setOpen(true)), []);
  useEffect(() => {
    if (!open) return;
    load();
    const off = on("jarvis:changed", load);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) {
        setOpen(false);
        onClosed?.();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      off();
      window.removeEventListener("keydown", onKey);
    };
  }, [open, load, onClosed]);

  // Abre sozinha com ?review=1 (link do antigo /inbox)
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("review") === "1") Promise.resolve().then(() => setOpen(true));
  }, []);

  const act = (fn: () => Promise<unknown>) =>
    start(async () => {
      await fn();
      load();
      notifyChanged();
    });

  if (!open) return null;
  const total = data ? data.seeds.length + data.links.length + data.items.length : 0;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50 fade-in" onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}>
      <aside role="dialog" aria-label="Revisar" className="slide-in-right flex h-full w-full max-w-md flex-col border-l border-border bg-surface shadow-2xl">
        <header className="flex items-center gap-2 border-b border-border px-4 py-3">
          <h2 className="text-lg font-semibold">Revisar{data ? ` (${total})` : ""}</h2>
          <button onClick={() => setOpen(false)} aria-label="Fechar" className="btn-ghost ml-auto !p-2">
            <IconClose />
          </button>
        </header>
        <div className="flex-1 space-y-6 overflow-y-auto p-4">
          {!data && (
            <div className="space-y-3" role="status" aria-label="Carregando">
              <Skeleton className="h-16" />
              <Skeleton className="h-16" />
              <Skeleton className="h-16" />
            </div>
          )}
          {data && total === 0 && <p className="py-10 text-center text-sm text-muted">Tudo revisado. Nada pendente por enquanto.</p>}

          {!!data?.items.length && (
            <section>
              <h3 className="mb-2 text-sm font-semibold">Decisões pendentes ({data.items.length})</h3>
              <ul className="space-y-2">
                {data.items.map((it) => (
                  <li key={it.id} className="surface-raised rounded-lg p-3 text-sm">
                    <p>{itemText(it.kind, it.payload)}</p>
                    <div className="mt-2 flex gap-2">
                      {it.kind !== "orphan" && (
                        <button className="btn-primary !py-1" onClick={() => act(() => resolveReviewItemAction(it.id, "accept"))}>
                          Sim
                        </button>
                      )}
                      <button className="btn-outline !py-1" onClick={() => act(() => resolveReviewItemAction(it.id, "dismiss"))}>
                        Dispensar
                      </button>
                      {it.note_id && (
                        <button className="btn-ghost !py-1" onClick={() => { setOpen(false); emit("jarvis:focus", { id: it.note_id }); }}>
                          Ver no grafo
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {!!data?.links.length && (
            <section>
              <h3 className="mb-2 text-sm font-semibold">Conexões sugeridas pela IA ({data.links.length})</h3>
              <ul className="space-y-2">
                {data.links.map((l) =>
                  l.from && l.to ? (
                    <li key={l.id} className="surface-raised rounded-lg p-3 text-sm">
                      <p className="leading-relaxed">
                        <Dot type={l.from.type} /> {l.from.title} <span className="text-muted">— {l.relation.replaceAll("_", " ")} →</span> <Dot type={l.to.type} /> {l.to.title}
                        {l.confidence != null && <span className="ml-1 text-xs text-muted">({Math.round(l.confidence * 100)}%)</span>}
                      </p>
                      {l.rationale && <p className="mt-1 text-xs text-muted">{l.rationale}</p>}
                      <div className="mt-2 flex gap-2">
                        <button className="btn-primary !py-1" onClick={() => act(() => reviewLinkAction(l.id, "accepted"))}>
                          Aceitar
                        </button>
                        <button className="btn-outline !py-1" onClick={() => act(() => reviewLinkAction(l.id, "rejected"))}>
                          Recusar
                        </button>
                      </div>
                    </li>
                  ) : null,
                )}
              </ul>
            </section>
          )}

          {!!data?.seeds.length && (
            <section>
              <h3 className="mb-2 text-sm font-semibold">Sementes para revisar ({data.seeds.length})</h3>
              <ul className="space-y-2">
                {data.seeds.map((n) => (
                  <li key={n.id} className="surface-raised rounded-lg p-3 text-sm">
                    <p className="font-medium">
                      <Dot type={n.type} /> {n.title}
                    </p>
                    {n.summary && <p className="mt-1 text-xs text-muted">{n.summary}</p>}
                    <div className="mt-2 flex gap-2">
                      <button className="btn-primary !py-1" onClick={() => act(() => setStageAction(n.id, "broto"))}>
                        Marcar como revisada
                      </button>
                      <button className="btn-ghost !py-1" onClick={() => { setOpen(false); emit("jarvis:focus", { id: n.id }); }}>
                        Ver no grafo
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </aside>
    </div>
  );
}

function Dot({ type }: { type: string }) {
  return <span className="mr-1 inline-block h-2 w-2 rounded-full align-middle" style={{ background: typeColor(type) }} />;
}
