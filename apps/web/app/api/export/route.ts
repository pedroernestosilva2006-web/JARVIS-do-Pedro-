import { buildVaultZip } from "@/lib/export/vault";
import { getAppContext } from "@/lib/access";

export const maxDuration = 120;

/** Backup: baixa todas as notas como um vault do Obsidian (.zip). Usa o cliente do usuário (RLS). */
export async function GET() {
  const ctx = await getAppContext();
  if (!ctx) return new Response("unauthorized", { status: 401 });
  const { db: supabase, workspaceId } = ctx;

  const { zip, count } = await buildVaultZip(supabase, workspaceId);
  const date = new Date().toISOString().slice(0, 10);
  return new Response(zip as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="jarvis-${date}.zip"`,
      "X-Notes-Count": String(count),
      "Cache-Control": "no-store",
    },
  });
}
