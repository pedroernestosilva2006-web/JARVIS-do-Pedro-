"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { authErrorMessage, MIN_PASSWORD_LENGTH } from "@/lib/auth-messages";

/** Definir/trocar senha (também é o destino do link "Esqueci minha senha"). */
export function ChangePassword() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < MIN_PASSWORD_LENGTH) return setMsg({ ok: false, text: `Use pelo menos ${MIN_PASSWORD_LENGTH} caracteres.` });
    if (password !== confirm) return setMsg({ ok: false, text: "As senhas não conferem." });
    setBusy(true);
    const { error } = await createClient().auth.updateUser({ password });
    setBusy(false);
    if (error) return setMsg({ ok: false, text: authErrorMessage(error.message, error.code) });
    setPassword("");
    setConfirm("");
    setMsg({ ok: true, text: "Senha atualizada." });
  }

  const field = "w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent";
  return (
    <form onSubmit={submit} className="space-y-2" noValidate>
      <input type="password" autoComplete="new-password" placeholder="Nova senha" value={password} onChange={(e) => setPassword(e.target.value)} className={field} />
      <input type="password" autoComplete="new-password" placeholder="Repita a nova senha" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={field} />
      <button disabled={busy} className="rounded-md bg-accent-2 px-3 py-1.5 text-sm text-white hover:bg-accent disabled:opacity-50">
        {busy ? "Salvando…" : "Salvar senha"}
      </button>
      {msg && <p className={`text-sm ${msg.ok ? "text-green-400" : "text-red-400"}`}>{msg.text}</p>}
    </form>
  );
}
