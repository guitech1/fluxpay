"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { LogOut, Loader2, ChevronDown, ShieldCheck, Settings, Check } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { environmentLabel, roleLabel } from "@/lib/labels";
import type { Environment } from "@/lib/types";

/**
 * Barra superior do painel.
 *
 * Indicação de ambiente: um único seletor discreto, aqui e mais nada. Antes
 * existiam três lugares dizendo a mesma coisa (faixa vermelha fixa em
 * produção, rodapé da sidebar e o próprio seletor) — o aviso ocupava mais
 * espaço que o conteúdo. A regra agora: o ambiente aparece no seletor do
 * cabeçalho e, de forma secundária, no rodapé da sidebar. Nenhuma tela
 * repete isso em faixa, banner ou alerta.
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
  const [envOpen, setEnvOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setMenuOpen(false);
        setEnvOpen(false);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  function switchEnvironment(next: Environment) {
    setEnvOpen(false);
    if (next === environment) return;
    document.cookie = `fluxpay_env=${next}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
    startTransition(() => router.refresh());
  }

  async function signOut() {
    setSigningOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    // Limpa a empresa selecionada para o próximo login não herdar a anterior.
    document.cookie = "fluxpay_org_id=; path=/; max-age=0";
    router.replace("/login");
    router.refresh();
  }

  const isLive = environment === "live";

  return (
    <header className="h-16 border-b border-flux-border bg-flux-black/80 backdrop-blur sticky top-0 z-30">
      <div ref={containerRef} className="h-full px-4 lg:px-8 flex items-center gap-3">
        <div className="min-w-0 pl-12 lg:pl-0">
          <div className="font-medium text-sm truncate">{organizationName}</div>
          <div className="text-xs text-flux-muted truncate">{roleLabel(role, true)}</div>
        </div>

        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          {/* Seletor de ambiente — indicação discreta e única */}
          <div className="relative">
            <button
              onClick={() => setEnvOpen((v) => !v)}
              disabled={pending}
              aria-haspopup="menu"
              aria-expanded={envOpen}
              className="flex items-center gap-2 rounded-lg border border-flux-border bg-flux-dark px-2.5 sm:px-3 py-2 text-xs font-medium hover:border-flux-gray-light transition-colors disabled:opacity-60"
            >
              <span
                className={cn(
                  "w-1.5 h-1.5 rounded-full shrink-0",
                  isLive ? "bg-emerald-400" : "bg-amber-400"
                )}
                aria-hidden
              />
              <span>{environmentLabel(environment)}</span>
              {pending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-flux-muted" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5 text-flux-muted" />
              )}
            </button>

            {envOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setEnvOpen(false)} aria-hidden />
                <div
                  role="menu"
                  className="absolute right-0 mt-2 w-60 rounded-lg border border-flux-border bg-flux-dark shadow-xl z-20 p-1"
                >
                  {(["test", "live"] as Environment[]).map((env) => (
                    <button
                      key={env}
                      role="menuitem"
                      onClick={() => switchEnvironment(env)}
                      className="w-full flex items-start gap-2.5 px-3 py-2.5 rounded-md text-left hover:bg-flux-gray"
                    >
                      <span
                        className={cn(
                          "w-1.5 h-1.5 rounded-full mt-1.5 shrink-0",
                          env === "live" ? "bg-emerald-400" : "bg-amber-400"
                        )}
                        aria-hidden
                      />
                      <span className="flex-1 min-w-0">
                        <span className="text-sm block">{environmentLabel(env)}</span>
                        <span className="text-xs text-flux-muted block mt-0.5 leading-snug">
                          {env === "live"
                            ? "Cobranças reais, com dinheiro de verdade."
                            : "Para experimentar. Nenhum valor é movimentado."}
                        </span>
                      </span>
                      {environment === env && (
                        <Check className="w-4 h-4 text-flux-red shrink-0 mt-0.5" />
                      )}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {isPlatformAdmin && (
            <Link
              href="/admin"
              className="flex items-center gap-1.5 rounded-lg border border-flux-border px-2.5 py-2 text-xs text-flux-muted hover:text-white"
              title="Administração da plataforma"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Plataforma</span>
            </Link>
          )}

          <div className="relative">
            <button
              className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm text-flux-muted hover:text-white hover:bg-flux-gray"
              onClick={() => setMenuOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-label="Menu da conta"
            >
              <span className="w-7 h-7 rounded-full bg-flux-gray-light text-white text-xs font-medium flex items-center justify-center shrink-0">
                {(userEmail || "?").slice(0, 1).toUpperCase()}
              </span>
              <ChevronDown className="w-4 h-4" />
            </button>

            {menuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} aria-hidden />
                <div
                  role="menu"
                  className="absolute right-0 mt-2 w-56 rounded-lg border border-flux-border bg-flux-dark shadow-xl z-20 p-1"
                >
                  <div className="px-3 py-2.5 border-b border-flux-border mb-1">
                    <p className="text-sm truncate">{userEmail}</p>
                    <p className="text-xs text-flux-muted mt-0.5">{roleLabel(role)}</p>
                  </div>
                  <Link
                    href="/dashboard/settings"
                    role="menuitem"
                    onClick={() => setMenuOpen(false)}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-flux-muted hover:text-white hover:bg-flux-gray"
                  >
                    <Settings className="w-4 h-4" />
                    Configurações
                  </Link>
                  <button
                    role="menuitem"
                    onClick={signOut}
                    disabled={signingOut}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-flux-muted hover:text-white hover:bg-flux-gray"
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
    </header>
  );
}
