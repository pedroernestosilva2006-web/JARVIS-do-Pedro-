"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { IconCheck } from "@/components/icons";
import { clearDemoDataAction, loadDemoDataAction } from "@/app/(app)/actions";
import { emit, notifyChanged, toast } from "@/lib/ui-events";

export interface OnboardingStatus {
  claudeOk: boolean;
  telegramOk: boolean;
  telegramConfigured: boolean;
  hasCaptured: boolean;
  demoCount: number;
}

function Row({ done, title, hint, action }: { done: boolean; title: string; hint: string; action?: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3 py-2.5">
      <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${done ? "border-accent bg-accent text-on-accent" : "border-border-strong text-transparent"}`} aria-hidden="true">
        <IconCheck width={13} height={13} />
      </span>
      <div className="min-w-0 flex-1">
        <p className={`text-sm font-medium ${done ? "text-muted line-through decoration-border-strong" : ""}`}>
          {title}
          <span className="sr-only">{done ? " — concluído" : " — pendente"}</span>
        </p>
        <p className="text-xs text-muted">{hint}</p>
      </div>
      {!done && action}
    </li>
  );
}

/** Primeiros passos: chave do Claude, Telegram e primeira captura — mais carregar/apagar dados de exemplo. */
export function Checklist({ status }: { status: OnboardingStatus }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<"load" | "clear" | null>(null);
  const done = [status.claudeOk, status.telegramOk, status.hasCaptured].filter(Boolean).length;

  const run = (kind: "load" | "clear") =>
    start(async () => {
      setBusy(kind);
      if (kind === "load") {
        const r = await loadDemoDataAction();
        if (r.error) toast(r.error, r.added ? "ok" : "error");
        else toast(`${r.added} notas de exemplo carregadas. Explore o grafo!`);
      } else {
        const r = await clearDemoDataAction();
        toast(`${r.removed} notas de exemplo apagadas.`);
      }
      setBusy(null);
      notifyChanged();
      router.refresh();
    });

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-base font-semibold">Primeiros passos</h2>
        <span className="text-xs text-muted">{done} de 3</span>
      </div>
      <ul className="divide-y divide-border">
        <Row
          done={status.claudeOk}
          title="Conectar a Claude API"
          hint={status.claudeOk ? "Chave encontrada." : "Falta a variável ANTHROPIC_API_KEY na Vercel."}
          action={
            <Link href="/settings#conexoes" className="btn-outline !py-1">
              Ver como
            </Link>
          }
        />
        <Row
          done={status.telegramOk}
          title="Parear o Telegram"
          hint={status.telegramOk ? "Telegram pareado." : status.telegramConfigured ? "Gere um código em Ajustes e envie /conectar ao bot." : "Opcional: capture pelo celular (falta TELEGRAM_BOT_TOKEN)."}
          action={
            <Link href="/settings#telegram" className="btn-outline !py-1">
              Parear
            </Link>
          }
        />
        <Row
          done={status.hasCaptured}
          title="Fazer a primeira captura"
          hint="Escreva uma ideia, cole um link ou solte um arquivo."
          action={
            <button onClick={() => emit("jarvis:palette")} className="btn-primary !py-1">
              Capturar
            </button>
          }
        />
      </ul>
      <div className="mt-3 border-t border-border pt-3">
        {status.demoCount > 0 ? (
          <div className="flex items-center gap-3">
            <p className="flex-1 text-xs text-muted">Há {status.demoCount} notas de exemplo no seu cérebro.</p>
            <button disabled={pending} onClick={() => run("clear")} className="btn-outline !py-1">
              {busy === "clear" ? "Apagando…" : "Apagar dados de exemplo"}
            </button>
          </div>
        ) : (
          <button disabled={pending} onClick={() => run("load")} className="btn-primary w-full">
            {busy === "load" ? "Carregando…" : "Carregar dados de exemplo"}
          </button>
        )}
        {status.demoCount === 0 && <p className="mt-1.5 text-center text-xs text-muted">~40 notas de demonstração (evento, livro, pessoas, insights) — dá para apagar depois.</p>}
      </div>
    </div>
  );
}
