"use client";

import { useState } from "react";
import type { Integration } from "@/lib/integrations";

const LIGHT = {
  ok: { dot: "bg-ok", label: "Conectado", text: "text-ok" },
  warn: { dot: "bg-warn", label: "Atenção", text: "text-warn" },
  fail: { dot: "bg-danger", label: "Faltando", text: "text-danger" },
} as const;

/** Semáforo de integrações (Claude, OpenAI, Telegram, Supabase, Cron) — mostra só nomes de variáveis. */
export function StatusBoard({ items }: { items: Integration[] }) {
  const [test, setTest] = useState<"idle" | "busy" | { ok: boolean; text: string }>("idle");

  async function testClaude() {
    setTest("busy");
    try {
      const d = await (await fetch("/api/health/ai", { method: "POST" })).json();
      setTest({ ok: !!d.ok, text: d.ok ? `Funcionando · ${d.provider} · ${d.model} · ${d.ms} ms` : (d.error ?? "Falhou.") });
    } catch {
      setTest({ ok: false, text: "Não foi possível chamar o servidor." });
    }
  }

  return (
    <ul className="divide-y divide-border">
      {items.map((it) => {
        const l = LIGHT[it.light];
        return (
          <li key={it.id} className="flex flex-col gap-1.5 py-3.5">
            <div className="flex items-center gap-3">
              <span className={`h-3 w-3 shrink-0 rounded-full ${l.dot}`} aria-hidden="true" />
              <span className="font-medium">{it.name}</span>
              <span className={`ml-auto text-sm font-medium ${l.text}`}>{l.label}</span>
            </div>
            <p className="pl-6 text-sm text-muted">{it.summary}</p>
            {it.missing.length > 0 && (
              <div className="pl-6 text-sm">
                <span className="text-muted">Falta definir na Vercel: </span>
                <span className="mt-1 flex flex-wrap gap-1.5">
                  {it.missing.map((m) => (
                    <code key={m} className="break-all rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[0.82rem]">
                      {m}
                    </code>
                  ))}
                </span>
              </div>
            )}
            {it.detail && <p className="pl-6 text-sm text-muted">{it.detail}</p>}
            {it.id === "claude" && it.light === "ok" && (
              <div className="flex flex-wrap items-center gap-3 pl-6 pt-1">
                <button onClick={testClaude} disabled={test === "busy"} className="btn-outline !py-1">
                  {test === "busy" ? "Testando…" : "Testar Claude"}
                </button>
                {typeof test === "object" && <span className={`text-sm ${test.ok ? "text-ok" : "text-danger"}`}>{test.text}</span>}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
