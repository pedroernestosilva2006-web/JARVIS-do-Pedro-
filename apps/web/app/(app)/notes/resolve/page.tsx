import { redirect } from "next/navigation";
import { createNote, findNoteByTitle } from "@/lib/ingest/notes-repo";
import { requireWorkspace } from "@/lib/workspace";

/** Destino dos [[wikilinks]]: abre a nota pelo título (ou cria um stub, como o Obsidian). */
export default async function ResolvePage({ searchParams }: { searchParams: Promise<{ title?: string }> }) {
  const { title } = await searchParams;
  if (!title) redirect("/notes");
  const { supabase, workspaceId } = await requireWorkspace();
  const found = await findNoteByTitle(supabase, workspaceId, title);
  const id = found?.id ?? (await createNote(supabase, workspaceId, { type: "conceito", title })).id;
  redirect(`/notes?sel=${id}`);
}
