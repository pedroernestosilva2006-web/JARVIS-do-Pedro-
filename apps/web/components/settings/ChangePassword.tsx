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

  const field = "field text-sm";
  return (
    <form onSubmit={submit} className="space-y-2" noValidate>
      <input type="password" autoComplete="new-password" placeholder="Nova senha" value={password} onChange={(e) => setPassword(e.target.value)} className={field} />
      <input type="password" autoComplete="new-password" placeholder="Repita a nova senha" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={field} />
      <button disabled={busy} className="btn-primary">
        {busy ? "Salvando…" : "Salvar senha"}
      </button>
      {msg && <p className={`text-sm ${msg.ok ? "text-ok" : "text-danger"}`}>{msg.text}</p>}
    </form>
  );
}
