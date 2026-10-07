import Link from "next/link";
import { Chat } from "@/components/chat/Chat";
import { requireWorkspace } from "@/lib/workspace";

export const metadata = { title: "Jarvis — JARVIS" };

type Block = { type: string; text?: string; name?: string };

export default async function ChatPage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const { c } = await searchParams;
  const { supabase, workspaceId } = await requireWorkspace();
  const { data: conversations } = await supabase
    .from("conversations")
    .select("id, title, updated_at")
    .eq("workspace_id", workspaceId)
    .order("updated_at", { ascending: false })
    .limit(20);

  // Reconstrói a conversa para a UI (tool_result fica oculto, tool_use vira "chip")
  const initial: { role: "user" | "assistant"; text: string; tools: string[] }[] = [];
  if (c) {
    const { data: rows } = await supabase.from("messages").select("role, content").eq("workspace_id", workspaceId).eq("conversation_id", c).order("created_at");
    for (const r of rows ?? []) {
      const blocks: Block[] = typeof r.content === "string" ? [{ type: "text", text: r.content }] : (r.content as Block[]);
      if (r.role === "user") {
        const text = blocks.filter((b) => b.type === "text").map((b) => b.text).join("\n");
        if (text) initial.push({ role: "user", text, tools: [] });
        continue;
      }
      const last = initial[initial.length - 1];
      const target = last?.role === "assistant" ? last : { role: "assistant" as const, text: "", tools: [] as string[] };
      if (target !== last) initial.push(target);
      for (const b of blocks) {
        if (b.type === "text" && b.text) target.text += (target.text ? "\n\n" : "") + b.text;
        if (b.type === "tool_use" && b.name) target.tools.push(b.name);
      }
    }
  }

  return (
    <div className="flex h-full min-h-0">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-border p-3 lg:flex">
        <Link href="/chat" className="btn-primary mb-4 w-full">
          Nova conversa
        </Link>
        <h2 className="mb-1 px-2 text-xs font-medium text-muted">Conversas recentes</h2>
        <ul className="min-h-0 flex-1 space-y-0.5 overflow-y-auto text-sm">
          {(conversations ?? []).map((cv) => (
            <li key={cv.id}>
              <Link href={`/chat?c=${cv.id}`} className={`row-hover block truncate rounded-lg px-2 py-1.5 ${cv.id === c ? "bg-accent-soft text-foreground" : "text-muted"}`}>
                {cv.title ?? "Conversa"}
              </Link>
            </li>
          ))}
          {!conversations?.length && <li className="px-2 text-muted">Nenhuma conversa ainda.</li>}
        </ul>
      </aside>
      <div className="min-w-0 flex-1">
        <Chat key={c ?? "new"} initial={initial} conversationId={c ?? null} />
      </div>
    </div>
  );
}
