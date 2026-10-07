"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Chat } from "@/components/chat/Chat";
import { IconClose, IconExpand } from "@/components/icons";
import { on } from "@/lib/ui-events";

/** Dock de chat do Jarvis: abre por cima de qualquer tela (tecla J ou botão no rail). */
export function JarvisDock() {
  const [open, setOpen] = useState(false);
  const [started, setStarted] = useState(false); // monta o chat só na primeira abertura e o mantém vivo
  const [question, setQuestion] = useState<string | null>(null);
  const [session, setSession] = useState(0);

  const show = useCallback(() => {
    setStarted(true);
    setOpen(true);
  }, []);

  useEffect(
    () =>
      on<{ question?: string } | undefined>("jarvis:dock", (d) => {
        if (d?.question) setQuestion(d.question);
        if (d?.question || !open) show();
        else setOpen(false);
      }),
    [open, show],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing = !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
      if (e.key.toLowerCase() === "j" && !typing && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        setOpen((o) => {
          if (!o) setStarted(true);
          return !o;
        });
      } else if (e.key === "Escape" && open) {
        e.preventDefault();
        e.stopImmediatePropagation();
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open]);

  if (!started) return null;
  return (
    <section
      aria-label="Jarvis — chat rápido"
      aria-hidden={!open}
      className={`${open ? "flex" : "hidden"} slide-in-up fixed inset-0 z-[55] flex-col border border-border-strong bg-surface shadow-2xl md:inset-auto md:bottom-4 md:right-4 md:h-[min(640px,calc(100vh-2rem))] md:w-[420px] md:rounded-xl`}
    >
      <header className="flex items-center gap-1 border-b border-border px-3 py-2">
        <h2 className="mr-auto text-base font-semibold">Jarvis</h2>
        <button className="btn-ghost" onClick={() => { setSession((s) => s + 1); setQuestion(null); }}>
          Nova conversa
        </button>
        <Link href="/chat" onClick={() => setOpen(false)} className="btn-ghost !p-2" aria-label="Abrir página de conversa">
          <IconExpand width={18} height={18} />
        </Link>
        <button onClick={() => setOpen(false)} aria-label="Fechar (Esc)" className="btn-ghost !p-2">
          <IconClose width={18} height={18} />
        </button>
      </header>
      <div className="min-h-0 flex-1 px-3 pb-3 pt-3">
        <Chat key={session} initial={[]} conversationId={null} variant="dock" question={question} onQuestionSent={() => setQuestion(null)} onCite={() => window.innerWidth < 768 && setOpen(false)} />
      </div>
    </section>
  );
}
