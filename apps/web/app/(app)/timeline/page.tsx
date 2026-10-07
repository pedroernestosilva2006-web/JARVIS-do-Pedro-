import Link from "next/link";
import { PageHeader } from "@/components/brand/motifs";
import { Card, NoteLink, TypeBadge } from "@/components/ui";
import { daysAgoIso, daysFromNowIso } from "@/lib/dates";
import { fileTypeLabel, formatBytes } from "@/lib/files/rules";
import { requireWorkspace } from "@/lib/workspace";

export const metadata = { title: "Timeline — JARVIS" };

/** Visão "Calendar" do LYT: eventos e diário por mês, com quantos insights cada um gerou. */
export default async function TimelinePage({
  searchParams,
}: {
  searchParams: Promise<{ only?: string }>;
}) {
  const { only } = await searchParams;
  const { supabase, workspaceId } = await requireWorkspace();
  const [{ data }, { data: files }] = await Promise.all([
    supabase.rpc("timeline", {
      p_workspace: workspaceId,
      p_from: daysAgoIso(365),
      p_to: daysFromNowIso(365),
      p_types: only ? ["evento", "diario", "livro", "projeto"] : null,
    }),
    // Arquivos guardados também entram na linha do tempo (junto com as notas)
    only
      ? Promise.resolve({
          data: [] as {
            id: string;
            file_name: string;
            mime_type: string | null;
            size_bytes: number;
            created_at: string;
          }[],
        })
      : supabase
          .from("attachments")
          .select("id, file_name, mime_type, size_bytes, created_at")
          .eq("workspace_id", workspaceId)
          .gte("created_at", daysAgoIso(365))
          .limit(300),
  ]);
  const items = (data ?? []) as {
    id: string;
    type: string;
    title: string;
    summary: string | null;
    happened_at: string;
    note_count: number;
  }[];
  type Entry =
    | { kind: "note"; at: string; it: (typeof items)[number] }
    | { kind: "file"; at: string; f: NonNullable<typeof files>[number] };
  const entries: Entry[] = [
    ...items.map((it) => ({ kind: "note" as const, at: it.happened_at, it })),
    ...(files ?? []).map((f) => ({
      kind: "file" as const,
      at: f.created_at,
      f,
    })),
  ].sort((a, b) => +new Date(b.at) - +new Date(a.at));
  const byMonth = new Map<string, Entry[]>();
  for (const e of entries) {
    const key = new Date(e.at).toLocaleDateString("pt-BR", {
      month: "long",
      year: "numeric",
    });
    byMonth.set(key, [...(byMonth.get(key) ?? []), e]);
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-6 md:px-10 md:py-10">
      <PageHeader
        index="Timeline"
        section="Calendar"
        title="Ao longo do tempo"
        subtitle="Tudo o que entrou no seu cérebro, mês a mês: notas, eventos, leituras e arquivos."
        actions={
          <Link
            href={only ? "/timeline" : "/timeline?only=1"}
            className="btn-outline px-4 py-2"
          >
            {only ? "Mostrar tudo" : "Só eventos, livros e projetos"}
          </Link>
        }
      />
      {!entries.length && (
        <p className="text-sm text-muted">
          Nada no último ano ainda. Toque em “+ Adicionar” ou use /evento no
          Telegram.
        </p>
      )}
      {[...byMonth].map(([month, list]) => (
        <Card key={month} title={month}>
          <ul className="space-y-2">
            {list.map((e) =>
              e.kind === "note" ? (
                <li
                  key={e.it.id}
                  className="flex flex-wrap items-center gap-2 text-sm"
                >
                  <span className="w-12 shrink-0 text-xs text-muted">
                    {new Date(e.at).toLocaleDateString("pt-BR", {
                      day: "2-digit",
                      month: "2-digit",
                    })}
                  </span>
                  <TypeBadge type={e.it.type} />
                  <NoteLink id={e.it.id} title={e.it.title} />
                  {e.it.note_count > 0 && (
                    <span className="text-xs text-muted">
                      · {e.it.note_count} aprendizados
                    </span>
                  )}
                  <Link
                    href={`/graph?focus=${e.it.id}`}
                    className="ml-auto text-[10.5px] uppercase tracking-[0.14em] text-muted hover:text-foreground"
                  >
                    no cérebro
                  </Link>
                </li>
              ) : (
                <li
                  key={e.f.id}
                  className="flex flex-wrap items-center gap-2 text-sm"
                >
                  <span className="w-12 shrink-0 text-xs text-muted">
                    {new Date(e.at).toLocaleDateString("pt-BR", {
                      day: "2-digit",
                      month: "2-digit",
                    })}
                  </span>
                  <span className="kicker">
                    {fileTypeLabel(e.f.file_name, e.f.mime_type)}
                  </span>
                  <a
                    href={`/api/files/${e.f.id}/download`}
                    className="hover:underline"
                  >
                    {e.f.file_name}
                  </a>
                  <span className="text-xs text-muted">
                    {formatBytes(e.f.size_bytes ?? 0)}
                  </span>
                </li>
              ),
            )}
          </ul>
        </Card>
      ))}
    </div>
  );
}
