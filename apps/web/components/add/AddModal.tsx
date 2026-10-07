"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AddPanel } from "./AddPanel";

/** Botão "+ Adicionar" (na barra lateral) que abre o painel de captura em qualquer página. */
export function AddModal({ aiReady }: { aiReady: boolean }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("jarvis:add", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("jarvis:add", onOpen);
    };
  }, []);

  return (
    <>
      <button onClick={() => setOpen(true)} className="btn-primary w-full whitespace-nowrap px-4 py-2.5 md:mb-6">
        + Adicionar
      </button>
      {open &&
        createPortal(
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-6" onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}>
          <div role="dialog" aria-modal="true" aria-label="Adicionar ao cérebro" className="surface-raised max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-sm p-5 shadow-2xl">
            <div className="mb-4 flex items-center justify-between border-b border-border pb-3">
              <h2 className="display text-sm">Adicionar ao cérebro</h2>
              <button onClick={() => setOpen(false)} className="text-[11px] uppercase tracking-[0.14em] text-muted hover:text-foreground">
                Fechar
              </button>
            </div>
            <AddPanel aiReady={aiReady} onDone={() => setTimeout(() => setOpen(false), 900)} />
          </div>
        </div>,
          document.body,
        )}
    </>
  );
}
