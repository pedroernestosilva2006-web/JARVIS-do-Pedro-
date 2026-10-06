"use client";

import { useRef, useState } from "react";
import { CheckerMark, OrbitSphere } from "@/components/brand/motifs";
import { renderMarkdown } from "@/lib/markdown";

interface UiMessage {
  role: "user" | "assistant";
  text: string;
  tools: string[];
  error?: string;
}

const TOOL_LABELS: Record<string, string> = {
  search_knowledge: "buscando na sua base",
  get_note: "lendo nota",
  get_neighbors: "explorando o grafo",
  timeline: "consultando a timeline",
  create_note: "criando nota",
  update_note: "atualizando nota",
  link_notes: "conectando notas",
  list_review_queue: "olhando a fila de revisão",
  remember: "memorizando",
  recall: "lembrando",
  synthesize: "reunindo material",
};

const SUGGESTIONS = [
  "O que aprendi sobre outbound?",
  "Quais temas se repetem nos eventos que fui este ano?",
  "Monte um roteiro de webinar usando minhas notas sobre IA em vendas",
  "Prepare-me para uma reunião: o que sei sobre o Aaron Ross?",
];

export function Chat({ initial, conversationId: initialId }: { initial: UiMessage[]; conversationId: string | null }) {
  const [messages, setMessages] = useState<UiMessage[]>(initial);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const conversationId = useRef<string | null>(initialId);
  const bottom = useRef<HTMLDivElement>(null);

  async function send(text: string) {
    if (!text.trim() || busy) return;
    setInput("");
    setBusy(true);
    setMessages((m) => [...m, { role: "user", text, tools: [] }, { role: "assistant", text: "", tools: [] }]);
    const update = (fn: (m: UiMessage) => UiMessage) =>
      setMessages((all) => [...all.slice(0, -1), fn(all[all.length - 1]!)]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: conversationId.current, message: text }),
      });
      if (!res.ok || !res.body) throw new Error(await res.text());
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const ev = JSON.parse(line);
          if (ev.type === "meta") {
            conversationId.current = ev.conversationId;
            window.history.replaceState(null, "", `/chat?c=${ev.conversationId}`);
          } else if (ev.type === "text") update((m) => ({ ...m, text: m.text + ev.text }));
          else if (ev.type === "tool") update((m) => ({ ...m, tools: [...m.tools, ev.name], text: m.text ? m.text + "\n\n" : m.text }));
          else if (ev.type === "error") update((m) => ({ ...m, error: ev.message }));
        }
        bottom.current?.scrollIntoView({ behavior: "smooth" });
      }
    } catch (e) {
      update((m) => ({ ...m, error: e instanceof Error ? e.message : String(e) }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex h-[calc(100vh-52px)] max-w-3xl flex-col p-4 md:h-screen md:p-6">
      <div className="flex-1 space-y-4 overflow-y-auto pb-4">
        {messages.length === 0 && (
          <div className="mt-6 text-center md:mt-10">
            <OrbitSphere className="mx-auto h-[200px] w-[200px] md:h-[260px] md:w-[260px]" />
            <div className="kicker mt-2">04 — Jarvis</div>
            <h1 className="display mt-3 text-2xl text-foreground md:text-3xl">Fale com seu cérebro</h1>
            <p className="mx-auto mt-3 max-w-md text-sm text-muted">
              Pergunte sobre o que você aprendeu. O Jarvis busca nas suas notas, cita as fontes e sugere o próximo passo.
            </p>
            <div className="mx-auto mt-8 grid max-w-2xl gap-px bg-border text-left sm:grid-cols-2">
              {SUGGESTIONS.map((s, i) => (
                <button key={s} onClick={() => send(s)} className="surface group flex min-h-[92px] flex-col justify-between p-4 text-left text-sm text-foreground transition hover:bg-panel-2">
                  <span className="kicker flex w-full items-center justify-between">
                    {String(i + 1).padStart(2, "0")}
                    <CheckerMark className="text-foreground/40 transition group-hover:text-[var(--signal)]" />
                  </span>
                  <span className="mt-3 leading-snug">{s}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "flex justify-end" : ""}>
            <div className={m.role === "user" ? "surface-raised max-w-[85%] rounded-sm px-4 py-2.5" : "w-full border-l border-border pl-4"}>
              {m.tools.length > 0 && (
                <div className="mb-1 flex flex-wrap gap-1">
                  {m.tools.map((t, j) => (
                    <span key={j} className="rounded-full border border-border px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-muted">
                      {TOOL_LABELS[t] ?? t}
                    </span>
                  ))}
                </div>
              )}
              {m.role === "assistant" ? (
                <div className="prose-jarvis text-sm" dangerouslySetInnerHTML={{ __html: renderMarkdown(m.text || (busy && i === messages.length - 1 ? "…" : "")) }} />
              ) : (
                <p className="whitespace-pre-wrap text-sm">{m.text}</p>
              )}
              {m.error && <p className="mt-1 text-xs text-[var(--signal)]">{m.error}</p>}
            </div>
          </div>
        ))}
        <div ref={bottom} />
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
        className="flex gap-2 border-t border-border pt-3"
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send(input);
            }
          }}
          rows={2}
          placeholder="Pergunte ao Jarvis… (Enter envia, Shift+Enter quebra linha)"
          className="field flex-1 resize-none text-sm "
        />
        <button disabled={busy} className="btn-primary px-4 disabled:opacity-50">
          {busy ? "…" : "Enviar"}
        </button>
      </form>
    </div>
  );
}
