import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { OnboardingStatus } from "@/components/onboarding/Checklist";
import { aiProvider } from "@/lib/ai/llm";

/** Estado dos "primeiros passos" (sem expor valores de variáveis). */
export async function getOnboardingStatus(db: SupabaseClient, workspaceId: string): Promise<OnboardingStatus> {
  const head = { count: "exact" as const, head: true };
  const [ids, sources, real, demo] = await Promise.all([
    db.from("channel_identities").select("id", head).eq("workspace_id", workspaceId),
    db.from("sources").select("id", head).eq("workspace_id", workspaceId),
    db.from("notes").select("id", head).eq("workspace_id", workspaceId).or("properties->>demo.is.null,properties->>demo.neq.true"),
    db.from("notes").select("id", head).eq("workspace_id", workspaceId).eq("properties->>demo", "true"),
  ]);
  return {
    claudeOk: aiProvider().kind !== "none",
    telegramOk: (ids.count ?? 0) > 0,
    telegramConfigured: !!process.env.TELEGRAM_BOT_TOKEN,
    hasCaptured: (sources.count ?? 0) > 0 || (real.count ?? 0) > 0,
    demoCount: demo.count ?? 0,
  };
}
