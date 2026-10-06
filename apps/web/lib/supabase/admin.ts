import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

/**
 * Cliente service_role — IGNORA RLS. Só para workers/webhooks no servidor.
 * Regra: toda query feita com ele DEVE filtrar por workspace_id explicitamente.
 */
let admin: SupabaseClient | null = null;

export function createAdminClient(): SupabaseClient {
  admin ??= createClient(env.supabaseUrl(), env.supabaseSecretKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return admin;
}
