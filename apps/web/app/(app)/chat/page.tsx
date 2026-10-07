import Link from "next/link";
import { Chat } from "@/components/chat/Chat";
import { requireWorkspace } from "@/lib/workspace";

export const metadata = { title: "Jarvis — chat" };

type Block = { type: string; text?: string; name?: string };

export default async function ChatPage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const { c } = await searchParams;
  const { supabase, workspaceId } = await requireWorkspace();
  const { data: conversations } = await supabase
    .from("conversations")
    .select("id, title, updated_at")
    .eq("workspace_id", workspaceId)
    .order("updated_at", { ascending: false })
    .limit(15);

  // Reconstrói a conversa para a UI (tool_result fica oculto, tool_use vira "chip")
  const initial: { role: "user" | "assistant"; text: string; tools: string[] }[] = [];
  if (c) {
    const { data: rows } = await supabase
      .from("messages")
      .select("role, content")
      .eq("workspace_id", workspaceId)
      .eq("conversation_id", c)
      .order("created_at");
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
    <div className="flex">
      <aside className="hidden w-56 shrink-0 border-r border-border p-3 lg:block">
        <Link href="/chat" className="btn-outline mb-4 block px-3 py-2 text-center">
          + Nova conversa
        </Link>
        <ul className="space-y-1 text-sm">
          {(conversations ?? []).map((cv) => (
            <li key={cv.id}>
              <Link
                href={`/chat?c=${cv.id}`}
                className={`block truncate rounded px-2 py-1 hover:bg-panel-2 ${cv.id === c ? "bg-panel-2 text-foreground" : "text-muted"}`}
              >
                {cv.title ?? "Conversa"}
              </Link>
            </li>
          ))}
        </ul>
      </aside>
      <div className="flex-1">
        <Chat key={c ?? "new"} initial={initial} conversationId={c ?? null} />
      </div>
    </div>
  );
}
