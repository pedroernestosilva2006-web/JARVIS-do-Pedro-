"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckerMark } from "@/components/brand/motifs";
import { analyzableKind, formatBytes } from "@/lib/files/rules";
import { notifyChanged, uploadFile } from "@/lib/files/upload-client";

type Item = { id: string; file: File; status: "espera" | "enviando" | "ok" | "erro"; stage?: string; message?: string };

/**
 * Painel único para guardar conhecimento: escreva, cole um link e/ou solte arquivos (vários, qualquer tipo).
 * Tudo é guardado; se marcado, o Jarvis lê PDFs, imagens, áudios e textos e cria as notas.
 */
export function AddPanel({
  noteId,
  aiReady,
  onDone,
  compact,
}: {
  noteId?: string | null;
  aiReady: boolean;
  onDone?: () => void;
  compact?: boolean;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [analyze, setAnalyze] = useState(true);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const addFiles = (list: FileList | File[]) => {
    const next = [...list].map((file) => ({ id: `${file.name}-${file.size}-${Math.random().toString(36).slice(2, 7)}`, file, status: "espera" as const }));
    setItems((cur) => [...cur, ...next]);
  };
  const patch = (id: string, p: Partial<Item>) => setItems((cur) => cur.map((i) => (i.id === id ? { ...i, ...p } : i)));
  const canAnalyzeAny = items.some((i) => analyzableKind(i.file.name, i.file.type));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || (!text.trim() && !items.length)) return;
    setBusy(true);
    setMsg(null);
    const notes: string[] = [];
    let failed = 0;

    if (text.trim()) {
      const form = new FormData();
      form.set("text", text);
      if (noteId) form.set("context_note_id", noteId);
      const res = await fetch("/api/capture/web", { method: "POST", body: form });
      if (res.ok) {
        notes.push(aiReady ? "Texto enviado ao Jarvis." : "Texto guardado (o Jarvis só cria notas depois de conectar a Claude API).");
        setText("");
      } else {
        failed++;
        const j = await res.json().catch(() => ({}));
        notes.push(`Texto: ${j.error ?? res.statusText}`);
      }
    }

    for (const item of items.filter((i) => i.status !== "ok")) {
      patch(item.id, { status: "enviando", stage: "preparando" });
      const r = await uploadFile(item.file, { noteId, analyze: analyze && aiReady }, (stage) => patch(item.id, { stage }));
      if (r.ok) {
        const why = r.analysis?.requested && !r.analysis.started ? ` Não analisado: ${r.analysis.reason}.` : r.analysis?.started ? " O Jarvis está lendo." : "";
        patch(item.id, { status: "ok", message: `Guardado.${why}` });
      } else {
        failed++;
        patch(item.id, { status: "erro", message: r.error });
      }
    }

    setBusy(false);
    notifyChanged();
    router.refresh();
    if (failed === 0) {
      setItems([]);
      setMsg({ ok: true, text: notes.join(" ") || "Guardado." });
      onDone?.();
    } else {
      setMsg({ ok: false, text: `${failed} item(ns) com erro — veja abaixo e tente de novo.` });
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={compact ? 3 : 4}
        placeholder="Escreva uma ideia, cole um link ou um trecho do que aprendeu…"
        className="field text-sm"
      />

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && inputRef.current?.click()}
        className={`flex cursor-pointer flex-col items-center justify-center gap-1 border border-dashed px-4 py-6 text-center text-sm transition ${
          drag ? "border-foreground bg-panel-2 text-foreground" : "border-border-strong text-muted hover:border-foreground hover:text-foreground"
        }`}
      >
        <CheckerMark className="text-foreground/60" />
        <span>Arraste arquivos aqui ou clique para escolher</span>
        <span className="text-[11px]">PDF, imagem, áudio, texto, planilha, qualquer tipo · até 50 MB cada</span>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) addFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {items.length > 0 && (
        <ul className="divide-y divide-border border border-border text-sm">
          {items.map((i) => (
            <li key={i.id} className="flex items-center gap-3 px-3 py-2">
              <span
                className={`h-1.5 w-1.5 shrink-0 ${i.status === "ok" ? "bg-foreground" : i.status === "erro" ? "bg-[var(--signal)]" : i.status === "enviando" ? "animate-pulse bg-muted" : "bg-border-strong"}`}
              />
              <span className="min-w-0 flex-1 truncate">{i.file.name}</span>
              <span className="shrink-0 text-xs text-muted">{i.status === "enviando" ? i.stage : i.message ?? formatBytes(i.file.size)}</span>
              {i.status !== "enviando" && i.status !== "ok" && (
                <button type="button" onClick={() => setItems((cur) => cur.filter((x) => x.id !== i.id))} className="text-xs text-muted hover:text-foreground" aria-label="Remover">
                  ✕
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {(canAnalyzeAny || text.trim()) && (
        <label className={`flex items-start gap-2 text-xs ${aiReady ? "text-muted" : "text-muted/60"}`}>
          <input type="checkbox" checked={analyze && aiReady} disabled={!aiReady} onChange={(e) => setAnalyze(e.target.checked)} className="mt-0.5" />
          <span>
            Pedir ao Jarvis para ler os arquivos e criar notas conectadas
            {!aiReady && <span className="block text-[var(--signal)]">Claude API ainda não conectada: os arquivos serão só guardados (veja Ajustes).</span>}
          </span>
        </label>
      )}

      <div className="flex items-center gap-3">
        <button disabled={busy || (!text.trim() && !items.length)} className="btn-primary px-5 py-2.5 disabled:opacity-40">
          {busy ? "Guardando…" : "Guardar"}
        </button>
        {msg && <p role="status" className={`text-xs ${msg.ok ? "text-foreground" : "text-[var(--signal)]"}`}>{msg.text}</p>}
      </div>
    </form>
  );
}
