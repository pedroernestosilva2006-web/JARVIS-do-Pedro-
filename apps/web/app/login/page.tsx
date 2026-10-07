"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { authErrorMessage, validateCredentials, MIN_PASSWORD_LENGTH } from "@/lib/auth-messages";

type Mode = "entrar" | "criar" | "link";

const TABS: { id: Mode; label: string }[] = [
  { id: "entrar", label: "Entrar" },
  { id: "criar", label: "Criar conta" },
  { id: "link", label: "Link mágico" },
];

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("entrar");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  function switchMode(next: Mode) {
    setMode(next);
    setError("");
    setInfo("");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setInfo("");
    const invalid = mode === "link" ? validateCredentials(email, "x", false) : validateCredentials(email, password, mode === "criar");
    if (invalid) return setError(invalid);

    setBusy(true);
    const supabase = createClient();
    const redirectTo = `${window.location.origin}/auth/callback`;
    try {
      if (mode === "entrar") {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) return setError(authErrorMessage(error.message, error.code));
        router.replace("/graph");
        router.refresh();
      } else if (mode === "criar") {
        const { data, error } = await supabase.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: redirectTo } });
        if (error) return setError(authErrorMessage(error.message, error.code));
        if (data.session) {
          router.replace("/graph");
          router.refresh();
        } else {
          // Confirmação de e-mail ligada: o login só vale depois do clique no link
          setInfo("Conta criada! Enviamos um link de confirmação para o seu e-mail. Depois de confirmar, é só entrar.");
          setMode("entrar");
          setPassword("");
        }
      } else {
        const { error } = await supabase.auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: redirectTo } });
        if (error) return setError(authErrorMessage(error.message, error.code));
        setInfo("Link enviado. Confira seu e-mail.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function forgotPassword() {
    setError("");
    setInfo("");
    const invalid = validateCredentials(email, "x", false);
    if (invalid) return setError("Informe seu e-mail acima para receber o link de recuperação.");
    setBusy(true);
    try {
      await createClient().auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/auth/callback?next=/settings`,
      });
    } catch {
      // Falha de rede: mesma resposta neutra abaixo
    } finally {
      setBusy(false);
    }
    // Mesma resposta exista ou não a conta (não revela cadastros)
    setInfo("Se houver uma conta com esse e-mail, enviamos um link para redefinir a senha.");
  }

  const field = "field";
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-soft text-accent-text">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
              <circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" />
              <ellipse cx="12" cy="12" rx="9" ry="4" transform="rotate(-25 12 12)" />
            </svg>
          </span>
          <div>
            <h1 className="text-xl font-semibold leading-tight">JARVIS</h1>
            <p className="text-sm text-muted">Seu segundo cérebro</p>
          </div>
        </div>

        <form onSubmit={submit} className="surface rounded-xl p-5" noValidate>
          <h2 className="text-lg font-semibold">{mode === "entrar" ? "Bem-vindo de volta" : mode === "criar" ? "Criar conta" : "Link mágico"}</h2>
          <p className="mt-1 text-sm text-muted">{mode === "link" ? "Enviamos um link de acesso para o seu e-mail." : "Entre com seu e-mail e senha."}</p>

          <div role="tablist" aria-label="Forma de acesso" className="mt-4 flex gap-1.5">
            {TABS.map((t) => (
              <button key={t.id} type="button" role="tab" aria-selected={mode === t.id} data-active={mode === t.id} onClick={() => switchMode(t.id)} className="chip">
                {t.label}
              </button>
            ))}
          </div>

          <div className="mt-5 space-y-4">
            <label className="block">
              <span className="label">E-mail</span>
              <input type="email" name="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="seu@email.com" className={`${field} mt-1.5`} />
            </label>

            {mode !== "link" && (
              <label className="block">
                <span className="label">Senha{mode === "criar" ? ` (mínimo ${MIN_PASSWORD_LENGTH} caracteres)` : ""}</span>
                <div className="relative mt-1.5">
                  <input
                    type={showPassword ? "text" : "password"}
                    name="password"
                    autoComplete={mode === "criar" ? "new-password" : "current-password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={`${field} pr-20`}
                  />
                  <button type="button" onClick={() => setShowPassword((v) => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-2 py-1 text-sm text-muted hover:text-foreground">
                    {showPassword ? "Ocultar" : "Mostrar"}
                  </button>
                </div>
              </label>
            )}
          </div>

          <button disabled={busy} className="btn-primary mt-6 w-full !py-2.5">
            {busy ? "Aguarde…" : mode === "entrar" ? "Entrar" : mode === "criar" ? "Criar conta" : "Enviar link de acesso"}
          </button>

          {mode === "entrar" && (
            <button type="button" onClick={forgotPassword} disabled={busy} className="btn-ghost mt-2 w-full">
              Esqueci minha senha
            </button>
          )}

          {info && (
            <p role="status" className="mt-4 rounded-lg border border-border bg-surface-2 p-3 text-sm">
              {info}
            </p>
          )}
          {error && (
            <p role="alert" className="mt-4 rounded-lg border border-danger/40 bg-surface-2 p-3 text-sm text-danger">
              {error}
            </p>
          )}
        </form>
      </div>
    </main>
  );
}
