import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { connection } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * Contexto de acesso do app: quem está usando e em qual workspace.
 *
 * MODO INTERNO (padrão enquanto o JARVIS é de uso pessoal): sem tela de login. O app age como o
 * dono — `JARVIS_OWNER_EMAIL` ou, se não definido, o usuário mais antigo do Supabase — usando o
 * cliente de serviço, e TODA consulta já filtra por workspace_id.
 * Para voltar a exigir login (obrigatório antes de abrir para outras pessoas), defina
 * JARVIS_REQUIRE_LOGIN=1.
 */
export function loginRequired(): boolean {
  return process.env.JARVIS_REQUIRE_LOGIN === "1";
}

export interface AppContext {
  /** Cliente a usar nas consultas (sessão do usuário com RLS, ou serviço no modo interno). */
  db: SupabaseClient;
  workspaceId: string;
  user: { id: string; email: string | null };
  /** true quando entrou pelo modo interno (sem sessão). */
  internal: boolean;
}

let cachedOwner: { userId: string; email: string | null; workspaceId: string; at: number } | null = null;
const OWNER_TTL_MS = 5 * 60_000;

/**
 * Descobre (e cria, se preciso) o usuário e o workspace do dono para o modo interno.
 * Chamadas simultâneas (layout + página + APIs na primeira abertura) compartilham a mesma busca;
 * sem isso cada uma criava o seu próprio workspace.
 */
let inflight: Promise<{ userId: string; email: string | null; workspaceId: string }> | null = null;
export function resolveOwner(): Promise<{ userId: string; email: string | null; workspaceId: string }> {
  if (cachedOwner && Date.now() - cachedOwner.at < OWNER_TTL_MS) return Promise.resolve(cachedOwner);
  inflight ??= loadOwner().finally(() => {
    inflight = null;
  });
  return inflight;
}

async function loadOwner(): Promise<{ userId: string; email: string | null; workspaceId: string }> {
  const admin = createAdminClient();

  const { data: list, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (error) throw new Error(`Não foi possível localizar o dono: ${error.message}`);
  const wanted = process.env.JARVIS_OWNER_EMAIL?.trim().toLowerCase();
  const users = [...list.users].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const owner = wanted ? users.find((u) => u.email?.toLowerCase() === wanted) : users[0];
  if (wanted && !owner) throw new Error(`JARVIS_OWNER_EMAIL (${wanted}) não existe no Supabase Auth.`);

  let workspaceId: string | null = null;
  if (owner) {
    const { data: m } = await admin
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", owner.id)
      .order("created_at")
      .limit(1);
    workspaceId = m?.[0]?.workspace_id ?? null;
  } else {
    const { data: w } = await admin.from("workspaces").select("id").order("created_at").limit(1);
    workspaceId = w?.[0]?.id ?? null;
  }
  if (!workspaceId) {
    const { data: w, error: wErr } = await admin.from("workspaces").insert({ name: "Meu cérebro" }).select("id").single();
    if (wErr || !w) throw new Error(`Falha ao criar workspace: ${wErr?.message}`);
    workspaceId = w.id as string;
    if (owner) await admin.from("workspace_members").insert({ workspace_id: workspaceId, user_id: owner.id, role: "owner" });
  }

  cachedOwner = { userId: owner?.id ?? "owner", email: owner?.email ?? null, workspaceId, at: Date.now() };
  return cachedOwner;
}

/** Contexto atual: sessão logada → RLS; senão, modo interno (se o login não for obrigatório); senão null. */
export async function getAppContext(): Promise<AppContext | null> {
  // Sempre dinâmico: nunca pré-renderizar no build (dados do dono não podem virar HTML estático).
  // Deve vir ANTES do try/catch para o sinal de renderização dinâmica do Next não ser engolido.
  await connection();
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const { data: workspaceId, error } = await supabase.rpc("bootstrap_workspace", {});
      if (!error && workspaceId) {
        return { db: supabase, workspaceId: workspaceId as string, user: { id: user.id, email: user.email ?? null }, internal: false };
      }
    }
  } catch {
    // sem cookies/sessão utilizável: cai para o modo interno
  }
  if (loginRequired()) return null;
  const owner = await resolveOwner();
  return { db: createAdminClient(), workspaceId: owner.workspaceId, user: { id: owner.userId, email: owner.email }, internal: true };
}
