import { CaptureBox } from "@/components/inbox/CaptureBox";
import { Button, Card, NoteLink, TypeBadge, timeAgo } from "@/components/ui";
import { requireWorkspace } from "@/lib/workspace";
import { resolveReviewItemAction, reviewLinkAction, setStageAction } from "../actions";

export const metadata = { title: "Inbox — JARVIS" };

type Rel = { id: string; title: string; type: string } | null;

export default async function InboxPage() {
  const { supabase, workspaceId } = await requireWorkspace();
  const [{ data: sources }, { data: seeds }, { data: links }, { data: items }] = await Promise.all([
    supabase
      .from("sources")
      .select("id, channel, kind, raw_text, status, error, captured_at")
      .eq("workspace_id", workspaceId)
      .order("captured_at", { ascending: false })
      .limit(8),
    supabase
      .from("notes")
      .select("id, type, title, summary, created_at")
      .eq("workspace_id", workspaceId)
      .eq("stage", "semente")
      .order("created_at", { ascending: false })
      .limit(30),
    supabase
      .from("links")
      .select("id, relation, rationale, confidence, origin, from:notes!links_from_note_fkey(id, title, type), to:notes!links_to_note_fkey(id, title, type)")
      .eq("workspace_id", workspaceId)
      .eq("status", "suggested")
      .order("created_at", { ascending: false })
      .limit(30),
    supabase
      .from("review_items")
      .select("id, kind, payload, note_id, created_at")
      .eq("workspace_id", workspaceId)
      .eq("status", "open")
      .order("created_at", { ascending: false })
      .limit(30),
  ]);

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-8">
      <header>
        <h1 className="text-2xl font-bold">Inbox</h1>
        <p className="text-sm text-muted">Capture, revise as sementes e aprove as conexões sugeridas pela IA.</p>
      </header>

      <Card title="Captura rápida">
        <CaptureBox />
        {!!sources?.length && (
          <ul className="mt-4 space-y-1 border-t border-border pt-3 text-xs text-muted">
            {sources.map((s) => (
              <li key={s.id} className="flex items-center gap-2">
                <span className={s.status === "done" ? "text-green-400" : s.status === "error" ? "text-red-400" : "text-yellow-400"}>●</span>
                <span className="w-16 shrink-0">{s.channel}</span>
                <span className="w-12 shrink-0">{s.kind}</span>
                <span className="truncate">{s.error ?? s.raw_text ?? "(arquivo)"}</span>
                <span className="ml-auto shrink-0">{timeAgo(s.captured_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {!!items?.length && (
        <Card title={`Decisões pendentes (${items.length})`}>
          <ul className="divide-y divide-border">
            {items.map((it) => {
              const p = it.payload as Record<string, unknown>;
              const text =
                it.kind === "entity_match"
                  ? `"${p.candidate_title}" parece ser a mesma entidade de uma nota nova. Fundir?`
                  : it.kind === "duplicate"
                    ? `"${p.merge_title}" parece duplicata de "${p.keep_title}". Fundir?`
                    : it.kind === "moc_proposal"
                      ? `Cluster de ${p.size} notas em torno de "${p.hub_title}" sem MOC. Criar um MOC?`
                      : it.kind === "orphan"
                        ? `"${p.title}" está órfã (sem conexões).`
                        : JSON.stringify(p);
              return (
                <li key={it.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                  <span className="flex-1">{text}</span>
                  {it.note_id && (
                    <a className="text-xs text-accent" href={`/notes/${it.note_id}`}>
                      abrir
                    </a>
                  )}
                  {it.kind !== "orphan" && (
                    <form action={resolveReviewItemAction.bind(null, it.id, "accept")}>
                      <Button variant="primary">Sim</Button>
                    </form>
                  )}
                  <form action={resolveReviewItemAction.bind(null, it.id, "dismiss")}>
                    <Button variant="ghost">Dispensar</Button>
                  </form>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <Card title={`Conexões sugeridas (${links?.length ?? 0})`}>
        {!links?.length && <p className="text-sm text-muted">Nenhuma sugestão pendente.</p>}
        <ul className="divide-y divide-border">
          {(links ?? []).map((l) => {
            const from = l.from as unknown as Rel;
            const to = l.to as unknown as Rel;
            if (!from || !to) return null;
            return (
              <li key={l.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                <NoteLink {...from} />
                <span className="text-xs text-muted">— {l.relation} →</span>
                <NoteLink {...to} />
                {l.confidence != null && <span className="text-xs text-muted">({Math.round(l.confidence * 100)}%)</span>}
                {l.rationale && <p className="w-full text-xs italic text-muted">{l.rationale}</p>}
                <div className="ml-auto flex gap-1">
                  <form action={reviewLinkAction.bind(null, l.id, "accepted")}>
                    <Button variant="primary">Aceitar</Button>
                  </form>
                  <form action={reviewLinkAction.bind(null, l.id, "rejected")}>
                    <Button variant="ghost">Rejeitar</Button>
                  </form>
                </div>
              </li>
            );
          })}
        </ul>
      </Card>

      <Card title={`Sementes para revisar (${seeds?.length ?? 0})`}>
        {!seeds?.length && <p className="text-sm text-muted">Tudo revisado. 🌿</p>}
        <ul className="divide-y divide-border">
          {(seeds ?? []).map((n) => (
            <li key={n.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
              <TypeBadge type={n.type} />
              <NoteLink id={n.id} title={n.title} />
              <span className="text-xs text-muted">{timeAgo(n.created_at)}</span>
              {n.summary && <p className="w-full text-xs text-muted">{n.summary}</p>}
              <form action={setStageAction.bind(null, n.id, "broto")} className="ml-auto">
                <Button>🌿 Revisada</Button>
              </form>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
