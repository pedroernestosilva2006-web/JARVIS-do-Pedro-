import { PageHeader } from "@/components/brand/motifs";
import { Card, NoteLink, TypeBadge } from "@/components/ui";
import { daysAgoIso, daysFromNowIso } from "@/lib/dates";
import { requireWorkspace } from "@/lib/workspace";

export const metadata = { title: "Timeline — JARVIS" };

/** Visão "Calendar" do LYT: eventos e diário por mês, com quantos insights cada um gerou. */
export default async function TimelinePage({ searchParams }: { searchParams: Promise<{ all?: string }> }) {
  const { all } = await searchParams;
  const { supabase, workspaceId } = await requireWorkspace();
  const { data } = await supabase.rpc("timeline", {
    p_workspace: workspaceId,
    p_from: daysAgoIso(365),
    p_to: daysFromNowIso(365),
    p_types: all ? null : ["evento", "diario", "livro", "projeto"],
  });
  const items = (data ?? []) as { id: string; type: string; title: string; summary: string | null; happened_at: string; note_count: number }[];
  const byMonth = new Map<string, typeof items>();
  for (const it of items) {
    const key = new Date(it.happened_at).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
    byMonth.set(key, [...(byMonth.get(key) ?? []), it]);
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-6 md:px-10 md:py-10">
      <PageHeader
        index="05 — Timeline"
        section="Calendar"
        title="Ao longo do tempo"
        subtitle="Eventos, leituras e projetos, mês a mês, com quantos aprendizados cada um gerou."
        actions={
          <a href={all ? "/timeline" : "/timeline?all=1"} className="btn-outline px-4 py-2">
            {all ? "Só eventos, livros e projetos" : "Mostrar tudo"}
          </a>
        }
      />
      {!items.length && <p className="text-sm text-muted">Nada no último ano ainda. Use /evento no Telegram durante seu próximo evento.</p>}
      {[...byMonth].map(([month, list]) => (
        <Card key={month} title={month}>
          <ul className="space-y-2">
            {list.map((it) => (
              <li key={it.id} className="flex flex-wrap items-center gap-2 text-sm">
                <span className="w-12 shrink-0 text-xs text-muted">{new Date(it.happened_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}</span>
                <TypeBadge type={it.type} />
                <NoteLink id={it.id} title={it.title} />
                {it.note_count > 0 && <span className="text-xs text-muted">· {it.note_count} aprendizados</span>}
              </li>
            ))}
          </ul>
        </Card>
      ))}
    </div>
  );
}
