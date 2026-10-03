"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    const { error } = await createClient().auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) {
      setError(error.message);
      setStatus("error");
    } else setStatus("sent");
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-xl border border-border bg-panel p-8">
        <div>
          <h1 className="text-2xl font-bold">
            <span className="text-accent">●</span> JARVIS
          </h1>
          <p className="mt-1 text-sm text-muted">Seu segundo cérebro. Entre com um link mágico.</p>
        </div>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="seu@email.com"
          className="w-full rounded-md border border-border bg-background px-3 py-2 outline-none focus:border-accent"
        />
        <button
          disabled={status === "sending"}
          className="w-full rounded-md bg-accent-2 px-3 py-2 font-medium text-white hover:bg-accent disabled:opacity-50"
        >
          {status === "sending" ? "Enviando…" : "Enviar link de acesso"}
        </button>
        {status === "sent" && <p className="text-sm text-green-400">Link enviado. Confira seu e-mail.</p>}
        {status === "error" && <p className="text-sm text-red-400">{error}</p>}
      </form>
    </main>
  );
}
