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
        router.replace("/inbox");
        router.refresh();
      } else if (mode === "criar") {
        const { data, error } = await supabase.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: redirectTo } });
        if (error) return setError(authErrorMessage(error.message, error.code));
        if (data.session) {
          router.replace("/inbox");
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
    await createClient().auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/auth/callback?next=/settings`,
    });
    setBusy(false);
    // Mesma resposta exista ou não a conta (não revela cadastros)
    setInfo("Se houver uma conta com esse e-mail, enviamos um link para redefinir a senha.");
  }

  const field = "w-full rounded-md border border-border bg-background px-3 py-2 outline-none focus:border-accent";
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-xl border border-border bg-panel p-8" noValidate>
        <div>
          <h1 className="text-2xl font-bold">
            <span className="text-accent">●</span> JARVIS
          </h1>
          <p className="mt-1 text-sm text-muted">Seu segundo cérebro.</p>
        </div>

        <div role="tablist" className="grid grid-cols-3 gap-1 rounded-md bg-background p-1 text-sm">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={mode === t.id}
              onClick={() => switchMode(t.id)}
              className={`rounded px-2 py-1.5 ${mode === t.id ? "bg-accent-2 text-white" : "text-muted hover:text-foreground"}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <label className="block text-sm">
          <span className="text-muted">E-mail</span>
          <input
            type="email"
            name="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="seu@email.com"
            className={`mt-1 ${field}`}
          />
        </label>

        {mode !== "link" && (
          <label className="block text-sm">
            <span className="text-muted">Senha{mode === "criar" ? ` (mínimo ${MIN_PASSWORD_LENGTH} caracteres)` : ""}</span>
            <div className="relative mt-1">
              <input
                type={showPassword ? "text" : "password"}
                name="password"
                autoComplete={mode === "criar" ? "new-password" : "current-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={`${field} pr-16`}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted hover:text-foreground"
              >
                {showPassword ? "ocultar" : "mostrar"}
              </button>
            </div>
          </label>
        )}

        <button disabled={busy} className="w-full rounded-md bg-accent-2 px-3 py-2 font-medium text-white hover:bg-accent disabled:opacity-50">
          {busy ? "Aguarde…" : mode === "entrar" ? "Entrar" : mode === "criar" ? "Criar conta" : "Enviar link de acesso"}
        </button>

        {mode === "entrar" && (
          <button type="button" onClick={forgotPassword} disabled={busy} className="block w-full text-center text-xs text-muted hover:text-foreground">
            Esqueci minha senha
          </button>
        )}

        {info && <p role="status" className="text-sm text-green-400">{info}</p>}
        {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
      </form>
    </main>
  );
}
