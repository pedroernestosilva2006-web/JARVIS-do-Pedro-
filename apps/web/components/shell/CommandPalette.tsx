"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AddPanel } from "@/components/add/AddPanel";
import { IconFile, IconGraph, IconInbox, IconNotes, IconPlus, IconSearch, IconSettings, IconSpark, IconTimeline, IconFiles } from "@/components/icons";
import { typeColor } from "@/components/ui";
import { emit, notifyChanged, on, toast } from "@/lib/ui-events";
import { extractUrl } from "@jarvis/core";
import { useFocusNode } from "./useFocusNode";

type Item = { id: string; group: string; label: string; hint?: string; icon?: React.ReactNode; dot?: string; run: () => void | Promise<void> };
type Hit = { id: string; title: string; type: string };

const PAGES = [
  { label: "Cérebro", href: "/graph", icon: <IconGraph /> },
  { label: "Notas", href: "/notes", icon: <IconNotes /> },
  { label: "Timeline", href: "/timeline", icon: <IconTimeline /> },
  { label: "Arquivos", href: "/files", icon: <IconFiles /> },
  { label: "Jarvis (página de conversa)", href: "/chat", icon: <IconSpark /> },
  { label: "Ajustes", href: "/settings", icon: <IconSettings /> },
];

/**
 * Barra de comando (Ctrl/Cmd+K ou botão "+"): um só lugar para capturar uma ideia ou arquivo,
 * buscar uma nota, pular para um nó do grafo e perguntar ao Jarvis.
 */
