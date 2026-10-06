import { buildVaultZip } from "@/lib/export/vault";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 120;

/** Backup: baixa todas as notas como um vault do Obsidian (.zip). Usa o cliente do usuário (RLS). */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("unauthorized", { status: 401 });
  const { data: workspaceId } = await supabase.rpc("bootstrap_workspace", {});
  if (!workspaceId) return new Response("workspace", { status: 500 });

  const { zip, count } = await buildVaultZip(supabase, workspaceId as string);
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
