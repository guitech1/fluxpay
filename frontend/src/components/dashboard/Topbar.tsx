"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { LogOut, Loader2, ChevronDown, ShieldCheck, Settings } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { roleLabel } from "@/lib/labels";
import type { Environment } from "@/lib/types";

/**
 * Barra superior do painel.
 * Ambiente de teste removido da UI: operacao sempre em producao (live).
 */
export function Topbar({
  organizationName,
  environment: _environment,
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
  const [signingOut, setSigningOut] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Limpa cookie legado de ambiente de teste.
    document.cookie = "fluxpay_env=live; path=/; max-age=" + 60 * 60 * 24 * 365 + "; samesite=lax";
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  async function signOut() {
    setSigningOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    document.cookie = "fluxpay_org_id=; path=/; max-age=0";
    document.cookie = "fluxpay_env=; path=/; max-age=0";
    router.replace("/login");
    router.refresh();
  }

  return (
    <header className="h-16 border-b border-flux-border bg-flux-black/80 backdrop-blur sticky top-0 z-30">
      <div ref={containerRef} className="h-full px-4 lg:px-8 flex items-center gap-3">
        <div className="min-w-0 pl-12 lg:pl-0">
          <div className="font-medium text-sm truncate">{organizationName}</div>
          <div className="text-xs text-flux-muted truncate">{roleLabel(role, true)}</div>
        </div>

        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          <div className="flex items-center gap-2 rounded-lg border border-flux-border bg-flux-dark px-2.5 sm:px-3 py-2 text-xs font-medium">
            <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-emerald-400" aria-hidden />
            <span>Producao</span>
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
