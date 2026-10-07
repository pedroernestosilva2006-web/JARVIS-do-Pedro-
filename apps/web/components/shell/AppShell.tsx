"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CommandPalette } from "./CommandPalette";
import { JarvisDock } from "./JarvisDock";
import { Nav } from "./Nav";
import { ReviewDrawer } from "./ReviewDrawer";
import { emit, on } from "@/lib/ui-events";

type Toast = { id: number; text: string; tone: "ok" | "error" };

/**
 * Casca do app: rail/abas de navegação + camadas globais (barra de comando, gaveta de revisão,
 * dock do Jarvis, avisos e "solte arquivos aqui"). O conteúdo da tela vem como children.
 */
export function AppShell({ children, reviewCount: initialCount, aiReady }: { children: React.ReactNode; reviewCount: number; aiReady: boolean }) {
  const [count, setCount] = useState(initialCount);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);

  const refreshCount = useCallback(() => {
    fetch("/api/review?count=1")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setCount(d.count))
      .catch(() => {});
  }, []);

  useEffect(() => on("jarvis:changed", refreshCount), [refreshCount]);

  useEffect(
    () =>
      on<{ text: string; tone?: "ok" | "error" }>("jarvis:toast", (d) => {
        const id = Date.now() + Math.random();
        setToasts((t) => [...t, { id, text: d.text, tone: d.tone ?? "ok" }]);
        setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500);
      }),
    [],
  );

  // Arrastar arquivos para qualquer lugar abre a captura com eles já listados
  useEffect(() => {
    const hasFiles = (e: DragEvent) => !!e.dataTransfer && [...e.dataTransfer.types].includes("Files");
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      dragDepth.current++;
      setDragging(true);
    };
    const leave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (!dragDepth.current) setDragging(false);
    };
    const over = (e: DragEvent) => hasFiles(e) && e.preventDefault();
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragDepth.current = 0;
      setDragging(false);
      const files = [...(e.dataTransfer?.files ?? [])];
      if (files.length) emit("jarvis:palette", { files });
    };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragleave", leave);
    window.addEventListener("dragover", over);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("dragover", over);
      window.removeEventListener("drop", drop);
    };
  }, []);

  return (
    <div className="flex h-dvh flex-col md:flex-row">
      <Nav reviewCount={count} />
      <main id="conteudo" className="relative min-h-0 min-w-0 flex-1 overflow-hidden pb-14 md:pb-0">
        {children}
      </main>
      <CommandPalette aiReady={aiReady} />
      <ReviewDrawer />
      <JarvisDock />

      {dragging && (
        <div className="pointer-events-none fixed inset-0 z-[70] flex items-center justify-center bg-black/60 fade-in">
          <div className="rounded-2xl border-2 border-dashed border-accent bg-surface px-10 py-8 text-center text-lg font-medium">Solte para guardar no cérebro</div>
        </div>
      )}

      <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[80] flex flex-col items-center gap-2 px-4 md:bottom-6" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} role="status" className={`slide-in-up pointer-events-auto max-w-md rounded-lg border px-4 py-2.5 text-sm shadow-xl ${t.tone === "error" ? "border-danger/50 bg-surface-2 text-danger" : "border-border-strong bg-surface-2 text-foreground"}`}>
            {t.text}
          </div>
        ))}
      </div>
    </div>
  );
}
