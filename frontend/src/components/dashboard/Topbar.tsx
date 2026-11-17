"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { LogOut, Loader2, ChevronDown, ShieldCheck, Settings, Menu, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { roleLabel } from "@/lib/labels";
import type { Environment } from "@/lib/types";
import { SidebarNavLinks } from "@/components/dashboard/Sidebar";
import { FluxMark } from "@/components/brand/FluxLogo";

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
  const [drawerOpen, setDrawerOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.cookie = "fluxpay_env=live; path=/; max-age=" + 60 * 60 * 24 * 365 + "; samesite=lax";
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setMenuOpen(false);
        setDrawerOpen(false);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!drawerOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [drawerOpen]);

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
    <>
      <header className="h-16 border-b border-flux-border bg-flux-black/80 backdrop-blur sticky top-0 z-30">
        <div ref={containerRef} className="h-full px-4 lg:px-8 flex items-center gap-3">
          <button
            type="button"
            className="lg:hidden -ml-1 p-2 rounded-lg text-flux-muted hover:text-white hover:bg-flux-gray/50"
            aria-label="Abrir menu"
            aria-expanded={drawerOpen}
            onClick={() => setDrawerOpen(true)}
          >
            <Menu className="w-5 h-5" />
          </button>

          <div className="min-w-0">
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
                className="hidden sm:inline-flex items-center gap-1.5 text-xs font-medium text-flux-muted hover:text-white border border-flux-border rounded-lg px-2.5 py-2"
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                ADM
              </Link>
            )}

            <div className="relative">
              <button
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                className="flex items-center gap-1.5 rounded-lg border border-flux-border bg-flux-dark px-2.5 py-2 text-xs font-medium text-flux-muted hover:text-white"
                aria-label="Menu da conta"
                aria-expanded={menuOpen}
              >
                <span className="w-6 h-6 rounded-full bg-flux-gray-light flex items-center justify-center text-[0.7rem] font-semibold text-white">
                  {(userEmail || "?").slice(0, 1).toUpperCase()}
                </span>
                <ChevronDown className="w-3.5 h-3.5 hidden sm:block" />
              </button>

              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} aria-hidden />
                  <div className="absolute right-0 mt-2 w-56 rounded-xl border border-flux-border bg-flux-dark shadow-xl z-20 p-1.5">
                    <div className="px-3 py-2 border-b border-flux-border mb-1">
                      <p className="text-xs text-flux-muted truncate">{userEmail}</p>
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

      {drawerOpen && (
        <div className="lg:hidden fixed inset-0 z-50">
          <button
            type="button"
            className="absolute inset-0 bg-black/70"
            aria-label="Fechar menu"
            onClick={() => setDrawerOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 w-[min(100%,18rem)] bg-flux-dark border-r border-flux-border flex flex-col shadow-2xl">
            <div className="h-14 flex items-center justify-between gap-2 px-4 border-b border-flux-border">
              <div className="flex items-center gap-2">
                <FluxMark className="w-7 h-7" />
                <span className="font-semibold tracking-tight">FluxPay</span>
              </div>
              <button
                type="button"
                className="p-2 rounded-lg text-flux-muted hover:text-white"
                aria-label="Fechar"
                onClick={() => setDrawerOpen(false)}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <SidebarNavLinks onNavigate={() => setDrawerOpen(false)} />
          </div>
        </div>
      )}
    </>
  );
}
