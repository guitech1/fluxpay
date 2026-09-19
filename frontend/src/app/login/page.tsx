"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Loader2 } from "lucide-react";
import { FluxLogo } from "@/components/brand/FluxLogo";
import { authError } from "@/lib/labels";

/**
 * O middleware manda quem tentou abrir uma pagina privada para ca com
 * ?next=<rota>. Depois de entrar, a pessoa volta para onde queria ir em vez
 * de cair sempre na visao geral. So aceitamos caminhos internos do painel:
 * um `next` apontando para fora viraria redirecionamento aberto.
 */
function safeNext(value: string | null): string {
  if (!value) return "/dashboard";
  if (!value.startsWith("/dashboard") && !value.startsWith("/onboarding")) return "/dashboard";
  return value;
}

function LoginForm() {
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    setLoading(false);

    if (error) {
      // Nunca a mensagem crua do Supabase Auth: authError traduz o que da
      // para agir em cima e manda o resto para o console.
      setError(authError(error.message));
      return;
    }

    router.push(next);
    router.refresh();
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-flux-black surface-grid px-4 py-10">
      <div className="w-full max-w-sm">
        <FluxLogo className="justify-center w-full mb-8" />

        <div className="card">
          <h1 className="text-lg font-semibold mb-1">Entrar</h1>
          <p className="text-sm text-flux-muted mb-6">Acesse o painel da sua empresa</p>

          <form onSubmit={handleSubmit} className="space-y-4">
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
                className="input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
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
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {loading ? "Entrando..." : "Entrar"}
            </button>
          </form>
        </div>

        <p className="text-sm text-flux-muted text-center mt-6">
          Ainda não tem conta?{" "}
          <Link href="/signup" className="text-flux-red hover:underline">
            Criar conta
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  // useSearchParams exige um limite de Suspense para o Next conseguir
  // pre-renderizar esta rota.
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
