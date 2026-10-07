import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getAppContext } from "@/lib/access";
import { MAX_FILE_BYTES, safeStorageName } from "@/lib/files/rules";
import { createAdminClient } from "@/lib/supabase/admin";

const Body = z.object({
  fileName: z.string().min(1).max(255),
  mimeType: z.string().max(200).optional(),
  size: z.number().int().min(0),
});

/**
 * Passo 1 do upload: devolve uma URL assinada para o navegador enviar o arquivo DIRETO ao Storage
 * (a Vercel limita o corpo das requisições a ~4,5 MB, então o arquivo não passa por aqui).
 * O caminho sempre fica dentro da pasta do workspace.
 */
export async function POST(req: Request) {
  const ctx = await getAppContext();
  if (!ctx) return new Response("unauthorized", { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Dados inválidos." }, { status: 400 });
  const { fileName, size } = parsed.data;
  if (size > MAX_FILE_BYTES) {
    return Response.json({ error: `Arquivo acima de ${MAX_FILE_BYTES / 1024 / 1024} MB.` }, { status: 413 });
  }

  const path = `${ctx.workspaceId}/files/${randomUUID()}-${safeStorageName(fileName)}`;
  const { data, error } = await createAdminClient().storage.from("captures").createSignedUploadUrl(path);
  if (error || !data) return Response.json({ error: `Não foi possível preparar o envio: ${error?.message}` }, { status: 500 });
  return Response.json({ path: data.path, token: data.token });
}
