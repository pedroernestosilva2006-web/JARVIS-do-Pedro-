import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { getAppContext } from "@/lib/access";

/**
 * Usuário + workspace para as páginas. Com login obrigatório e sem sessão, redireciona para /login;
 * no modo interno (padrão) entra direto como o dono.
 */
export const requireWorkspace = cache(async () => {
  const ctx = await getAppContext();
  if (!ctx) redirect("/login");
  return { supabase: ctx.db, user: ctx.user, workspaceId: ctx.workspaceId, internal: ctx.internal };
});
