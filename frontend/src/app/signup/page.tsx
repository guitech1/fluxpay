"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { FluxLogo } from "@/components/brand/FluxLogo";

export default function SignupPage() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("A senha precisa ter pelo menos 8 caracteres.");
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });
    setLoading(false);

    if (error) {
      setError(error.message);
      return;
    }

    // Se a confirmacao de e-mail estiver desativada no projeto Supabase,
    // ja existe sessao aqui e da para seguir direto pro onboarding.
    if (data.session) {
      window.location.href = "/onboarding";
      return;
    }

    setDone(true);
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-flux-black px-4">
        <div className="card max-w-sm text-center">
          <h1 className="text-lg font-semibold mb-2">Confira seu e-mail</h1>
          <p className="text-sm text-flux-muted">
            Enviamos um link de confirmação para <strong className="text-white">{email}</strong>.
            Depois de confirmar, faça login para continuar.
          </p>
          <Link href="/login" className="btn-secondary inline-block mt-6">
            Ir para o login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-flux-black surface-grid px-4 py-10">
      <div className="w-full max-w-sm">
        <FluxLogo className="justify-center w-full mb-8" />

        <div className="card">
          <h1 className="text-lg font-semibold mb-1">Criar conta</h1>
          <p className="text-sm text-flux-muted mb-6">Comece a usar a FluxPay</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">Nome</label>
              <input
                required
                className="input"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Seu nome"
              />
            </div>
            <div>
              <label className="label">E-mail</label>
              <input
                type="email"
                required
                className="input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="voce@empresa.com"
              />
            </div>
            <div>
              <label className="label">Senha</label>
              <input
                type="password"
                required
                minLength={8}
                className="input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Minimo 8 caracteres"
              />
            </div>

            {error && (
              <div
                role="alert"
                className="rounded-lg bg-red-500/10 border border-red-500/20 px-3.5 py-2.5 text-sm text-red-300"
              >
                {error}
              </div>
            )}

            <button type="submit" disabled={loading} className="btn-primary w-full">
              {loading ? "Criando..." : "Criar conta"}
            </button>
          </form>
        </div>

        <p className="text-sm text-flux-muted text-center mt-6">
          Já tem conta?{" "}
          <Link href="/login" className="text-flux-red hover:underline">
            Entrar
          </Link>
        </p>
      </div>
    </div>
  );
}
