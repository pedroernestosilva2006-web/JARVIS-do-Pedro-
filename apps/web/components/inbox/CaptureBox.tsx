"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

/** Captura rápida pela web: texto, link ou arquivo (áudio, foto, PDF). */
export function CaptureBox() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<string>("");
  const inputRef = useRef<HTMLInputElement>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() && !file) return;
    setStatus("Enviando…");
    const form = new FormData();
    form.set("text", text);
    if (file) form.set("file", file);
    const res = await fetch("/api/capture/web", { method: "POST", body: form });
    if (res.ok) {
      setText("");
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
      setStatus("Capturado! Processando em segundo plano…");
      setTimeout(() => router.refresh(), 4000);
    } else {
      const j = await res.json().catch(() => ({}));
      setStatus(`Erro: ${j.error ?? res.statusText}`);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-2">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        placeholder="O que você aprendeu? Cole um link, escreva uma ideia, um insight de evento…"
        className="w-full resize-y rounded-md border border-border bg-background p-3 text-sm outline-none focus:border-accent"
      />
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          accept="audio/*,image/*,application/pdf"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="text-xs text-muted file:mr-2 file:rounded file:border-0 file:bg-panel-2 file:px-2 file:py-1 file:text-foreground"
        />
        <button className="ml-auto rounded-md bg-accent-2 px-3 py-1.5 text-sm font-medium text-white hover:bg-accent">
          Capturar
        </button>
      </div>
      {status && <p className="text-xs text-muted">{status}</p>}
    </form>
  );
}
