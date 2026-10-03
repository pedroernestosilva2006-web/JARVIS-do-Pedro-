import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/** Usuário logado + workspace pessoal (criado no primeiro acesso). Redireciona ao login se não houver sessão. */
export const requireWorkspace = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: workspaceId, error } = await supabase.rpc("bootstrap_workspace", {
    p_name: "Meu cérebro",
  });
  if (error || !workspaceId) throw new Error(`Falha ao carregar workspace: ${error?.message}`);
  return { supabase, user, workspaceId: workspaceId as string };
});
