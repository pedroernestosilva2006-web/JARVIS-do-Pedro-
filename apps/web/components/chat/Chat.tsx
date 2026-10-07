"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { IconSend } from "@/components/icons";
import { useFocusNode } from "@/components/shell/useFocusNode";
import { renderMarkdown } from "@/lib/markdown";
import { notifyChanged, resolveNoteId, toast } from "@/lib/ui-events";

export interface UiMessage {
  role: "user" | "assistant";
  text: string;
  tools: string[];
  error?: string;
}

const TOOL_LABELS: Record<string, string> = {
  search_knowledge: "Buscando na sua base",
  get_note: "Lendo nota",
  get_neighbors: "Explorando o grafo",
  timeline: "Consultando a timeline",
  create_note: "Criando nota",
  update_note: "Atualizando nota",
  link_notes: "Conectando notas",
  list_review_queue: "Olhando a fila de revisão",
  remember: "Memorizando",
  recall: "Lembrando",
  synthesize: "Reunindo material",
};

const SUGGESTIONS = [
  "O que aprendi sobre outbound?",
  "Quais temas se repetem nos eventos que fui este ano?",
  "Prepare-me para uma reunião: o que sei sobre o Aaron Ross?",
  "Monte um roteiro de webinar com minhas notas sobre IA em vendas",
];

/**
 * Conversa com o Jarvis (página e dock). As notas citadas como [[Título]] viram chips clicáveis
 * que focam o nó no grafo.
 */
export function Chat({
  initial,
  conversationId: initialId,
  variant = "page",
  question,
  onQuestionSent,
  onCite,
}: {
  initial: UiMessage[];
  conversationId: string | null;
  variant?: "page" | "dock";
  question?: string | null;
  onQuestionSent?: () => void;
  onCite?: () => void;
}) {
  const focusNode = useFocusNode();
  const [messages, setMessages] = useState<UiMessage[]>(initial);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const conversationId = useRef<string | null>(initialId);
  const bottom = useRef<HTMLDivElement>(null);

  const send = useCallback(
    async (text: string) => {
      if (!text.trim() || busy) return;
      setInput("");
      setBusy(true);
      setMessages((m) => [...m, { role: "user", text, tools: [] }, { role: "assistant", text: "", tools: [] }]);
      const update = (fn: (m: UiMessage) => UiMessage) => setMessages((all) => [...all.slice(0, -1), fn(all[all.length - 1]!)]);

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
              if (variant === "page") window.history.replaceState(null, "", `/chat?c=${ev.conversationId}`);
            } else if (ev.type === "text") update((m) => ({ ...m, text: m.text + ev.text }));
            else if (ev.type === "tool") {
              update((m) => ({ ...m, tools: [...m.tools, ev.name], text: m.text ? m.text + "\n\n" : m.text }));
              if (["create_note", "update_note", "link_notes"].includes(ev.name)) notifyChanged();
            } else if (ev.type === "error") update((m) => ({ ...m, error: ev.message }));
          }
          bottom.current?.scrollIntoView({ behavior: "smooth" });
        }
      } catch (e) {
        update((m) => ({ ...m, error: e instanceof Error ? e.message : String(e) }));
      } finally {
        setBusy(false);
      }
    },
    [busy, variant],
  );

  // Pergunta vinda da barra de comando
  const sentQuestion = useRef<string | null>(null);
  useEffect(() => {
    if (question && sentQuestion.current !== question) {
      sentQuestion.current = question;
      void send(question);
      onQuestionSent?.();
    }
  }, [question, send, onQuestionSent]);

  async function onCiteClick(e: React.MouseEvent) {
    const btn = (e.target as HTMLElement).closest<HTMLElement>("button.cite");
    if (!btn) return;
    const title = btn.dataset.cite ?? "";
    const id = await resolveNoteId(title);
    if (!id) return toast(`Não encontrei a nota “${title}”.`, "error");
    onCite?.();
    focusNode(id);
  }

  const dock = variant === "dock";
  return (
    <div className={`flex h-full min-h-0 flex-col ${dock ? "" : "mx-auto max-w-3xl p-4 md:p-6"}`}>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pb-4" onClick={onCiteClick}>
        {messages.length === 0 && (
          <div className={`text-center ${dock ? "mt-4" : "mt-10"}`}>
            <h1 className={`font-semibold tracking-tight ${dock ? "text-lg" : "text-2xl"}`}>Converse com seu cérebro</h1>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted">Pergunte sobre o que você aprendeu. O Jarvis busca nas suas notas e cita as fontes — clique numa citação para ver o nó no grafo.</p>
            <div className={`mx-auto mt-5 grid gap-2 text-left ${dock ? "" : "max-w-2xl sm:grid-cols-2"}`}>
              {SUGGESTIONS.map((s) => (
                <button key={s} onClick={() => send(s)} className="surface row-hover rounded-lg p-3 text-left text-sm">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "flex justify-end" : ""}>
            <div className={m.role === "user" ? "surface-raised max-w-[88%] rounded-xl rounded-br-sm px-4 py-2.5" : "w-full"}>
              {m.tools.length > 0 && (
                <div className="mb-1.5 flex flex-wrap gap-1">
                  {m.tools.map((t, j) => (
                    <span key={j} className="chip chip-static !py-0 text-xs">
                      {TOOL_LABELS[t] ?? t}
                    </span>
                  ))}
                </div>
              )}
              {m.role === "assistant" ? (
                <div className="prose-jarvis text-[0.95rem]" dangerouslySetInnerHTML={{ __html: renderMarkdown(m.text || (busy && i === messages.length - 1 ? "…" : ""), { cite: true }) }} />
              ) : (
                <p className="whitespace-pre-wrap text-[0.95rem]">{m.text}</p>
              )}
              {m.error && <p className="mt-1 text-sm text-danger">{m.error}</p>}
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
        className="flex items-end gap-2 border-t border-border pt-3"
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
          rows={dock ? 2 : 2}
          aria-label="Mensagem para o Jarvis"
          placeholder="Pergunte ao Jarvis…"
          className="field flex-1 resize-none"
        />
        <button disabled={busy || !input.trim()} aria-label="Enviar" className="btn-primary !px-3 !py-3">
          {busy ? "…" : <IconSend />}
        </button>
      </form>
    </div>
  );
}
