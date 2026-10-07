import { getAppContext } from "@/lib/access";
import { createAdminClient } from "@/lib/supabase/admin";

/** Baixa/abre um arquivo: confere o workspace e redireciona para uma URL assinada de curta duração. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAppContext();
  if (!ctx) return new Response("unauthorized", { status: 401 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("not found", { status: 404 });
  const admin = createAdminClient();
  const { data: att } = await admin
    .from("attachments")
    .select("storage_path, file_name")
    .eq("id", id)
    .eq("workspace_id", ctx.workspaceId)
    .maybeSingle();
  if (!att) return new Response("not found", { status: 404 });
  const inline = new URL(req.url).searchParams.get("inline") === "1";
  const { data, error } = await admin.storage
    .from("captures")
    .createSignedUrl(att.storage_path, 120, inline ? undefined : { download: att.file_name });
  if (error || !data) return new Response("Arquivo indisponível", { status: 404 });
  return Response.redirect(data.signedUrl, 302);
}
