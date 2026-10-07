import { GraphView } from "@/components/graph/GraphView";
import { getAppContext } from "@/lib/access";
import { aiProvider } from "@/lib/ai/llm";
import { getOnboardingStatus } from "@/lib/onboarding";

export const metadata = { title: "Cérebro — JARVIS" };

export default async function GraphPage({ searchParams }: { searchParams: Promise<{ focus?: string; local?: string }> }) {
  const { focus, local } = await searchParams;
  const ctx = await getAppContext();
  const onboarding = ctx
    ? await getOnboardingStatus(ctx.db, ctx.workspaceId)
    : { claudeOk: false, telegramOk: false, telegramConfigured: false, hasCaptured: false, demoCount: 0 };
  const depth = Number(local);
  return (
    <GraphView
      focusId={focus && /^[0-9a-f-]{36}$/i.test(focus) ? focus : undefined}
      localDepth={depth >= 1 && depth <= 3 ? depth : undefined}
      aiReady={aiProvider().kind !== "none"}
      onboarding={onboarding}
    />
  );
}
