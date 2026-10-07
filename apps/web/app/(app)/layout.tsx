import { AppShell } from "@/components/shell/AppShell";
import { aiProvider } from "@/lib/ai/llm";
import { getAppContext } from "@/lib/access";
import { reviewCount } from "@/lib/review";
import { requireWorkspace } from "@/lib/workspace";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireWorkspace();
  const ctx = await getAppContext();
  const count = ctx ? await reviewCount(ctx.db, ctx.workspaceId).catch(() => 0) : 0;
  return (
    <AppShell reviewCount={count} aiReady={aiProvider().kind !== "none"}>
      {children}
    </AppShell>
  );
}
