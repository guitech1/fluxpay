"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { LogOut, Loader2, ChevronDown, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { Environment } from "@/lib/types";

/**
 * Barra superior do painel: empresa atual, alternancia test/live e logout.
 *
 * O ambiente vive num cookie (fluxpay_env) porque quem le ele e Server
 * Component (lib/dashboard-context.ts) — por isso, depois de trocar, chamamos
 * router.refresh() para o servidor re-renderizar as paginas com o novo filtro.
 */
export function Topbar({
  organizationName,
  environment,
  userEmail,
  role,
  isPlatformAdmin = false,
}: {
  organizationName: string;
  environment: Environment;
  userEmail: string | null;
  role: string;
  isPlatformAdmin?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [signingOut, setSigningOut] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  function switchEnvironment(next: Environment) {
    if (next === environment) return;
    document.cookie = `fluxpay_env=${next}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
    startTransition(() => router.refresh());
  }

  async function signOut() {
    setSigningOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    // Limpa a empresa selecionada para o proximo login nao herdar a anterior.
    document.cookie = "fluxpay_org_id=; path=/; max-age=0";
    router.replace("/login");
    router.refresh();
  }

  return (
    <header className="h-16 border-b border-flux-border bg-flux-dark/60 backdrop-blur sticky top-0 z-30">
      <div className="h-full px-4 lg:px-8 flex items-center gap-4">
        <div className="min-w-0 pl-12 lg:pl-0">
          <div className="font-medium truncate">{organizationName}</div>
          <div className="text-xs text-flux-muted capitalize">{role}</div>
        </div>

        <div className="ml-auto flex items-center gap-3">
          {/* Toggle de ambiente */}
          <div className="flex items-center rounded-lg border border-flux-border bg-flux-gray p-0.5">
            {(["test", "live"] as Environment[]).map((env) => (
              <button
                key={env}
                onClick={() => switchEnvironment(env)}
                disabled={pending}
                className={cn(
                  "px-3 py-1.5 rounded-md text-xs font-medium transition-colors disabled:opacity-60",
                  environment === env
                    ? env === "live"
                      ? "bg-flux-red text-white"
                      : "bg-flux-gray-light text-white"
                    : "text-flux-muted hover:text-white"
                )}
              >
                {env === "test" ? "Teste" : "Produção"}
              </button>
            ))}
          </div>

          {pending && <Loader2 className="w-4 h-4 animate-spin text-flux-muted" />}

          {isPlatformAdmin && (
            <Link
              href="/admin"
              className="flex items-center gap-1.5 text-sm text-flux-muted hover:text-white"
              title="Painel administrativo da plataforma"
            >
              <ShieldCheck className="w-4 h-4" />
              <span className="hidden sm:inline">ADM</span>
            </Link>
          )}

          <div className="relative">
            <button
              className="flex items-center gap-2 text-sm text-flux-muted hover:text-white"
              onClick={() => setMenuOpen((v) => !v)}
            >
              <span className="hidden sm:inline max-w-[180px] truncate">{userEmail}</span>
              <ChevronDown className="w-4 h-4" />
            </button>

            {menuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 mt-2 w-48 rounded-lg border border-flux-border bg-flux-dark shadow-lg z-20 p-1">
                  <button
                    onClick={signOut}
                    disabled={signingOut}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-flux-muted hover:text-white hover:bg-flux-gray-light"
                  >
                    {signingOut ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <LogOut className="w-4 h-4" />
                    )}
                    Sair da conta
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {environment === "live" && (
        <div className="bg-flux-red/10 border-b border-flux-red/20 px-4 lg:px-8 py-1.5 text-xs text-flux-red-light">
          Você está em <strong>produção</strong>. Cobranças criadas aqui são reais.
        </div>
      )}
    </header>
  );
}
