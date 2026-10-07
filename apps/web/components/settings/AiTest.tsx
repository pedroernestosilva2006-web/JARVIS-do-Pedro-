"use client";

import { useState } from "react";

/** Botão "Testar Claude": confirma que a chave/modelo funcionam, sem sair de Ajustes. */
export function AiTest() {
  const [state, setState] = useState<"idle" | "busy" | { ok: boolean; text: string }>("idle");

  async function run() {
    setState("busy");
    try {
      const r = await fetch("/api/health/ai", { method: "POST" });
      const d = await r.json();
      setState({ ok: !!d.ok, text: d.ok ? `Funcionando · ${d.provider} · ${d.model} · ${d.ms} ms` : d.error ?? "Falhou." });
    } catch {
      setState({ ok: false, text: "Não foi possível chamar o servidor." });
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button onClick={run} disabled={state === "busy"} className="btn-outline px-3 py-1.5 disabled:opacity-50">
        {state === "busy" ? "Testando…" : "Testar Claude"}
      </button>
      {typeof state === "object" && <span className={`text-xs ${state.ok ? "text-foreground" : "text-[var(--signal)]"}`}>{state.text}</span>}
    </div>
  );
}
