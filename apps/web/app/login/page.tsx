"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { CheckerMark, JarvisMark, OrbitSphere, WaveField } from "@/components/brand/motifs";
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

  return (
    <main className="grid min-h-screen bg-background lg:grid-cols-[1.25fr_1fr]">
      {/* Hero: esfera em órbita sobre ondas de linhas finas */}
      <section className="relative flex min-h-[340px] flex-col overflow-hidden border-b border-border bg-[radial-gradient(ellipse_at_30%_20%,#1c1c1c_0%,#0a0a0a_65%)] px-6 py-6 lg:min-h-screen lg:border-b-0 lg:border-r lg:px-12 lg:py-10">
        <div className="kicker relative z-10 flex items-center gap-4">
          <span>Capturar</span>
          <span className="hidden sm:inline">Conectar</span>
          <span className="hidden sm:inline">Conversar</span>
          <span className="h-px flex-1 bg-border" />
          <span>Jarvis · 2026</span>
        </div>
        <WaveField className="absolute inset-x-0 bottom-0 h-[70%] w-full" lines={46} amplitude={110} opacity={0.5} />
        <div className="relative z-10 flex flex-1 items-center justify-center">
          <OrbitSphere className="h-[220px] w-[220px] sm:h-[320px] sm:w-[320px] lg:h-[440px] lg:w-[440px]" />
        </div>
        <div className="relative z-10 flex items-end justify-between gap-6">
          <div>
            <h1 className="display text-3xl text-foreground sm:text-5xl lg:text-6xl">Jarvis</h1>
            <p className="display mt-2 text-xs text-muted sm:text-sm">Segundo cérebro</p>
          </div>
          <div className="hidden max-w-[260px] border-t border-border pt-3 text-xs leading-relaxed text-muted md:block">
            Mande um áudio depois da palestra, uma foto do livro ou um link. O Jarvis transforma tudo em notas
            conectadas e conversa com você sobre o que aprendeu.
          </div>
          <CheckerMark className="hidden text-foreground/70 lg:block" />
        </div>
      </section>

      {/* Formulário */}
      <section className="flex items-center justify-center px-6 py-10">
        <form onSubmit={submit} className="w-full max-w-sm" noValidate>
          <div className="kicker flex items-center gap-3">
            <span>Acesso</span>
            <span className="h-px flex-1 bg-border" />
            <JarvisMark className="h-4 w-4 text-foreground" />
          </div>
          <h2 className="display mt-6 text-xl text-foreground">
            {mode === "entrar" ? "Bem-vindo de volta" : mode === "criar" ? "Criar conta" : "Link mágico"}
          </h2>
          <p className="mt-2 text-sm text-muted">
            {mode === "link" ? "Enviamos um link de acesso para o seu e-mail." : "Entre com seu e-mail e senha."}
          </p>

          <div role="tablist" className="mt-7 grid grid-cols-3 border-b border-border">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={mode === t.id}
                onClick={() => switchMode(t.id)}
                className={`-mb-px border-b px-1 pb-2.5 text-[10.5px] uppercase tracking-[0.16em] transition ${
                  mode === t.id ? "border-foreground text-foreground" : "border-transparent text-muted hover:text-foreground"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="mt-6 space-y-4">
            <label className="block">
              <span className="kicker">E-mail</span>
              <input
                type="email"
                name="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu@email.com"
                className="field mt-2 text-sm"
              />
            </label>

            {mode !== "link" && (
              <label className="block">
                <span className="kicker">Senha{mode === "criar" ? ` · mínimo ${MIN_PASSWORD_LENGTH}` : ""}</span>
                <div className="relative mt-2">
                  <input
                    type={showPassword ? "text" : "password"}
                    name="password"
                    autoComplete={mode === "criar" ? "new-password" : "current-password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="field pr-20 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] uppercase tracking-[0.14em] text-muted hover:text-foreground"
                  >
                    {showPassword ? "ocultar" : "mostrar"}
                  </button>
                </div>
              </label>
            )}
          </div>

          <button disabled={busy} className="btn-primary mt-7 w-full px-4 py-3 disabled:opacity-50">
            {busy ? "Aguarde…" : mode === "entrar" ? "Entrar" : mode === "criar" ? "Criar conta" : "Enviar link de acesso"}
          </button>

          {mode === "entrar" && (
            <button
              type="button"
              onClick={forgotPassword}
              disabled={busy}
              className="mt-4 block w-full text-center text-[10.5px] uppercase tracking-[0.16em] text-muted hover:text-foreground"
            >
              Esqueci minha senha
            </button>
          )}

          {info && (
            <p role="status" className="mt-5 border-l border-foreground pl-3 text-sm text-foreground">
              {info}
            </p>
          )}
          {error && (
            <p role="alert" className="mt-5 border-l border-[var(--signal)] pl-3 text-sm text-[var(--signal)]">
              {error}
            </p>
          )}
        </form>
      </section>
    </main>
  );
}