export function CommandPalette({ aiReady }: { aiReady: boolean }) {
  const router = useRouter();
  const focusNode = useFocusNode();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"command" | "files">("command");
  const [files, setFiles] = useState<File[]>([]);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [active, setActive] = useState(0);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    setQ("");
    setMode("command");
    setFiles([]);
  }, []);

  useEffect(
    () =>
      on<{ files?: File[]; mode?: string } | undefined>("jarvis:palette", (d) => {
        setOpen(true);
        if (d?.files?.length) {
          setFiles(d.files);
          setMode("files");
        } else if (d?.mode === "files") setMode("files");
      }),
    [],
  );

  // Atalhos globais: Ctrl/Cmd+K abre/fecha; Esc fecha (fase de captura para ganhar dos painéis)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
        return;
      }
      if (open && e.key === "Escape") {
        e.preventDefault();
        e.stopImmediatePropagation();
        close();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, close]);

  useEffect(() => {
    if (open && mode === "command") requestAnimationFrame(() => inputRef.current?.focus());
  }, [open, mode]);

  // Busca de notas pelo título (debounce)
  useEffect(() => {
    if (!open || mode !== "command") return;
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/notes/titles?q=${encodeURIComponent(q.trim())}`, { signal: ctrl.signal })
        .then((r) => (r.ok ? r.json() : []))
        .then((d: Hit[]) => {
          setHits(d);
          setActive(0);
        })
        .catch(() => {});
    }, 120);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q, open, mode]);

  const text = q.trim();

  const items = useMemo<Item[]>(() => {
    const jump: Item[] = hits.slice(0, 6).map((h) => ({
      id: `note-${h.id}`,
      group: text ? "Notas" : "Notas recentes",
      label: h.title,
      dot: typeColor(h.type),
      hint: "Ir para o nó",
      run: () => {
        close();
        focusNode(h.id);
      },
    }));
    const pages: Item[] = PAGES.filter((p) => !text || p.label.toLowerCase().includes(text.toLowerCase())).map((p) => ({
      id: `page-${p.href}`,
      group: "Ir para",
      label: p.label,
      icon: p.icon,
      run: () => {
        close();
        router.push(p.href);
      },
    }));
    pages.push(
      ...(!text || "revisar".includes(text.toLowerCase())
        ? [{ id: "page-review", group: "Ir para", label: "Revisar", icon: <IconInbox />, run: () => { close(); emit("jarvis:review"); } }]
        : []),
    );
    const attach: Item = { id: "attach", group: "Ações", label: "Anexar arquivos…", icon: <IconFile />, hint: "PDF, imagem, áudio, texto", run: () => setMode("files") };
    if (!text) return [...jump, attach, ...pages];

    const isUrl = !!extractUrl(text) && text.replace(extractUrl(text)!, "").trim().length < 40;
    const capture: Item = {
      id: "capture",
      group: "Ações",
      label: `${isUrl ? "Guardar link" : "Guardar como ideia"}: “${text.length > 60 ? text.slice(0, 60) + "…" : text}”`,
      icon: <IconPlus />,
      hint: aiReady ? "O Jarvis cria as notas" : "Guardar (sem IA conectada)",
      run: async () => {
        setBusy(true);
        const form = new FormData();
        form.set("text", text);
        const res = await fetch("/api/capture/web", { method: "POST", body: form });
        setBusy(false);
        if (res.ok) {
          toast(aiReady ? "Guardado. O Jarvis está criando as notas…" : "Guardado. Conecte a Claude API para o Jarvis criar as notas.");
          notifyChanged();
          router.refresh();
          close();
        } else {
          const j = await res.json().catch(() => ({}));
          toast(j.error ?? "Não foi possível guardar.", "error");
        }
      },
    };
    const ask: Item = {
      id: "ask",
      group: "Ações",
      label: `Perguntar ao Jarvis: “${text.length > 60 ? text.slice(0, 60) + "…" : text}”`,
      icon: <IconSpark />,
      hint: "Abre o chat rápido",
      run: () => {
        close();
        emit("jarvis:dock", { question: text });
      },
    };
    // Heurística: pergunta → Jarvis; título curto que bate com nota → nota; senão capturar
    const looksQuestion = /\?\s*$/.test(text) || /^(o que|como|quais|qual|quem|por que|porque|quando|onde|me )/i.test(text);
    const noteMatch = hits.some((h) => h.title.toLowerCase().includes(text.toLowerCase())) && text.length <= 60 && !looksQuestion;
    const actions = looksQuestion ? [ask, capture] : noteMatch ? [capture, ask] : [capture, ask];
    return noteMatch ? [...jump, ...actions, attach, ...pages] : [...actions, ...jump, attach, ...pages];
  }, [text, hits, aiReady, close, focusNode, router]);

  if (!open) return null;

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => (a + 1) % items.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => (a - 1 + items.length) % items.length);
    } else if (e.key === "Enter" && !busy) {
      e.preventDefault();
      void items[active]?.run();
    }
  };

  let lastGroup = "";
  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/60 p-3 pt-[8vh] fade-in sm:pt-[12vh]" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div role="dialog" aria-modal="true" aria-label="Barra de comando" className="slide-in-up w-full max-w-xl overflow-hidden rounded-xl border border-border-strong bg-surface shadow-2xl">
        {mode === "command" ? (
          <>
            <div className="flex items-center gap-3 border-b border-border px-4">
              <IconSearch className="shrink-0 text-muted" />
              <input
                ref={inputRef}
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setActive(0);
                }}
                onKeyDown={onKeyDown}
                placeholder="Capture uma ideia, busque uma nota ou pergunte ao Jarvis…"
                aria-label="Comando"
                role="combobox"
                aria-expanded="true"
                aria-controls="cmd-list"
                aria-activedescendant={items[active] ? `cmd-${items[active].id}` : undefined}
                className="h-14 w-full bg-transparent text-base outline-none placeholder:text-[#858585]"
              />
              <span className="kbd hidden sm:inline">Esc</span>
            </div>
            <ul id="cmd-list" role="listbox" className="max-h-[52vh] overflow-y-auto p-2">
              {items.map((it, i) => {
                const header = it.group !== lastGroup ? (lastGroup = it.group) : null;
                return (
                  <li key={it.id} role="presentation">
                    {header && <p className="px-3 pb-1 pt-2 text-xs font-medium text-muted">{header}</p>}
                    <button
                      id={`cmd-${it.id}`}
                      role="option"
                      aria-selected={i === active}
                      onMouseMove={() => setActive(i)}
                      onClick={() => void it.run()}
                      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[0.95rem] ${i === active ? "bg-accent-soft text-foreground" : "text-foreground"}`}
                    >
                      {it.dot ? <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: it.dot }} /> : <span className="shrink-0 text-muted">{it.icon}</span>}
                      <span className="min-w-0 flex-1 truncate">{it.label}</span>
                      {it.hint && <span className="hidden shrink-0 text-xs text-muted sm:inline">{it.hint}</span>}
                      {i === active && <span className="kbd shrink-0">Enter</span>}
                    </button>
                  </li>
                );
              })}
              {!items.length && <li className="px-3 py-6 text-center text-sm text-muted">Nada encontrado.</li>}
            </ul>
            <div className="flex items-center gap-4 border-t border-border px-4 py-2 text-xs text-muted">
              <span>
                <span className="kbd">↑</span> <span className="kbd">↓</span> navegar
              </span>
              <span>
                <span className="kbd">Enter</span> executar
              </span>
              <span className="ml-auto">Arraste um arquivo para qualquer lugar da tela</span>
            </div>
          </>
        ) : (
          <div className="p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Guardar no cérebro</h2>
              <button className="btn-ghost" onClick={() => setMode("command")}>
                Voltar
              </button>
            </div>
            <AddPanel aiReady={aiReady} initialFiles={files} autoFocus={!files.length} onDone={() => setTimeout(close, 900)} />
          </div>
        )}
      </div>
    </div>
  );
}
