import Link from "next/link";
import { notFound } from "next/navigation";
import { NoteEditor } from "@/components/notes/NoteEditor";
import { Button, Card, NoteLink, StageBadge, TypeBadge, timeAgo } from "@/components/ui";
import { renderMarkdown } from "@/lib/markdown";
import { requireWorkspace } from "@/lib/workspace";
import { linkToRelatedAction } from "../../actions";

type Rel = { id: string; title: string; type: string } | null;

export default async function NotePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ edit?: string }>;
}) {
  const [{ id }, { edit }] = await Promise.all([params, searchParams]);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { supabase, workspaceId } = await requireWorkspace();

  const [{ data: note }, { data: outgoing }, { data: incoming }, { data: sources }, { data: related }] = await Promise.all([
    supabase.from("notes").select("*").eq("id", id).eq("workspace_id", workspaceId).maybeSingle(),
    supabase
      .from("links")
      .select("id, relation, status, rationale, origin, to:notes!links_to_note_fkey(id, title, type)")
      .eq("workspace_id", workspaceId)
      .eq("from_note", id)
      .neq("status", "rejected"),
    supabase
      .from("links")
      .select("id, relation, status, rationale, origin, from:notes!links_from_note_fkey(id, title, type)")
      .eq("workspace_id", workspaceId)
      .eq("to_note", id)
      .neq("status", "rejected"),
    supabase
      .from("note_sources")
      .select("excerpt, source:sources(id, channel, kind, captured_at, url)")
      .eq("workspace_id", workspaceId)
      .eq("note_id", id),
    supabase.rpc("related_notes", { p_workspace: workspaceId, p_note: id, match_count: 6 }),
  ]);
  if (!note) notFound();

  const props = Object.entries((note.properties ?? {}) as Record<string, unknown>);

  return (
    <div className="mx-auto grid max-w-6xl gap-8 px-4 py-6 md:grid-cols-[1fr_300px] md:px-10 md:py-10">
      <article className="min-w-0 space-y-5">
        <div className="kicker flex items-center gap-3">
          <span>02 — Nota</span>
          <span className="h-px flex-1 bg-border" />
          <Link href="/notes" className="hover:text-foreground">Todas as notas</Link>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <TypeBadge type={note.type} />
          <StageBadge stage={note.stage} />
          <span className="text-xs text-muted">
            {note.created_by === "ai" ? "criada pela IA" : "criada por você"} · {timeAgo(note.created_at)}
          </span>
          <Link href={`/graph?focus=${note.id}`} className="btn-outline ml-auto px-3 py-1">
            Ver no grafo
          </Link>
        </div>
        {props.length > 0 && (
          <dl className="surface grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 rounded-sm p-4 text-sm">
            {props.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="kicker self-center">{k}</dt>
                <dd>{String(v)}</dd>
              </div>
            ))}
          </dl>
        )}
        <NoteEditor note={note} renderedHtml={renderMarkdown(note.content_md ?? "")} startEditing={edit === "1"} />

        {!!sources?.length && (
          <Card title="Fontes (proveniência)">
            <ul className="space-y-2 text-sm">
              {sources.map((s, i) => {
                const src = s.source as unknown as { channel: string; kind: string; captured_at: string; url: string | null } | null;
                return (
                  <li key={i}>
                    {s.excerpt && <blockquote className="border-l border-foreground pl-3 italic text-muted">“{s.excerpt}”</blockquote>}
                    {src && (
                      <p className="mt-1 text-xs text-muted">
                        {src.kind} via {src.channel} · {timeAgo(src.captured_at)}
                        {src.url && (
                          <>
                            {" · "}
                            <a href={src.url} target="_blank" rel="noopener noreferrer" className="underline">
                              link
                            </a>
                          </>
                        )}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          </Card>
        )}
      </article>

      <aside className="space-y-4">
        <Card title={`Backlinks (${incoming?.length ?? 0})`}>
          <ul className="space-y-1.5 text-sm">
            {(incoming ?? []).map((l) => {
              const from = l.from as unknown as Rel;
              return from ? (
                <li key={l.id} className={l.status === "suggested" ? "opacity-60" : ""} title={l.rationale ?? undefined}>
                  <NoteLink {...from} /> <span className="text-xs text-muted">{l.relation}</span>
                </li>
              ) : null;
            })}
          </ul>
        </Card>
        <Card title={`Links (${outgoing?.length ?? 0})`}>
          <ul className="space-y-1.5 text-sm">
            {(outgoing ?? []).map((l) => {
              const to = l.to as unknown as Rel;
              return to ? (
                <li key={l.id} className={l.status === "suggested" ? "opacity-60" : ""} title={l.rationale ?? undefined}>
                  <span className="text-xs text-muted">{l.relation}</span> <NoteLink {...to} />
                </li>
              ) : null;
            })}
          </ul>
        </Card>
        <Card title="Relacionadas (semântica)">
          {!related?.length && <p className="text-xs text-muted">Aparece quando a nota tiver embedding.</p>}
          <ul className="space-y-1.5 text-sm">
            {(related ?? []).map((r: { id: string; title: string; type: string; similarity: number; linked: boolean }) => (
              <li key={r.id} className="flex items-center gap-2">
                <NoteLink id={r.id} title={r.title} type={r.type} />
                <span className="text-xs text-muted">{Math.round(r.similarity * 100)}%</span>
                {!r.linked && (
                  <form action={linkToRelatedAction.bind(null, note.id, r.id)} className="ml-auto">
                    <Button variant="ghost" title="Conectar">
                      ＋
                    </Button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        </Card>
      </aside>
    </div>
  );
}
